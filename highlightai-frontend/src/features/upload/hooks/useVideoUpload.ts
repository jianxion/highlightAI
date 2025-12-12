import { useState } from "react";
import { getPresignedUploadUrl } from "../api/uploadApi";
import { useAuth } from "../../auth/hooks/useAuth";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function useVideoUpload() {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function uploadVideo(file: File): Promise<{ videoId: string }> {
    if (!accessToken) {
      setStatus("error");
      setError("You must be signed in to upload.");
      throw new Error("Not authenticated");
    }

    setStatus("uploading");
    setProgress(0);
    setError(null);

    // Request signed upload URL
    const { uploadUrl, videoId } = await getPresignedUploadUrl(accessToken, file);

    // Upload video to S3 (MUST match signed headers)
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("Upload failed: " + xhr.status));
      };

      xhr.onerror = () => reject(new Error("Network upload error"));

      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    });

    setStatus("success");
    return { videoId };
  }

  function reset() {
    setStatus("idle");
    setProgress(0);
    setError(null);
  }

  return { status, progress, error, uploadVideo, reset };
}
