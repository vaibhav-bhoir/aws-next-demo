import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3 = new S3Client({ region: "ap-south-1" });
const BUCKET = "vaibhav-aws-learning-bucket";
const SIGNED_URL_EXPIRY = 3600; // 1 hour

const client = new DynamoDBClient({ region: "ap-south-1" });
const ddb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "NotesTable";
const API_KEY = process.env.API_KEY;

// Parse multipart/form-data
function parseMultipartFormData(body, boundary, isBase64Encoded) {
  const bodyBuffer = isBase64Encoded ? Buffer.from(body, "base64") : Buffer.from(body, "binary");
  const parts = {};
  
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const sections = [];
  let start = 0;
  
  // Split by boundary
  while (start < bodyBuffer.length) {
    const boundaryIndex = bodyBuffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;
    if (start !== 0) {
      sections.push(bodyBuffer.slice(start, boundaryIndex));
    }
    start = boundaryIndex + boundaryBuffer.length;
  }
  
  for (const section of sections) {
    if (section.length === 0) continue;
    
    // Find the headers/content separator (\r\n\r\n)
    const separator = Buffer.from("\r\n\r\n");
    const separatorIndex = section.indexOf(separator);
    if (separatorIndex === -1) continue;
    
    const headers = section.slice(0, separatorIndex).toString("utf-8");
    let content = section.slice(separatorIndex + separator.length);
    
    // Remove trailing \r\n
    if (content.length >= 2 && content[content.length - 2] === 13 && content[content.length - 1] === 10) {
      content = content.slice(0, -2);
    }
    
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const nameMatch = headers.match(/name="([^"]+)"/);
    const contentTypeMatch = headers.match(/Content-Type: ([^\r\n]+)/);
    
    if (filenameMatch) {
      parts.file = true;
      parts.fileName = filenameMatch[1];
      parts.fileContentType = contentTypeMatch?.[1]?.trim() || "application/octet-stream";
      parts.fileBuffer = content;
    } else if (nameMatch) {
      const fieldName = nameMatch[1];
      parts[fieldName] = content.toString("utf-8");
    }
  }
  
  return parts;
}

