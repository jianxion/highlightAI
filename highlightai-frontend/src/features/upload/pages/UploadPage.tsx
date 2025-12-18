import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useVideoUpload } from "../hooks/useVideoUpload";
import { useUploadAnalytics } from "../../analytics/hooks/useUploadAnalytics";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_DURATION_SECONDS = 120; // 2 minutes

type Mode = "idle" | "record" | "preview";

export default function UploadPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const { status, progress, error: uploadError, uploadVideo, reset } = useVideoUpload();
  
  // 🔥 Analytics tracking
  const uploadAnalytics = useUploadAnalytics();

  // Start camera immediately when component mounts
  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-redirect to profile after successful upload
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        navigate("/profile");
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [status, navigate]);

  // Start camera stream (persistent across idle/record modes)
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: true,
      });

      mediaStreamRef.current = stream;

      if (cameraPreviewRef.current) {
        cameraPreviewRef.current.srcObject = stream;
        cameraPreviewRef.current.muted = true;
        try {
          await cameraPreviewRef.current.play();
          setCameraReady(true);
        } catch (playError) {
          console.error("Failed to play camera preview:", playError);
        }
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setError("Could not access camera. Please check permissions.");
      setCameraReady(false);
    }
  }

  // Stop camera stream
  function stopCamera() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = null;
    }

    setCameraReady(false);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validationError = await validateVideoFile(selected);
    if (validationError) {
      setError(validationError);
      setFile(null);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      return;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(selected);
    setFile(selected);
    setVideoUrl(url);
    setMode("preview");

    // Stop camera when showing uploaded file preview
    stopCamera();
  }

  async function validateVideoFile(f: File): Promise<string | null> {
    if (!f.type.startsWith("video/")) {
      return "Please select a valid video file.";
    }

    if (f.size > MAX_FILE_SIZE) {
      return "Video must be smaller than 200MB.";
    }

    try {
      const duration = await getVideoDuration(f);
      if (duration > MAX_DURATION_SECONDS) {
        return "Video must be at most 2 minutes long.";
      }
    } catch {
      return "Unable to read video duration. Please try another file.";
    }

    return null;
  }

  function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };

      video.onerror = () => {
        reject("Error loading video");
      };

      video.src = URL.createObjectURL(file);
    });
  }

  // Start recording (camera already running)
  function startRecording() {
    if (!mediaStreamRef.current) {
      setError("Camera not ready. Please wait or refresh the page.");
      return;
    }

    setError(null);
    reset();

    try {
      chunksRef.current = [];
      const recorder = new MediaRecorder(mediaStreamRef.current, {
        mimeType: "video/webm",
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        chunksRef.current = [];

        const recordedFile = new File([blob], "recording.webm", {
          type: "video/webm",
        });

        const validationError = await validateVideoFile(recordedFile);
        if (validationError) {
          setError(validationError);
          setFile(null);
          if (videoUrl) URL.revokeObjectURL(videoUrl);
          setVideoUrl(null);
          setMode("idle");
          return;
        }

        if (videoUrl) URL.revokeObjectURL(videoUrl);
        const url = URL.createObjectURL(recordedFile);
        setFile(recordedFile);
        setVideoUrl(url);
        setMode("preview");

        // Stop camera when showing recorded preview
        stopCamera();
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordSeconds(0);
      setMode("record");

      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_DURATION_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      setError("Failed to start recording. Please try again.");
    }
  }

  function stopRecording() {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    setRecordSeconds(0);
  }

  async function handleUpload() {
    if (!file) {
      setError("No video selected.");
      return;
    }

    try {
      setError(null);
      
      // Get video duration for analytics
      const duration = await getVideoDuration(file);
      
      // 🔥 Track upload start with analytics
      const tempVideoId = `temp-${Date.now()}`;
      uploadAnalytics.trackUploadStart(tempVideoId, file.size, duration);
      
      // Upload the video
      const { videoId } = await uploadVideo(file);
      console.log("Uploaded videoId:", videoId);
      
      // 🔥 Track upload complete
      uploadAnalytics.trackUploadComplete(videoId, file.size, duration);
      
    } catch (err: any) {
      console.error(err);
      const errorMessage = err?.message || "Upload failed.";
      setError(errorMessage);
      
      // 🔥 Track upload failed
      uploadAnalytics.trackUploadFailed(
        "unknown",
        file.size,
        0,
        errorMessage
      );
    }
  }

  function handleRetake() {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(null);
    setFile(null);
    reset();
    setError(null);
    setMode("idle");

    // Restart camera for retake
    startCamera();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Header with Back to Feed */}
      <div className="border-b border-white/10 backdrop-blur-md bg-slate-950/80 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link 
            to="/" 
            className="flex items-center gap-2 text-slate-300 hover:text-white transition"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M15 19l-7-7 7-7" 
              />
            </svg>
            <span className="font-medium">Back to Feed</span>
          </Link>

          <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Upload Highlight
          </h1>

          <Link 
            to="/profile" 
            className="text-slate-300 hover:text-white text-sm transition"
          >
            Profile
          </Link>
        </div>
      </div>

      {/* Upload Content */}
      <div className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-xl space-y-6">
          <div className="text-center">
            <p className="text-sm text-slate-300">
              Record or upload a short clip (max 2 minutes, under 200MB).
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="rounded-3xl border border-white/10 bg-white/5 shadow-xl shadow-black/50 backdrop-blur-2xl p-4 md:p-6 flex flex-col gap-4">
            <div className="aspect-[9/16] w-full max-h-[480px] bg-black/70 rounded-2xl overflow-hidden flex items-center justify-center relative">
              
              {/* Camera Preview (shown in idle and record modes) */}
              {mode !== "preview" && (
                <>
                  <video
                    ref={cameraPreviewRef}
                    className="h-full w-full object-cover"
                    autoPlay
                    muted
                    playsInline
                  />
                  
                  {/* Recording indicator */}
                  {mode === "record" && (
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs font-semibold text-red-200">
                        Recording • {recordSeconds}s
                      </span>
                    </div>
                  )}

                  {/* Loading indicator while camera initializes */}
                  {!cameraReady && mode === "idle" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-white border-r-transparent mb-2"></div>
                        <p className="text-sm text-white">Starting camera...</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Recorded/Uploaded Video Preview */}
              {mode === "preview" && videoUrl && (
                <video
                  ref={videoPreviewRef}
                  className="h-full w-full object-cover"
                  src={videoUrl}
                  controls
                />
              )}
            </div>

            <div className="flex flex-col gap-3">
              {mode === "idle" && (
                <>
                  <button
                    onClick={startRecording}
                    disabled={!cameraReady}
                    className="w-full rounded-full bg-gradient-to-r from-pink-500 via-red-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/40 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {cameraReady ? "Start Recording" : "Camera Loading..."}
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs text-slate-400">or</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <label className="w-full cursor-pointer rounded-full border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-slate-100 text-center hover:bg-white/10 transition">
                    Upload from device
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                </>
              )}

              {mode === "record" && (
                <button
                  onClick={stopRecording}
                  className="w-full rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/40 hover:bg-red-500 transition"
                >
                  Stop Recording
                </button>
              )}

              {mode === "preview" && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={handleRetake}
                      className="flex-1 rounded-full border border-white/20 bg-transparent py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10 transition"
                    >
                      Retake
                    </button>
                    <button
                      onClick={handleUpload}
                      disabled={status === "uploading"}
                      className="flex-1 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/40 hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {status === "uploading" ? "Uploading..." : "Upload Clip"}
                    </button>
                  </div>

                  {status === "uploading" && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Uploading</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-400 to-pink-400 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {status === "success" && (
                    <p className="mt-2 text-xs text-emerald-300">
                      Upload complete! Redirecting to your profile...
                    </p>
                  )}

                  {uploadError && (
                    <p className="mt-2 text-xs text-red-300">
                      {uploadError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}