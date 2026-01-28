# Signed URLs - Deep Dive

## What is a Signed URL?

A signed URL is a time-limited, cryptographically signed URL that grants temporary access to a private resource in AWS S3.

---

## 🔐 How Signed URLs Work

### Generation Process (Server-side - Lambda)

```
Step 1: Have AWS Credentials
  ├─ Lambda execution role has S3 permissions
  └─ Contains: AccessKeyId, SecretAccessKey, SessionToken

Step 2: Create Command Object
  const command = new GetObjectCommand({
    Bucket: "vaibhav-aws-learning-bucket",
    Key: "notes/demo-user/1706362800000-document.pdf"
  });

Step 3: Generate Signed URL
  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 3600  // 1 hour in seconds
  });

Step 4: What getSignedUrl() Does
  ├─ Takes secret access key (server has this)
  ├─ Creates StringToSign:
  │  ├─ HTTP method: GET
  │  ├─ Canonical URI: /notes/demo-user/...
  │  ├─ Query params: X-Amz-Algorithm, X-Amz-Credential, etc.
  │  ├─ Timestamp: 20260127T105500Z
  │  ├─ Expiration: 3600 seconds from now
  │  └─ Other headers: Host, etc.
  │
  ├─ Compute HMAC-SHA256 signature:
  │  signature = HMAC-SHA256(
  │    secretAccessKey,
  │    stringToSign
  │  )
  │
  └─ Build final URL:
     https://bucket.s3.region.amazonaws.com/key
     ?X-Amz-Algorithm=AWS4-HMAC-SHA256
     &X-Amz-Credential=AKIAIOSFODNN7EXAMPLE/20260127/ap-south-1/s3/aws4_request
     &X-Amz-Date=20260127T105500Z
     &X-Amz-Expires=3600
     &X-Amz-SignedHeaders=host
     &X-Amz-Signature=<computed-signature>
```

### Usage Process (Client-side - Browser)

```
Step 1: User Receives Signed URL
  ├─ From DynamoDB via GET /api/notes
  └─ URL example: https://bucket.s3.ap-south-1.amazonaws.com/...?X-Amz-Signature=...

Step 2: User Clicks Download Link
  ├─ Browser makes HTTP GET request to signed URL
  └─ URL contains all parameters including signature

Step 3: S3 Validates Request
  ├─ Extracts all parameters from URL
  ├─ Extracts signature from X-Amz-Signature parameter
  ├─ Recomputes what signature should be:
  │  newSignature = HMAC-SHA256(
  │    awsSecretKey (stored in S3),
  │    stringToSign (reconstructed from URL params)
  │  )
  │
  ├─ Compares: newSignature == X-Amz-Signature?
  │  └─ YES → Continue to next check
  │  └─ NO → Return 403 Forbidden
  │
  ├─ Checks current time vs X-Amz-Expires
  │  ├─ currentTime < (X-Amz-Date + X-Amz-Expires)
  │  └─ YES → Continue
  │  └─ NO → Return 403 Forbidden (expired)
  │
  └─ Checks requested object matches URL Key
     └─ YES → Grant access
     └─ NO → Return 403 Forbidden

Step 4: S3 Returns File
  ├─ Status: 200 OK
  ├─ Headers: Content-Type, Content-Length, ETag
  └─ Body: File contents (binary data)

Step 5: Browser Downloads File
  └─ User's download manager saves file
```

---

## 🎯 Why Signed URLs Are Secure

### ❌ Without Signed URLs (Public URL)
```
https://bucket.s3.amazonaws.com/notes/demo-user/document.pdf

Problems:
  ├─ Anyone with this URL can download forever
  ├─ Anyone can guess other URLs:
  │  ├─ /notes/demo-user/2706362800000-other-file.pdf
  │  ├─ /notes/other-user/...
  │  └─ No way to prevent enumeration
  ├─ Can share URL publicly (loses privacy)
  ├─ Bandwidth costs from random downloads
  ├─ Vulnerable to DoS (people spamming downloads)
  └─ Security risk: sensitive data exposed
```

### ✅ With Signed URLs (Secure)
```
https://bucket.s3.amazonaws.com/notes/demo-user/document.pdf
?X-Amz-Algorithm=AWS4-HMAC-SHA256
&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE/20260127/ap-south-1/s3/aws4_request
&X-Amz-Date=20260127T105500Z
&X-Amz-Expires=3600
&X-Amz-Signature=abc123def456ghi789...

Security benefits:
  ├─ URL only works for 1 hour (auto-expires)
  ├─ Cryptographic signature prevents tampering:
  │  └─ User can't change Key, Expires, or any param
  │  └─ Signature won't match if tampered
  ├─ Only authorized party generated it (AWS credentials)
  ├─ Audit trail: S3 logs who downloaded what
  ├─ Can revoke access (delete credential used)
  ├─ Works for private buckets (no public access needed)
  └─ Fine-grained control per file, per request
```

---

## 🔐 Signature Validation Details

### What Can't Be Modified?

