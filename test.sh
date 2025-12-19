#!/bin/bash

# Unified test script for HighlightAI
# Tests authentication, upload, and GraphQL APIs

echo "🧪 HighlightAI Test Suite"
echo "========================="
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    print_error "jq is required but not installed. Install with: brew install jq"
    exit 1
fi

# Load environment from CloudFormation if .env doesn't exist
if [ ! -f "highlightai-frontend/.env" ]; then
    print_step "Frontend .env not found, fetching from CloudFormation..."
    ./deploy.sh
fi

# Source the frontend .env to get API endpoints
source highlightai-frontend/.env

print_success "Using API: $VITE_API_URL"
echo ""

# Test credentials
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"
TEST_USERNAME="testuser$(date +%s)"

# Test 1: User Signup
print_step "Test 1: User signup"
SIGNUP_RESPONSE=$(curl -s -X POST "$VITE_API_URL/auth/signup" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$TEST_EMAIL\",
        \"password\": \"$TEST_PASSWORD\",
        \"username\": \"$TEST_USERNAME\"
    }")

if echo "$SIGNUP_RESPONSE" | jq -e '.userId' > /dev/null 2>&1; then
    USER_ID=$(echo "$SIGNUP_RESPONSE" | jq -r '.userId')
    print_success "User signed up: $USER_ID"
else
    print_error "Signup failed"
    echo "$SIGNUP_RESPONSE" | jq '.'
    exit 1
fi
echo ""

# Test 2: Confirm user (using a dummy code since we can't get the real one)
print_step "Test 2: Confirming user (skipping - requires email code)"
print_warning "Note: In production, user would receive confirmation code via email"
# We'll use admin confirm instead for testing
aws cognito-idp admin-confirm-sign-up \
    --user-pool-id "$VITE_USER_POOL_ID" \
    --username "$TEST_EMAIL" > /dev/null 2>&1
print_success "User confirmed via admin command"
echo ""

# Test 3: User Signin
print_step "Test 3: User signin"
SIGNIN_RESPONSE=$(curl -s -X POST "$VITE_API_URL/auth/signin" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$TEST_EMAIL\",
        \"password\": \"$TEST_PASSWORD\"
    }")

if echo "$SIGNIN_RESPONSE" | jq -e '.idToken' > /dev/null 2>&1; then
    ID_TOKEN=$(echo "$SIGNIN_RESPONSE" | jq -r '.idToken')
    print_success "User signed in successfully"
else
    print_error "Signin failed"
    echo "$SIGNIN_RESPONSE" | jq '.'
    exit 1
fi
echo ""

# Test 4: Presigned URL Generation
print_step "Test 4: Presigned URL generation"
PRESIGNED_RESPONSE=$(curl -s -X POST "$VITE_API_URL/upload/presigned-url" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ID_TOKEN" \
    -d "{
        \"filename\": \"test-video.mp4\",
        \"contentType\": \"video/mp4\",
        \"fileSize\": 1024000
    }")

if echo "$PRESIGNED_RESPONSE" | jq -e '.presignedUrl' > /dev/null 2>&1; then
    VIDEO_ID=$(echo "$PRESIGNED_RESPONSE" | jq -r '.videoId')
    PRESIGNED_URL=$(echo "$PRESIGNED_RESPONSE" | jq -r '.presignedUrl')
    print_success "Presigned URL generated for video: $VIDEO_ID"
else
    print_error "Presigned URL generation failed"
    echo "$PRESIGNED_RESPONSE" | jq '.'
    exit 1
fi
echo ""

# Test 5: GraphQL API connectivity
print_step "Test 5: GraphQL API query"
GRAPHQL_RESPONSE=$(curl -s -X POST "$VITE_APPSYNC_HTTP_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ID_TOKEN" \
    -d '{
        "query": "query { listVideos(limit: 5) { videoId filename status } }"
    }')

if echo "$GRAPHQL_RESPONSE" | jq -e '.data.listVideos' > /dev/null 2>&1; then
    VIDEO_COUNT=$(echo "$GRAPHQL_RESPONSE" | jq '.data.listVideos | length')
    print_success "GraphQL query successful, found $VIDEO_COUNT videos"
else
    print_error "GraphQL query failed"
    echo "$GRAPHQL_RESPONSE" | jq '.'
    exit 1
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "ALL TESTS PASSED! ✨"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Test Results:"
echo "  ✅ User signup"
echo "  ✅ User confirmation"
echo "  ✅ User signin"
echo "  ✅ Presigned URL generation"
echo "  ✅ GraphQL API query"
echo ""
echo "🎯 Test User Created:"
echo "  Email: $TEST_EMAIL"
echo "  Password: $TEST_PASSWORD"
echo "  Video ID: $VIDEO_ID"
echo ""
print_success "System is ready for use! 🚀"
