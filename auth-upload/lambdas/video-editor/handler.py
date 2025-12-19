
"""
video-editor/handler.py - Complete, Production-Ready Handler

Flow:
1. SQS triggers Lambda with S3 upload event
2. Launch Transcribe + Rekognition jobs (non-blocking)
3. Store job IDs in DynamoDB
4. Return immediately (CloudWatch Events will trigger consolidation)

Environment Variables Required:
- RAW_VIDEOS_BUCKET: Bucket with uploaded videos
- EDITED_VIDEOS_BUCKET: Destination for edited highlights
- VIDEOS_TABLE: DynamoDB table for tracking
- REGION: AWS region
- SNS_TOPIC_ARN: SNS topic for job completion notifications (optional)
"""

import json
import os
import traceback
import boto3
import time
import urllib.request
from datetime import datetime
from botocore.exceptions import ClientError

# ============================================================================
# AWS CLIENTS & CONFIG
# ============================================================================

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
transcribe_client = boto3.client('transcribe')
rekognition_client = boto3.client('rekognition')
mediaconvert_client = boto3.client('mediaconvert', region_name='us-east-1')
sts_client = boto3.client('sts')
sqs_client = boto3.client('sqs')

RAW_BUCKET = os.environ.get('RAW_VIDEOS_BUCKET')
EDITED_BUCKET = os.environ.get('EDITED_VIDEOS_BUCKET')
VIDEOS_TABLE_NAME = os.environ.get('VIDEOS_TABLE')
REGION = os.environ.get('REGION', 'us-east-1')
ACCOUNT_ID = sts_client.get_caller_identity()['Account']

videos_table = dynamodb.Table(VIDEOS_TABLE_NAME)

# ============================================================================
# PHASE 1: MAIN HANDLER - KICK OFF ANALYSIS
# ============================================================================

def lambda_handler(event, context):
    """
    SQS-triggered handler to start async analysis jobs
    
    Event structure from UploadCompleteFunction:
    {
        'Records': [
            {
                'body': {
                    'videoId': 'abc123',
                    'bucket': 'bucket-name',
                    's3Key': 'videos/userId_videoId_timestamp_file.mp4',
                    'fileSize': 12345,
                    'status': 'UPLOADED',
                    'timestamp': 1234567890
                }
            }
        ]
    }
    """
    print(f"🎬 video-editor Lambda triggered (v2)")
    print(f"Event: {json.dumps(event)}")
    
    try:
        results = []
        
        for record in event['Records']:
            try:
                # Parse SQS message from UploadCompleteFunction
                message_body = json.loads(record['body'])
                
                # Extract video details from custom message format
                video_id = message_body.get('videoId')
                bucket = message_body.get('bucket')
                key = message_body.get('s3Key')
                file_size = message_body.get('fileSize', 0)
                
                if not video_id or not bucket or not key:
                    print(f"⚠️  Missing required fields in message: {message_body}")
                    continue
                
                print(f"📹 Processing video: {video_id}")
                print(f"   S3 Location: s3://{bucket}/{key}")
                
                # ✅ STEP 1: Start Transcribe job (non-blocking)
                transcribe_job = start_transcribe_job(bucket, key, video_id)
                transcribe_job_name = transcribe_job['TranscriptionJobName']
                print(f"   ✓ Transcribe job started: {transcribe_job_name}")
                
                # ✅ STEP 2: Start Rekognition job (non-blocking)
                rekognition_job = start_rekognition_job(bucket, key, video_id)
                rekognition_job_id = rekognition_job['JobId']
                print(f"   ✓ Rekognition job started: {rekognition_job_id}")
                
                # ✅ STEP 3: Store job IDs in DynamoDB for tracking
                update_video_status(video_id, {
                    'status': 'ANALYZING',
                    'bucket': bucket,
                    'key': key,
                    'transcribeJobId': transcribe_job_name,
                    'rekognitionJobId': rekognition_job_id,
                    'startedAt': datetime.utcnow().isoformat(),
                    'phase': 'ANALYSIS',
                    'uploadedSize': file_size
                })
                
                results.append({
                    'videoId': video_id,
                    'transcribeJobId': transcribe_job_name,
                    'rekognitionJobId': rekognition_job_id,
                    'status': 'ANALYSIS_STARTED'
                })
                
                print(f"✅ Analysis jobs initiated for {video_id}")
                
            except Exception as e:
                print(f"❌ Error processing record: {str(e)}")
                print("   Full error:")
                traceback.print_exc()
                # Continue processing other records
                continue
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Analysis jobs initiated',
                'results': results,
                'count': len(results)
            })
        }
    
    except Exception as e:
        print(f"❌ CRITICAL ERROR in lambda_handler: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


# ============================================================================
# JOB STARTERS (Non-blocking)
# ============================================================================

def start_transcribe_job(bucket, key, video_id):
    """Start AWS Transcribe job - returns immediately"""
    
    job_name = f"transcribe-{video_id}"
    s3_uri = f"s3://{bucket}/{key}"
    
    # Check if job already exists
    try:
        existing = transcribe_client.get_transcription_job(
            TranscriptionJobName=job_name
        )
        print(f"   ℹ️  Transcribe job already exists: {existing['TranscriptionJob']['TranscriptionJobStatus']}")
        return existing['TranscriptionJob']
    except:
        pass
    
    # Start new job
    response = transcribe_client.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={'MediaFileUri': s3_uri},
        MediaFormat=key.split('.')[-1].lower(),
        LanguageCode='en-US',
        Settings={
            'ShowSpeakerLabels': True,
            'MaxSpeakerLabels': 3,
            'VocabularyFilterMethod': 'remove'  # Optional: filter profanity
        },
        OutputBucketName=RAW_BUCKET,
        OutputKey=f"transcripts/{video_id}.json"
    )
    
    return response['TranscriptionJob']


