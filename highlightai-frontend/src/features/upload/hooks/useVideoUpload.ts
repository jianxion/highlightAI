import { useState } from "react";
import { getPresignedUploadUrl } from "../api/uploadApi";
import { useAuth } from "../../auth/hooks/useAuth";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function useVideoUpload() {
  const auth = useAuth();
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function uploadVideo(file: File): Promise<{ videoId: string }> {
    console.log("=== Upload Video Started ===");
    console.log("Auth state:", {
      hasIdToken: !!auth.idToken,
      hasAccessToken: !!auth.accessToken,
      isAuthenticated: auth.isAuthenticated,
      idTokenPreview: auth.idToken?.substring(0, 50) + "...",
    });

    if (!auth.idToken) {
      console.error("No idToken available!");
      setStatus("error");
      setError("You must be signed in to upload.");
      throw new Error("Not authenticated");
    }

    try {
      setStatus("uploading");
      setProgress(0);
      setError(null);

      console.log("Requesting presigned URL for:", {
        filename: file.name,
        type: file.type,
        size: file.size,
      });

      // Request signed upload URL
      const { uploadUrl, videoId } = await getPresignedUploadUrl(
        auth.idToken,
        file
      );

      console.log("Got presigned URL:", {
        videoId,
        urlPreview: uploadUrl.substring(0, 100) + "...",
      });

      // Upload video to S3 (MUST match signed headers)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            console.log(`Upload progress: ${percent}%`);
            setProgress(percent);
          }
        };

        xhr.onload = () => {
          console.log("S3 Upload completed:", {
            status: xhr.status,
            statusText: xhr.statusText,
          });

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(
              new Error(`Upload failed with status: ${xhr.status} ${xhr.statusText}`)
            );
          }
        };

        xhr.onerror = () => {
          console.error("XHR Network error during upload");
          reject(new Error("Network upload error"));
        };

        console.log("Starting S3 PUT request...");
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      console.log("Upload successful! VideoId:", videoId);
      setStatus("success");
      return { videoId };
    } catch (err: any) {
      console.error("Upload failed:", err);
      console.error("Error details:", {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
      });

      setStatus("error");
      const errorMessage =
        err?.response?.data?.error || err?.message || "Upload failed";
      setError(errorMessage);
      throw err;
    }
  }

  function reset() {
    console.log("Reset upload state");
    setStatus("idle");
    setProgress(0);
    setError(null);
  }

  return { status, progress, error, uploadVideo, reset };
}