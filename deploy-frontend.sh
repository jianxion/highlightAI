#!/bin/bash

# Deploy frontend to S3 + CloudFront

echo "🚀 Building frontend..."
cd highlightai-frontend
npm run build

echo ""
echo "📦 Creating S3 bucket for frontend hosting..."
BUCKET_NAME="highlightai-frontend-$(aws sts get-caller-identity --query Account --output text)"

# Create bucket if it doesn't exist
aws s3 mb s3://$BUCKET_NAME 2>/dev/null || echo "Bucket already exists"

# Remove any existing public access blocks
echo "Configuring bucket permissions..."
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Configure bucket for static website hosting
aws s3 website s3://$BUCKET_NAME \
  --index-document index.html \
  --error-document index.html

# Set public read policy
cat > /tmp/bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file:///tmp/bucket-policy.json

echo ""
echo "📤 Uploading files to S3..."
aws s3 sync dist/ s3://$BUCKET_NAME/ \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html"

# Upload index.html separately with no cache
aws s3 cp dist/index.html s3://$BUCKET_NAME/ \
  --cache-control "no-cache, no-store, must-revalidate"

echo ""
echo "✅ Frontend deployed!"
echo ""
echo "🌐 Website URL:"
echo "http://$BUCKET_NAME.s3-website-us-east-1.amazonaws.com"
echo ""
echo "📝 Share this URL with your users!"
echo ""
echo "💡 Optional: Set up CloudFront for HTTPS and better performance:"
echo "   1. Go to AWS CloudFront console"
echo "   2. Create distribution pointing to: $BUCKET_NAME.s3-website-us-east-1.amazonaws.com"
echo "   3. Use the CloudFront domain (xxx.cloudfront.net) for HTTPS access"
