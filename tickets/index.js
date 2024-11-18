const AWS = require("aws-sdk");
const { validateCreditCard } = require("/opt/nodejs/validateCreditCard");

const dynamo = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const startTime = Date.now(); // Marcar el inicio de la ejecución
  console.log("Lambda invoked at:", new Date().toISOString());
  console.log("Event received:", JSON.stringify(event)); // Log del evento completo recibido

  try {
    // Parsear el cuerpo del evento
    const parseStart = Date.now();
    const body = JSON.parse(event.body);
    console.log("Parsed body:", body, "Time taken:", Date.now() - parseStart, "ms");

    const { creditCard, showId, userId } = body;
    console.log("Extracted fields - creditCard:", creditCard, "showId:", showId, "userId:", userId);

    // Validar tarjeta de crédito
    const validateStart = Date.now();
    const validation = validateCreditCard(creditCard);
    console.log("Credit card validation result:", validation, "Time taken:", Date.now() - validateStart, "ms");

    if (!validation.isValid) {
      console.log("Invalid credit card. Returning 400 response.");
      return {
        statusCode: 400,
        body: JSON.stringify({ message: validation.message }),
      };
    }

    // Generar un ID único para esta ejecución
    const executionId = `${userId}-${showId}`;
    console.log("Generated executionId:", executionId);

    // Registrar la ejecución en LambdaExecutionLog
    const logStart = Date.now();
    const logParams = {
      TableName: "LambdaExecutionLog",
      Item: {
        executionId, // Clave de partición única
        timestamp: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(executionId)", // Verificar que no exista previamente
    };

    console.log("Attempting to log execution:", JSON.stringify(logParams));
    await dynamo.put(logParams).promise();
    console.log("Execution logged successfully. Time taken:", Date.now() - logStart, "ms");

    // Actualizar entradas en la tabla ShowTickets
    const dynamoStart = Date.now();
    const updateParams = {
      TableName: "ShowTickets",
      Key: { showId },
      UpdateExpression: "SET ticketsAvailable = ticketsAvailable - :decrement",
      ConditionExpression: "attribute_exists(showId) AND ticketsAvailable > :zero",
      ExpressionAttributeValues: {
        ":decrement": 1,
        ":zero": 0,
      },
      ReturnValues: "UPDATED_NEW",
    };

    console.log("DynamoDB update parameters:", JSON.stringify(updateParams));
    const result = await dynamo.update(updateParams).promise();
    console.log(
      "DynamoDB update result:",
      result,
      "Time taken for DynamoDB operation:",
      Date.now() - dynamoStart,
      "ms"
    );

    console.log("Lambda completed successfully in:", Date.now() - startTime, "ms");
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Ticket purchased successfully.",
        remainingTickets: result.Attributes.ticketsAvailable,
      }),
    };
  } catch (err) {
    console.error("Error during execution:", err);

    // Si ya existe el registro en LambdaExecutionLog
    if (err.code === "ConditionalCheckFailedException") {
      console.log("Execution already logged or tickets unavailable.");
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Tickets are sold out or purchase already processed." }),
      };
    }

    // Manejo de otros errores inesperados
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error." }),
    };
  }
};
