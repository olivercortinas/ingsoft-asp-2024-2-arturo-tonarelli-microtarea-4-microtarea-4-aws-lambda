const AWS = require("aws-sdk");
const { validateCreditCard } = require("/opt/nodejs/validateCreditCard");

const dynamo = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log("Lambda invoked at:", new Date().toISOString());
  console.log("Event received:", JSON.stringify(event));

  let executionId;

  try {
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
    executionId = `${userId}-${showId}`;
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

    // Verificar si el showId existe antes de actualizar
    const checkShowParams = {
      TableName: "ShowTickets",
      Key: { showId },
    };

    const existingShow = await dynamo.get(checkShowParams).promise();
    console.log("Existing show entry:", existingShow);

    if (!existingShow.Item) {
      console.log("Show ID does not exist. Returning 404 response.");
      await updateExecutionLogStatus(executionId, "FAILED");
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Show does not exist." }),
      };
    }

    // Actualizar entradas en la tabla ShowTickets
    const updateParams = {
      TableName: "ShowTickets",
      Key: { showId },
      UpdateExpression: "SET ticketsAvailable = ticketsAvailable - :decrement",
      ConditionExpression: "ticketsAvailable > :zero",
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
    await updateExecutionLogStatus(executionId, "COMPLETED");

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Ticket purchased successfully.",
        remainingTickets: result.Attributes.ticketsAvailable,
      }),
    };
  } catch (err) {
    console.error("Error during execution:", err);

    if (executionId) {
      await updateExecutionLogStatus(executionId, "FAILED");
    }

    if (err.code === "ConditionalCheckFailedException") {
      console.log("Tickets unavailable or other conflict.");
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Tickets are sold out." }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error." }),
    };
  }
};

// Función para actualizar el estado del log de ejecución
const updateExecutionLogStatus = async (executionId, status) => {
  const dynamo = new AWS.DynamoDB.DocumentClient();
  const updateLogParams = {
    TableName: "LambdaExecutionLog",
    Key: { executionId },
    UpdateExpression: "SET #status = :status",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":status": status,
    },
  };

  try {
    console.log("Updating executionId status:", JSON.stringify(updateLogParams));
    await dynamo.update(updateLogParams).promise();
    console.log(`ExecutionId ${executionId} status updated to ${status}.`);
  } catch (logError) {
    console.error("Failed to update log status:", logError);
  }
};
