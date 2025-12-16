import { useEffect, useRef, useState } from "react";
import { useVideoUpload } from "../hooks/useVideoUpload";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_DURATION_SECONDS = 120; // 2 minutes

type Mode = "idle" | "record" | "preview";

export default function UploadPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const recordVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const { status, progress, error: uploadError, uploadVideo, reset } =
    useVideoUpload();

  // Cleanup media stream on unmount
  useEffect(() => {
    return () => {
      stopRecordingInternal(true);
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }

  async function validateVideoFile(f: File): Promise<string | null> {
    if (!f.type.startsWith("video/")) {
      return "Please select a valid video file.";
    }

    if (f.size > MAX_FILE_SIZE) {
      return "Video must be smaller than 200MB.";
    }

    // Check duration using a temporary video element
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

  async function startRecording() {
    setError(null);
    reset();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      mediaStreamRef.current = stream;

      if (recordVideoRef.current) {
        recordVideoRef.current.srcObject = stream;
        recordVideoRef.current.play().catch(() => {});
      }

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm",
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Create Blob from chunks
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
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      // setIsRecording(true);
      setRecordSeconds(0);
      setMode("record");

      // Timer
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_DURATION_SECONDS) {
            stopRecordingInternal(false);
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      setError("Could not access camera. Please check permissions.");
    }
  }

  function stopRecordingInternal(cancelOnly: boolean) {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setRecordSeconds(0);

    if (cancelOnly) {
      setMode("idle");
    }
  }

  function stopRecording() {
    stopRecordingInternal(false);
  }

  async function handleUpload() {
    if (!file) {
      setError("No video selected.");
      return;
    }

    try {
      setError(null);
      const { videoId } = await uploadVideo(file);
      console.log("Uploaded videoId:", videoId);
      // You could redirect or show a nice toast here
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Upload failed.");
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
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex justify-center px-4 py-8">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Upload a Highlight</h1>
          <p className="text-sm text-slate-300 mt-1">
            Record or upload a short clip (max 2 minutes, under 200MB).
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 shadow-xl shadow-black/50 backdrop-blur-2xl p-4 md:p-6 flex flex-col gap-4">
          {/* Video area */}
          <div className="aspect-[9/16] w-full max-h-[480px] bg-black/70 rounded-2xl overflow-hidden flex items-center justify-center relative">
            {/* Recording preview */}
            {mode === "record" && (
              <>
                <video
                  ref={recordVideoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold text-red-200">
                    Recording • {recordSeconds}s
                  </span>
                </div>
              </>
            )}

            {/* Preview video */}
            {mode === "preview" && videoUrl && (
              <video
                ref={videoPreviewRef}
                className="h-full w-full object-cover"
                src={videoUrl}
                controls
              />
            )}

            {/* Idle state placeholder */}
            {mode === "idle" && (
              <div className="flex flex-col items-center justify-center text-center px-6">
                <div className="mb-3 text-5xl">🎥</div>
                <p className="text-sm text-slate-200 font-medium">
                  Capture your best moments
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Record a new clip or upload from your device. Max 2 minutes,
                  under 200MB.
                </p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3">
            {mode === "idle" && (
              <>
                <button
                  onClick={startRecording}
                  className="w-full rounded-full bg-gradient-to-r from-pink-500 via-red-500 to-orange-500 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/40 hover:opacity-95 transition"
                >
                  Start Recording
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
                    Upload complete! Your clip will appear in the feed once
                    processed.
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
  );
}
