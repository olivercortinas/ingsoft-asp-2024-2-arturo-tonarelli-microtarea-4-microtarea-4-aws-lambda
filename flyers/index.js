// Importar módulos necesarios
const AWS = require('aws-sdk');
const { Pool } = require('pg');

// Inicializar clientes de AWS y PostgreSQL
const s3 = new AWS.S3();
const pool = new Pool({
    host: process.env.DB_HOST, // Host de la base de datos
    port: process.env.DB_PORT, // Puerto de la base de datos
    user: process.env.DB_USER, // Usuario de la base de datos
    password: process.env.DB_PASSWORD, // Contraseña de la base de datos
    database: process.env.DB_NAME, // Nombre de la base de datos
    max: 5, // Máximo de conexiones en el pool
    idleTimeoutMillis: 30000, // Tiempo máximo de inactividad antes de cerrar conexiones
    ssl: {
        rejectUnauthorized: false, // Desactiva la validación del certificado para pruebas
    },
});

// Función Lambda
exports.handler = async (event) => {
    let client; // Cliente de la base de datos
    try {
        console.log('Evento recibido:', JSON.stringify(event));

        // Validar el evento S3
        const record = event.Records && event.Records[0];
        if (!record || !record.s3) {
            throw new Error('Evento inválido: no contiene información de S3.');
        }

        const bucketName = record.s3.bucket.name;
        const objectKey = record.s3.object.key;

        console.log(`Procesando archivo S3 - Bucket: ${bucketName}, Key: ${objectKey}`);

        // Descargar archivo desde S3 con un timeout
        const s3Params = {
            Bucket: bucketName,
            Key: objectKey,
        };
        console.log('Parámetros de S3:', s3Params);
        const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout al descargar archivo S3')), ms));

        try {
            const s3Object = await Promise.race([
                s3.getObject(s3Params).promise(),
                timeout(40000), // Timeout de 40 segundos
            ]);
            console.log(`Archivo descargado: tamaño ${s3Object.ContentLength} bytes`);
        } catch (err) {
            console.error('Error al descargar archivo de S3:', err);
            if (err.code === 'NoSuchKey') {
                console.error('Archivo no encontrado en el bucket.');
            } else {
                console.error('Otro error:', err);
            }
            throw err;
        }

        console.log('Intentando conexión con RDS');

        // Conectar a la base de datos
        console.log('Estableciendo conexión con la base de datos...');
        client = await pool.connect();

        // Insertar datos en la base de datos
        const insertQuery = `
            INSERT INTO events (event_name, flyer) 
            VALUES ($1, $2)
            ON CONFLICT (event_name) DO UPDATE SET flyer = EXCLUDED.flyer;
        `;

        const eventName = objectKey.replace(/\.[^/.]+$/, ''); // Usar el nombre del archivo sin la extensión
        const flyerUrl = `https://${bucketName}.s3.amazonaws.com/${objectKey}`;

        console.log(`Insertando datos en la base de datos para el evento "${eventName}"...`);
        await client.query(insertQuery, [eventName, flyerUrl]);

        console.log('Datos insertados/actualizados correctamente.');

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Archivo procesado e información guardada en la base de datos.',
            }),
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    } finally {
        // Liberar conexión de la base de datos
        if (client) {
            console.log('Liberando conexión con la base de datos...');
            client.release();
        }
    }
};
