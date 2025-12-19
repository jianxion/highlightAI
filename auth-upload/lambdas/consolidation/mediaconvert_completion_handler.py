import json
import boto3
import os
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
videos_table = dynamodb.Table(os.environ.get('VIDEOS_TABLE', 'highlightai-videos'))

def mediaconvert_completion_handler(event, context):
    """
    Triggered by CloudWatch Events when MediaConvert job completes.
    Updates DynamoDB with final status and edited video URL.
    """
    print(f"MediaConvert completion event: {json.dumps(event)}")
    
    try:
        # Extract job details from CloudWatch event
        detail = event.get('detail', {})
        status = detail.get('status')
        job_id = detail.get('jobId')
        
        if not job_id:
            print("❌ No jobId in event")
            return {'statusCode': 400, 'body': 'No jobId'}
        
        # Find video_id from DynamoDB by mediaConvertJobId
        response = videos_table.scan(
            FilterExpression='mediaConvertJobId = :job_id',
            ExpressionAttributeValues={':job_id': job_id}
        )
        
        if not response.get('Items'):
            print(f"⚠️ No video found with mediaConvertJobId: {job_id}")
            return {'statusCode': 404, 'body': 'Video not found'}
        
        video = response['Items'][0]
        video_id = video['videoId']
        
        print(f"📹 Found video: {video_id}, MediaConvert status: {status}")
        
        if status == 'COMPLETE':
            # Extract output file location
            output_group_details = detail.get('outputGroupDetails', [])
            edited_video_url = None
            
            if output_group_details:
                output_details = output_group_details[0].get('outputDetails', [])
                if output_details:
                    # Get the first output's destination
                    output_file_paths = output_details[0].get('outputFilePaths', [])
                    if output_file_paths:
                        edited_video_url = output_file_paths[0]
            
            # Update DynamoDB
            update_expression = 'SET #status = :status, editedAt = :edited_at'
            expression_values = {
                ':status': 'EDITED',
                ':edited_at': datetime.utcnow().isoformat()
            }
            expression_names = {'#status': 'status'}
            
            if edited_video_url:
                update_expression += ', editedVideo = :video_url'
                expression_values[':video_url'] = edited_video_url
            
            videos_table.update_item(
                Key={'videoId': video_id},
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expression_names,
                ExpressionAttributeValues=expression_values
            )
            
            print(f"✅ Updated {video_id} to EDITED status")
            print(f"📹 Edited video: {edited_video_url}")
            
        elif status in ['ERROR', 'CANCELED']:
            # Update to error status
            videos_table.update_item(
                Key={'videoId': video_id},
                UpdateExpression='SET #status = :status, errorMessage = :error, failedAt = :failed_at',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'ERROR',
                    ':error': detail.get('errorMessage', 'MediaConvert job failed'),
                    ':failed_at': datetime.utcnow().isoformat()
                }
            )
            
            print(f"❌ Updated {video_id} to ERROR status")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Status updated',
                'videoId': video_id,
                'status': status
            })
        }
        
    except Exception as e:
        print(f"❌ Error processing MediaConvert completion: {e}")
        import traceback
        traceback.print_exc()
        return {'statusCode': 500, 'body': str(e)}
