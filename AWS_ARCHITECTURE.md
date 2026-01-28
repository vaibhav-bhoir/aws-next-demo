# AWS Architecture Diagram - Notes Application

## 🏗️ Complete Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                    │
│                         (React/Next.js Frontend)                             │
│                                                                              │
│  Components:                                                                 │
│  • Notes List Display                                                        │
│  • Create Note Form (with file upload)                                       │
│  • Edit/Delete Actions                                                       │
│  • Image Preview Links                                                       │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           │ HTTP Requests
                           │ (FormData for files, JSON for text)
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          NEXT.JS API ROUTES                                  │
│                        (Edge/Serverless Layer)                               │
│                                                                              │
│  Routes:                                                                     │
│  • POST   /api/notes    → Create note (with optional file)                  │
│  • GET    /api/notes    → List all notes                                    │
│  • PUT    /api/notes    → Update note (with optional file)                  │
│  • DELETE /api/notes    → Delete note (and S3 file)                         │
│                                                                              │
│  Security:                                                                   │
│  • Adds x-api-key header: "notes-demo-key-123"                              │
│  • Forwards requests to Lambda                                              │
│  • Handles CORS and response formatting                                     │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           │ HTTPS + API Key Auth
                           │ (Content-Type: multipart/form-data OR application/json)
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS LAMBDA FUNCTION                                  │
│                        (notes-handler.js - Node.js)                          │
│                         Region: ap-south-1 (Mumbai)                          │
│                                                                              │
│  Authentication:                                                             │
│  • Validates x-api-key header                                               │
│  • Returns 401 if missing/invalid                                           │
│                                                                              │
│  Business Logic:                                                             │
│  ┌───────────────────────────────────────────────────────────┐              │
│  │ POST Handler (Create Note)                                │              │
│  │ 1. Parse multipart form data (title, content, file)       │              │
│  │ 2. Upload file to S3 (if present)                         │              │
│  │ 3. Generate signed URL (1 hour expiry)                    │              │
│  │ 4. Save metadata to DynamoDB                              │              │
│  │ 5. Return note with fileUrl                               │              │
│  └───────────────────────────────────────────────────────────┘              │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────┐              │
│  │ GET Handler (List Notes)                                  │              │
│  │ 1. Query DynamoDB by userId                               │              │
│  │ 2. Return array of notes with signed URLs                 │              │
│  └───────────────────────────────────────────────────────────┘              │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────┐              │
│  │ PUT Handler (Update Note)                                 │              │
│  │ 1. Fetch existing note from DynamoDB                      │              │
│  │ 2. If new file provided:                                  │              │
│  │    • Delete old S3 file                                   │              │
│  │    • Upload new file to S3                                │              │
│  │    • Generate new signed URL                              │              │
│  │ 3. Update DynamoDB with new data                          │              │
│  └───────────────────────────────────────────────────────────┘              │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────┐              │
│  │ DELETE Handler (Remove Note)                              │              │
│  │ 1. Fetch note from DynamoDB                               │              │
│  │ 2. Delete file from S3 (using s3Key)                      │              │
│  │ 3. Delete note from DynamoDB                              │              │
│  └───────────────────────────────────────────────────────────┘              │
│                                                                              │
│  IAM Permissions Required:                                                   │
│  • dynamodb:Query, PutItem, GetItem, UpdateItem, DeleteItem                 │
│  • s3:PutObject, GetObject, DeleteObject                                    │
└────────────┬─────────────────────────────────┬──────────────────────────────┘
             │                                 │
             │                                 │
             ▼                                 ▼
