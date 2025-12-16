#!/bin/bash

# HighlightAI - Engagement & AppSync Module Deployment Script

set -e

echo "🚀 HighlightAI - Deploying Engagement & AppSync Module"
echo "========================================================"

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

# Check if auth-upload stack exists
AUTH_STACK_NAME="highlightai-auth-upload"
if ! aws cloudformation describe-stacks --stack-name "${AUTH_STACK_NAME}" &> /dev/null; then
    echo -e "${RED}❌ Auth-upload stack not found${NC}"
    echo "Deploy auth-upload module first: cd ../auth-upload && ./deploy.sh"
    exit 1
fi

STACK_NAME="highlightai-engagement"

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
    --parameter-overrides AuthStackName=${AUTH_STACK_NAME} \
    --no-fail-on-empty-changeset

# Get outputs
echo ""
echo "📋 Retrieving stack outputs..."
APPSYNC_API_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='AppSyncApiUrl'].OutputValue" \
    --output text)

APPSYNC_API_ID=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='AppSyncApiId'].OutputValue" \
    --output text)

PROCESSED_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='ProcessedVideosBucketName'].OutputValue" \
    --output text)

ENGAGEMENT_QUEUE_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='EngagementQueueUrl'].OutputValue" \
    --output text)

# Save to .env file
echo ""
echo "💾 Saving configuration to .env file..."
cat > .env << EOF
# HighlightAI - Engagement & AppSync Module Configuration

APPSYNC_API_URL=${APPSYNC_API_URL}
APPSYNC_API_ID=${APPSYNC_API_ID}
PROCESSED_VIDEOS_BUCKET=${PROCESSED_BUCKET}
ENGAGEMENT_QUEUE_URL=${ENGAGEMENT_QUEUE_URL}
EOF

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "========================================================"
echo "AppSync GraphQL API:"
echo "  URL: ${APPSYNC_API_URL}"
echo "  API ID: ${APPSYNC_API_ID}"
echo ""
echo "S3 Buckets:"
echo "  Processed Videos: ${PROCESSED_BUCKET}"
echo ""
echo "SQS Queue:"
echo "  Engagement Queue: ${ENGAGEMENT_QUEUE_URL}"
echo ""
echo "Next Steps:"
echo "  1. Test GraphQL mutations from iOS app"
echo "  2. Subscribe to real-time updates"
echo "  3. Monitor engagement metrics in DynamoDB"
echo "========================================================"
echo ""
