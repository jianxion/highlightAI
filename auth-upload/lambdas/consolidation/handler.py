
"""
consolidation/handler.py - MediaConvert Implementation (Restored)

Flow:
1. Triggered by CloudWatch Events (Transcribe completion)
2. Fetch Transcribe & Rekognition results
3. Identify highlights
4. Create MediaConvert job to process and concatenate highlights
"""

import json
import os
import boto3
import urllib.request
from datetime import datetime
from decimal import Decimal
from botocore.exceptions import ClientError

# ============================================================================
# AWS CLIENTS & CONFIG
# ============================================================================

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
transcribe_client = boto3.client('transcribe')
rekognition_client = boto3.client('rekognition')
mediaconvert_client = boto3.client('mediaconvert', region_name='us-east-1')
bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')
sts_client = boto3.client('sts')

RAW_BUCKET = os.environ.get('RAW_VIDEOS_BUCKET')
EDITED_BUCKET = os.environ.get('EDITED_VIDEOS_BUCKET')
VIDEOS_TABLE_NAME = os.environ.get('VIDEOS_TABLE')
MEDIA_CONVERT_ROLE_ARN = os.environ.get('MEDIA_CONVERT_ROLE_ARN')
REGION = os.environ.get('REGION', 'us-east-1')
ACCOUNT_ID = sts_client.get_caller_identity()['Account']

videos_table = dynamodb.Table(VIDEOS_TABLE_NAME)

# ============================================================================
# HANDLER
# ============================================================================

