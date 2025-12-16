import json
import os
import boto3
from datetime import datetime
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')

VIDEOS_TABLE = os.environ['VIDEOS_TABLE']

def lambda_handler(event, context):
    """
    Handle S3 upload completion event from SQS
    Updates video status in DynamoDB to 'UPLOADED'
    """
    try:
        table = dynamodb.Table(VIDEOS_TABLE)
        
        for record in event['Records']:
            # Parse SQS message
            message_body = json.loads(record['body'])
            
            # Extract S3 event details
            if 'Records' in message_body:
                s3_record = message_body['Records'][0]
                bucket = s3_record['s3']['bucket']['name']
                s3_key = s3_record['s3']['object']['key']
                file_size = s3_record['s3']['object']['size']
                
                # Extract videoId from s3_key (format: videos/<userId>_<videoId>_<timestamp>_<filename>)
                key_parts = s3_key.split('/')[-1].split('_')
                if len(key_parts) >= 2:
                    video_id = key_parts[1]
                    
                    # Update DynamoDB
                    timestamp = int(datetime.utcnow().timestamp())
                    
                    response = table.update_item(
                        Key={'videoId': video_id},
                        UpdateExpression='SET #status = :status, uploadedSize = :size, updatedAt = :updated',
                        ExpressionAttributeNames={
                            '#status': 'status'
                        },
                        ExpressionAttributeValues={
                            ':status': 'UPLOADED',
                            ':size': file_size,
                            ':updated': timestamp
                        },
                        ReturnValues='ALL_NEW'
                    )
                    
                    print(f"Successfully updated video {video_id} to UPLOADED status")
                    print(f"S3 Key: {s3_key}, Size: {file_size} bytes")
                    
                else:
                    print(f"Invalid S3 key format: {s3_key}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Upload completion processed successfully'})
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        print(f"DynamoDB error: {error_code} - {error_message}")
        raise  # Re-raise to trigger SQS retry
        
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise  # Re-raise to trigger SQS retry