def start_rekognition_job(bucket, key, video_id):
    """Start AWS Rekognition label detection - returns immediately"""
    
    response = rekognition_client.start_label_detection(
        Video={'S3Object': {'Bucket': bucket, 'Name': key}},
        MinConfidence=70,
        Features=['GENERAL_LABELS']  # Can also add 'FACE_DETECTION', 'SHOT_DETECTION'
    )
    
    return response


# ============================================================================
# RESULT FETCHERS (Called during consolidation)
# ============================================================================

def get_transcribe_results(job_name):
    """Fetch completed Transcribe job results"""
    
    response = transcribe_client.get_transcription_job(
        TranscriptionJobName=job_name
    )
    job = response['TranscriptionJob']
    
    if job['TranscriptionJobStatus'] != 'COMPLETED':
        raise Exception(f"Transcribe job not complete: {job['TranscriptionJobStatus']}")
    
    # Download transcript JSON from S3
    transcript_uri = job['Transcript']['TranscriptFileUri']
    print(f"   📥 Downloading transcript from: {transcript_uri}")
    
    with urllib.request.urlopen(transcript_uri) as response:
        transcript_data = json.loads(response.read().decode())
    
    return transcript_data


def get_rekognition_results(job_id):
    """Fetch completed Rekognition job results"""
    
    response = rekognition_client.get_label_detection(JobId=job_id)
    
    if response['JobStatus'] != 'SUCCEEDED':
        raise Exception(f"Rekognition job failed: {response['JobStatus']}")
    
    return response


# ============================================================================
# HIGHLIGHT EXTRACTION LOGIC
# ============================================================================