def consolidation_handler(event, context):
    """
    Triggered by CloudWatch Events when Transcribe job completes
    Merges results and creates MediaConvert job
    """
    print(f"🔀 Consolidation handler triggered")
    print(f"Event: {json.dumps(event)}")
    
    try:
        # CloudWatch Event format for Transcribe completion
        if 'detail' not in event or 'detail-type' not in event:
            print(f"⚠️  Not a CloudWatch event, ignoring")
            return {'statusCode': 400, 'body': 'Invalid event format'}
        
        detail = event['detail']
        transcribe_job_name = detail.get('TranscriptionJobName')
        job_status = detail.get('TranscriptionJobStatus')
        
        if job_status != 'COMPLETED':
            print(f"⚠️  Transcribe job not completed: {job_status}")
            return {'statusCode': 200, 'body': 'Job not completed yet'}
        
        # Extract videoId from job name (format: transcribe-{videoId})
        if not transcribe_job_name or not transcribe_job_name.startswith('transcribe-'):
            raise ValueError(f"Invalid transcribe job name: {transcribe_job_name}")
        
        video_id = transcribe_job_name.replace('transcribe-', '')
        
        if not video_id:
            raise ValueError(f"No videoId found in job name: {transcribe_job_name}")
        
        print(f"📊 Consolidating results for {video_id}")
        
        # Fetch video data from DynamoDB
        response = videos_table.get_item(Key={'videoId': video_id})
        
        if 'Item' not in response:
            raise ValueError(f"Video {video_id} not found in DynamoDB")
        
        video_data = response['Item']
        transcribe_job_id = video_data.get('transcribeJobId')
        rekognition_job_id = video_data.get('rekognitionJobId')
        
        print(f"   Fetching Transcribe results: {transcribe_job_id}")
        print(f"   Fetching Rekognition results: {rekognition_job_id}")
        
        # 1. Get completed results
        transcribe_results = get_transcribe_results(transcribe_job_id, video_id)
        rekognition_results = get_rekognition_results(rekognition_job_id)
        
        # 2. Extract highlights from both sources
        video_duration_ms = rekognition_results.get('VideoMetadata', {}).get('DurationMillis', 0)
        video_duration_sec = video_duration_ms / 1000.0 if video_duration_ms > 0 else 300.0
        print(f"   Video Duration: {video_duration_sec}s")

        audio_highlights = extract_audio_highlights(transcribe_results)
        visual_highlights = extract_visual_highlights(rekognition_results)
        
        print(f"   Found {len(audio_highlights)} audio highlights")
        print(f"   Found {len(visual_highlights)} visual highlights")
        
        # 3. Merge and deduplicate
        key_moments = merge_highlights(audio_highlights, visual_highlights, video_duration_sec)
        
        # Clamp moments to video duration
        valid_moments = []
        for m in key_moments:
            if m['start'] >= video_duration_sec:
                continue
            m['end'] = min(m['end'], video_duration_sec)
            if m['end'] > m['start']:
                valid_moments.append(m)
        key_moments = valid_moments
        
        if not key_moments:
            print(f"⚠️  No highlights found, generating fallback clips")
            key_moments = generate_fallback_highlights(video_duration=video_duration_sec)

        # Merge loops and enforce 15-20s cap
        # We trust merge_highlights to handle the capping now
        key_moments = merge_highlights(key_moments, [], video_duration_sec)
        
        # Double check fallbacks if still too short (rare case if merge is strict)
        total_dur = sum([m['end'] - m['start'] for m in key_moments])
        if total_dur < 15:
             print(f"⚠️  Duration {total_dur}s < 15s, adding fallbacks")
             fallbacks = generate_fallback_highlights(video_duration_sec)
             # Add fallbacks and re-merge to cap
             key_moments.extend(fallbacks)
             key_moments = merge_highlights(key_moments, [], video_duration_sec)
        
        print(f"✅ Final key moments: {len(key_moments)}")
        for i, moment in enumerate(key_moments, 1):
            duration = moment['end'] - moment['start']
            print(f"   {i}. {moment['start']:.1f}s - {moment['end']:.1f}s ({duration:.1f}s) - Score: {moment['score']:.2f}")
        
        # 3.5 Generate and Upload Subtitles (SRT) - mapped to edited video timeline
        # Only create if transcript has words
        srt_content = json_to_srt(transcribe_results, key_moments)
        srt_key = None
        
        if srt_content:
            srt_key = f"subtitles/{video_id}.srt"
            s3_client.put_object(Bucket=RAW_BUCKET, Key=srt_key, Body=srt_content)
            print(f"📝 Subtitles uploaded to: s3://{RAW_BUCKET}/{srt_key}")
        else:
            print("ℹ️ No subtitles generated (transcript empty or no words in highlights)")

        # 3.6 Generate Smart Contextual Summary (Bedrock)
        print("🧠 Generating smart context...")
        smart_title = summarize_context(video_data['key'], transcribe_results)
        print(f"   Generated Title: {smart_title}")

        # Generate title overlay image
        print(f"🎨 Creating title overlay image...")
        title_overlay_key = generate_title_sequences(smart_title, video_id)
        
        if not title_overlay_key:
            print("⚠️ Failed to generate title overlay, proceeding without it")
        
        # Sanitize title for filename (remove special chars, limit length)
        safe_title = "".join(c if c.isalnum() or c in (' ', '-') else '_' for c in smart_title)[:50]
        safe_title = safe_title.replace(' ', '_')
        
        # 4. Create MediaConvert job with highlights, subtitles, title overlay, and descriptive filename
        mediaconvert_job_id = create_mediaconvert_job(
            video_id=video_id,
            bucket=video_data['bucket'],
            key=video_data['key'],
            key_moments=key_moments,
            subtitle_key=srt_key,
            output_filename=f"{video_id}_{safe_title}_highlights",
            title_overlay_key=title_overlay_key
        )
        
        print(f"🎬 MediaConvert job created: {mediaconvert_job_id}")
        
        # 5. Update DynamoDB with editing status
        # Helper to convert floats to Decimal for DynamoDB
        def to_decimal(obj):
            if isinstance(obj, float): return Decimal(str(obj))
            if isinstance(obj, dict): return {k: to_decimal(v) for k, v in obj.items()}
            if isinstance(obj, list): return [to_decimal(v) for v in obj]
            return obj

        update_video_status(video_id, {
            'status': 'EDITING',
            'phase': 'MEDIACONVERT',
            'mediaConvertJobId': mediaconvert_job_id,
            'keyMoments': to_decimal(key_moments),
            'keyMomentsCount': len(key_moments),
            'title': smart_title,
            'consolidatedAt': datetime.utcnow().isoformat()
        })
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'videoId': video_id,
                'mediaConvertJobId': mediaconvert_job_id,
                'keyMoments': len(key_moments),
                'status': 'EDITING'
            })
        }
    
    except Exception as e:
        print(f"❌ Consolidation error: {str(e)}")
        if video_id:
            update_video_status(video_id, {
                'status': 'ERROR',
                'phase': 'CONSOLIDATION',
                'error': str(e)
            })
        raise


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_transcribe_results(job_name, video_id):
    response = transcribe_client.get_transcription_job(TranscriptionJobName=job_name)
    job = response['TranscriptionJob']
    if job['TranscriptionJobStatus'] != 'COMPLETED':
        raise Exception(f"Transcribe job not complete")
    
    # Transcript is stored in RAW_BUCKET/transcripts/<video_id>.json
    key = f"transcripts/{video_id}.json"
    
    # Retrieve from S3
    obj = s3_client.get_object(Bucket=RAW_BUCKET, Key=key)
    return json.loads(obj['Body'].read().decode('utf-8'))

