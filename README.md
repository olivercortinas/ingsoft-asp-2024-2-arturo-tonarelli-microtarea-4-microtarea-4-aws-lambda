# microtarea-4-aws-lambda

Ud está construyendo una app para la venta de tickets a eventos deportivos y espectáculos musicales (una ticketera), en ese sentido quiere comenzar con un MVP que le genere el menor gasto posible.

Para ello, debe implementar 2 funciones lambda en aws.
1. La primera, escucha la inserción de un objeto en un bucket que son los flyers (imágenes) de los eventos y los inserta en una base de datos RDS (asumir que el evento ya existe y el nombre del archivo es el nombre del mismo).
2. La segunda, es accesible vía api gateway (método POST) que gestiona la venta de un espectáculo. Para ello, con una capa debe verificar la validez de la tarjeta de crédito de entrada (visa y master) y disminuir la cantidad de entradas disponibles. Además, para evitar el caso borde de ejecuciones no deseadas, en dynamo se debe implementar el conditional writing - que chequea si la instancia de la función lambda ya fue ejecutada.

## Notas
La BD solo cuenta con una tabla: Nombre evento, costo entrada, entradas disponibles, flyer (img mapeada a un string).

---
# Lambda para Gestión de Venta de Entradas

Esta Lambda permite gestionar la venta de entradas para espectáculos mediante un API Gateway. Implementa validaciones de tarjetas de crédito y asegura la consistencia de los datos usando DynamoDB y técnicas como **Conditional Writes**.

## Flujo General

1. **Validación de Tarjeta de Crédito:**
   - Se valida que la tarjeta sea **Visa** o **MasterCard**.
   - Se utiliza el algoritmo de Luhn para verificar la validez de la tarjeta.

2. **Control de Ejecución:**
   - Se verifica en la tabla `LambdaExecutionLog` si existe un registro previo para el usuario y el espectáculo (`executionId`).
   - Los posibles estados son:
     - **`IN_PROGRESS`**: Indica que la transacción está en curso. Se bloquean nuevas compras.
     - **`COMPLETED`**: Indica que la transacción se procesó con éxito anteriormente. Se permite intentar una nueva compra.
     - **`FAILED`**: Indica que la transacción anterior falló. Se permite intentar nuevamente.

3. **Gestión del Inventario de Entradas:**
   - Se actualiza la cantidad de entradas disponibles en la tabla `ShowTickets` usando **Conditional Writes** para evitar inconsistencias:
     - Verifica que existan suficientes entradas disponibles.
     - Decrementa el número de entradas disponibles solo si la condición se cumple.

4. **Actualización del Estado de Ejecución:**
   - El estado en `LambdaExecutionLog` se actualiza según el resultado:
     - **`IN_PROGRESS`** al inicio de la transacción.
     - **`COMPLETED`** si la transacción fue exitosa.
     - **`FAILED`** si ocurre un error inesperado.

5. **Respuestas del Sistema:**
   - **200 (Éxito):** La compra se procesó correctamente.
   - **400 (Error):**
     - `"Invalid credit card."`: La tarjeta de crédito no es válida.
     - `"Purchase already in progress."`: Existe una transacción en curso para el mismo usuario y espectáculo.
     - `"Tickets are sold out or purchase already processed."`: Las entradas están agotadas o la compra ya fue procesada.
   - **500 (Error interno):** Si ocurre un problema inesperado.

---

## Tablas de DynamoDB

### `ShowTickets`
| Atributo          | Tipo   | Descripción                          |
|--------------------|--------|--------------------------------------|
| `showId`          | String | Identificador único del espectáculo. |
| `ticketsAvailable`| Number | Cantidad de entradas disponibles.    |

### `LambdaExecutionLog`
| Atributo          | Tipo   | Descripción                                             |
|--------------------|--------|---------------------------------------------------------|
| `executionId`     | String | Identificador único de la transacción (`userId-showId`). |
| `timestamp`       | String | Marca de tiempo de la transacción.                      |
| `status`          | String | Estado de la transacción (`IN_PROGRESS`, `COMPLETED`, `FAILED`). |

---

## Ejemplo de Flujo

### Escenario 1: Compra Exitosamente Procesada
- **Estado Inicial:** No existe `executionId` en `LambdaExecutionLog`.
- **Acción:** Se registra `IN_PROGRESS`, se decrementa `ticketsAvailable` y se actualiza a `COMPLETED`.

### Escenario 2: Compra Duplicada
- **Estado Inicial:** Existe un registro con estado `IN_PROGRESS`.
- **Acción:** Se bloquea la nueva transacción con un mensaje de error `"Purchase already in progress."`.

### Escenario 3: Nueva Compra tras una Compra Completada
- **Estado Inicial:** Existe un registro con estado `COMPLETED`.
- **Acción:** Se permite una nueva compra, siguiendo el flujo de éxito.

### Escenario 4: Reintento tras Error
- **Estado Inicial:** Existe un registro con estado `FAILED`.
- **Acción:** Se permite un nuevo intento de compra.

---

## Validaciones Implementadas

1. **Validez de la tarjeta de crédito.**
2. **Gestión de concurrencia con `IN_PROGRESS`.**
3. **Evitar decrementos en entradas agotadas.**
4. **Permitir nuevos intentos tras errores o compras completadas.**

