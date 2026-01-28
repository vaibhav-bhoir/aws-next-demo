# File Upload & Storage Flow - Detailed Explanation

## 📋 Table of Contents
1. File Upload Flow
2. Signed URL Mechanism
3. DynamoDB Storage
4. File Deletion Flow
5. File Update Flow
6. Edge Cases & Security

---

## 🔼 1. FILE UPLOAD FLOW (POST with file)

### Browser to Next.js API
```
User Action:
  └─ Selects file + enters title + content
     └─ Clicks "Add Note" button

Frontend (page.tsx):
  └─ Creates FormData object:
     {
       title: "My Note",
       content: "Note text",
       file: File object {name: "document.pdf", size: 2MB, type: "application/pdf"}
     }
  └─ Sends POST to /api/notes with FormData
  └─ Content-Type: multipart/form-data (automatically set by browser)
```

### Next.js API Layer (/api/notes)
```
POST /api/notes (NextRequest):
  ├─ Read request headers
  ├─ Detect: Content-Type = "multipart/form-data"
  ├─ Parse FormData:
  │  ├─ await req.formData()
  │  └─ Extract: title, content, file object
  ├─ Forward to Lambda with:
  │  ├─ x-api-key header (for auth)
  │  ├─ FormData body (including file buffer)
  │  └─ Content-Type: multipart/form-data
  └─ Return Lambda response to client
```

### Lambda Handler (notes-handler.js) - POST
```
Lambda receives event:
  ├─ event.headers["content-type"] = "multipart/form-data; boundary=..."
  ├─ event.body = raw multipart encoded data (Base64 or plain text)
  ├─ event.isBase64Encoded = true/false (depends on encoding)
  
Step 1: Detect multipart
  └─ Check if content-type includes "multipart/form-data"
  └─ If yes → parse multipart, if no → treat as JSON

Step 2: Parse multipart form data
  ├─ Extract boundary from content-type header
  │  └─ Example: "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW"
  ├─ Decode body if Base64 encoded
  ├─ Split by boundary delimiters
  ├─ For each part, extract:
  │  ├─ Headers (Content-Disposition, Content-Type)
  │  ├─ Field name (title, content, file)
  │  └─ Field value (text for title/content, buffer for file)
  └─ Result: {title, content, file, fileName, fileContentType, fileBuffer}

Step 3: Generate unique S3 key (file path)
  ├─ Structure: notes/{userId}/{timestamp}-{originalFilename}
  ├─ Example: notes/demo-user/1706362800000-document.pdf
  ├─ Timestamp ensures: no overwrite + ordered by date
  ├─ userId ensures: user isolation (multi-tenant)
  └─ Original filename ensures: human-readable names

Step 4: Upload file to S3
  ├─ Create PutObjectCommand:
  │  ├─ Bucket: "vaibhav-aws-learning-bucket"
  │  ├─ Key: "notes/demo-user/1706362800000-document.pdf"
  │  ├─ Body: fileBuffer (raw file bytes)
  │  ├─ ContentType: fileContentType (e.g., "application/pdf")
  │  └─ Metadata: {originalName: "document.pdf"} (optional)
  ├─ Send to S3
  └─ S3 response: {ETag, VersionId} (file successfully stored)

Step 5: Generate Signed URL
  ├─ Create GetObjectCommand with same S3 key
  ├─ Use getSignedUrl() function:
  │  ├─ Input: S3 client, GetObjectCommand, options
  │  ├─ Options: { expiresIn: 3600 } (1 hour in seconds)
  │  └─ Output: Signed URL string
  ├─ Signed URL contains:
  │  ├─ Bucket name
  │  ├─ Object key
  │  ├─ AWS credentials (AccessKeyId, SecretAccessKey)
  │  ├─ Signature (HMAC-SHA256)
  │  ├─ Timestamp (X-Amz-Date)
  │  └─ Expiration time (X-Amz-Expires)
  │
  └─ Example URL:
     https://vaibhav-aws-learning-bucket.s3.ap-south-1.amazonaws.com/notes/demo-user/1706362800000-document.pdf
     ?X-Amz-Algorithm=AWS4-HMAC-SHA256
     &X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20260127%2Fap-south-1%2Fs3%2Faws4_request
     &X-Amz-Date=20260127T105500Z
     &X-Amz-Expires=3600
     &X-Amz-Signature=abc123def456...

Step 6: Save note to DynamoDB
  ├─ Create note object:
  │  ├─ userId: "demo-user"
  │  ├─ noteId: UUID (random)
  │  ├─ title: "My Note"
  │  ├─ content: "Note text"
  │  ├─ fileUrl: "https://...signed-url..." ✅ (SIGNED URL - not direct S3 URL)
  │  ├─ fileName: "document.pdf"
  │  ├─ s3Key: "notes/demo-user/1706362800000-document.pdf"
  │  └─ createdAt: "2026-01-27T10:55:00Z"
  │
  ├─ PutCommand to DynamoDB:
  │  ├─ TableName: "NotesTable"
  │  ├─ Key: {userId: "demo-user", noteId: "abc-123"}
  │  └─ Item: note object (all fields above)
  │
  └─ DynamoDB response: success ✓

Step 7: Return response to Next.js API
  ├─ Status: 201 Created
  ├─ Body: complete note object (with signed URL)
  └─ Frontend receives and displays the note
```