def get_rekognition_results(job_id):
    # Poll for completion
    max_retries = 150 # Wait up to 300s
    for _ in range(max_retries):
        response = rekognition_client.get_label_detection(JobId=job_id)
        status = response['JobStatus']
        if status == 'SUCCEEDED':
            return response
        elif status == 'FAILED':
            raise Exception(f"Rekognition job failed")
        
        print(f"   Rekognition status: {status}, waiting...")
        import time
        time.sleep(2)
        
    raise Exception(f"Rekognition job timed out after {max_retries*2}s")

def extract_audio_highlights(transcript_data):
    highlights = []
    EXCITEMENT_KEYWORDS = {
        'goal': 0.95, 'score': 0.95, 'win': 0.95, 'amazing': 0.85, 'wow': 0.85, 'yes': 0.70,
        'okay': 0.6, 'right': 0.6, 'now': 0.6, 'let': 0.6, 'good': 0.6, 'start': 0.6, 'welcome': 0.8
    }
    try:
        items = transcript_data.get('results', {}).get('items', [])
        
        # Helper to find sentence boundaries
        def find_boundary(index, direction, limit_sec):
            # direction: -1 for start (left), 1 for end (right)
            # Ensure we have a valid reference time
            try:
                curr_time = float(items[index]['start_time' if direction == -1 else 'end_time'])
            except:
                return None # Can't snap without reference
            
            # Scan
            scan_idx = index
            while 0 <= scan_idx < len(items):
                item = items[scan_idx]
                
                # Check absolute time limit only for pronunciation items (punctuation often lacks timestamps)
                if item.get('type') == 'pronunciation':
                    t = float(item.get('start_time', 0))
                    if abs(t - curr_time) > limit_sec:
                        break
                
                # Check for punctuation
                if item.get('type') == 'punctuation' and item.get('alternatives', [{}])[0].get('content') in ['.', '?', '!']:
                    # Found boundary
                    # If looking left (start), boundary is the item AFTER the punctuation
                    if direction == -1:
                        if scan_idx + 1 < len(items):
                            return float(items[scan_idx+1]['start_time'])
                    # If looking right (end), boundary is the item BEFORE the punctuation (simplest safe cut)
                    # Or better: include the punctuation? Punctuation has no duration, so we use end of previous word.
                    else:
                        if scan_idx - 1 >= 0:
                            return float(items[scan_idx-1]['end_time'])
                    
                scan_idx += direction
            
            # Fallback if no punctuation found
            return None

        for i, item in enumerate(items):
            if item.get('type') != 'pronunciation': continue
            word = item['alternatives'][0].get('content', '').lower()
            confidence = float(item['alternatives'][0].get('confidence', 0.9))
            
            for k, s in EXCITEMENT_KEYWORDS.items():
                if k in word:
                    # Found keyword, snap to sentence
                    t_start = float(item.get('start_time', 0))
                    t_end = float(item.get('end_time', 0))
                    
                    # Snap Start (look back 30s)
                    snapped_start = find_boundary(i, -1, 30)
                    final_start = snapped_start if snapped_start is not None else max(0, t_start - 3)
                    
                    # Snap End (look forward 30s)
                    snapped_end = find_boundary(i, 1, 30)
                    final_end = snapped_end if snapped_end is not None else (t_end + 3)

                    # Add buffer
                    final_start = max(0, final_start - 0.3)
                    final_end = final_end + 0.3

                    highlights.append({
                        'start': final_start, 
                        'end': final_end,
                        'score': s * confidence, 
                        'type': 'audio'
                    })
                    break
    except Exception as e: print(f"Audio extract error: {e}")
    return highlights

