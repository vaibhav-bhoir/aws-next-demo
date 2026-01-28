# Lambda Handlers - Updated Implementation Summary

## 📊 Overview

Updated Lambda handlers to properly manage files in S3 alongside DynamoDB records.

---

## ✅ POST Handler (Create Note with Optional File)

### Flow
```
Browser sends FormData (title, content, optional file)
    ↓
Lambda receives multipart/form-data
    ↓
Parse multipart form data
    ↓
If file exists:
  ├─ Generate S3 key: notes/{userId}/{timestamp}-{filename}
  ├─ Upload file to S3
  ├─ Generate signed URL (1 hour expiry)
  └─ Save URL to DynamoDB
    ↓
Save note to DynamoDB:
  ├─ userId (partition key)
  ├─ noteId (sort key)
  ├─ title, content
  ├─ fileUrl (if file uploaded)
  ├─ fileName (if file uploaded)
  ├─ s3Key (if file uploaded)
  └─ createdAt
    ↓
Return note object with signed URL to client
```

### Implementation
```javascript
// Handles both JSON and multipart form data
- Detects content-type header
- Parses multipart form data if present
- Generates unique S3 keys with timestamp
- Creates signed URLs for secure access
- Stores all metadata in DynamoDB
```

---

## ✅ GET Handler (List Notes)

### Flow
```
Browser sends GET request
    ↓
Lambda queries DynamoDB
    ↓
Query all notes for userId
    ↓
Return array of notes:
  [
    {noteId, title, content, fileUrl, fileName, s3Key, createdAt},
    {noteId, title, content, fileUrl, fileName, s3Key, createdAt},
    ...
  ]
    ↓
Frontend receives signed URLs ready for download
```

### Important Note
```
⚠️ Signed URLs expire after 1 hour
   └─ If user waits > 1 hour, link becomes invalid
   └─ Should refresh on page load to get fresh URLs
   
Options:
  1. Auto-refresh signed URLs in GET response
  2. Generate on-demand when user clicks download
  3. Use CloudFront for longer caching
```

---

## ✅ PUT Handler (Update Note - NEW!)

### Flow
```
Browser sends FormData or JSON with updates
    ↓
Lambda retrieves existing note from DynamoDB
    ↓
Check if new file provided
    ├─ YES → Delete old S3 file, upload new, generate new signed URL
    └─ NO → Keep existing file reference
    ↓
Update DynamoDB with:
  ├─ New/unchanged title
  ├─ New/unchanged content
  ├─ New/unchanged fileUrl
  ├─ New/unchanged fileName
  └─ New/unchanged s3Key
    ↓
Return success response
```

### Key Features
```
✅ Supports partial updates (title/content only)
✅ Supports file replacement (delete old, upload new)
✅ Supports file removal (delete S3, clear metadata)
✅ Backward compatible with JSON updates
✅ Error handling: continues with DynamoDB even if S3 fails
```

### Implementation
```javascript
// Steps:
1. Get old note to check for existing file
2. If not found → return 404
3. Parse incoming request (multipart or JSON)
4. If new file provided:
   - Delete old S3 file (if exists)
   - Upload new S3 file
   - Generate new signed URL
5. Build dynamic UpdateExpression for changed fields
6. Update DynamoDB
7. Return success with updated note
```

---

## ✅ DELETE Handler (Delete Note - UPDATED!)

### Flow
```
Browser sends DELETE request with noteId
    ↓
Lambda retrieves note from DynamoDB
    ↓
Check if note has associated file
    ├─ YES → Delete file from S3 ✓
    └─ NO → Skip S3 deletion
    ↓
Delete note from DynamoDB
    ↓
Return success response
```

### Key Features
```
✅ Gets note first to find s3Key
✅ Deletes file from S3 (if exists)
✅ Deletes note from DynamoDB
✅ Error handling: continues with DB deletion if S3 fails
✅ Prevents orphaned files in S3
✅ Prevents orphaned metadata in DynamoDB
```

### Implementation
```javascript
// Steps:
1. Get noteId from query parameters
2. Fetch note from DynamoDB
3. If not found → return 404
4. If s3Key exists:
   - Delete from S3 (catch errors but continue)
5. Delete note from DynamoDB
6. Return success
```

---

## 📊 Data Flow Diagrams

### POST (Upload Note with File)
```
FormData (title, content, file)
    ↓
Next.js API (/api/notes)
    ├─ Detect: multipart/form-data
    └─ Forward to Lambda
    ↓
Lambda Handler
    ├─ Parse multipart form data
    ├─ Upload file to S3
    │  └─ S3 Key: notes/demo-user/1706362800000-document.pdf
    ├─ Generate signed URL
    ├─ Save to DynamoDB
    └─ Return {noteId, title, content, fileUrl, fileName, s3Key}
    ↓
Frontend stores in state
    ↓
Display note with download link
```

### GET (List Notes)
```
GET /api/notes
    ↓
Lambda queries DynamoDB
    ├─ Filter: userId = "demo-user"
    └─ Get all notes
    ↓
Return:
  [
    {
      noteId: "abc-123",
      title: "My Doc",
      content: "...",
      fileUrl: "https://s3.ap-south-1.amazonaws.com/...?X-Amz-Signature=...",
      fileName: "document.pdf",
      s3Key: "notes/demo-user/1706362800000-document.pdf"
    },
    ...
  ]
    ↓
Frontend renders with download links
```

