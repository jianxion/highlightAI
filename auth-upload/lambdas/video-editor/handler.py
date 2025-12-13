import json
import os
import shutil
import boto3
import subprocess
import tempfile
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

videos_table = dynamodb.Table(VIDEOS_TABLE_NAME)


def lambda_handler(event, context):
    """
    Main handler - triggered by SQS upload completion event
    """
    print(f"Event: {json.dumps(event)}")
    
    try:
        # Parse SQS message
        for record in event['Records']:
            message_body = json.loads(record['body'])
            print(f"Message: {json.dumps(message_body)}")
            
            # Extract S3 event details
            s3_event = message_body['Records'][0]
            bucket = s3_event['s3']['bucket']['name']
            key = s3_event['s3']['object']['key']
            
            # Extract videoId from S3 key
            # Format: videos/userId_videoId_timestamp_filename.mp4
            video_id = extract_video_id(key)
            
            print(f"Processing video: {video_id}")
            
            # Process video
            process_video(bucket, key, video_id)
            
            # Delete message from queue (success)
            delete_message(record)
            
        return {
            'statusCode': 200,
            'body': json.dumps('Video processing completed')
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        raise


def extract_video_id(s3_key):
    """Extract videoId from S3 key"""
    # Format: videos/userId_videoId_timestamp_filename.mp4
    # Example: videos/user123_550e8400-e29b_1702400000_myvideo.mp4
    parts = s3_key.split('_')
    if len(parts) >= 2:
        return parts[1]
    return s3_key.split('/')[-1].split('.')[0]


def process_video(bucket, key, video_id):
    """Main processing pipeline"""
    print(f"🔍 DEBUG INFO:")
    print(f"  Bucket: {bucket}")
    print(f"  Key: {key}")
    print(f"  Video ID: {video_id}")
    print(f"  RAW_BUCKET env var: {RAW_BUCKET}")
    with tempfile.TemporaryDirectory() as tmpdir:
        # Download video
        video_path = f"{tmpdir}/input_video.mp4"
        print(f"Downloading {key}...")
        print(f"  Downloading from: s3://{bucket}/{key}")
        try:
            s3_client.download_file(bucket, key, video_path)
        except Exception as e:
            print(f"  ❌ Download failed: {e}")
            raise
        
        
        # Detect audio
        has_audio = detect_audio(video_path)
        print(f"Has audio: {has_audio}")
        
        # Find key moments
        if has_audio:
            print("Using transcription path...")
            key_moments = analyze_by_transcription(video_path, video_id)
        else:
            print("Using rekognition path...")
            key_moments = analyze_by_rekognition(video_path, video_id)
        
        if not key_moments:
            raise Exception("Could not find key moments in video")
        
        print(f"Found {len(key_moments)} key moments")
        
        # Extract clips
        clips = extract_clips(video_path, key_moments, tmpdir)
        
        # Concatenate clips
        final_video_path = f"{tmpdir}/final_video.mp4"
        concatenate_clips(clips, final_video_path)
        
        # Upload plain version
        plain_s3_key = f"{video_id}_plain.mp4"
        print(f"Uploading plain video to {plain_s3_key}...")
        s3_client.upload_file(final_video_path, EDITED_BUCKET, plain_s3_key)
        
        # Create captioned version
        captioned_video_path = f"{tmpdir}/final_captioned.mp4"
        add_captions(final_video_path, captioned_video_path, key_moments)
        
        # Upload captioned version
        captioned_s3_key = f"{video_id}_captioned.mp4"
        print(f"Uploading captioned video to {captioned_s3_key}...")
        s3_client.upload_file(captioned_video_path, EDITED_BUCKET, captioned_s3_key)
        
        # Update DynamoDB
        running_caption = " → ".join([m['content'][:20] for m in key_moments])
        update_dynamodb(video_id, {
            'status': 'EDITED',
            'keyMoments': key_moments,
            'editedVideo': {
                'plainS3Key': plain_s3_key,
                'captionedS3Key': captioned_s3_key,
                'totalDuration': 15,
                'runningCaption': running_caption
            },
            'completedAt': int(datetime.now().timestamp())
        })
        
        print(f"Processing complete for {video_id}")


def detect_audio(video_path):
    """Check if video has audio stream"""
    try:
        result = subprocess.run(
            ['/opt/python/bin/ffprobe', '-v', 'error', '-select_streams', 'a:0',
             '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', video_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        print(f"  FFprobe result: {result.stdout}")
        return 'audio' in result.stdout
    except Exception as e:
        print(f"Error detecting audio: {e}")
        return False


def analyze_by_transcription(video_path, video_id):
    """
    Use AWS Transcribe to analyze audio
    TODO: Implement transcription logic
    """
    print("TODO: Implement transcription analysis")
    # For now, return dummy moments
    return [
        {'startSec': 2, 'endSec': 4, 'confidence': 0.95, 'content': 'Key moment 1'},
        {'startSec': 10, 'endSec': 13, 'confidence': 0.92, 'content': 'Key moment 2'},
        {'startSec': 45, 'endSec': 50, 'confidence': 0.98, 'content': 'Key moment 3'},
    ]


def analyze_by_rekognition(video_path, video_id):
    """
    Use AWS Rekognition to analyze scenes
    TODO: Implement rekognition logic
    """
    print("TODO: Implement rekognition analysis")
    # For now, return dummy moments
    return [
        {'startSec': 5, 'endSec': 8, 'confidence': 0.92, 'content': 'Scene 1'},
        {'startSec': 20, 'endSec': 25, 'confidence': 0.88, 'content': 'Scene 2'},
        {'startSec': 50, 'endSec': 55, 'confidence': 0.95, 'content': 'Scene 3'},
    ]


def extract_clips(video_path, key_moments, tmpdir):
    """Extract clips from video with fade transitions"""
    clips = []
    for i, moment in enumerate(key_moments[:5]):  # Max 5 clips
        clip_path = f"{tmpdir}/clip_{i}.mp4"
        duration = moment['endSec'] - moment['startSec']
        
        # FFmpeg command with fade
        # cmd = [
        #     '/opt/python/bin/ffmpeg', '-i', video_path,
        #     '-ss', str(moment['startSec']),
        #     '-t', str(duration),
            # '-vf', 'fade=t=in:st=0:d=0.5,fade=t=out:st=' + str(duration - 0.5) + ':d=0.5',
            # '-c:v', 'libx264', '-preset', 'fast',
            # '-c:a', 'aac', '-y',
        #     '-c', 'copy',
        #     '-y',
        #     clip_path
        # ]
        cmd = [
            '/opt/python/bin/ffmpeg', '-i', video_path,
            '-ss', str(moment['startSec']),
            '-t', str(duration),
            '-c', 'copy',
            '-y',
            clip_path
        ]
        
        print(f"Extracting clip {i+1}...")
        subprocess.run(cmd, check=True, capture_output=True)
        clips.append(clip_path)
    
    return clips


def concatenate_clips(clips, output_path):
    """Concatenate clips into single video"""
    # Create concat demuxer file
    concat_file = output_path.replace('.mp4', '_concat.txt')
    with open(concat_file, 'w') as f:
        for clip in clips:
            f.write(f"file '{clip}'\n")
    
    cmd = [
        '/opt/python/bin/ffmpeg', '-f', 'concat', '-safe', '0',
        '-i', concat_file, '-c', 'copy', '-y', output_path
    ]
    
    print("Concatenating clips...")
    subprocess.run(cmd, check=True, capture_output=True)


# def add_captions(input_path, output_path, key_moments):
#     """Add running captions to video"""
#     caption = " → ".join([m['content'][:15] for m in key_moments])
    
#     cmd = [
#         '/opt/python/bin/ffmpeg', '-i', input_path,
#         '-vf', f"drawtext=text='{caption}':fontsize=24:fontcolor=white:"
#                "x=(w-text_w)/2:y=h-50:box=1:boxcolor=black@0.5:boxborderw=5",
#         '-c:v', 'libx264', '-preset', 'fast',
#         '-c:a', 'aac', '-y',
#         output_path
#     ]
    
#     print("Adding captions...")
#     subprocess.run(cmd, check=True, capture_output=True)
def add_captions(input_path, output_path, key_moments):
    """For now, just copy the file without captions"""
    # We'll add fancy captions later
    shutil.copy(input_path, output_path)
    print(f"Copied final video (captions disabled for now)")



def update_dynamodb(video_id, data):
    """Update video metadata in DynamoDB"""
    try:
        videos_table.update_item(
            Key={'videoId': video_id},
            UpdateExpression='SET #status = :status, #keyMoments = :moments, '
                           '#editedVideo = :edited, #completedAt = :completed',
            ExpressionAttributeNames={
                '#status': 'status',
                '#keyMoments': 'keyMoments',
                '#editedVideo': 'editedVideo',
                '#completedAt': 'completedAt'
            },
            ExpressionAttributeValues={
                ':status': data['status'],
                ':moments': data['keyMoments'],
                ':edited': data['editedVideo'],
                ':completed': data['completedAt']
            }
        )
        print(f"Updated DynamoDB for {video_id}")
    except Exception as e:
        print(f"Error updating DynamoDB: {e}")
        raise


def delete_message(record):
    """Delete message from SQS after processing"""
    # Message will auto-delete on success
    # Only needed if implementing manual deletion
    pass