---

## 🔗 2. SIGNED URL MECHANISM

### What is a Signed URL?
```
Normal S3 URL (doesn't work):
  https://vaibhav-aws-learning-bucket.s3.ap-south-1.amazonaws.com/notes/demo-user/file.pdf
  └─ Returns 403 Forbidden (bucket is private)

Signed URL (works):
  https://.../?X-Amz-Algorithm=...&X-Amz-Credential=...&X-Amz-Signature=...
  └─ Valid for 1 hour
  └─ Contains AWS credentials and cryptographic signature
  └─ No additional IAM permissions needed
```

### How Signed URLs Work
```
Generation (Server - Lambda):
  1. Server has AWS credentials (from Lambda execution role)
  2. Create GetObjectCommand for specific S3 object
  3. Use getSignedUrl(s3Client, command, {expiresIn: 3600})
  4. Function creates signature using AWS secret key:
     signature = HMAC-SHA256(
       secretKey,
       stringToSign (includes bucket, key, timestamp, expiry, etc.)
     )
  5. Generate URL with signature embedded
  6. Return URL to client

Usage (Client - Browser):
  1. Client receives signed URL
  2. Clicks download link
  3. Browser makes GET request to signed URL
  4. S3 receives request with URL parameters
  5. S3 validates:
     ├─ Signature is correct (recomputes HMAC)
     ├─ Current time < expiration time
     └─ Requested object matches Key in URL
  6. If valid → return file (200 OK)
  7. If invalid → return error (403 Forbidden)

Expiration:
  ├─ expiresIn: 3600 (1 hour)
  ├─ After 1 hour: signature is invalid
  ├─ User gets 403 Forbidden
  └─ User must request new signed URL from app
```

### Why Use Signed URLs?
```
✅ Benefits:
  ├─ S3 bucket remains private
  ├─ Temporary access (auto-expires)
  ├─ No additional IAM users needed
  ├─ Fine-grained control per file
  ├─ User can't modify URL (signature validates)
  ├─ Logging: S3 logs who downloaded what
  └─ Efficient: no server bandwidth needed

❌ Without signed URLs (direct public URLs):
  ├─ Anyone with URL can download forever
  ├─ No expiration
  ├─ Anyone can guess other URLs (noteId, fileName)
  ├─ Bandwidth costs (could be DoS attacked)
  └─ Security risk
```

---

## 💾 3. DYNAMODB STORAGE

