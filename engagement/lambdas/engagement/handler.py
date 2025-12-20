import json
import os
import uuid
import boto3
from datetime import datetime
from botocore.exceptions import ClientError
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')

VIDEOS_TABLE = os.environ['VIDEOS_TABLE']
LIKES_TABLE = os.environ['LIKES_TABLE']
COMMENTS_TABLE = os.environ['COMMENTS_TABLE']
VIEWS_TABLE = os.environ['VIEWS_TABLE']
ENGAGEMENT_QUEUE_URL = os.environ['ENGAGEMENT_QUEUE_URL']

def lambda_handler(event, context):
    """
    Handle social engagement actions: likes, comments, views
    Can be invoked by AppSync or SQS
    """
    try:
<<<<<<< HEAD
=======
        print(f"Event received: {json.dumps(event)}")
        
>>>>>>> monish-engagement
        # Check if invoked by AppSync or SQS
        if 'Records' in event:
            # SQS batch processing
            return process_sqs_batch(event)
        else:
            # Direct AppSync invocation
            return process_engagement_action(event)
            
    except Exception as e:
        print(f"Error: {str(e)}")
<<<<<<< HEAD
=======
        import traceback
        print(traceback.format_exc())
>>>>>>> monish-engagement
        raise

def process_sqs_batch(event):
    """Process engagement actions from SQS queue"""
    for record in event['Records']:
        message = json.loads(record['body'])
        process_engagement_action(message)
    
    return {'statusCode': 200, 'body': 'Batch processed'}

def process_engagement_action(payload):
    """Route to appropriate engagement handler"""
    action = payload.get('action')
    
    handlers = {
        'likeVideo': handle_like_video,
        'unlikeVideo': handle_unlike_video,
        'addComment': handle_add_comment,
<<<<<<< HEAD
        'recordView': handle_record_view
=======
        'recordView': handle_record_view,
        'getComments': handle_get_comments,  # ✅ ADDED
>>>>>>> monish-engagement
    }
    
    handler = handlers.get(action)
    if not handler:
        raise ValueError(f"Unknown action: {action}")
    
<<<<<<< HEAD
=======
    print(f"Handling action: {action}")
>>>>>>> monish-engagement
    return handler(payload)

def handle_like_video(payload):
    """Add a like to a video"""
    video_id = payload['videoId']
    user_id = payload['userId']
    timestamp = int(datetime.utcnow().timestamp())
    
    likes_table = dynamodb.Table(LIKES_TABLE)
    videos_table = dynamodb.Table(VIDEOS_TABLE)
    
    try:
        # Add like record
        likes_table.put_item(
            Item={
                'videoId': video_id,
                'userId': user_id,
                'createdAt': timestamp
            },
            ConditionExpression='attribute_not_exists(videoId) AND attribute_not_exists(userId)'
        )
        
        # Increment like count in videos table
        response = videos_table.update_item(
            Key={'videoId': video_id},
            UpdateExpression='SET likeCount = if_not_exists(likeCount, :zero) + :inc',
            ExpressionAttributeValues={
                ':inc': 1,
                ':zero': 0
            },
            ReturnValues='ALL_NEW'
        )
        
        return get_engagement_counts(response['Attributes'])
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            # Already liked, return current counts
            video = videos_table.get_item(Key={'videoId': video_id})['Item']
            return get_engagement_counts(video)
        raise

def handle_unlike_video(payload):
    """Remove a like from a video"""
    video_id = payload['videoId']
    user_id = payload['userId']
    
    likes_table = dynamodb.Table(LIKES_TABLE)
    videos_table = dynamodb.Table(VIDEOS_TABLE)
    
    try:
        # Remove like record
        likes_table.delete_item(
            Key={
                'videoId': video_id,
                'userId': user_id
            },
            ConditionExpression='attribute_exists(videoId) AND attribute_exists(userId)'
        )
        
        # Decrement like count
        response = videos_table.update_item(
            Key={'videoId': video_id},
            UpdateExpression='SET likeCount = if_not_exists(likeCount, :one) - :dec',
            ExpressionAttributeValues={
                ':dec': 1,
                ':one': 1
            },
            ReturnValues='ALL_NEW'
        )
        
        return get_engagement_counts(response['Attributes'])
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            # Not liked, return current counts
            video = videos_table.get_item(Key={'videoId': video_id})['Item']
            return get_engagement_counts(video)
        raise