┌─────────────────────────────┐  ┌─────────────────────────────────────────┐
│     AMAZON DYNAMODB         │  │          AMAZON S3 BUCKET               │
│  Table: NotesTable          │  │  Bucket: vaibhav-aws-learning-bucket    │
│  Region: ap-south-1         │  │  Region: ap-south-1                     │
│                             │  │                                         │
│  Primary Key:               │  │  File Structure:                        │
│  • userId (Partition Key)   │  │  notes/                                 │
│  • noteId (Sort Key)        │  │    └─ demo-user/                        │
│                             │  │         ├─ 1769590708954-brisbane.jpeg  │
│  Attributes:                │  │         ├─ 1769591118577-logo.png       │
│  • title (String)           │  │         └─ 1769591304667-doc.pdf        │
│  • content (String)         │  │                                         │
│  • fileUrl (String)         │  │  File Naming:                           │
│  • fileName (String)        │  │  {timestamp}-{originalFileName}         │
│  • s3Key (String)           │  │                                         │
│  • createdAt (ISO String)   │  │  Storage Configuration:                 │
│                             │  │  • Private bucket (no public access)    │
│  Data Isolation:            │  │  • Signed URLs for secure access        │
│  • Each user has own        │  │  • Content-Type preserved               │
│    partition                │  │  • Content-Disposition: inline          │
│  • Notes grouped by userId  │  │    (for browser display)                │
└─────────────────────────────┘  └────────────────┬────────────────────────┘
                                                   │
                                                   │ Signed URL Generation
                                                   │ (via @aws-sdk/s3-request-presigner)
                                                   ▼
                                  ┌──────────────────────────────────────────┐
                                  │       SIGNED URL MECHANISM               │
                                  │                                          │
                                  │  Generated by Lambda:                    │
                                  │  • Algorithm: AWS4-HMAC-SHA256           │
                                  │  • Expiry: 3600 seconds (1 hour)         │
                                  │  • Signature: Cryptographically signed   │
                                  │  • Parameters: Cannot be modified        │
                                  │                                          │
                                  │  Example URL:                            │
                                  │  https://bucket.s3.region.amazonaws.com/ │
                                  │  notes/demo-user/file.jpg                │
                                  │  ?X-Amz-Algorithm=AWS4-HMAC-SHA256       │
                                  │  &X-Amz-Credential=ACCESS_KEY/...        │
                                  │  &X-Amz-Date=20260128T090518Z            │
                                  │  &X-Amz-Expires=3600                     │
                                  │  &X-Amz-Signature=abc123...              │
                                  │  &response-content-disposition=inline    │
                                  │                                          │
                                  │  Security:                               │
                                  │  • URL tampering detected                │
                                  │  • Auto-expires after 1 hour             │
                                  │  • No bucket credentials exposed         │
                                  └──────────────────────────────────────────┘
```

---

## 📊 Data Flow Diagrams

### 1️⃣ Create Note with File Upload Flow

```
Browser                Next.js API           Lambda              S3                DynamoDB
  │                        │                    │                 │                    │
  │ POST /api/notes        │                    │                 │                    │
  │ (FormData: title,      │                    │                 │                    │
  │  content, file)        │                    │                 │                    │
  ├───────────────────────>│                    │                 │                    │
  │                        │                    │                 │                    │
  │                        │ Forward request    │                 │                    │
  │                        │ + x-api-key        │                 │                    │
  │                        ├───────────────────>│                 │                    │
  │                        │                    │                 │                    │
  │                        │                    │ Validate API key│                    │
  │                        │                    │ Parse multipart │                    │
  │                        │                    │ Extract file    │                    │
  │                        │                    │ buffer          │                    │
  │                        │                    │                 │                    │
  │                        │                    │ PutObject       │                    │
  │                        │                    │ (file buffer +  │                    │
  │                        │                    │  ContentType)   │                    │
  │                        │                    ├────────────────>│                    │
  │                        │                    │                 │                    │
  │                        │                    │    File stored  │                    │
  │                        │                    │<────────────────┤                    │
  │                        │                    │                 │                    │
  │                        │                    │ Generate signed URL                  │
  │                        │                    │ (1 hour expiry) │                    │
  │                        │                    │                 │                    │
  │                        │                    │ PutItem         │                    │
  │                        │                    │ (note + fileUrl │                    │
  │                        │                    │  + s3Key)       │                    │
  │                        │                    ├───────────────────────────────────>│
  │                        │                    │                 │                    │
  │                        │                    │                 │   Note saved       │
  │                        │                    │<───────────────────────────────────┤
  │                        │                    │                 │                    │
  │                        │ Return note        │                 │                    │
  │                        │<───────────────────┤                 │                    │
  │                        │                    │                 │                    │
  │   201 Created          │                    │                 │                    │
  │   {note with fileUrl}  │                    │                 │                    │
  │<───────────────────────┤                    │                 │                    │
  │                        │                    │                 │                    │