```
Example signed URL:
  https://bucket.s3.ap-south-1.amazonaws.com/notes/demo-user/file.pdf
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=AKIAIOSFODNN7EXAMPLE/20260127/ap-south-1/s3/aws4_request
  &X-Amz-Date=20260127T105500Z
  &X-Amz-Expires=3600
  &X-Amz-Signature=abc123def456...

User attempts to modify:

1. Change file path
   Before: /notes/demo-user/file.pdf
   After: /notes/admin-user/admin-file.pdf
   Result: Signature invalid → 403 Forbidden

2. Extend expiration
   Before: &X-Amz-Expires=3600
   After: &X-Amz-Expires=86400
   Result: Signature invalid → 403 Forbidden

3. Use future date
   Before: &X-Amz-Date=20260127T105500Z
   After: &X-Amz-Date=20260127T115500Z
   Result: Signature invalid → 403 Forbidden

4. Add query parameters
   Before: ?X-Amz-Signature=abc...
   After: ?X-Amz-Signature=abc...&download=true
   Result: Signature invalid → 403 Forbidden

Why? Because signature = HMAC(secret, stringToSign)
  └─ StringToSign includes all these parameters
  └─ Change any parameter → different stringToSign
  └─ Different stringToSign → different signature
  └─ S3 rejects mismatched signature
```

---

## ⏰ Expiration Mechanism

### Timeline Example

```
Generation Time: 2026-01-27 10:55:00 UTC
Expiry Duration: 3600 seconds (1 hour)
Expiration Time: 2026-01-27 11:55:00 UTC

Parameters in URL:
  X-Amz-Date=20260127T105500Z (generation time)
  X-Amz-Expires=3600 (duration in seconds)

Validation: current_time < (X-Amz-Date + X-Amz-Expires)

Timeline:
  10:55:00 - URL generated (VALID)
  10:56:00 - User downloads (VALID) - 1 hour remaining
  11:00:00 - User downloads (VALID) - 55 minutes remaining
  11:50:00 - User downloads (VALID) - 5 minutes remaining
  11:55:00 - URL expires (now invalid)
  11:55:01 - User tries to download (INVALID) - 403 Forbidden
  11:56:00 - User tries to download (INVALID) - 403 Forbidden

If stored in DynamoDB:
  ├─ URL stored at 10:55:00
  ├─ Next day (24+ hours later)
  ├─ User clicks stored URL
  ├─ URL is expired
  └─ 403 Forbidden (unless refreshed)
```

### What Happens When URL Expires?

```
S3 receives request:
  ├─ Extracts X-Amz-Date: 20260127T105500Z
  ├─ Extracts X-Amz-Expires: 3600
  ├─ Calculates expiration time: 20260127T115500Z
  ├─ Gets current time: 20260127T120000Z (1 hour 5 minutes later)
  ├─ Checks: 20260127T120000Z > 20260127T115500Z?
  │  └─ YES (expired)
  ├─ Returns HTTP 403 Forbidden
  └─ Response body: 
     AccessDenied
     Request has expired.

Client receives:
  ├─ Status: 403
  └─ Error message about expired request
```

---

## 🔄 Signed URL Refresh Patterns

### Pattern 1: Refresh On Page Load (Recommended)

```javascript
// Frontend (page.tsx)
useEffect(() => {
  const fetchNotes = async () => {
    const res = await fetch("/api/notes");
    const notes = await res.json();
    
    // Fresh signed URLs every time page loads
    // URLs are valid for 1 hour from this moment
    setNotes(notes);
  };
  
  fetchNotes();
}, []);

// Lambda returns fresh signed URLs every time
// User has 1 hour of access from page load
```

**Pros:**
- Fresh URLs every time
- Simple to implement
- Works with any expiry duration

**Cons:**
- Extra API call on page load
- Network overhead
- Can't download after app closed for 1 hour

---

### Pattern 2: Generate On Demand (Better for Long Sessions)

```javascript
// Frontend
const handleDownload = async (noteId) => {
  // Instead of using stored URL, request fresh one
  const res = await fetch(`/api/notes/${noteId}/download-url`);
  const {fileUrl} = await res.json();
  
  // Open fresh signed URL in new tab
  window.open(fileUrl);
};

// Lambda adds new handler: GET /notes/{noteId}/download-url
if (method === "GET" && path === `/notes/${noteId}/download-url`) {
  // Fetch note from DynamoDB
  // Regenerate signed URL
  // Return fresh URL
}
```

**Pros:**
- URLs always fresh at download time
- Users can wait hours before downloading
- No stale URL problem

**Cons:**
- Extra API call per download
- More complex
- Slight delay when clicking download

---

### Pattern 3: Increase Expiry Time (Simpler but Less Secure)

```javascript
// Lambda
const signedUrl = await getSignedUrl(s3, command, {
  expiresIn: 86400  // 24 hours instead of 1 hour
});

// Pros: URLs last longer
// Cons: Less secure (more time for URL leaks)
```

---

### Pattern 4: Store with Expiry Check (Most Robust)

