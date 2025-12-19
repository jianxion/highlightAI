#!/bin/bash

# HighlightAI - API Testing Script

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo ".env file not found. Run deploy.sh first."
    exit 1
fi

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🧪 HighlightAI - API Testing"
echo "============================"
echo ""

# Test data
TEST_EMAIL="frankshenjx@gmail.com" ## replace with your email to receive verification code
TEST_PASSWORD="Sjx990617" # Replace with your desired test password
TEST_NAME="monish"

echo -e "${BLUE}Test User:${NC}"
echo "  Email: ${TEST_EMAIL}"
echo "  Password: ${TEST_PASSWORD}"
echo ""

# 1. Test Signup
echo -e "${YELLOW}1️⃣  Testing Signup...${NC}"
SIGNUP_RESPONSE=$(curl -s -X POST "${API_URL}/auth/signup" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"${TEST_EMAIL}\",
        \"password\": \"${TEST_PASSWORD}\",
        \"name\": \"${TEST_NAME}\"
    }")

echo "${SIGNUP_RESPONSE}" | jq '.'

# Check if signup was successful or user already exists
if echo "${SIGNUP_RESPONSE}" | jq -e '.userId' > /dev/null; then
    echo -e "${GREEN}✅ Signup successful${NC}"
    
    # Only ask for verification code if this is a new signup
    echo ""
    echo -e "${YELLOW}📧 Check your email for the verification code${NC}"
    echo -e "${BLUE}Enter the 6-digit verification code:${NC}"
    read -r VERIFICATION_CODE

    # 2. Confirm Email (Using API Endpoint)
    echo ""
    echo -e "${YELLOW}2️⃣  Confirming Email via API...${NC}"
    CONFIRM_RESPONSE=$(curl -s -X POST "${API_URL}/auth/confirm" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"${TEST_EMAIL}\",
            \"code\": \"${VERIFICATION_CODE}\"
        }")

    echo "${CONFIRM_RESPONSE}" | jq '.'

    if echo "${CONFIRM_RESPONSE}" | jq -e '.message' | grep -q "confirmed successfully"; then
        echo -e "${GREEN}✅ Email confirmed successfully${NC}"
    else
        echo -e "${RED}❌ Email confirmation failed${NC}"
        exit 1
    fi
    
elif echo "${SIGNUP_RESPONSE}" | jq -e '.error' | grep -q "User already exists"; then
    echo -e "${BLUE}ℹ️  User already exists, skipping to signin...${NC}"
else
    echo -e "${RED}❌ Signup failed${NC}"
    exit 1
fi

echo ""
sleep 2

# 3. Test Signin
echo -e "${YELLOW}3️⃣  Testing Signin...${NC}"
SIGNIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/signin" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"${TEST_EMAIL}\",
        \"password\": \"${TEST_PASSWORD}\"
    }")

echo "${SIGNIN_RESPONSE}" | jq '.'

ACCESS_TOKEN=$(echo "${SIGNIN_RESPONSE}" | jq -r '.accessToken')
ID_TOKEN=$(echo "${SIGNIN_RESPONSE}" | jq -r '.idToken')

if [ "${ACCESS_TOKEN}" != "null" ] && [ -n "${ACCESS_TOKEN}" ]; then
    echo -e "${GREEN}✅ Signin successful${NC}"
    echo -e "${BLUE}Access Token (first 50 chars): ${ACCESS_TOKEN:0:50}...${NC}"
    echo -e "${BLUE}ID Token (first 50 chars): ${ID_TOKEN:0:50}...${NC}"
    
    # Validate token with Cognito
    echo -e "${BLUE}Validating access token with Cognito...${NC}"
    if aws cognito-idp get-user --access-token "${ACCESS_TOKEN}" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Access Token is valid${NC}"
    else
        echo -e "${RED}⚠️  Access Token validation failed - token might be invalid or expired${NC}"
    fi
else
    echo -e "${RED}❌ Signin failed - No access token received${NC}"
    exit 1
fi

echo ""
sleep 1

# 4. Test Presigned URL Generation with ID Token
echo -e "${YELLOW}4️⃣  Testing Presigned URL Generation (with ID Token)...${NC}"
echo -e "${BLUE}Using Authorization: Bearer ${ID_TOKEN:0:50}...${NC}"
PRESIGNED_RESPONSE=$(curl -s -X POST "${API_URL}/upload/presigned-url" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ID_TOKEN}" \
    -d "{
        \"filename\": \"test-video.mp4\",
        \"contentType\": \"video/mp4\",
        \"fileSize\": 10485760
    }" \
    -w "\nHTTP_CODE:%{http_code}")

# Extract HTTP code and response body
HTTP_CODE=$(echo "${PRESIGNED_RESPONSE}" | grep "HTTP_CODE:" | cut -d: -f2)
PRESIGNED_BODY=$(echo "${PRESIGNED_RESPONSE}" | sed '/HTTP_CODE:/d')

echo "${PRESIGNED_BODY}" | jq '.'
echo -e "${BLUE}HTTP Status Code: ${HTTP_CODE}${NC}"


UPLOAD_URL=$(echo "${PRESIGNED_BODY}" | jq -r '.uploadUrl')
VIDEO_ID=$(echo "${PRESIGNED_BODY}" | jq -r '.videoId')