def extract_visual_highlights(rekognition_data):
    highlights = []
    # Richer Action Labels with differentiated scores
    ACTION_LABELS = {
        'Person': 0.2, # Down-weighted generic
        'Sports': 0.95, 'Competition': 0.95, 'Match': 0.95,
        'Running': 0.9, 'Jumping': 0.9, 'Dancing': 0.9, 'Human': 0.2,
        'Vehicle': 0.7, 'Car': 0.7, 'Plane': 0.7,
        'Nature': 0.6, 'Outdoor': 0.6, 'Mountain': 0.6, 'Beach': 0.7,
        'Happy': 0.8, 'Smile': 0.8, 'Laughing': 0.8, 'Party': 0.85,
        'Concert': 0.9, 'Performance': 0.9, 'Stage': 0.85
    }
    
    label_timeline = {}
    try:
        # 1. Bucket labels by timestamp (1s granularity)
        for label in rekognition_data.get('Labels', []):
            name = label['Label']['Name']
            conf = label['Label']['Confidence']
            
            if conf > 65:
                # Round to nearest second for density calculation
                ts = int(label['Timestamp'] / 1000)
                if ts not in label_timeline: label_timeline[ts] = []
                
                # Base score from dict, or default low for unknown objects
                base_score = ACTION_LABELS.get(name, 0.3)
                label_timeline[ts].append({'name': name, 'score': base_score})

        # 2. Generate Highlights from Timeline
        for ts in sorted(label_timeline.keys()):
            labels_in_sec = label_timeline[ts]
            if not labels_in_sec: continue
            
            # Max Base Score
            max_score = max(l['score'] for l in labels_in_sec)
            
            # Density Bonus (more unique labels = richer scene)
            unique_labels = set(l['name'] for l in labels_in_sec)
            density_bonus = min(0.3, len(unique_labels) * 0.05)
            
            final_score = max_score + density_bonus
            
            # Only keep interesting moments
            if final_score > 0.4:
                highlights.append({
                    'start': max(0, ts - 1.5), 
                    'end': ts + 2.5,
                    'score': final_score, 
                    'type': 'visual',
                    'labels': list(unique_labels)
                })

    except Exception as e: print(f"Visual extract error: {e}")
    return highlights

def merge_highlights(audio, visual, video_duration=300):
    # 1. Combine
    all_h = audio + visual
    
    # 2. Sort by Score (Desc), then by closeness to center (Asc)
    # This prevents taking just the first few seconds if scores are tied
    midpoint = video_duration / 2
    all_h.sort(key=lambda x: (x['score'], -abs(x['start'] - midpoint)), reverse=True)
    
    selected = []
    total_duration = 0
    TARGET_DURATION = 18 # Sweet spot between 15-20
    
    # 3. Greedy Selection
    for h in all_h:
        dur = h['end'] - h['start']
        
        # Check overlaps with already selected
        is_overlapping = False
        for s in selected:
            # Overlap logic: (StartA <= EndB) and (EndA >= StartB)
            if (h['start'] < s['end'] - 0.5) and (h['end'] > s['start'] + 0.5):
                is_overlapping = True
                break
        
        if is_overlapping: continue
        
        # Add if fits
        if total_duration + dur <= 22: # Allow slightly over 20 to finish a sentence
            selected.append(h)
            total_duration += dur
        
        if total_duration >= 15:
            break
            
    # 4. Sort by Time for playback
    return sorted(selected, key=lambda x: x['start'])