### Table Schema
```
NotesTable (Partition Key: userId, Sort Key: noteId)

Attributes:
  ├─ userId (Partition Key) [String]
  │  └─ Demo value: "demo-user"
  │  └─ Used for: querying all notes of a user
  │
  ├─ noteId (Sort Key) [String]
  │  └─ Demo value: "550e8400-e29b-41d4-a716-446655440000"
  │  └─ Used for: unique identifier, update/delete operations
  │
  ├─ title [String]
  │  └─ Demo value: "My Document"
  │
  ├─ content [String]
  │  └─ Demo value: "This is the note content..."
  │
  ├─ fileUrl [String] (Optional - only if file uploaded)
  │  └─ Demo value: "https://s3.ap-south-1.amazonaws.com/...?X-Amz-Signature=..."
  │  └─ This is the SIGNED URL (expires in 1 hour)
  │
  ├─ fileName [String] (Optional - only if file uploaded)
  │  └─ Demo value: "document.pdf"
  │  └─ Used for: display name in UI
  │
  ├─ s3Key [String] (Optional - only if file uploaded)
  │  └─ Demo value: "notes/demo-user/1706362800000-document.pdf"
  │  └─ Used for: deletion (reference to S3 object)
  │
  └─ createdAt [String] [ISO 8601]
     └─ Demo value: "2026-01-27T10:55:00.123Z"
     └─ Used for: sorting, displaying timestamp

Example DynamoDB Item:
{
  "userId": {"S": "demo-user"},
  "noteId": {"S": "abc-123-def-456"},
  "title": {"S": "Meeting Notes"},
  "content": {"S": "Discussed project timeline..."},
  "fileUrl": {"S": "https://...signed-url..."},
  "fileName": {"S": "agenda.pdf"},
  "s3Key": {"S": "notes/demo-user/1706362800000-agenda.pdf"},
  "createdAt": {"S": "2026-01-27T10:55:00Z"}
}
```

### Why Store fileUrl in DynamoDB?
```
✅ Need to store signed URL because:
  ├─ DynamoDB is the source of truth for note metadata
  ├─ When fetching notes, we return fileUrl for download links
  ├─ Avoids regenerating signed URL on every GET request
  ├─ Signed URL is already generated and ready to use
  └─ Client can immediately use URL without extra API call

⚠️ Important consideration:
  ├─ Signed URL expires after 1 hour
  ├─ Stored URL becomes invalid after 1 hour
  ├─ User must refresh page to get new signed URL
  │
  └─ Alternative approaches:
     ├─ Store s3Key only, regenerate URL on GET (extra Lambda call)
     ├─ Store with expiry timestamp, regenerate if expired
     └─ Use CloudFront with origin access identity (more complex)
```

---

## 🗑️ 4. FILE DELETION FLOW (DELETE method)

### DELETE Handler Flow
```
Step 1: Receive request
  ├─ Query parameter: noteId
  ├─ From auth: userId (from session/header)
  └─ Example: DELETE /api/notes?noteId=abc-123

Step 2: Get note from DynamoDB
  ├─ Query DynamoDB to fetch the note
  ├─ Key: {userId: "demo-user", noteId: "abc-123"}
  ├─ Get note object which includes: s3Key (if file exists)
  └─ If not found → return 404 error

Step 3: Delete file from S3 (if exists)
  ├─ Check if note.s3Key exists
  ├─ If yes:
  │  ├─ Create DeleteObjectCommand:
  │  │  ├─ Bucket: "vaibhav-aws-learning-bucket"
  │  │  └─ Key: note.s3Key (e.g., "notes/demo-user/1706362800000-doc.pdf")
  │  ├─ Send to S3
  │  ├─ S3 deletes the file
  │  └─ Response: {DeleteMarker: true} (file marked for deletion)
  └─ If no: skip S3 deletion (no file attached)

Step 4: Delete note from DynamoDB
  ├─ DeleteCommand:
  │  ├─ TableName: "NotesTable"
  │  └─ Key: {userId: "demo-user", noteId: "abc-123"}
  ├─ DynamoDB deletes the item
  └─ Response: success

Step 5: Return response
  ├─ Status: 200 OK
  ├─ Body: {message: "Note and file deleted"}
  └─ Both S3 and DynamoDB cleaned up ✓

Code Implementation:
  ```javascript
  if (method === "DELETE") {
    const noteId = event.queryStringParameters?.noteId;
    
    // Step 2: Fetch note to get s3Key
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {userId, noteId}
    }));
    
    if (!result.Item) {
      return {statusCode: 404, body: JSON.stringify({error: "Note not found"})};
    }
    
    // Step 3: Delete from S3 if file exists
    if (result.Item.s3Key) {
      await s3.send(new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: result.Item.s3Key
      }));
    }
    
    // Step 4: Delete from DynamoDB
    await ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {userId, noteId}
    }));
    
    // Step 5: Return success
    return {
      statusCode: 200,
      body: JSON.stringify({message: "Note deleted"})
    };
  }
  ```
```

---

## ✏️ 5. FILE UPDATE FLOW (PUT method)

