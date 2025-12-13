import json
import os
import boto3
from datetime import datetime

# AWS Clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
transcribe_client = boto3.client('transcribe')
rekognition_client = boto3.client('rekognition')

# Environment variables
RAW_BUCKET = os.environ['RAW_VIDEOS_BUCKET']
EDITED_BUCKET = os.environ['EDITED_VIDEOS_BUCKET']
VIDEOS_TABLE_NAME = os.environ['VIDEOS_TABLE']
REGION = os.environ.get('REGION', 'us-east-1')

videos_table = dynamodb.Table(VIDEOS_TABLE_NAME)


def lambda_handler(event, context):
    """Main handler - triggered by SQS"""
    print(f"Event: {json.dumps(event)}")
    
    try:
        for record in event['Records']:
            message_body = json.loads(record['body'])
            
            # Extract S3 details
            s3_event = message_body['Records'][0]
            bucket = s3_event['s3']['bucket']['name']
            key = s3_event['s3']['object']['key']
            
            video_id = extract_video_id(key)
            
            print(f"Processing video: {video_id}")
            
            # Create MediaConvert job
            job_id = create_mediaconvert_job(bucket, key, video_id)
            
            print(f"✅ MediaConvert job submitted: {job_id}")
            
        return {
            'statusCode': 200,
            'body': json.dumps('MediaConvert job submitted')
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        raise


def extract_video_id(s3_key):
    """Extract videoId from S3 key"""
    parts = s3_key.split('_')
    if len(parts) >= 2:
        return parts[1]
    return s3_key.split('/')[-1].split('.')[0]


def get_mediaconvert_endpoint():
    """Get MediaConvert endpoint"""
    mc = boto3.client('mediaconvert', region_name=REGION)
    endpoints = mc.describe_endpoints()
    return endpoints['Endpoints'][0]['Url']


def create_mediaconvert_job(bucket, key, video_id):
    """Create MediaConvert job"""
    
    # Get MediaConvert endpoint
    endpoint = get_mediaconvert_endpoint()
    mc_client = boto3.client('mediaconvert', region_name=REGION, endpoint_url=endpoint)
    
    # Get MediaConvert role ARN
    account_id = boto3.client('sts').get_caller_identity()['Account']
    role_arn = f"arn:aws:iam::{account_id}:role/MediaConvertRole"
    
    # Hardcoded key moments (TODO: use Transcribe/Rekognition)
    # key_moments = [
    #     {'start': 2, 'end': 5},
    #     {'start': 10, 'end': 13},
    #     {'start': 20, 'end': 23}
    # ]
    
    # # Build input clippings
    # input_clippings = []
    # for moment in key_moments:
    #     input_clippings.append({
    #         'StartTimecode': seconds_to_timecode(moment['start']),
    #         'EndTimecode': seconds_to_timecode(moment['end'])
    #     })
    
    # Job settings
    job_settings = {
        'Role': role_arn,
        'Settings': {
            'Inputs': [{
                'FileInput': f"s3://{bucket}/{key}",
                # 'InputClippings': input_clippings,
                'AudioSelectors': {
                    'Audio Selector 1': {'DefaultSelection': 'DEFAULT'}
                },
                'VideoSelector': {}
            }],
            'OutputGroups': [{
                'Name': 'File Group',
                'OutputGroupSettings': {
                    'Type': 'FILE_GROUP_SETTINGS',
                    'FileGroupSettings': {
                        'Destination': f"s3://{EDITED_BUCKET}/{video_id}_edited"
                    }
                },
                'Outputs': [{
                    'ContainerSettings': {'Container': 'MP4'},
                    'VideoDescription': {
                        'CodecSettings': {
                            'Codec': 'H_264',
                            'H264Settings': {
                                'RateControlMode': 'QVBR',
                                'MaxBitrate': 5000000
                            }
                        }
                    },
                    'AudioDescriptions': [{
                        'AudioSourceName': 'Audio Selector 1', 
                        'CodecSettings': {
                            'Codec': 'AAC',
                            'AacSettings': {
                                'Bitrate': 96000,
                                'CodingMode': 'CODING_MODE_2_0',
                                'SampleRate': 48000
                            }
                        }
                    }]
                }]
            }]
        },
        'UserMetadata': {
            'videoId': video_id
        }
    }
    
    # Create job
    response = mc_client.create_job(**job_settings)
    job_id = response['Job']['Id']
    
    # Update DynamoDB
    update_dynamodb(video_id, {
        'status': 'PROCESSING',
        'mediaConvertJobId': job_id
    })
    
    return job_id


def seconds_to_timecode(seconds):
    """Convert seconds to HH:MM:SS:FF"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    f = int((seconds % 1) * 30)
    return f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"


def update_dynamodb(video_id, data):
    """Update DynamoDB"""
    try:
        update_expr = 'SET '
        expr_names = {}
        expr_values = {}
        
        for i, (key, value) in enumerate(data.items()):
            attr_name = f"#attr{i}"
            attr_value = f":val{i}"
            update_expr += f"{attr_name} = {attr_value}, "
            expr_names[attr_name] = key
            expr_values[attr_value] = value
        
        update_expr = update_expr.rstrip(', ')
        
        videos_table.update_item(
            Key={'videoId': video_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values
        )
        print(f"Updated DynamoDB for {video_id}")
    except Exception as e:
        print(f"Error updating DynamoDB: {e}")
        raise
