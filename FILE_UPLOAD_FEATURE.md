# File Upload Feature Documentation

## Architecture

```
Browser (File Upload)
  ↓
Next.js API (/api/notes)
  ↓
AWS Lambda Handler
  ├── Parse multipart/form-data
  ├── Upload file to S3
  ├── Generate signed URL (1 hour expiry)
  ├── Save metadata to DynamoDB
  └── Return signed URL to client
```

## Features

1. **File Upload**: Users can optionally attach files to notes
2. **S3 Storage**: Files are stored securely in AWS S3
3. **Signed URLs**: Temporary download URLs (1 hour validity)
4. **Metadata Storage**: File names and URLs stored in DynamoDB
5. **User Isolation**: Files are organized by userId in S3

## Implementation Details

### Frontend (page.tsx)
- File input in the form
- FormData handling for multipart requests
- Display download links in note cards
- File name display with paperclip emoji

### API Route (/api/notes)
- Forwards FormData to Lambda
- Handles multipart/form-data content type
- Includes API key authentication

### Lambda Function (notes-handler.js)
- Detects multipart form data by content-type header
- Parses form data and extracts file information
- Uploads file to S3 with structured key: `notes/{userId}/{timestamp}-{filename}`
- Generates signed URL with 1-hour expiry
- Saves note with file metadata to DynamoDB

### DynamoDB Schema Update
```javascript
{
  userId: "demo-user",
  noteId: "uuid",
  title: "string",
  content: "string",
  fileUrl: "string (optional - signed S3 URL)",
  fileName: "string (optional - original filename)",
  s3Key: "string (optional - S3 object key)",
  createdAt: "ISO timestamp"
}
```

## S3 File Structure
```
vaibhav-aws-learning-bucket/
  ├── notes/
  │   └── demo-user/
  │       ├── 1706362800000-document.pdf
  │       ├── 1706362805000-image.jpg
  │       └── 1706362810000-spreadsheet.xlsx
```

## Usage

1. **Adding a note with file**:
   - Enter title and content
   - Click file input to select a file
   - Click "Add Note" button
   - File is uploaded to S3, URL is saved to DynamoDB

2. **Downloading a file**:
   - Click the "📎 Download File" link on a note card
   - Signed URL is valid for 1 hour
   - After 1 hour, link expires (user would need to request new signed URL)

## Environment Variables

- `API_KEY`: Must match Lambda environment variable
- `LAMBDA_URL`: AWS Lambda function URL

## Dependencies

Lambda requires:
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`
- `@aws-sdk/client-dynamodb`
- `@aws-sdk/lib-dynamodb`

## Error Handling

- Missing title/content → 400 error with message
- S3 upload failure → 500 error
- Authentication failure → 401 Unauthorized
- Invalid API key → 401 Unauthorized

## Security Considerations

1. **Signed URLs**: Files are accessed via signed URLs, not public URLs
2. **User Isolation**: Files stored in user-specific S3 directories
3. **API Key Auth**: All requests require valid API key
4. **URL Expiry**: Signed URLs expire after 1 hour for security
5. **Content Type Validation**: S3 stores original content type

## Testing

Test file uploads by:
1. Create a note with a file attachment
2. Verify file appears in S3 console
3. Verify download link works
4. Wait for signed URL to expire (1 hour) and verify link behavior
5. Test with various file types (PDF, images, documents, etc.)