def handle_add_comment(payload):
    """Add a comment to a video"""
    video_id = payload['videoId']
    user_id = payload['userId']
    user_email = payload.get('userEmail', '')
    content = payload['content']
    timestamp = int(datetime.utcnow().timestamp())
    comment_id = str(uuid.uuid4())
    
    comments_table = dynamodb.Table(COMMENTS_TABLE)
    videos_table = dynamodb.Table(VIDEOS_TABLE)
    
    # Add comment
    comment = {
        'commentId': comment_id,
        'videoId': video_id,
        'userId': user_id,
        'userEmail': user_email,
        'content': content,
        'createdAt': timestamp
    }
    
    comments_table.put_item(Item=comment)
    
    # Increment comment count
    videos_table.update_item(
        Key={'videoId': video_id},
        UpdateExpression='SET commentCount = if_not_exists(commentCount, :zero) + :inc',
        ExpressionAttributeValues={
            ':inc': 1,
            ':zero': 0
        }
    )
    
<<<<<<< HEAD
    return comment
=======
    print(f"Comment added: {comment_id}")
    return convert_decimals(comment)

def handle_get_comments(payload):
    """Get all comments for a video"""
    video_id = payload['videoId']
    
    print(f"Getting comments for video: {video_id}")
    
    comments_table = dynamodb.Table(COMMENTS_TABLE)
    
    try:
        # Query comments by videoId, sorted by createdAt descending
        response = comments_table.query(
            KeyConditionExpression='videoId = :vid',
            ExpressionAttributeValues={
                ':vid': video_id
            },
            ScanIndexForward=False,  # Descending order (newest first)
            Limit=100
        )
        
        items = response.get('Items', [])
        print(f"Found {len(items)} comments")
        
        # Convert Decimal to int for JSON serialization
        return convert_decimals(items)
        
    except ClientError as e:
        print(f"Error getting comments: {str(e)}")
        return []
>>>>>>> monish-engagement

def handle_record_view(payload):
    """Record a video view"""
    video_id = payload['videoId']
    user_id = payload['userId']
    timestamp = int(datetime.utcnow().timestamp())
    
    views_table = dynamodb.Table(VIEWS_TABLE)
    videos_table = dynamodb.Table(VIDEOS_TABLE)
    
    # Check if user already viewed (within last 24 hours)
    yesterday = timestamp - 86400
    
    try:
        # Add view record
        views_table.put_item(
            Item={
                'videoId': video_id,
                'userId': user_id,
                'viewedAt': timestamp
            }
        )
        
        # Check if this is a unique view in last 24h
        response = views_table.query(
            KeyConditionExpression='videoId = :vid AND userId = :uid',
            ExpressionAttributeValues={
                ':vid': video_id,
                ':uid': user_id
            }
        )
        
        # Only increment if first view in 24h
        if len(response['Items']) == 1:
            videos_table.update_item(
                Key={'videoId': video_id},
                UpdateExpression='SET viewCount = if_not_exists(viewCount, :zero) + :inc',
                ExpressionAttributeValues={
                    ':inc': 1,
                    ':zero': 0
                }
            )
        
        # Get updated counts
        video = videos_table.get_item(Key={'videoId': video_id})['Item']
        return get_engagement_counts(video)
        
    except ClientError as e:
        print(f"Error recording view: {str(e)}")
        video = videos_table.get_item(Key={'videoId': video_id})['Item']
        return get_engagement_counts(video)

def get_engagement_counts(video_item):
    """Extract engagement counts from video item"""
    return {
        'likeCount': int(video_item.get('likeCount', 0)),
        'commentCount': int(video_item.get('commentCount', 0)),
        'viewCount': int(video_item.get('viewCount', 0))
    }
<<<<<<< HEAD
=======

def convert_decimals(obj):
    """Convert Decimal types to int/float for JSON serialization"""
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    return obj
>>>>>>> monish-engagement
