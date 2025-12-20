import urllib.request
import json
import ssl
import cv2
import base64
import os

API_KEY = "AIzaSyAETLx2MRDP6WQi3WoYkx1bX5ScXh9FLFM"
MODEL = "gemini-flash-latest" 
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
VIDEO_PATH = "test-videos/shooting.mp4"

def extract_frames(video_path, num_frames=3):
    frames = []
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened(): 
        print("❌ Could not open video")
        return []
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Total Frames: {total_frames}")
    if total_frames <= 0: return []
    
    step = total_frames // (num_frames + 1)
    
    for i in range(1, num_frames + 1):
        cap.set(cv2.CAP_PROP_POS_FRAMES, step * i)
        ret, frame = cap.read()
        if ret:
            # Resize
            frame = cv2.resize(frame, (640, 360)) 
            _, buffer = cv2.imencode('.jpg', frame)
            frames.append(base64.b64encode(buffer).decode('utf-8'))
            print(f"✅ Extracted Frame {i}")
            
    cap.release()
    return frames

# 1. Extract
print(f"Processing {VIDEO_PATH}...")
b64_frames = extract_frames(VIDEO_PATH)

if not b64_frames:
    exit("No frames extracted")


# 2. Prepare Prompt
prompt_text = """
You are a professional video editor analyzing video content.

VIDEO FRAMES: You will see 3 frames from the video.
AUDIO TRANSCRIPT: (Not provided in this test)

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

payload = {
    "contents": [{"parts": parts}]
}

data = json.dumps(payload).encode('utf-8')
headers = {'Content-Type': 'application/json'}

print(f"Sending to Gemini ({MODEL})...")
try:
    req = urllib.request.Request(URL, data=data, headers=headers, method='POST')
    
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    
    with urllib.request.urlopen(req, context=context) as response:
        print(f"Status: {response.status}")
        res_body = response.read().decode('utf-8')
        res_json = json.loads(res_body)
        
        if 'candidates' in res_json:
             text = res_json['candidates'][0]['content']['parts'][0]['text']
             print(f"\n✨ GENERATED SUMMARY:\n{text}\n")
        else:
             print(f"❌ Unexpected Response: {res_body}")

except urllib.error.HTTPError as e:
    print(f"❌ HTTP Error {e.code}: {e.read().decode('utf-8')}")
except Exception as e:
    print(f"❌ Error: {e}")