def generate_fallback_highlights(duration):
    # Fixed 3 clips of 5 seconds = 15s total
    clips = []
    
    # Intro: 0-5s
    clips.append({'start': 0, 'end': min(5, duration), 'score': 0.5})
    
    if duration > 15:
        # Middle
        mid = duration / 2
        clips.append({'start': mid, 'end': min(mid + 5, duration), 'score': 0.5})
        
        # Outro
        # Ensure we don't overlap with Intro if short
        start_outro = max(5, duration - 5)
        # Ensure we don't go past finding valid video
        if start_outro < duration:
             clips.append({'start': start_outro, 'end': duration, 'score': 0.5})
        
    return clips

def update_video_status(video_id, data):
    try:
        u, n, v = [], {}, {}
        for key, val in data.items():
            u.append(f"#{key} = :{key}")
            n[f"#{key}"] = key
            v[f":{key}"] = val
        videos_table.update_item(Key={'videoId': video_id}, UpdateExpression='SET '+', '.join(u), ExpressionAttributeNames=n, ExpressionAttributeValues=v)
    except Exception as e: print(f"DynamoDB error: {e}")


def create_video_description_with_overlay(title_overlay_key):
    """Helper function to create VideoDescription with optional ImageInserter"""
    video_desc = {
        'Width': 1080,
        'Height': 1920,
        'CodecSettings': {
            'Codec': 'H_264',
            'H264Settings': {
                'MaxBitrate': 6000000,
                'RateControlMode': 'QVBR'
            }
        }
    }
    
    # Add title overlay if available
    if title_overlay_key:
        video_desc['VideoPreprocessors'] = {
            'ImageInserter': {
                'InsertableImages': [{
                    'ImageX': 0,
                    'ImageY': 0,
                    'Layer': 1,
                    'ImageInserterInput': f"s3://{EDITED_BUCKET}/{title_overlay_key}",
                    'Opacity': 100,
                    'StartTime': '00:00:00:00',
                    'FadeIn': 500,  # Fade in over 0.5 seconds
                    'Duration': 5000,  # Show for 5 seconds
                    'FadeOut': 500  # Fade out over 0.5 seconds
                }]
            }
        }
        print(f"✨ Added title overlay to MediaConvert job: s3://{EDITED_BUCKET}/{title_overlay_key}")
    else:
        print("ℹ️ No title overlay to add")
    
    return video_desc