### Scenarios
```
Scenario 1: Update note text only (no file change)
  ├─ User edits title/content, doesn't change file
  ├─ Flow: Update DynamoDB only
  └─ No S3 operation needed

Scenario 2: Replace file with new file
  ├─ User uploads new file
  ├─ Flow: Delete old S3 file → Upload new → Update DynamoDB
  └─ Old file is deleted, new file is stored

Scenario 3: Remove file from note
  ├─ User had attachment, now wants to remove it
  ├─ Flow: Delete S3 file → Update DynamoDB (remove fileUrl, fileName, s3Key)
  └─ Note remains, file is deleted
```

### Updated PUT Handler Flow
```
Step 1: Receive request
  ├─ Body: {noteId, title, content, file (optional)}
  ├─ File: new File object (if updating with file)
  └─ File: null/undefined (if no file change)

Step 2: Get existing note from DynamoDB
  ├─ Query: Key: {userId, noteId}
  ├─ Get: oldNote object with old s3Key (if has file)
  └─ Used for: deciding what to clean up

Step 3: Handle file updates
  ├─ If new file provided:
  │  ├─ Delete old S3 file (using oldNote.s3Key)
  │  ├─ Upload new S3 file (same process as POST)
  │  ├─ Generate new signed URL
  │  └─ Prepare new fileUrl, fileName, s3Key
  │
  ├─ If no new file but old file exists:
  │  ├─ Keep old file (no action)
  │  └─ Keep old fileUrl in DynamoDB
  │
  └─ If explicitly removing file (flag: deleteFile=true):
     ├─ Delete old S3 file
     └─ Remove fileUrl, fileName, s3Key from DynamoDB

Step 4: Update DynamoDB
  ├─ UpdateCommand:
  │  ├─ TableName: "NotesTable"
  │  ├─ Key: {userId, noteId}
  │  ├─ UpdateExpression: "SET title=:t, content=:c, fileUrl=:f, fileName=:fn, s3Key=:sk"
  │  └─ ExpressionAttributeValues:
  │     ├─ :t = new title
  │     ├─ :c = new content
  │     ├─ :f = new fileUrl (or old fileUrl, or NULL if removing)
  │     ├─ :fn = new fileName (or old fileName, or NULL if removing)
  │     └─ :sk = new s3Key (or old s3Key, or NULL if removing)
  └─ DynamoDB updates the item

Step 5: Return response
  ├─ Status: 200 OK
  ├─ Body: updated note object
  └─ UI reflects changes

Code Implementation:
  ```javascript
  if (method === "PUT") {
    const isMultipart = event.headers["content-type"]?.includes("multipart/form-data");
    let title, content, newFileUrl, newFileName, newS3Key;
    
    // Step 2: Get old note
    const oldNote = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {userId, noteId: body.noteId}
    })).then(r => r.Item);
    
    if (!oldNote) {
      return {statusCode: 404, body: JSON.stringify({error: "Note not found"})};
    }
    
    // Extract title and content
    if (isMultipart) {
      const parts = parseMultipartFormData(...);
      title = parts.title;
      content = parts.content;
      
      // Step 3: Handle file updates
      if (parts.file) {
        // Delete old file if exists
        if (oldNote.s3Key) {
          await s3.send(new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: oldNote.s3Key
          }));
        }
        
        // Upload new file
        const newS3Key = `notes/${userId}/${Date.now()}-${parts.fileName}`;
        await s3.send(new PutObjectCommand({...}));
        
        // Generate new signed URL
        newFileUrl = await getSignedUrl(s3, command, {expiresIn: 3600});
        newFileName = parts.fileName;
      } else {
        // Keep old file
        newFileUrl = oldNote.fileUrl;
        newFileName = oldNote.fileName;
        newS3Key = oldNote.s3Key;
      }
    } else {
      // JSON update (no file)
      title = body.title;
      content = body.content;
      newFileUrl = oldNote.fileUrl;
      newFileName = oldNote.fileName;
      newS3Key = oldNote.s3Key;
    }
    
    // Step 4: Update DynamoDB
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {userId, noteId: body.noteId},
      UpdateExpression: "SET title=:t, content=:c, fileUrl=:f, fileName=:fn, s3Key=:sk",
      ExpressionAttributeValues: {
        ":t": title,
        ":c": content,
        ":f": newFileUrl || null,
        ":fn": newFileName || null,
        ":sk": newS3Key || null
      }
    }));
    
    return {statusCode: 200, body: JSON.stringify({...})};
  }
  ```
```

