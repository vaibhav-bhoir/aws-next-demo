import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({ region: "ap-south-1" });
const ddb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "NotesTable";

export const handler = async (event) => {
  console.log("Event:", JSON.stringify(event));

  const method = event.requestContext?.http?.method;
  const userId = "demo-user"; // temp auth

  try {
    // CREATE
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");

      const note = {
        userId,
        noteId: randomUUID(),
        title: body.title,
        content: body.content,
        createdAt: new Date().toISOString(),
      };

      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: note,
        })
      );

      return { statusCode: 201, body: JSON.stringify(note) };
    }

    // READ (LIST)
    if (method === "GET") {
      const result = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "userId = :uid",
          ExpressionAttributeValues: { ":uid": userId },
        })
      );

      return { statusCode: 200, body: JSON.stringify(result.Items) };
    }

    // UPDATE
    if (method === "PUT") {
      const body = JSON.parse(event.body || "{}");

      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            userId,
            noteId: body.noteId,
          },
          UpdateExpression: "SET title = :t, content = :c",
          ExpressionAttributeValues: {
            ":t": body.title,
            ":c": body.content,
          },
        })
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Note updated" }),
      };
    }

    // DELETE
    if (method === "DELETE") {
      const noteId = event.queryStringParameters?.noteId;

      await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            userId,
            noteId,
          },
        })
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Note deleted" }),
      };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
