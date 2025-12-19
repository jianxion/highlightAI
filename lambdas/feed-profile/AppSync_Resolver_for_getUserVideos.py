import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
VIDEOS_TABLE = os.environ['VIDEOS_TABLE']

def lambda_handler(event, context):
    """
    AppSync resolver for getUserVideos query
    Fetches all videos for a specific user
    """
    try:
        print(f"Event: {json.dumps(event)}")
        
        # Extract userId from AppSync event
        user_id = event['arguments']['userId']
        
        if not user_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'userId is required'})
            }
        
        print(f"Fetching videos for userId: {user_id}")
        
        # Query DynamoDB table for videos by userId
        table = dynamodb.Table(VIDEOS_TABLE)
        
        # If you have a GSI on userId, use query:
        try:
            response = table.query(
                IndexName='UserIdIndex',  # Your GSI name
                KeyConditionExpression=Key('userId').eq(user_id),
                ScanIndexForward=False  # Sort by createdAt descending (newest first)
            )
        except Exception as e:
            print(f"Query with GSI failed, falling back to scan: {str(e)}")
            # Fallback to scan if no GSI (slower, but works)
            response = table.scan(
                FilterExpression=Key('userId').eq(user_id)
            )
        
        videos = response.get('Items', [])
        
        # Convert Decimal types to int/float for JSON serialization
        videos = convert_decimals(videos)
        
        print(f"Found {len(videos)} videos for user {user_id}")
        
        # Return videos directly (AppSync expects the data, not wrapped in response)
        return videos
        
    except Exception as e:
        print(f"Error in getUserVideos: {str(e)}")
        import traceback
        print(traceback.format_exc())
        raise

def convert_decimals(obj):
    """Convert Decimal types to int/float for JSON serialization"""
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    return obj