---

## 🔒 6. EDGE CASES & SECURITY

### Edge Case 1: Signed URL Expiration
```
Problem:
  ├─ User fetches notes
  ├─ Gets signed URL (valid for 1 hour)
  ├─ Waits 2 hours
  ├─ Clicks download link
  └─ Gets 403 Forbidden (URL expired)

Solutions:
  1. Refresh on page load: Generate new signed URLs for all notes
  2. Generate on demand: Only create when user clicks download
  3. Increase expiry: Use 24 hours instead of 1 hour (less secure)
  4. CloudFront: Cache signed requests longer

Recommended: Solution 1 - refresh signed URLs when loading notes
```

### Edge Case 2: User Deletion
```
What if user account deleted?
  ├─ All notes must be deleted
  ├─ All S3 files must be deleted
  ├─ Use: Query all notes by userId, delete each one
  └─ Bulk cleanup needed

Implementation:
  ├─ Query: userId = "demo-user"
  ├─ Get all noteIds
  ├─ For each note:
  │  ├─ Delete S3 file (if s3Key exists)
  │  └─ Delete DynamoDB item
  └─ User completely cleaned up
```

### Edge Case 3: S3 Upload Fails
```
What if file uploaded but DynamoDB write fails?
  ├─ File exists in S3 orphaned
  ├─ No reference in DynamoDB
  ├─ User doesn't know file was uploaded
  └─ Problem: orphaned file costs storage

Solution:
  ├─ Use transactions (if supported)
  ├─ Or: Try DynamoDB first, then S3 (limits file size)
  ├─ Or: Implement cleanup job for orphaned files
  └─ Or: Accept as acceptable loss (small risk)
```

### Edge Case 4: Concurrent Updates
```
What if user updates same note twice quickly?
  ├─ Request 1: Upload new file A
  ├─ Request 2: Upload new file B (before Request 1 completes)
  ├─ Race condition: Which file is final?
  ├─ DynamoDB might have file B URL
  ├─ But S3 deleted file A before B was uploaded
  └─ Might delete B instead of A

Solution:
  ├─ Use DynamoDB conditional writes
  ├─ Use optimistic locking (version number)
  ├─ Or: Accept as acceptable risk (rare)
  └─ Or: Queue updates (more complex)
```

### Security: Signed URL Parameters Can't Be Modified
```
Example signed URL:
  https://...?X-Amz-Signature=abc123def456...&X-Amz-Date=20260127&X-Amz-Expires=3600

User attempts to modify:
  ├─ Change Key: notes/demo-user/other-user-file.pdf
  ├─ Change Expires: 86400 (24 hours)
  └─ S3 recomputes signature:
     └─ newSignature = HMAC-SHA256(secretKey, newStringToSign)
     └─ newSignature ≠ abc123def456 (doesn't match)
     └─ Returns 403 Forbidden

Result: User can't modify URL parameters ✓
```

### Security: File Virus Scanning
```
Current implementation: NO virus scanning
  ├─ User uploads any file
  ├─ File goes directly to S3
  ├─ No validation or scanning

Better implementation:
  ├─ Use Lambda + ClamAV (antivirus)
  ├─ Scan file before S3 upload
  ├─ Reject if malware detected
  └─ More complex but safer

Or: Use AWS Macie or GuardDuty for detection
```

---

## Summary Table

| Operation | DynamoDB | S3 | Signed URL |
|-----------|----------|----|----|
| **POST (new file)** | Create item with fileUrl | Upload file | Generate & store |
| **GET (list)** | Query all notes | No access | Return stored URLs |
| **PUT (new file)** | Update with new fileUrl | Delete old, upload new | Generate new |
| **PUT (no file)** | Update note text | No change | Keep old URL |
| **DELETE** | Delete item | Delete file | N/A |
| **Download** | No access | Access via signed URL | Validate & download |

---

## Implementation Checklist

- [ ] Update DELETE handler to delete S3 file
- [ ] Update PUT handler to handle file replacement
- [ ] Add error handling for S3 failures
- [ ] Add error handling for DynamoDB failures
- [ ] Implement cleanup for orphaned S3 files
- [ ] Consider signed URL expiration handling
- [ ] Add file size limits
- [ ] Add file type validation
- [ ] Add virus/malware scanning
- [ ] Monitor S3 costs (file cleanup)