def create_mediaconvert_job(video_id, bucket, key, key_moments, subtitle_key, output_filename, title_overlay_key=None):
    input_clippings = []
    for m in key_moments:
        input_clippings.append({
            'StartTimecode': seconds_to_timecode(m['start']),
            'EndTimecode': seconds_to_timecode(m['end'])
        })
        
    try:
        endpoint = mediaconvert_client.describe_endpoints(MaxResults=1)['Endpoints'][0]['Url']
    except: endpoint = None
    
    # Title overlay removed - MediaConvert ImageInserter doesn't work for full-frame images
    # Focus on captions instead
    mc = boto3.client('mediaconvert', region_name=REGION, endpoint_url=endpoint) if endpoint else mediaconvert_client
    
    job_settings = {
        'Role': MEDIA_CONVERT_ROLE_ARN,
        'Settings': {
            'Inputs': [{
                'FileInput': f"s3://{bucket}/{key}",
                'TimecodeSource': 'ZEROBASED',
                # Center Crop for 1920x1080 Input -> 1080x1920 Output (Reels)
                # To fill vertical, we crop the input to a 9:16 ratio area.
                # 1080 height input -> need 9/16 width = 607.5px wide? No.
                # If we want to fill the height, we keep full height 1080. 
                # Output is 1080x1920. We can't upscale 1080 input height to 1920 easily without blur.
                # Standard practice for Landscape -> Reel: 
                # Option A: Scale and Crop. (Zoom in). Input 1920x1080. Scale to cover 1080x1920.
                # Option B: Input Crop.
                # Let's try specifying only Output Width/Height and allow MediaConvert to default (Letterbox).
                # User asked for "size of the frame". 
                # Let's leave Output at 1080x1920. Remove invalid ImageCropper.
                # If we want to CROP, we add 'Crop': {...} here in Input.
                # For now, let's just remove the invalid parameter to unblock.
                'InputClippings': input_clippings,
                'AudioSelectors': {'Audio Selector 1': {'DefaultSelection': 'DEFAULT'}},
                'VideoSelector': {},
                'CaptionSelectors': {
                    'Captions': {
                        'SourceSettings': {
                            'SourceType': 'SRT',
                            'FileSourceSettings': {
                                'SourceFile': f"s3://{RAW_BUCKET}/{subtitle_key}"
                            }
                        }
                    }
                } if subtitle_key else {}
            }],
            'OutputGroups': [{
                'Name': 'File Group',
                'OutputGroupSettings': {
                    'Type': 'FILE_GROUP_SETTINGS',
                    'FileGroupSettings': {'Destination': f"s3://{EDITED_BUCKET}/{output_filename}"}
                },
                'Outputs': [{
                    'ContainerSettings': {'Container': 'MP4'},
                    'VideoDescription': create_video_description_with_overlay(title_overlay_key),
                    'AudioDescriptions': [{'CodecSettings': {'Codec': 'AAC', 'AacSettings': {'Bitrate': 96000, 'CodingMode': 'CODING_MODE_2_0', 'SampleRate': 48000}}}],
                    'CaptionDescriptions': [{
                        'CaptionSelectorName': 'Captions',
                        'DestinationSettings': {
                            'DestinationType': 'BURN_IN',
                            'BurninDestinationSettings': {
                                'FontColor': 'WHITE',
                                'BackgroundColor': 'BLACK',
                                'BackgroundOpacity': 255,  # Maximum opacity
                                'FontOpacity': 255,  # Maximum font opacity
                                'FontSize': 48,  # Readable size
                                'Alignment': 'AUTO',  # Let MediaConvert position automatically
                                'OutlineColor': 'BLACK',
                                'OutlineSize': 3,  # Thicker outline for visibility
                                'ShadowColor': 'BLACK',
                                'ShadowOpacity': 255,
                                'ShadowXOffset': 2,
                                'ShadowYOffset': 2,
                                'TeletextSpacing': 'FIXED_GRID',
                                'XPosition': 0,  # Centered
                                'YPosition': 80  # Near bottom (0-100 scale)
                            }
                        }
                    }] if subtitle_key else []
                }]
            }]
        },
        'UserMetadata': {'videoId': video_id}
    }
    
    response = mc.create_job(**job_settings)
    return response['Job']['Id']

def seconds_to_timecode(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    # Force 00 frames to avoid framerate mismatch issues
    return f"{hours:02d}:{minutes:02d}:{secs:02d}:00"

def format_srt_time(seconds):
    # Format: HH:MM:SS,mmm
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds * 1000) % 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def json_to_srt(transcript_data, key_moments):
    """
    Convert AWS Transcribe JSON to SRT format, MAPPED to edited video timeline.
    Only includes words that fall within highlight moments and adjusts timestamps.
    """
    items = transcript_data.get('results', {}).get('items', [])
    if not items:
        print("ℹ️ No items in transcript")
        return None  # Return None instead of empty string
    
    # Build word list with timestamps
    words = []
    for item in items:
        # We only care about pronunciations for content, but punctuation adds to the string ??
        # Actually standard Transcribe "items" separates punctuation.
        if item.get('type') == 'pronunciation' and 'start_time' in item:
            words.append({
                'start': float(item['start_time']),
                'end': float(item['end_time']),
                'text': item['alternatives'][0]['content']
            })
    
    if not words:
        print("ℹ️ No words with timestamps in transcript")
        return None  # Return None instead of empty string
    
    # Map words to edited timeline
    mapped_words = []
    current_output_time = 0.0  # Current position in edited video
    
    for moment in key_moments:
        moment_start = moment['start']
        moment_end = moment['end']
        
        # Find words within this moment
        for word in words:
            if moment_start <= word['start'] < moment_end:
                # Adjust timestamp to edited video timeline
                offset_from_clip_start = word['start'] - moment_start
                new_start = current_output_time + offset_from_clip_start
                
                offset_from_clip_end = word['end'] - moment_start
                new_end = current_output_time + offset_from_clip_end
                
                mapped_words.append({
                    'start': new_start,
                    'end': new_end,
                    'text': word['text']
                })
        
        # Move output timeline forward by this clip's duration
        current_output_time += (moment_end - moment_start)
    
    if not mapped_words:
        print("ℹ️ No words found within highlight moments")
        return None  # Return None so we skip captions entirely
    
    # Group words into caption chunks (every 3-5 words or 3 seconds)
    srt_entries = []
    entry_idx = 1
    current_chunk = []
    chunk_start = None
    
    for word in mapped_words:
        if not current_chunk:
            chunk_start = word['start']
        
        current_chunk.append(word['text'])
        chunk_duration = word['end'] - chunk_start
        
        # Create entry if: chunk has 5 words OR duration > 3s OR last word
        if len(current_chunk) >= 5 or chunk_duration >= 3.0 or word == mapped_words[-1]:
            entry_text = ' '.join(current_chunk)
            srt_entries.append(f"{entry_idx}\n{format_srt_time(chunk_start)} --> {format_srt_time(word['end'])}\n{entry_text}\n")
            entry_idx += 1
            current_chunk = []
            chunk_start = None
    
    srt_output = "\n".join(srt_entries)

    return srt_output

