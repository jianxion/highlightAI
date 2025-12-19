import { useEffect, useRef } from "react";
import { getCurrentLocation } from "../utils/geolocation";
import { sendUploadAnalytics } from "../api/analyticsApi";
import { useAuth } from "../../auth/hooks/useAuth";
import type { VideoUploadEvent } from "../types/analytics";

export function useUploadAnalytics() {
  const { user } = useAuth();
  const uploadStartTimeRef = useRef<number | null>(null);
  const locationRef = useRef<any>(null);

  // Get location when component mounts
  useEffect(() => {
    getCurrentLocation().then((loc) => {
      locationRef.current = loc;
      console.log("Location captured for upload:", loc);
    });
  }, []);

  const trackUploadStart = (videoId: string, fileSize: number, duration: number) => {
    uploadStartTimeRef.current = Date.now();

    const event: VideoUploadEvent = {
      eventType: "upload_start",
      videoId,
      userId: user?.userId || "anonymous",
      timestamp: Date.now(),
      fileSize,
      duration,
      recordingLocation: locationRef.current || undefined,
    };

    sendUploadAnalytics(event);
  };

  const trackUploadComplete = (videoId: string, fileSize: number, duration: number) => {
    const uploadDuration = uploadStartTimeRef.current
      ? Date.now() - uploadStartTimeRef.current
      : undefined;

    const event: VideoUploadEvent = {
      eventType: "upload_complete",
      videoId,
      userId: user?.userId || "anonymous",
      timestamp: Date.now(),
      fileSize,
      duration,
      uploadDuration,
      recordingLocation: locationRef.current || undefined,
    };

    sendUploadAnalytics(event);
    uploadStartTimeRef.current = null;
  };

  const trackUploadFailed = (videoId: string, fileSize: number, duration: number, error: string) => {
    const event: VideoUploadEvent = {
      eventType: "upload_failed",
      videoId,
      userId: user?.userId || "anonymous",
      timestamp: Date.now(),
      fileSize,
      duration,
      recordingLocation: locationRef.current || undefined,
      error,
    };

    sendUploadAnalytics(event);
    uploadStartTimeRef.current = null;
  };

  return {
    trackUploadStart,
    trackUploadComplete,
    trackUploadFailed,
  };
}