def extract_audio_highlights(transcript_data):
    """
    Extract exciting moments from transcript
    
    Logic:
    1. Define excitement keywords with confidence scores
    2. Scan transcript for keywords
    3. Create 4-5 second clips around each keyword
    4. Return sorted by excitement level
    """
    
    # Keywords that indicate exciting moments
    EXCITEMENT_KEYWORDS = {
        # Sports/Competition
        'goal': 0.95, 'score': 0.95, 'win': 0.95, 'winner': 0.95,
        'victory': 0.90, 'champion': 0.90, 'touchdown': 0.95, 'home run': 0.95,
        
        # Excitement/Reactions
        'amazing': 0.85, 'incredible': 0.85, 'wow': 0.85, 'awesome': 0.85,
        'unbelievable': 0.85, 'insane': 0.85, 'crazy': 0.80, 'mad': 0.75,
        
        # Success
        'yes': 0.70, 'yes!': 0.85, 'boom': 0.80, 'boom!': 0.85,
        'breakthrough': 0.85, 'success': 0.80, 'perfect': 0.80, 'best': 0.70,
        'world record': 0.95, 'record': 0.80,
        
        # Celebration
        'celebration': 0.90, 'celebrate': 0.85, 'party': 0.80, 'cheers': 0.85,
        'applause': 0.80, 'congratulations': 0.75,
    }
    
    highlights = []
    
    try:
        items = transcript_data.get('results', {}).get('items', [])
        
        for i, item in enumerate(items):
            if item.get('type') != 'pronunciation':
                continue
            
            word = item['alternatives'][0].get('content', '').lower()
            confidence = float(item['alternatives'][0].get('confidence', 0.9))
            
            # Check for keyword matches
            for keyword, excitement_score in EXCITEMENT_KEYWORDS.items():
                if keyword in word:
                    start_time = float(item.get('start_time', 0))
                    end_time = float(item.get('end_time', 0))
                    
                    # Create 4-second clip centered on keyword (1.5s before, 2.5s after)
                    clip_start = max(0, start_time - 1.5)
                    clip_end = end_time + 2.5
                    
                    score = excitement_score * confidence
                    
                    highlights.append({
                        'start': clip_start,
                        'end': clip_end,
                        'score': score,
                        'type': 'audio',
                        'keyword': keyword,
                        'word': word,
                        'confidence': confidence
                    })
                    
                    break  # Don't double-count
    
    except Exception as e:
        print(f"⚠️  Error extracting audio highlights: {e}")
    
    return highlights


def extract_visual_highlights(rekognition_data):
    """
    Extract exciting moments from video visuals
    
    Logic:
    1. Define action/excitement labels (people, sports, celebrations)
    2. Group labels by timestamp
    3. Find moments with multiple high-confidence labels
    4. Create 4-second clips around high-activity moments
    """
    
    # Labels indicating action or excitement
    ACTION_LABELS = {
        # People/Activities
        'Person': 0.6, 'People': 0.6, 'Group': 0.65, 'Crowd': 0.85,
        
        # Movement/Action
        'Running': 0.90, 'Jumping': 0.90, 'Walking': 0.60, 'Dancing': 0.85,
        'Sports': 0.95, 'Game': 0.80, 'Play': 0.75, 'Athlete': 0.90,
        
        # Excitement/Celebration
        'Celebration': 0.95, 'Party': 0.85, 'Cheering': 0.90, 'Applause': 0.90,
        'Confetti': 0.95, 'Fireworks': 0.90, 'Stadium': 0.75,
        
        # Reactions
        'Excitement': 0.85, 'Emotion': 0.70, 'Expression': 0.65,
    }
    
    highlights = []
    label_timeline = {}
    
    try:
        labels = rekognition_data.get('Labels', [])
        
        for label in labels:
            if label['Label']['Confidence'] < 70:
                continue
            
            label_name = label['Label']['Name']
            if label_name not in ACTION_LABELS:
                continue
            
            timestamp = label['Timestamp'] / 1000  # Convert milliseconds to seconds
            confidence = label['Label']['Confidence'] / 100
            score = ACTION_LABELS[label_name] * confidence
            
            if timestamp not in label_timeline:
                label_timeline[timestamp] = []
            
            label_timeline[timestamp].append({
                'label': label_name,
                'score': score,
                'confidence': confidence
            })
        
        # Group consecutive high-activity moments
        for timestamp in sorted(label_timeline.keys()):
            labels_at_time = label_timeline[timestamp]
            
            if len(labels_at_time) >= 2:  # Multiple action labels = high activity
                avg_score = sum(l['score'] for l in labels_at_time) / len(labels_at_time)
                
                highlights.append({
                    'start': max(0, timestamp - 1.5),
                    'end': timestamp + 2.5,
                    'score': avg_score,
                    'type': 'visual',
                    'labels': [l['label'] for l in labels_at_time],
                    'count': len(labels_at_time)
                })
    
    except Exception as e:
        print(f"⚠️  Error extracting visual highlights: {e}")
    
    return highlights


