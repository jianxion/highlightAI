import json
import os
import uuid
import boto3
from datetime import datetime
from botocore.exceptions import ClientError

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

RAW_VIDEOS_BUCKET = os.environ['RAW_VIDEOS_BUCKET']
VIDEOS_TABLE = os.environ['VIDEOS_TABLE']

def lambda_handler(event, context):
    """
    Generate presigned S3 URL for video upload
    
    Expected Input:
    {
        "filename": "my-video.mp4",
        "contentType": "video/mp4",
        "fileSize": 52428800
    }
    
    Returns presigned URL and video metadata
    """
    try:
        # Extract user info from Cognito authorizer
        claims = event['requestContext']['authorizer']['claims']
        user_id = claims['sub']
        user_email = claims.get('email', '')
        
        # Parse request body
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        
        filename = body.get('filename', '').strip()
        content_type = body.get('contentType', 'video/mp4')
        file_size = body.get('fileSize', 0)
        
        # Validation
        if not filename:
            return response(400, {'error': 'Filename is required'})
        
        # Validate video file extension
        allowed_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
        if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
            return response(400, {'error': f'Invalid file type. Allowed: {", ".join(allowed_extensions)}'})
        
        # File size limit: 500MB
        max_size = 500 * 1024 * 1024  # 500MB in bytes
        if file_size > max_size:
            return response(400, {'error': f'File too large. Maximum size: 500MB'})
        
        # Generate unique video ID
        video_id = str(uuid.uuid4())
        timestamp = int(datetime.utcnow().timestamp())
        
        # Create S3 key with user-based organization
        # Format: videos/<userId>_<videoId>_<timestamp>_<filename>
        s3_key = f"videos/{user_id}_{video_id}_{timestamp}_{filename}"
        
        # Generate presigned URL for PUT operation (15 minutes expiry)
        presigned_url = s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': RAW_VIDEOS_BUCKET,
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=900  # 15 minutes
        )
        
        # Store initial metadata in DynamoDB
        table = dynamodb.Table(VIDEOS_TABLE)
        
        video_metadata = {
            'videoId': video_id,
            'userId': user_id,
            'userEmail': user_email,
            'filename': filename,
            's3Key': s3_key,
            'bucket': RAW_VIDEOS_BUCKET,
            'fileSize': file_size,
            'contentType': content_type,
            'status': 'UPLOADING',
            'createdAt': timestamp,
            'updatedAt': timestamp
        }
        
        table.put_item(Item=video_metadata)
        
        return response(200, {
            'videoId': video_id,
            'uploadUrl': presigned_url,
            's3Key': s3_key,
            'expiresIn': 900,
            'message': 'Upload URL generated successfully'
        })
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        print(f"AWS error: {error_code} - {error_message}")
        return response(500, {'error': 'Failed to generate upload URL'})
        
    except KeyError as e:
        print(f"Missing authorization: {str(e)}")
        return response(401, {'error': 'Unauthorized - missing user information'})
        
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return response(500, {'error': 'Internal server error'})

def response(status_code, body):
    """Helper function to format API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        'body': json.dumps(body)
    }