export const handler = async (event) => {
  console.log("Event:", JSON.stringify(event));

  // ===== API Key Authentication =====
  const requestApiKey = event.headers?.["x-api-key"];
  
  console.log("Expected API Key:", API_KEY);
  console.log("Received API Key:", requestApiKey);
  
  if (!requestApiKey || requestApiKey !== API_KEY) {
    console.log("Authentication failed!");
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Unauthorized: Invalid or missing API key",
        debug: {
          received: requestApiKey ? "key present" : "no key",
          expected: API_KEY ? "key configured" : "no key configured"
        }
      }),
    };
  }
  
  console.log("Authentication successful!");
  // ==================================

  const method = event.requestContext?.http?.method;
  const userId = "demo-user"; // temp auth

  try {
    // CREATE with optional file upload
    if (method === "POST") {
      const isMultipart = event.headers?.["content-type"]?.includes("multipart/form-data");
      
      let title, content, fileUrl = null, fileName = null, s3Key = null;
      
      if (isMultipart) {
        // Parse multipart form data
        const boundary = event.headers["content-type"]?.split("boundary=")[1];
        const parts = parseMultipartFormData(event.body, boundary, event.isBase64Encoded);
        
        title = parts.title;
        content = parts.content;
        
        // Handle file upload to S3 if file exists
        if (parts.file) {
          s3Key = `notes/${userId}/${Date.now()}-${parts.fileName}`;
          
          await s3.send(
            new PutObjectCommand({
              Bucket: BUCKET,
              Key: s3Key,
              Body: parts.fileBuffer,
              ContentType: parts.fileContentType,
            })
          );
          
          // Generate signed URL
          const getCommand = new GetObjectCommand({
            Bucket: BUCKET,
            Key: s3Key,
            ResponseContentDisposition: 'inline',
          });
          fileUrl = await getSignedUrl(s3, getCommand, { expiresIn: SIGNED_URL_EXPIRY });
          fileName = parts.fileName;
        }
      } else {
        // Handle JSON body
        const body = JSON.parse(event.body || "{}");
        title = body.title;
        content = body.content;
      }

      const noteId = randomUUID();
      const note = {
        userId,
        noteId,
        title,
        content,
        ...(s3Key && { fileUrl, fileName, s3Key }),
        createdAt: new Date().toISOString(),
      };

      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: note,
        })
      );

      return { 
        statusCode: 201, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note) 
      };
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

    // UPDATE (with optional file handling)
    if (method === "PUT") {
      const isMultipart = event.headers?.["content-type"]?.includes("multipart/form-data");
      
      let title, content, newFileUrl, newFileName, newS3Key;
      
      // Step 1: Get old note to check for existing file
      const oldNoteResult = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            userId,
            noteId: event.queryStringParameters?.noteId || (isMultipart ? null : JSON.parse(event.body || "{}").noteId),
          },
        })
      );
      
      if (!oldNoteResult.Item) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Note not found" }),
        };
      }
      
      const oldNote = oldNoteResult.Item;
      const noteId = oldNote.noteId;
      
      // Step 2: Parse request data
      if (isMultipart) {
        const boundary = event.headers["content-type"]?.split("boundary=")[1];
        const parts = parseMultipartFormData(event.body, boundary, event.isBase64Encoded);
        
        title = parts.title || oldNote.title;
        content = parts.content || oldNote.content;
        
        // Handle file updates
        if (parts.file) {
          // Delete old file if exists
          if (oldNote.s3Key) {
            console.log("Deleting old file:", oldNote.s3Key);
            await s3.send(
              new DeleteObjectCommand({
                Bucket: BUCKET,
                Key: oldNote.s3Key,
              })
            );
          }
          
          // Upload new file
          const s3Key = `notes/${userId}/${Date.now()}-${parts.fileName}`;
          
          await s3.send(
            new PutObjectCommand({
              Bucket: BUCKET,
              Key: s3Key,
              Body: parts.fileBuffer,
              ContentType: parts.fileContentType,
            })
          );
          
          // Generate signed URL for new file
          const getCommand = new GetObjectCommand({
            Bucket: BUCKET,
            Key: s3Key,
            ResponseContentDisposition: 'inline',
          });
          newFileUrl = await getSignedUrl(s3, getCommand, { expiresIn: SIGNED_URL_EXPIRY });
          newFileName = parts.fileName;
          newS3Key = s3Key;
        } else {
          // Keep old file
          newFileUrl = oldNote.fileUrl;
          newFileName = oldNote.fileName;
          newS3Key = oldNote.s3Key;
        }
      } else {
        // JSON update (no multipart file)
        const body = JSON.parse(event.body || "{}");
        title = body.title || oldNote.title;
        content = body.content || oldNote.content;
        newFileUrl = oldNote.fileUrl;
        newFileName = oldNote.fileName;
        newS3Key = oldNote.s3Key;
      }
      
      // Step 3: Build update expression
      const updateExpressions = [];
      const expressionValues = {};
      
      updateExpressions.push("title = :t");
      expressionValues[":t"] = title;
      
      updateExpressions.push("content = :c");
      expressionValues[":c"] = content;
      
      if (newFileUrl !== undefined) {
        updateExpressions.push("fileUrl = :f");
        expressionValues[":f"] = newFileUrl;
      }
      
      if (newFileName !== undefined) {
        updateExpressions.push("fileName = :fn");
        expressionValues[":fn"] = newFileName;
      }
      
      if (newS3Key !== undefined) {
        updateExpressions.push("s3Key = :sk");
        expressionValues[":sk"] = newS3Key;
      }
      
      // Step 4: Update DynamoDB
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            userId,
            noteId,
          },
          UpdateExpression: "SET " + updateExpressions.join(", "),
          ExpressionAttributeValues: expressionValues,
        })
      );

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Note updated" }),
      };
    }

    // DELETE (with file cleanup)
    if (method === "DELETE") {
      const noteId = event.queryStringParameters?.noteId;
      
      if (!noteId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "noteId is required" }),
        };
      }
      
      // Step 1: Get note to check if it has a file
      const noteResult = await ddb.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            userId,
            noteId,
          },
        })
      );
      
      if (!noteResult.Item) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Note not found" }),
        };
      }
      
      const note = noteResult.Item;
      
      // Step 2: Delete file from S3 if it exists
      if (note.s3Key) {
        try {
          console.log("Deleting S3 file:", note.s3Key);
          await s3.send(
            new DeleteObjectCommand({
              Bucket: BUCKET,
              Key: note.s3Key,
            })
          );
          console.log("S3 file deleted successfully");
        } catch (s3Error) {
          console.error("Error deleting S3 file:", s3Error);
          // Continue with DynamoDB deletion even if S3 fails
        }
      }
      
      // Step 3: Delete note from DynamoDB
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            userId,
            noteId,
          },
        })
      );
      
      console.log("Note deleted successfully");

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Note and associated file deleted" }),
      };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