# ============================================================================
# MERGE & DEDUPLICATE
# ============================================================================

def merge_highlights(audio_highlights, visual_highlights):
    """
    Merge audio and visual highlights, deduplicate overlaps
    
    Logic:
    1. Combine all highlights
    2. Sort by start time
    3. Merge clips that overlap (within 2 seconds)
    4. Sort by score and keep top 15
    5. Re-sort by time for MediaConvert
    """
    
    all_highlights = audio_highlights + visual_highlights
    
    if not all_highlights:
        print("⚠️  No highlights detected from either source")
        return []
    
    # Sort by start time
    all_highlights.sort(key=lambda x: x['start'])
    
    # Merge overlapping/nearby clips
    merged = []
    
    for highlight in all_highlights:
        if not merged:
            merged.append(highlight)
            continue
        
        last = merged[-1]
        
        # If clips are within 2 seconds of each other, merge them
        if highlight['start'] <= last['end'] + 2:
            # Extend end time
            last['end'] = max(last['end'], highlight['end'])
            # Keep highest score
            last['score'] = max(last['score'], highlight['score'])
            # Combine metadata
            last['mergedTypes'] = list(set([last.get('type', 'unknown'), highlight.get('type', 'unknown')]))
            
        else:
            # Far enough apart, add as new clip
            merged.append(highlight)
    
    print(f"   After merging: {len(merged)} unique moments")
    
    # Take top 15 by score (quality filtering)
    top_highlights = sorted(merged, key=lambda x: x['score'], reverse=True)[:15]
    
    # Re-sort by time for MediaConvert (must be chronological)
    top_highlights.sort(key=lambda x: x['start'])
    
    print(f"   After quality filtering: {len(top_highlights)} highlights")
    
    return top_highlights


def generate_fallback_highlights(video_duration, num_clips=10):
    """
    Generate evenly-spaced clips if analysis fails
    Useful as fallback when Transcribe/Rekognition don't find anything
    """
    
    clip_duration = 5  # 5-second clips
    interval = (video_duration - clip_duration) / max(num_clips, 1)
    
    highlights = []
    
    for i in range(num_clips):
        start = max(0, i * interval)
        end = min(video_duration, start + clip_duration)
        
        highlights.append({
            'start': start,
            'end': end,
            'score': 0.5,  # Low score = fallback
            'type': 'fallback',
            'reason': f'Auto-generated clip {i+1}'
        })
    
    return highlights


# ============================================================================
# MEDIACONVERT JOB CREATION
# ============================================================================

