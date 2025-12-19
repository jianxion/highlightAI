#!/bin/bash

# Unified deployment script for HighlightAI
# Deploys both backend stacks and configures frontend environment

echo "🚀 HighlightAI Deployment Script"
echo "================================"
echo ""

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Stack names
AUTH_STACK="highlightai-auth-upload"
ENGAGEMENT_STACK="highlightai-engagement"

# Function to print colored output
print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS CLI is not configured. Please run 'aws configure' first."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-east-1")

print_success "AWS Account: $ACCOUNT_ID"
print_success "Region: $REGION"
echo ""

# Deploy auth-upload stack
print_step "Step 1/4: Building and deploying auth-upload stack..."
cd auth-upload

if sam build; then
    print_success "Auth-upload build completed"
else
    print_error "Auth-upload build failed"
    exit 1
fi

DEPLOY_OUTPUT=$(sam deploy --stack-name $AUTH_STACK --capabilities CAPABILITY_IAM --resolve-s3 --no-confirm-changeset 2>&1)
DEPLOY_EXIT_CODE=$?

if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    print_success "Auth-upload stack deployed"
elif echo "$DEPLOY_OUTPUT" | grep -q "No changes to deploy"; then
    print_warning "Auth-upload stack is already up to date (no changes)"
else
    print_error "Auth-upload deployment failed"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

cd ..
echo ""

# Deploy engagement stack
print_step "Step 2/4: Building and deploying engagement stack..."
cd engagement

if sam build; then
    print_success "Engagement build completed"
else
    print_error "Engagement build failed"
    exit 1
fi

DEPLOY_OUTPUT=$(sam deploy --stack-name $ENGAGEMENT_STACK --capabilities CAPABILITY_IAM --resolve-s3 --no-confirm-changeset 2>&1)
DEPLOY_EXIT_CODE=$?

if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    print_success "Engagement stack deployed"
elif echo "$DEPLOY_OUTPUT" | grep -q "No changes to deploy"; then
    print_warning "Engagement stack is already up to date (no changes)"
else
    print_error "Engagement deployment failed"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

cd ..
echo ""

# Fetch CloudFormation outputs and configure frontend
print_step "Step 3/4: Configuring frontend environment..."

API_URL=$(aws cloudformation describe-stacks --stack-name $AUTH_STACK --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text 2>/dev/null)
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name $AUTH_STACK --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text 2>/dev/null)
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name $AUTH_STACK --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text 2>/dev/null)
RAW_VIDEOS_BUCKET=$(aws cloudformation describe-stacks --stack-name $AUTH_STACK --query "Stacks[0].Outputs[?OutputKey=='RawVideosBucketName'].OutputValue" --output text 2>/dev/null)
APPSYNC_HTTP_URL=$(aws cloudformation describe-stacks --stack-name $ENGAGEMENT_STACK --query "Stacks[0].Outputs[?OutputKey=='AppSyncApiUrl'].OutputValue" --output text 2>/dev/null)

# Construct WebSocket URL from HTTP URL (replace appsync-api with appsync-realtime-api)
if [ ! -z "$APPSYNC_HTTP_URL" ]; then
    APPSYNC_WS_URL=$(echo "$APPSYNC_HTTP_URL" | sed 's/https/wss/g' | sed 's/appsync-api/appsync-realtime-api/g')
else
    APPSYNC_WS_URL=""
fi

# Debug: Show what we retrieved
echo "Debug - Retrieved values:"
echo "  API_URL: ${API_URL:-EMPTY}"
echo "  USER_POOL_ID: ${USER_POOL_ID:-EMPTY}"
echo "  CLIENT_ID: ${CLIENT_ID:-EMPTY}"
echo "  RAW_VIDEOS_BUCKET: ${RAW_VIDEOS_BUCKET:-EMPTY}"
echo "  APPSYNC_HTTP_URL: ${APPSYNC_HTTP_URL:-EMPTY}"
echo "  APPSYNC_WS_URL: ${APPSYNC_WS_URL:-EMPTY}"

if [ -z "$API_URL" ] || [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ] || [ -z "$RAW_VIDEOS_BUCKET" ] || [ -z "$APPSYNC_HTTP_URL" ] || [ -z "$APPSYNC_WS_URL" ]; then
    print_error "Failed to retrieve CloudFormation outputs"
    echo ""
    echo "Checking stack status..."
    aws cloudformation describe-stacks --stack-name $AUTH_STACK --query "Stacks[0].[StackName,StackStatus]" --output text 2>&1 || echo "Auth stack not found"
    aws cloudformation describe-stacks --stack-name $ENGAGEMENT_STACK --query "Stacks[0].[StackName,StackStatus]" --output text 2>&1 || echo "Engagement stack not found"
    exit 1
fi

# Create frontend .env file
cat > highlightai-frontend/.env << EOF
# Auto-generated from CloudFormation stacks
# Generated: $(date)
# Run ./deploy.sh to regenerate

VITE_API_URL=$API_URL
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_CLIENT_ID=$CLIENT_ID
VITE_RAW_VIDEOS_BUCKET=$RAW_VIDEOS_BUCKET
VITE_APPSYNC_HTTP_URL=$APPSYNC_HTTP_URL
VITE_APPSYNC_WS_URL=$APPSYNC_WS_URL
EOF

print_success "Frontend .env configured"
echo ""

# Install frontend dependencies if needed
print_step "Step 4/4: Checking frontend dependencies..."
cd highlightai-frontend

if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found, installing dependencies..."
    npm install
    print_success "Dependencies installed"
else
    print_success "Dependencies already installed"
fi

cd ..
echo ""

# Upload frontend to S3
print_step "Step 5/6: Uploading frontend to S3..."
BUCKET_NAME="highlightai-frontend-298156079577"
aws s3 sync highlightai-frontend/dist/ s3://$BUCKET_NAME/ --delete --cache-control "public, max-age=31536000, immutable" --exclude "index.html"
aws s3 cp highlightai-frontend/dist/index.html s3://$BUCKET_NAME/ --cache-control "no-cache, no-store, must-revalidate"
print_success "Frontend uploaded to S3 bucket: $BUCKET_NAME"

# Deploy CloudFront distribution
print_step "Step 6/6: Deploying CloudFront distribution..."
aws cloudformation deploy \
    --stack-name $ENGAGEMENT_STACK \
    --template-file engagement/template.yaml \
    --capabilities CAPABILITY_IAM

# Output CloudFront domain
CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name $ENGAGEMENT_STACK --query "Stacks[0].Outputs[?OutputKey=='FrontendCloudFrontDomain'].OutputValue" --output text)
if [ -n "$CF_DOMAIN" ]; then
    print_success "Your HTTPS frontend is available at: https://$CF_DOMAIN"
else
    print_warning "CloudFront deployment complete. Check AWS Console for domain name."
fi

# Print summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "DEPLOYMENT COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Configuration Summary:"
echo "  API URL:          $API_URL"
echo "  User Pool ID:     $USER_POOL_ID"
echo "  Client ID:        $CLIENT_ID"
echo "  Raw Videos:       $RAW_VIDEOS_BUCKET"
echo "  GraphQL HTTP:     $APPSYNC_HTTP_URL"
echo "  GraphQL WS:       $APPSYNC_WS_URL"
echo ""
echo "🎯 Next Steps:"
echo "  1. Run tests:     ./test.sh"
echo "  2. Start frontend: cd highlightai-frontend && npx vite"
echo ""
print_success "Happy coding! 🚀"
