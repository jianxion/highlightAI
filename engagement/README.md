# HighlightAI - Social Engagement & AppSync Module

**Handles social engagement features (likes, comments, views) with real-time updates via AppSync GraphQL**

## Architecture

```
Edited Video → S3 (Processed) → Lambda → DynamoDB
                                     ↓
iOS App → AppSync GraphQL API → SQS Queue → Lambda → DynamoDB (Likes/Comments/Views)
                 ↓
          Real-time Subscriptions (WebSocket)
```

## What's Included

- **AppSync GraphQL API** - Real-time API with subscriptions
- **Processed Videos S3 Bucket** - Storage for edited videos from AI pipeline
- **DynamoDB Tables**:
  - `highlightai-likes` - User likes on videos
  - `highlightai-comments` - Video comments
  - `highlightai-views` - Video view tracking
- **SQS Queue** - Engagement actions for concurrency handling
- **Lambda Function** - Processes likes, comments, views

## Prerequisites

1. **Deploy auth-upload module first**:
   ```bash
   cd ../auth-upload
   ./deploy.sh
   ```

2. **AWS CLI & SAM CLI** installed

## Deployment

```bash
cd engagement
chmod +x deploy.sh
./deploy.sh
```

## GraphQL Schema

### Queries

```graphql
# Get a single video
query GetVideo {
  getVideo(videoId: "video-uuid") {
    videoId
    filename
    status
    likeCount
    commentCount
    viewCount
  }
}

# List all videos
query ListVideos {
  listVideos(limit: 20) {
    videoId
    filename
    status
    createdAt
  }
}
```

### Mutations

```graphql
# Like a video
mutation LikeVideo {
  likeVideo(videoId: "video-uuid") {
    likeCount
    commentCount
    viewCount
  }
}

# Unlike a video
mutation UnlikeVideo {
  unlikeVideo(videoId: "video-uuid") {
    likeCount
    commentCount
    viewCount
  }
}

# Add comment
mutation AddComment {
  addComment(
    videoId: "video-uuid"
    content: "Great video!"
  ) {
    commentId
    userId
    content
    createdAt
  }
}

# Record view
mutation RecordView {
  recordView(videoId: "video-uuid") {
    likeCount
    commentCount
    viewCount
  }
}
```

### Subscriptions (Real-time Updates)

```graphql
subscription OnEngagementUpdate {
  onVideoEngagementUpdate(videoId: "video-uuid") {
    likeCount
    commentCount
    viewCount
  }
}
```

## Execution Flow

```
11. Edited video uploaded to S3 Processed bucket
    ↓
12. S3 triggers Lambda via SQS
    ↓
13. Lambda updates DynamoDB with processedS3Key and CloudFront URL
    ↓
14. React app queries AppSync to get video feed
    ↓
15. User likes/comments/views → AppSync mutation → SQS Queue
    ↓
16. Lambda processes engagement → Updates DynamoDB tables
    ↓
17. AppSync subscription broadcasts updates to all connected React clients (real-time)
```

## DynamoDB Schema

### Likes Table
```json
{
  "videoId": "uuid",      // Hash Key
  "userId": "cognito-sub", // Range Key
  "createdAt": 1234567890
}
```

### Comments Table
```json
{
  "videoId": "uuid",         // Hash Key
  "commentId": "uuid",       // Range Key
  "userId": "cognito-sub",
  "userEmail": "user@example.com",
  "content": "Great video!",
  "createdAt": 1234567890
}
```

### Views Table
```json
{
  "videoId": "uuid",      // Hash Key
  "userId": "cognito-sub", // Range Key
  "viewedAt": 1234567890
}
```

## Concurrency Handling

**Problem**: Multiple users liking simultaneously could cause race conditions.

**Solution**: SQS Queue buffers engagement actions, Lambda processes sequentially.

```
User A likes → AppSync → SQS
User B likes → AppSync → SQS
User C likes → AppSync → SQS
         ↓
    Lambda processes one-by-one
         ↓
    DynamoDB atomic increments
```

## Testing

```bash
chmod +x test-appsync.sh
./test-appsync.sh
```


## Cleanup

```bash
aws cloudformation delete-stack --stack-name highlightai-engagement
```

