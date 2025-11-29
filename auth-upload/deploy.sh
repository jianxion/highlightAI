#!/bin/bash

# HighlightAI - Authentication & Upload Module Deployment Script

set -e

echo "🚀 HighlightAI - Deploying Auth & Upload Module"
echo "================================================"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo -e "${RED}❌ AWS SAM CLI is not installed${NC}"
    echo "Install it from: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi

STACK_NAME="highlightai-auth-upload"

echo -e "${YELLOW}Stack Name: ${STACK_NAME}${NC}"
echo ""

# Build SAM application
echo "📦 Building SAM application..."
sam build

# Deploy
echo ""
echo "🚢 Deploying to AWS..."
sam deploy \
    --stack-name "${STACK_NAME}" \
    --capabilities CAPABILITY_IAM \
    --resolve-s3 \
    --no-fail-on-empty-changeset

# Get outputs
echo ""
echo "📋 Retrieving stack outputs..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
    --output text)

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
    --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
    --output text)

BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='RawVideosBucketName'].OutputValue" \
    --output text)

# Save to .env file
echo ""
echo "💾 Saving configuration to .env file..."
cat > .env << EOF
# HighlightAI - Auth & Upload Module Configuration

API_URL=${API_URL}
USER_POOL_ID=${USER_POOL_ID}
CLIENT_ID=${CLIENT_ID}
RAW_VIDEOS_BUCKET=${BUCKET_NAME}
EOF

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "================================================"
echo "API Endpoints:"
echo "  Signup:  POST ${API_URL}/auth/signup"
echo "  Signin:  POST ${API_URL}/auth/signin"
echo "  Upload:  POST ${API_URL}/upload/presigned-url"
echo ""
echo "Cognito:"
echo "  User Pool ID: ${USER_POOL_ID}"
echo "  Client ID: ${CLIENT_ID}"
echo ""
echo "S3 Bucket: ${BUCKET_NAME}"
echo "================================================"
echo ""