import cv2
import requests
import base64

def extract_frames(video_path, num_frames=3):
    frames = []
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened(): return []
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames <= 0: return []
    
    step = total_frames // (num_frames + 1)
    
    for i in range(1, num_frames + 1):
        cap.set(cv2.CAP_PROP_POS_FRAMES, step * i)
        ret, frame = cap.read()
        if ret:
            # Resize to reduce payload (Gemini accepts up to ~10MB, but smaller is faster)
            frame = cv2.resize(frame, (640, 360)) 
            _, buffer = cv2.imencode('.jpg', frame)
            frames.append(base64.b64encode(buffer).decode('utf-8'))
            
    cap.release()
    return frames

def summarize_context(video_s3_key, transcript_data):
    # GEMINI API KEY (Passed directly for this task)
    API_KEY = "AIzaSyAETLx2MRDP6WQi3WoYkx1bX5ScXh9FLFM"
    
    try:
        # 1. Download Video for Analysis
        video_path = f"/tmp/{os.path.basename(video_s3_key)}"
        s3_client.download_file(RAW_BUCKET, video_s3_key, video_path)
        
        # 2. Extract Frames (more frames = better context)
        b64_frames = extract_frames(video_path, num_frames=5)
        if not b64_frames:
             print("⚠️ No frames extracted.")
             return "Highlight Video"
        print(f"✅ Extracted {len(b64_frames)} frames for analysis")
             
        # 3. Prepare Transcript Context (more context = better accuracy)
        audio_context = "No speech detected."
        items = transcript_data.get('results', {}).get('items', [])
        if items:
            full_text = transcript_data.get('results', {}).get('transcripts', [{'transcript': ''}])[0]['transcript']
            audio_context = full_text[:2000]  # Increased from 1000 to 2000 chars
            print(f"📝 Transcript context: {len(audio_context)} chars")

        # 4. Construct Gemini Request (improved prompt for accuracy)
        prompt_text = f"""
        You are a professional video editor analyzing video content.
        
        VIDEO FRAMES: You will see {len(b64_frames)} frames from the video.
        AUDIO TRANSCRIPT: {audio_context}
        
        TASK: Create a single, engaging, factual title (max 12 words) for this video clip.
        
        INSTRUCTIONS:
        1. Describe EXACTLY what you see happening in the frames
        2. Be specific and accurate - avoid generic terms
        3. If this is a video game, mention the game type (FPS, battle royale, etc.)
        4. If this is real life, describe the actual activity or event
        5. Use action-oriented language
        6. Do NOT use placeholder phrases or generic examples
        7. Be factual and objective
        
        OUTPUT: Only the title text, nothing else.
        """
        
        parts = [{"text": prompt_text}]
        for b64 in b64_frames:
            parts.append({
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": b64
                }
            })
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={API_KEY}"
        payload = {
            "contents": [{
                "parts": parts
            }],
            "generationConfig": {
                "temperature": 0.3,  # Lower = more factual, less creative
                "topP": 0.8,
                "topK": 40,
                "maxOutputTokens": 50  # Short title only
            }
        }
        
        # 5. Call Gemini
        response = requests.post(url, json=payload, headers={'Content-Type': 'application/json'})
        result = response.json()
        
        summary = result['candidates'][0]['content']['parts'][0]['text'].strip()
        
        # Clean quotes
        return summary.replace('"', '').replace("'", "").replace("\n", " ")

    except Exception as e:
        print(f"❌ Gemini Error: {e}")
        return "Highlight Video"
        
    except Exception as e:
        print(f"❌ Bedrock error: {e}")
        return "Highlight Video"