```

### 2️⃣ Delete Note with S3 Cleanup Flow

```
Browser                Next.js API           Lambda              DynamoDB           S3
  │                        │                    │                    │               │
  │ DELETE /api/notes      │                    │                    │               │
  │ ?noteId=abc-123        │                    │                    │               │
  ├───────────────────────>│                    │                    │               │
  │                        │                    │                    │               │
  │                        │ Forward + api-key  │                    │               │
  │                        ├───────────────────>│                    │               │
  │                        │                    │                    │               │
  │                        │                    │ GetItem            │               │
  │                        │                    │ (fetch note)       │               │
  │                        │                    ├───────────────────>│               │
  │                        │                    │                    │               │
  │                        │                    │ Note with s3Key    │               │
  │                        │                    │<───────────────────┤               │
  │                        │                    │                    │               │
  │                        │                    │ DeleteObject       │               │
  │                        │                    │ (using s3Key)      │               │
  │                        │                    ├───────────────────────────────────>│
  │                        │                    │                    │               │
  │                        │                    │                    │ File deleted  │
  │                        │                    │<───────────────────────────────────┤
  │                        │                    │                    │               │
  │                        │                    │ DeleteItem         │               │
  │                        │                    │ (remove note)      │               │
  │                        │                    ├───────────────────>│               │
  │                        │                    │                    │               │
  │                        │                    │    Success         │               │
  │                        │                    │<───────────────────┤               │
  │                        │                    │                    │               │
  │                        │ 200 OK             │                    │               │
  │                        │<───────────────────┤                    │               │
  │                        │                    │                    │               │
  │   Success message      │                    │                    │               │
  │<───────────────────────┤                    │                    │               │
  │                        │                    │                    │               │
```

---

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                              │
└─────────────────────────────────────────────────────────────────┘

Layer 1: API Key Authentication
├─ Next.js API adds header: x-api-key
├─ Lambda validates before any operation
└─ 401 Unauthorized if missing/invalid

Layer 2: IAM Permissions (Lambda Execution Role)
├─ Principle of Least Privilege
├─ DynamoDB: Query, Get, Put, Update, Delete on NotesTable only
├─ S3: PutObject, GetObject, DeleteObject on specific bucket
└─ No wildcard (*) permissions

Layer 3: Private S3 Bucket
├─ No public access allowed
├─ All access through signed URLs only
└─ Signed URLs auto-expire (1 hour)

Layer 4: Signed URLs
├─ Cryptographic signature (HMAC-SHA256)
├─ Cannot be modified without invalidation
├─ Time-bound access (expires after 3600 seconds)
└─ Includes request parameters in signature

Layer 5: User Isolation (Data)
├─ DynamoDB Partition Key: userId
├─ S3 prefix: notes/{userId}/
└─ Each user can only access their own data

Layer 6: HTTPS Everywhere
├─ Next.js ↔ Lambda: HTTPS
├─ Lambda ↔ DynamoDB: AWS SDK (encrypted)
├─ Lambda ↔ S3: AWS SDK (encrypted)
└─ Browser ↔ S3: HTTPS (signed URLs)
```

---

## 💾 Data Models

### DynamoDB Schema

```javascript
{
  // Primary Key
  userId: "demo-user",          // Partition Key (for isolation)
  noteId: "abc-123-def-456",    // Sort Key (UUID)
  
  // Note Data
  title: "My Important Note",
  content: "This is the note content...",
  
  // File Metadata (if file uploaded)
  fileName: "brisbane.jpeg",
  fileUrl: "https://bucket.s3.region.amazonaws.com/...?X-Amz-Signature=...",
  s3Key: "notes/demo-user/1769590708954-brisbane.jpeg",
  
  // Timestamps
  createdAt: "2026-01-28T09:05:08.954Z"
}
```

### S3 File Organization

```
vaibhav-aws-learning-bucket/
└── notes/
    ├── demo-user/
    │   ├── 1769590708954-brisbane.jpeg
    │   ├── 1769591118577-google-logo.png
    │   └── 1769591304667-document.pdf
    │
    └── user-2/
        ├── 1769591500000-image.jpg
        └── 1769591600000-file.txt

File naming convention:
{timestamp}-{originalFileName}

Benefits:
• Timestamp ensures uniqueness
• Sortable by upload time
• Original filename preserved for user
• User isolation via folder structure
```

---

## 🚀 Deployment Configuration

### Environment Variables

**Next.js (.env.local)**
```bash
LAMBDA_URL=https://YOUR_LAMBDA_URL.lambda-url.ap-south-1.on.aws/
API_KEY=notes-demo-key-123
```

**AWS Lambda**
```bash
API_KEY=notes-demo-key-123
```

### AWS Resources Configuration

**Lambda Function**
- Runtime: Node.js (latest)
- Region: ap-south-1 (Mumbai)
- Memory: 512 MB (recommended for file processing)
- Timeout: 30 seconds
- Execution Role: Custom role with DynamoDB + S3 permissions
- Function URL: Enabled (public endpoint)