### PUT (Update Note)
```
FormData (updated title, content, optional new file)
    ↓
Lambda
    ├─ Get old note
    ├─ If new file:
    │  ├─ Delete old S3 file
    │  ├─ Upload new S3 file
    │  └─ Generate new signed URL
    ├─ Update DynamoDB
    └─ Return updated note
    ↓
Frontend refreshes display
```

### DELETE (Delete Note)
```
DELETE /api/notes?noteId=abc-123
    ↓
Lambda
    ├─ Get note (to find s3Key)
    ├─ Delete from S3 (if fileUrl exists)
    ├─ Delete from DynamoDB
    └─ Return success
    ↓
Frontend removes from list
```

---

## 🔒 Important Security & Error Handling

### S3 File Deletion Safety
```javascript
if (note.s3Key) {
  try {
    await s3.send(new DeleteObjectCommand({...}));
  } catch (s3Error) {
    console.error("Error deleting S3 file:", s3Error);
    // Continue with DynamoDB deletion
    // File orphaned but not critical
  }
}
```

### DynamoDB Error Handling
```javascript
// If DynamoDB fails after S3 upload:
// - File exists in S3
// - Metadata not in DB
// - Problem: orphaned file (minor storage cost)

// If S3 fails after DynamoDB update:
// - Metadata in DB references non-existent file
// - User can't download (fileUrl returns 403)
// - DB cleanup needed

// Solution: Consider implementing:
// - Cleanup job for orphaned S3 files
// - Retry logic with exponential backoff
// - Transaction logs for recovery
```

### Signed URL Expiration
```
Generated: 20260127T105500Z
Expires in: 3600 seconds
Valid until: 20260127T115500Z (1 hour later)

User can't extend URL:
  └─ Modifying X-Amz-Expires parameter → signature invalid
  └─ Can only request new URL from app

Frontend should:
  ├─ Refresh URLs on page load
  ├─ Show expiry time to user
  └─ Auto-refresh every 50 minutes
```

---

## 📋 DynamoDB Update Expression

### Dynamic Update Expression Building
```javascript
const updateExpressions = [];
const expressionValues = {};

if (title !== undefined) {
  updateExpressions.push("title = :t");
  expressionValues[":t"] = title;
}

if (content !== undefined) {
  updateExpressions.push("content = :c");
  expressionValues[":c"] = content;
}

if (fileUrl !== undefined) {
  updateExpressions.push("fileUrl = :f");
  expressionValues[":f"] = fileUrl;
}

// Result: "SET title = :t, content = :c, fileUrl = :f"
UpdateExpression: "SET " + updateExpressions.join(", ")
```

---

## ✅ Testing Checklist

### POST Tests
- [ ] Create note without file (JSON)
- [ ] Create note with file (FormData)
- [ ] Verify S3 file uploaded
- [ ] Verify signed URL works
- [ ] Verify DynamoDB entry created
- [ ] Verify signed URL expires after 1 hour

### GET Tests
- [ ] Fetch all notes for user
- [ ] Verify fileUrl is signed URL
- [ ] Verify files with no attachment don't have fileUrl
- [ ] Verify can download files using signed URL

### PUT Tests
- [ ] Update note text only
- [ ] Update with new file (should delete old)
- [ ] Update without file (should keep old)
- [ ] Verify old S3 file deleted when replaced
- [ ] Verify new signed URL generated

### DELETE Tests
- [ ] Delete note without file
- [ ] Delete note with file
- [ ] Verify S3 file deleted
- [ ] Verify DynamoDB entry deleted
- [ ] Verify download link no longer works
- [ ] Verify no orphaned files in S3

---

## 🚀 Deployment Steps

1. **Update Lambda Function Code**
   - Replace old handler with updated version
   - Ensure imports are correct
   - Test in development first

2. **Add S3 Permissions** (if not already added)
   ```json
   {
     "Effect": "Allow",
     "Action": [
       "s3:PutObject",
       "s3:GetObject",
       "s3:DeleteObject"
     ],
     "Resource": "arn:aws:s3:::vaibhav-aws-learning-bucket/notes/*"
   }
   ```

3. **Test All Operations**
   - Test file upload
   - Test file download (with signed URL)
   - Test file replacement
   - Test file deletion
   - Test signed URL expiration

4. **Monitor Logs**
   - Check CloudWatch for errors
   - Monitor S3 operations
   - Monitor DynamoDB usage
   - Watch for orphaned files

---

## 📌 Future Improvements

- [ ] Implement signed URL refresh on GET
- [ ] Add file size limits
- [ ] Add file type validation
- [ ] Add virus scanning (ClamAV)
- [ ] Implement cleanup job for orphaned S3 files
- [ ] Add transaction logs for recovery
- [ ] Cache signed URLs with expiry check
- [ ] Implement versioning for file updates
- [ ] Add CloudFront CDN for faster downloads