if [ "${UPLOAD_URL}" != "null" ] && [ -n "${UPLOAD_URL}" ]; then
    echo -e "${GREEN}✅ Presigned URL generated${NC}"
    echo -e "${BLUE}Video ID: ${VIDEO_ID}${NC}"
else
    echo -e "${RED}❌ Presigned URL generation failed${NC}"
    exit 1
fi

echo ""
sleep 1

# 5. Test Video Upload to S3
echo -e "${YELLOW}5️⃣  Testing Video Upload to S3...${NC}"
# Create a small test video file (1KB with random data)

TEST_VIDEO_FILE="test-videos/nine_eleven.mp4"

if [ ! -f "${TEST_VIDEO_FILE}" ]; then
    echo -e "${RED}❌ Test video not found: ${TEST_VIDEO_FILE}${NC}"
    echo -e "${BLUE}Falling back to random data...${NC}"
    TEST_VIDEO_FILE="/tmp/test-video-${VIDEO_ID}.mp4"
    dd if=/dev/urandom of="${TEST_VIDEO_FILE}" bs=1024 count=10 2>/dev/null
fi

echo -e "${BLUE}Using test video file: ${TEST_VIDEO_FILE}${NC}"
echo -e "${BLUE}Uploading to S3...${NC}"

UPLOAD_RESPONSE=$(curl -s -X PUT "${UPLOAD_URL}" \
    -H "Content-Type: video/mp4" \
    --data-binary "@${TEST_VIDEO_FILE}" \
    -w "\nHTTP_CODE:%{http_code}")

UPLOAD_HTTP_CODE=$(echo "${UPLOAD_RESPONSE}" | grep "HTTP_CODE:" | cut -d: -f2)

echo -e "${BLUE}HTTP Status Code: ${UPLOAD_HTTP_CODE}${NC}"

if [ "${UPLOAD_HTTP_CODE}" = "200" ]; then
    echo -e "${GREEN}✅ Video uploaded successfully to S3${NC}"
    
    # Wait for video processing (AI analysis takes time)
    echo -e "${BLUE}Waiting 60 seconds for AI video processing...${NC}"
    for i in {60..1}; do
        echo -ne "\r${BLUE}$i seconds remaining...${NC}"
        sleep 1
    done
    echo ""
    
    # Check DynamoDB for video status
    echo -e "${BLUE}Checking video status in DynamoDB...${NC}"
    VIDEO_STATUS=$(aws dynamodb get-item \
        --table-name highlightai-videos \
        --key "{\"videoId\": {\"S\": \"${VIDEO_ID}\"}}" \
        --output json 2>/dev/null | jq -r '.Item.status.S // "NOT_FOUND"')
    echo -e "${BLUE}Video Status: ${VIDEO_STATUS}${NC}"
    
    # 6. Check for AI-processed videos (Debika's contribution)
    echo ""
    echo -e "${YELLOW}6️⃣  Checking AI-Processed Videos...${NC}"
    
    EDITED_BUCKET=$(echo "${RAW_VIDEOS_BUCKET}" | sed 's/raw/edited/')
    echo -e "${BLUE}Edited Videos Bucket: ${EDITED_BUCKET}${NC}"
    
    # Check for edited videos
    EDITED_VIDEOS=$(aws s3 ls "s3://${EDITED_BUCKET}/" --recursive 2>/dev/null | grep "${VIDEO_ID}" || true)
    
    if [ -z "$EDITED_VIDEOS" ]; then
        echo -e "${YELLOW}⚠️  No edited videos found yet${NC}"
        echo -e "${BLUE}This is normal - AI processing may take several minutes${NC}"
        echo -e "${BLUE}Check Lambda logs: aws logs tail /aws/lambda/highlightai-video-editor --follow${NC}"
    else
        echo -e "${GREEN}✅ Edited videos found!${NC}"
        echo "${EDITED_VIDEOS}"
        
        # Check DynamoDB for AI metadata
        echo ""
        echo -e "${BLUE}Checking AI processing metadata...${NC}"
        aws dynamodb get-item \
            --table-name highlightai-videos \
            --key "{\"videoId\": {\"S\": \"${VIDEO_ID}\"}}" \
            --output json 2>/dev/null | jq '.Item | {status, transcribeJobId, rekognitionJobId, keyMoments}' || echo "Metadata not available"
    fi
else
    echo -e "${RED}❌ Video upload failed${NC}"
    echo "${UPLOAD_RESPONSE}" | sed '/HTTP_CODE:/d'
fi

# Cleanup test file (only if using temp file)
if [[ "${TEST_VIDEO_FILE}" == "/tmp/"* ]]; then
    rm -f "${TEST_VIDEO_FILE}"
fi

echo ""
echo "============================"
echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "Test Summary:"
echo "  User Pool ID: ${USER_POOL_ID}"
echo "  Raw Videos Bucket: ${RAW_VIDEOS_BUCKET}"
echo "  Edited Videos Bucket: ${EDITED_BUCKET}"
echo "  Test Email: ${TEST_EMAIL}"
echo "  Video ID: ${VIDEO_ID}"
echo "  Upload Status: $([ "${UPLOAD_HTTP_CODE}" = "200" ] && echo "SUCCESS" || echo "FAILED")"
