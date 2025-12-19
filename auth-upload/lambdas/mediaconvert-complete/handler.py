import json
import os
import boto3
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
mediaconvert = boto3.client('mediaconvert')

VIDEOS_TABLE = os.environ['VIDEOS_TABLE']
EDITED_VIDEOS_BUCKET = os.environ['EDITED_VIDEOS_BUCKET']

def lambda_handler(event, context):
    """
    Handle MediaConvert job completion events
    Updates video status to COMPLETED and stores processedS3Key
    """
    print(f"MediaConvert completion event: {json.dumps(event)}")
    
    try:
        # Extract job details from CloudWatch Event
        detail = event.get('detail', {})
        job_id = detail.get('jobId')
        status = detail.get('status')
        
        print(f"Job ID: {job_id}, Status: {status}")
        
        if status != 'COMPLETE':
            print(f"Job not completed successfully, status: {status}")
            return {
                'statusCode': 200,
                'body': json.dumps({'message': f'Job status: {status}'})
            }
        
        # Get job details to extract video ID from user metadata
        job_details = mediaconvert.get_job(Id=job_id)
        user_metadata = job_details.get('Job', {}).get('UserMetadata', {})
        video_id = user_metadata.get('videoId')
        
        if not video_id:
            print("ERROR: No videoId in job metadata")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'No videoId in job metadata'})
            }
        
        print(f"Processing completion for video: {video_id}")
        
        # Extract output file location from job settings
        job_settings = job_details.get('Job', {}).get('Settings', {})
        output_groups = job_settings.get('OutputGroups', [])
        processed_s3_key = None
        
        for output_group in output_groups:
            file_group_settings = output_group.get('OutputGroupSettings', {}).get('FileGroupSettings', {})
            destination = file_group_settings.get('Destination', '')
            
            if destination:
                # Destination format: s3://bucket-name/filename_without_extension
                # MediaConvert adds extension automatically
                # Extract just the filename from s3://bucket/filename
                s3_prefix = f"s3://{EDITED_VIDEOS_BUCKET}/"
                if destination.startswith(s3_prefix):
                    base_name = destination.replace(s3_prefix, '')
                    # MediaConvert appends .mp4 extension
                    processed_s3_key = f"{base_name}.mp4"
                    break
        
        # If we couldn't extract from output, try to find the file
        if not processed_s3_key:
            print(f"Could not extract output path from job, searching for file with video_id: {video_id}")
            # List files in bucket to find the output
            s3 = boto3.client('s3')
            response = s3.list_objects_v2(Bucket=EDITED_VIDEOS_BUCKET, Prefix=video_id)
            if 'Contents' in response:
                for obj in response['Contents']:
                    key = obj['Key']
                    if key.endswith('.mp4'):
                        processed_s3_key = key
                        break
        
        if not processed_s3_key:
            raise Exception(f"Could not determine output file location for video {video_id}")
        
        print(f"Processed S3 Key: {processed_s3_key}")
        
        # Update DynamoDB
        table = dynamodb.Table(VIDEOS_TABLE)
        timestamp = int(datetime.utcnow().timestamp())
        
        table.update_item(
            Key={'videoId': video_id},
            UpdateExpression='SET #status = :status, processedS3Key = :processedKey, processedBucket = :processedBucket, updatedAt = :updatedAt',
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': 'COMPLETED',
                ':processedKey': processed_s3_key,
                ':processedBucket': EDITED_VIDEOS_BUCKET,
                ':updatedAt': timestamp
            }
        )
        
        print(f"✅ Video {video_id} marked as COMPLETED")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Video processing completed',
                'videoId': video_id,
                'processedS3Key': processed_s3_key
            })
        }
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
