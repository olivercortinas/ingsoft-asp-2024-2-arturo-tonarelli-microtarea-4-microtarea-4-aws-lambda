const AWS = require("aws-sdk");
const { validateCreditCard } = require("/opt/nodejs/validateCreditCard");

const dynamo = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log("Lambda invoked at:", new Date().toISOString());
  console.log("Event received:", JSON.stringify(event));

  try {
    // Parsear el cuerpo del evento
    const body = JSON.parse(event.body);
    console.log("Parsed body:", body);

    const { creditCard, showId, userId } = body;
    console.log("Extracted fields - creditCard:", creditCard, "showId:", showId, "userId:", userId);

    // Validar tarjeta de crédito
    const validation = validateCreditCard(creditCard);
    console.log("Credit card validation result:", validation);

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

    // Verificar el estado actual del executionId en la tabla LambdaExecutionLog
    const logCheckParams = {
      TableName: "LambdaExecutionLog",
      Key: { executionId },
    };

    const existingLog = await dynamo.get(logCheckParams).promise();
    console.log("Existing log entry:", existingLog);

    if (existingLog.Item) {
      const { status } = existingLog.Item;
      console.log("Current status:", status);

      if (status === "IN_PROGRESS") {
        console.log("Operation already in progress. Returning 400 response.");
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Purchase already in progress." }),
        };
      }

      // Si el estado es COMPLETED o FAILED, permitir nueva compra
      console.log("Previous execution status is not IN_PROGRESS. Proceeding with new attempt.");
    }

    // Registrar el nuevo intento como IN_PROGRESS
    const logParams = {
      TableName: "LambdaExecutionLog",
      Item: {
        executionId,
        timestamp: new Date().toISOString(),
        status: "IN_PROGRESS",
      },
    };

    console.log("Attempting to log execution:", JSON.stringify(logParams));
    await dynamo.put(logParams).promise();
    console.log("Execution logged successfully.");

    // Actualizar entradas en la tabla ShowTickets
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
    console.log("DynamoDB update result:", result);

    // Actualizar el estado a COMPLETED
    const updateLogParams = {
      TableName: "LambdaExecutionLog",
      Key: { executionId },
      UpdateExpression: "SET #status = :completed",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":completed": "COMPLETED",
      },
    };

    console.log("Updating log status to COMPLETED:", JSON.stringify(updateLogParams));
    await dynamo.update(updateLogParams).promise();
    console.log("Log status updated to COMPLETED.");

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Ticket purchased successfully.",
        remainingTickets: result.Attributes.ticketsAvailable,
      }),
    };
  } catch (err) {
    console.error("Error during execution:", err);

    if (err.code === "ConditionalCheckFailedException") {
      console.log("Conditional check failed. Tickets unavailable or duplicate execution.");
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Tickets are sold out or purchase already processed." }),
      };
    }

    // Actualizar el estado a FAILED si ocurre un error inesperado
    try {
      const errorLogParams = {
        TableName: "LambdaExecutionLog",
        Key: { executionId },
        UpdateExpression: "SET #status = :failed",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":failed": "FAILED",
        },
      };

      console.log("Updating log status to FAILED:", JSON.stringify(errorLogParams));
      await dynamo.update(errorLogParams).promise();
      console.log("Log status updated to FAILED.");
    } catch (logError) {
      console.error("Failed to update log status to FAILED:", logError);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error." }),
    };
  }
};