**DynamoDB Table**
- Name: NotesTable
- Region: ap-south-1
- Partition Key: userId (String)
- Sort Key: noteId (String)
- Billing Mode: On-demand (pay per request)
- Encryption: AWS managed keys

**S3 Bucket**
- Name: vaibhav-aws-learning-bucket
- Region: ap-south-1
- Access: Private (no public access)
- Versioning: Disabled
- Encryption: AES-256

---

## 📈 Request/Response Flow Summary

| Operation | Method | Path | Request Body | Response |
|-----------|--------|------|--------------|----------|
| Create Note | POST | /api/notes | FormData (title, content, file?) | 201 + note object |
| List Notes | GET | /api/notes | None | 200 + array of notes |
| Update Note | PUT | /api/notes | JSON or FormData | 200 + success message |
| Delete Note | DELETE | /api/notes?noteId=X | None | 200 + success message |

---

## 🎯 Key Features

✅ **File Upload**: Browser → Next.js → Lambda → S3 (with multipart parsing)  
✅ **Signed URLs**: Secure, time-limited access to private S3 files  
✅ **File Cleanup**: Deleting note also removes S3 file (no orphaned files)  
✅ **File Replacement**: Updating note with new file deletes old file  
✅ **API Key Auth**: Lambda validates every request  
✅ **User Isolation**: Data partitioned by userId  
✅ **Content-Type Preservation**: Images/PDFs display correctly in browser  
✅ **Binary Data Handling**: Proper buffer management for image uploads  
✅ **Error Handling**: Graceful degradation (continues DB delete even if S3 fails)  

---

## 📋 AWS Services Used

| Service | Purpose | Estimated Cost |
|---------|---------|----------------|
| **AWS Lambda** | Serverless compute for business logic | ~$0.20 per 1M requests |
| **Amazon DynamoDB** | NoSQL database for note metadata | ~$0.25 per 1M read/write requests |
| **Amazon S3** | Object storage for file uploads | ~$0.023 per GB/month + data transfer |
| **IAM** | Access control and security | Free |
| **CloudWatch** | Logging and monitoring | ~$0.50 per GB ingested |

**Total estimated cost for 10,000 notes/month with files:** < $5/month

---

## 🔄 Scalability & Performance

**Current Architecture:**
- Scales automatically (serverless)
- No server management required
- Pay only for what you use

**Performance Characteristics:**
- Lambda cold start: ~500ms (first request)
- Lambda warm: ~50-100ms
- DynamoDB latency: Single-digit milliseconds
- S3 upload: Depends on file size (~2 seconds for 1MB)
- Signed URL generation: <10ms

**Potential Improvements:**
1. Add CloudFront CDN for faster file downloads
2. Add DynamoDB GSI for advanced queries
3. Implement S3 Transfer Acceleration for large files
4. Add ElastiCache for frequently accessed notes
5. Use Step Functions for complex workflows
6. Add SNS/SQS for asynchronous operations

---

## 🛡️ Disaster Recovery

**Current Setup:**
- DynamoDB: Point-in-time recovery (enable if needed)
- S3: Versioning disabled (enable for file history)
- Lambda: Code stored in AWS (deployable anytime)

**Backup Strategy:**
1. Enable DynamoDB backups (manual or automatic)
2. Enable S3 versioning for file history
3. Store Lambda code in GitHub (done ✅)
4. Export DynamoDB to S3 periodically (for archival)

---

## 📊 Monitoring & Logging

**CloudWatch Logs:**
- Lambda execution logs
- API Gateway access logs (if using API Gateway)
- Application errors and debugging info

**Metrics to Monitor:**
- Lambda invocations (count)
- Lambda errors (count)
- Lambda duration (ms)
- DynamoDB consumed read/write units
- S3 storage usage (GB)
- S3 request count

**Alerts to Set:**
- Lambda error rate > 5%
- Lambda duration > 25 seconds (near timeout)
- DynamoDB throttling events
- S3 storage > 100 GB (cost management)

---

## 🏁 Conclusion

This architecture implements a **fully serverless**, **secure**, and **scalable** notes application with file upload capabilities using AWS best practices.

**Strengths:**
- No server management
- Auto-scaling
- Pay-per-use pricing
- Secure file storage
- Proper cleanup (no orphaned files)

**Areas for Future Enhancement:**
- CloudFront for CDN
- Cognito for user authentication
- API Gateway for rate limiting
- Step Functions for workflows
- SNS for notifications