def generate_title_sequences(text, video_id):
    """
    Generate title overlay image as PNG file
    Returns: S3 key for uploaded image
    """
    from PIL import Image, ImageDraw, ImageFont
    import os
    
    # Clean the text
    text = text.replace('"', '').replace("'", '').replace('`', '')
    
    try:
        # Create a single title frame (1080x1920 for vertical video)
        img = Image.new('RGBA', (1080, 1920), (0, 0, 0, 0))  # Transparent background
        draw = ImageDraw.Draw(img)
        
        # Load font
        try:
            font = ImageFont.truetype('/var/task/Roboto-Bold.ttf', 72)
            print("✅ Loaded bundled font from /var/task.")
        except:
            try:
                font = ImageFont.truetype('/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', 72)
                print("✅ Loaded system font.")
            except:
                print("⚠️ Falling back to default font (will be small).")
                font = ImageFont.load_default()
        
        # Word wrap the text
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            current_line.append(word)
            line_str = ' '.join(current_line)
            bbox = draw.textbbox((0, 0), line_str, font=font)
            width = bbox[2] - bbox[0]
            
            if width > 900:  # Max width
                current_line.pop()
                lines.append(' '.join(current_line))
                current_line = [word]
        
        if current_line:
            lines.append(' '.join(current_line))
        
        # Calculate positioning (top third of video)
        line_height = 90
        block_height = len(lines) * line_height + 40
        y_start = 300  # Start position from top
        
        # Draw semi-transparent background box
        box_padding = 50
        box_x0 = 40
        box_y0 = y_start - box_padding
        box_x1 = 1040
        box_y1 = y_start + block_height + box_padding
        
        # Draw background (semi-transparent black)
        overlay = Image.new('RGBA', (1080, 1920), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.rectangle([box_x0, box_y0, box_x1, box_y1], fill=(0, 0, 0, 200))
        img = Image.alpha_composite(img, overlay)
        draw = ImageDraw.Draw(img)
        
        # Draw text with outline
        y = y_start
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            w = bbox[2] - bbox[0]
            x = (1080 - w) // 2  # Center horizontally
            
            # Draw outline (black stroke)
            for adj_x in [-3, -2, -1, 0, 1, 2, 3]:
                for adj_y in [-3, -2, -1, 0, 1, 2, 3]:
                    if adj_x != 0 or adj_y != 0:
                        draw.text((x + adj_x, y + adj_y), line, font=font, fill=(0, 0, 0, 255))
            
            # Draw main text (white)
            draw.text((x, y), line, font=font, fill=(255, 255, 255, 255))
            y += line_height
        
        # Save to /tmp
        path = f'/tmp/title_overlay_{video_id}.png'
        img.save(path, 'PNG')
        file_size = os.path.getsize(path)
        print(f"🎨 Generated title overlay: {path} ({file_size:,} bytes)")
        
        # Upload to S3 EDITED_BUCKET
        s3_key = f'overlays/{video_id}_title.png'
        s3_client.put_object(
            Bucket=EDITED_BUCKET,
            Key=s3_key,
            Body=open(path, 'rb'),
            ContentType='image/png'
        )
        print(f"📤 Uploaded title overlay to s3://{EDITED_BUCKET}/{s3_key}")
        
        return s3_key
        
    except Exception as e:
        print(f"❌ Error generating title overlay: {e}")
        import traceback
        traceback.print_exc()
        return None