def create_mediaconvert_job(video_id, bucket, key, key_moments):
    """
    Create MediaConvert job with INPUT CLIPPING
    
    🔑 KEY CONCEPT:
    Instead of processing the entire video, we pass "InputClippings"
    to MediaConvert. It ONLY processes those segments.
    
    This is the "editing" - AWS MediaConvert extracts and concatenates
    the highlight segments into a single output video.
    
    Timecodes format: HH:MM:SS:FF (frames at 30fps)
    """
    
    if not key_moments:
        raise ValueError("No key moments provided")
    
    print(f"📊 Creating MediaConvert job with {len(key_moments)} clips")
    
    # Build input clippings from key moments
    input_clippings = []
    
    for i, moment in enumerate(key_moments, 1):
        start_tc = seconds_to_timecode(moment['start'])
        end_tc = seconds_to_timecode(moment['end'])
        
        print(f"   Clip {i}: {start_tc} → {end_tc}")
        
        input_clippings.append({
            'StartTimecode': start_tc,
            'EndTimecode': end_tc
        })
    
    # Get MediaConvert endpoint
    try:
        endpoint_response = mediaconvert_client.describe_endpoints(MaxResults=1)
        endpoint = endpoint_response['Endpoints'][0]['Url']
    except:
        endpoint = None  # Will use default
    
    mc = boto3.client(
        'mediaconvert',
        region_name=REGION,
        endpoint_url=endpoint
    ) if endpoint else mediaconvert_client
    
    # Build job settings
    job_settings = {
        'Role': f"arn:aws:iam::{ACCOUNT_ID}:role/MediaConvertRole",
        'Settings': {
            'Inputs': [{
                'FileInput': f"s3://{bucket}/{key}",
                'InputClippings': input_clippings,  # ← THE MAGIC
                'AudioSelectors': {
                    'Audio Selector 1': {
                        'DefaultSelection': 'DEFAULT'
                    }
                },
                'VideoSelector': {}
            }],
            'OutputGroups': [{
                'Name': 'File Group',
                'OutputGroupSettings': {
                    'Type': 'FILE_GROUP_SETTINGS',
                    'FileGroupSettings': {
                        'Destination': f"s3://{EDITED_BUCKET}/{video_id}_highlights"
                    }
                },
                'Outputs': [{
                    'ContainerSettings': {
                        'Container': 'MP4'
                    },
                    'VideoDescription': {
                        'CodecSettings': {
                            'Codec': 'H_264',
                            'H264Settings': {
                                'RateControlMode': 'QVBR',
                                'MaxBitrate': 5000000,
                                'QualityTuningLevel': 'SINGLE_PASS_HQ'
                            }
                        },
                        'Width': 1920,
                        'Height': 1080
                    },
                    'AudioDescriptions': [{
                        'AudioSourceName': 'Audio Selector 1',
                        'CodecSettings': {
                            'Codec': 'AAC',
                            'AacSettings': {
                                'Bitrate': 128000,
                                'CodingMode': 'CODING_MODE_2_0',
                                'SampleRate': 48000
                            }
                        }
                    }]
                }]
            }]
        },
        'UserMetadata': {
            'videoId': video_id,
            'clipCount': str(len(key_moments))
        }
    }
    
    # Create the job
    response = mc.create_job(**job_settings)
    job_id = response['Job']['Id']
    
    print(f"✅ MediaConvert job created: {job_id}")
    
    return job_id


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def seconds_to_timecode(seconds):
    """Convert seconds (float) to HH:MM:SS:FF format (30fps)"""
    
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    frames = int((seconds % 1) * 30)  # 30 frames per second
    
    return f"{hours:02d}:{minutes:02d}:{secs:02d}:{frames:02d}"


def extract_video_id(s3_key):
    """
    Extract videoId from S3 key
    Expected format: videos/<userId>_<videoId>_<timestamp>_<filename.ext>
    """
    
    # Get filename from key
    filename = s3_key.split('/')[-1]
    
    # Split by underscore
    parts = filename.split('_')
    
    # videoId is typically the 2nd part (after userId)
    if len(parts) >= 2:
        return parts[1]
    
    # Fallback: use filename without extension
    return filename.split('.')[0]


def update_video_status(video_id, data):
    """
    Generic DynamoDB update
    
    Example:
        update_video_status('video123', {
            'status': 'ANALYZING',
            'transcribeJobId': 'transcribe-job-123'
        })
    """
    
    if not video_id or not data:
        print(f"⚠️  Skipping DynamoDB update: videoId={video_id}, data={data}")
        return
    
    try:
        # Build update expression
        update_parts = []
        expr_names = {}
        expr_values = {}
        
        for key, value in data.items():
            attr_name = f"#{key}"
            attr_value = f":{key}"
            
            update_parts.append(f"{attr_name} = {attr_value}")
            expr_names[attr_name] = key
            expr_values[attr_value] = value
        
        update_expr = 'SET ' + ', '.join(update_parts)
        
        videos_table.update_item(
            Key={'videoId': video_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues='ALL_NEW'
        )
        
        print(f"✅ DynamoDB updated: {video_id}")
        
    except ClientError as e:
        print(f"❌ DynamoDB error: {e}")
        raise


# ============================================================================
# DEBUGGING / LOCAL TESTING
# ============================================================================

if __name__ == '__main__':
    """Local testing"""
    
    # Mock SQS event with UploadCompleteFunction message format
    test_event = {
        'Records': [
            {
                'body': json.dumps({
                    'videoId': 'video456',
                    'bucket': 'raw-videos-bucket',
                    's3Key': 'videos/user123_video456_1702704000_recording.mp4',
                    'fileSize': 10485760,
                    'status': 'UPLOADED',
                    'timestamp': 1702704000
                })
            }
        ]
    }
    
    # Test
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))