```javascript
// DynamoDB item
{
  noteId: "abc-123",
  title: "...",
  content: "...",
  fileUrl: "https://...",
  fileUrlExpiresAt: "2026-01-27T11:55:00Z"  // NEW
}

// Frontend
useEffect(() => {
  const fetchNotes = async () => {
    const res = await fetch("/api/notes");
    let notes = await res.json();
    
    // Check which URLs are expired
    const now = new Date();
    const needsRefresh = notes.filter(n => 
      new Date(n.fileUrlExpiresAt) < now
    );
    
    // If any expired, refresh them
    if (needsRefresh.length > 0) {
      const refreshed = await fetch("/api/notes/refresh-urls", {
        method: "POST",
        body: JSON.stringify({noteIds: needsRefresh.map(n => n.noteId)})
      }).then(r => r.json());
      
      // Update expired URLs
      notes = notes.map(n => 
        refreshed[n.noteId] || n
      );
    }
    
    setNotes(notes);
  };
}, []);

// Lambda: new handler for batch refresh
```

**Pros:**
- Only refresh when needed
- Efficient
- Users don't wait for unnecessary refreshes

**Cons:**
- More complex
- Requires storing expiry time

---

## 🛡️ Security Best Practices

### 1. Use Short Expiry Times
```javascript
// ✅ Good
const url = await getSignedUrl(s3, command, {expiresIn: 3600});  // 1 hour

// ❌ Bad
const url = await getSignedUrl(s3, command, {expiresIn: 604800}); // 7 days
```

### 2. Always Use HTTPS
```
✅ HTTPS signed URL (encrypted in transit)
https://bucket.s3.amazonaws.com/...?X-Amz-Signature=...

❌ Never HTTP (plain text, signature exposed)
http://bucket.s3.amazonaws.com/...?X-Amz-Signature=...
```

### 3. Limit URL Sharing
```
✅ Share securely (encrypted chat, secure link)
❌ Don't share in:
  - Public URLs/forums
  - Unencrypted email
  - Plain text logs
```

### 4. Audit S3 Access
```
Enable CloudTrail and S3 server access logging
  ├─ Track who accessed what
  ├─ Detect suspicious activity
  ├─ Investigate breaches
  └─ Compliance requirements
```

### 5. Use Least Privilege
```
Lambda role should only have:
  ├─ s3:GetObject (for generating signed URLs)
  ├─ s3:PutObject (for uploads)
  ├─ s3:DeleteObject (for cleanup)
  
NOT:
  └─ s3:* (all actions)
```

---

## 📊 Signed URL Anatomy

```
https://bucket.s3.ap-south-1.amazonaws.com/notes/demo-user/file.pdf
?X-Amz-Algorithm=AWS4-HMAC-SHA256
&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE/20260127/ap-south-1/s3/aws4_request
&X-Amz-Date=20260127T105500Z
&X-Amz-Expires=3600
&X-Amz-SignedHeaders=host
&X-Amz-Signature=abc123def456ghi789...

Breaking it down:

1. Host: bucket.s3.ap-south-1.amazonaws.com
   └─ AWS S3 endpoint for this bucket

2. Path: /notes/demo-user/file.pdf
   └─ Object key in S3

3. X-Amz-Algorithm: AWS4-HMAC-SHA256
   └─ Signing algorithm used

4. X-Amz-Credential: AKIAIOSFODNN7EXAMPLE/20260127/ap-south-1/s3/aws4_request
   └─ AccessKeyId/Date/Region/Service/aws4_request
   └─ Identifies who generated URL

5. X-Amz-Date: 20260127T105500Z
   └─ When URL was generated (UTC)

6. X-Amz-Expires: 3600
   └─ How long URL is valid (seconds)

7. X-Amz-SignedHeaders: host
   └─ Which headers are included in signature

8. X-Amz-Signature: abc123def456ghi789...
   └─ HMAC-SHA256 signature (cryptographic proof)
```

---

## Implementation in Our App

### Frontend Usage
```typescript
// page.tsx - display download link
const download Link = note.fileUrl
  ? (
    <a href={note.fileUrl} target="_blank" rel="noopener noreferrer">
      📎 Download {note.fileName}
    </a>
  )
  : null;
```

### Backend Generation
```javascript
// Lambda - generate signed URL after S3 upload
const signedUrl = await getSignedUrl(s3, 
  new GetObjectCommand({Bucket, Key: s3Key}),
  {expiresIn: 3600}
);

// Store in DynamoDB
await ddb.send(new PutCommand({
  TableName: TABLE_NAME,
  Item: {
    ...note,
    fileUrl: signedUrl,
    // Optional: fileUrlExpiresAt: new Date(Date.now() + 3600000)
  }
}));
```

### DynamoDB Storage
```javascript
{
  userId: "demo-user",
  noteId: "abc-123",
  title: "My Document",
  content: "...",
  fileUrl: "https://bucket.s3.ap-south-1.amazonaws.com/notes/demo-user/file.pdf?X-Amz-Signature=...",
  fileName: "document.pdf",
  s3Key: "notes/demo-user/1706362800000-document.pdf"
}
```
