# Lambda Functions

This directory contains the AWS Lambda function code that is deployed separately on AWS. The Lambda function handles CRUD operations for notes stored in a DynamoDB table.

## Notes Handler Lambda

**File:** `notes-handler.js`  
**Function Name:** (your AWS Lambda function name)  
**Runtime:** Node.js  
**Region:** ap-south-1  

### Environment Variables Required:
- `TABLE_NAME` - DynamoDB table name for storing notes

### API Endpoints:
- **GET** `/` - Get all notes
- **POST** `/` - Create a new note (requires `title` and `content` in body)
- **PUT** `/` - Update a note (requires `noteId`, `title`, and `content` in body)
- **DELETE** `/?noteId={id}` - Delete a note by ID

### Dependencies:
```json
{
  "@aws-sdk/client-dynamodb": "^3.x",
  "@aws-sdk/lib-dynamodb": "^3.x"
}
```

### DynamoDB Table Schema:
- Primary Key: `noteId` (String)
- Attributes: `userId`, `title`, `content`, `createdAt`

### Deployment Notes:
- Last deployed: [Add date when you deploy]
- Lambda URL: [Add your Lambda function URL here]
- API Gateway (if used): [Add API Gateway URL here]