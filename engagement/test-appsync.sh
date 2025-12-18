#!/bin/bash

# Load environment variables
source ../auth-upload/.env

# AppSync API configuration
APPSYNC_URL="https://vi3nkmozhfglbism5tqmfh5dhi.appsync-api.us-east-1.amazonaws.com/graphql"
TEST_VIDEO_ID="test-video-123"

echo "🔐 Signing in to get ID token..."
SIGNIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"frankshenjx@gmail.com\",
    \"password\": \"Sjx990617\"
  }")

ID_TOKEN=$(echo "${SIGNIN_RESPONSE}" | jq -r '.idToken')

if [ "$ID_TOKEN" == "null" ] || [ -z "$ID_TOKEN" ]; then
  echo "❌ Failed to get ID token"
  echo "Response: ${SIGNIN_RESPONSE}"
  exit 1
fi

echo "✅ Got ID token"
echo ""

# Test 1: Query a video
echo "📹 Test 1: Get Video"
curl -s -X POST "${APPSYNC_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -d '{
    "query": "query GetVideo($videoId: ID!) { getVideo(videoId: $videoId) { videoId filename status likeCount commentCount viewCount } }",
    "variables": {
      "videoId": "'"${TEST_VIDEO_ID}"'"
    }
  }' | jq '.'

echo ""

# Test 2: Record a view
echo "👁️  Test 2: Record View"
curl -s -X POST "${APPSYNC_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -d '{
    "query": "mutation RecordView($videoId: ID!) { recordView(videoId: $videoId) { likeCount commentCount viewCount } }",
    "variables": {
      "videoId": "'"${TEST_VIDEO_ID}"'"
    }
  }' | jq '.'

echo ""

# Test 3: Like a video
echo "👍 Test 3: Like Video"
curl -s -X POST "${APPSYNC_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -d '{
    "query": "mutation LikeVideo($videoId: ID!) { likeVideo(videoId: $videoId) { likeCount commentCount viewCount } }",
    "variables": {
      "videoId": "'"${TEST_VIDEO_ID}"'"
    }
  }' | jq '.'

echo ""

# Test 4: Add a comment
echo "💬 Test 4: Add Comment"
curl -s -X POST "${APPSYNC_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -d '{
    "query": "mutation AddComment($videoId: ID!, $content: String!) { addComment(videoId: $videoId, content: $content) { commentId userId content createdAt } }",
    "variables": {
      "videoId": "'"${TEST_VIDEO_ID}"'",
      "content": "Great video! Testing from CLI."
    }
  }' | jq '.'

echo ""

# Test 5: Unlike the video
echo "👎 Test 5: Unlike Video"
curl -s -X POST "${APPSYNC_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ID_TOKEN}" \
  -d '{
    "query": "mutation UnlikeVideo($videoId: ID!) { unlikeVideo(videoId: $videoId) { likeCount commentCount viewCount } }",
    "variables": {
      "videoId": "'"${TEST_VIDEO_ID}"'"
    }
  }' | jq '.'

echo ""
echo "✅ All tests completed!"
