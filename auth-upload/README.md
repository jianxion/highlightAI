# HighlightAI - Authentication & Upload Module

**Part of the HighlightAI serverless video platform**

This module handles user authentication (Cognito) and video upload via S3 presigned URLs.

## Architecture

```
User → API Gateway → Lambda → Cognito (Auth)
                   ↓
                   S3 (Video Upload)
                   ↓
                   SQS → Lambda → DynamoDB
```

## What's Included

- **Cognito User Pool** - Email/password authentication
- **API Gateway** - REST API endpoints
- **S3 Bucket** - Raw video storage
- **DynamoDB Table** - Video metadata storage
- **SQS Queue** - Upload event processing with DLQ

## Quick Start

### Prerequisites

1. **AWS CLI** - [Install](https://aws.amazon.com/cli/)
2. **AWS SAM CLI** - [Install](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
3. **AWS Account** - Configure credentials:
   ```bash
   aws configure
   ```

### Required AWS Permissions

Your AWS IAM user needs these permissions to deploy:
Attach these AWS managed policies to your IAM user:
- `PowerUserAccess` - For creating AWS resources
- `IAMFullAccess` - For creating IAM roles for Lambda functions


**To grant permissions (ask your AWS admin or use root account):**
```bash
# Using AWS Console:
# 1. Go to IAM → Users → [Your Username]
# 2. Add permissions → Attach policies directly
# 3. Select "PowerUserAccess" and "IAMFullAccess"

# Or using AWS CLI (requires admin access):
aws iam attach-user-policy \
  --user-name YourUsername \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess

aws iam attach-user-policy \
  --user-name YourUsername \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess
```

### Deployment

```bash
# Make scripts executable
chmod +x deploy.sh test.sh

# Deploy to AWS (creates all resources)
./deploy.sh

# This will:
# - Build Lambda functions
# - Deploy CloudFormation stack
# - Create .env file with outputs
```

### Testing

```bash
# Run automated API tests
./test.sh
```

## API Endpoints

After deployment, you'll get these endpoints:

### 1. Sign Up
```bash
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "message": "User created successfully",
  "userId": "abc123...",
  "confirmed": true,
  "email": "user@example.com"
}
```

### 2. Sign In
```bash
POST /auth/signin
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "message": "Sign in successful",
  "accessToken": "eyJraWQ...",
  "idToken": "eyJraWQ...",
  "refreshToken": "eyJjdHk...",
  "expiresIn": 3600
}
```

### 3. Get Presigned Upload URL
```bash
POST /upload/presigned-url
Content-Type: application/json
Authorization: Bearer <accessToken>

{
  "filename": "my-video.mp4",
  "contentType": "video/mp4",
  "fileSize": 52428800
}
```

**Response:**
```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://s3.amazonaws.com/...",
  "s3Key": "videos/userId_videoId_timestamp_filename.mp4",
  "expiresIn": 900
}
```

### 4. Upload Video to S3
```bash
PUT <uploadUrl>
Content-Type: video/mp4
Body: <binary video data>
```


## View Your Resources

### Check Cognito User Pool
```bash
aws cognito-idp list-users --user-pool-id <your-pool-id>
```

### Check DynamoDB Table
```bash
aws dynamodb scan --table-name highlightai-videos


```

### Check S3 Bucket
```bash
aws s3 ls s3://highlightai-raw-videos-dev-<your-account-id>/videos/
```

## Upload Flow

1. **User signs up** → Cognito creates account
2. **User signs in** → Receives JWT tokens
3. **Request presigned URL** → Lambda validates JWT, creates DynamoDB entry
4. **Upload to S3** → Client uploads directly to S3 (no backend bottleneck)
5. **S3 triggers event** → SQS receives notification
6. **Lambda processes** → Transcribe + Rekognition analysis
7. **Consolidation** → JSON analysis + MediaConvert job creation
8. **Editing** → MediaConvert processes cuts and outputs final video to S3

## DynamoDB Schema

**Videos Table:**
```json
{
  "videoId": "uuid",           // Primary Key
  "userId": "cognito-sub",     // GSI Hash Key
  "createdAt": 1234567890,     // GSI Range Key
  "filename": "video.mp4",
  "s3Key": "videos/...",
  "status": "UPLOADING|UPLOADED|PROCESSING|COMPLETE",
  "fileSize": 52428800,
  "uploadedSize": 52428800
}
```

## Configuration

After deployment, `.env` file is auto-generated:

```bash
API_URL=https://xxx.execute-api.us-east-1.amazonaws.com/dev
USER_POOL_ID=us-east-1_xxxxx
CLIENT_ID=xxxxxxxxxxxxx
RAW_VIDEOS_BUCKET=highlightai-raw-videos-123456789
```


## Cleanup

To delete the stack

```bash
aws cloudformation delete-stack --stack-name highlightai-auth-upload-dev
```


## Resources

- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)


