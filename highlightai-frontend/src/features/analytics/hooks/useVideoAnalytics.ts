import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { VideoViewEvent } from "../types/analytics";
import { sendAnalyticsEvent, sendAnalyticsBatch } from "../api/analyticsApi";
import { getCurrentLocation } from "../utils/geolocation";
import { useAuth } from "../../auth/hooks/useAuth";

export function useVideoAnalytics(videoId: string, videoElement: HTMLVideoElement | null) {
  const { user } = useAuth();
  const sessionIdRef = useRef(uuidv4());
  const watchCountRef = useRef(0);
  const pauseCountRef = useRef(0);
  const locationRef = useRef<any>(null);
  const eventsBufferRef = useRef<VideoViewEvent[]>([]);
  const lastProgressTimeRef = useRef(0);
  
  const [hasStarted, setHasStarted] = useState(false);

  // Get location once when hook initializes
  useEffect(() => {
    getCurrentLocation().then((loc) => {
      locationRef.current = loc;
    });
  }, []);

  // Flush events buffer every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (eventsBufferRef.current.length > 0) {
        sendAnalyticsBatch({
          events: eventsBufferRef.current,
          sessionId: sessionIdRef.current,
          userId: user?.userId || "anonymous",
        });
        eventsBufferRef.current = [];
      }
    }, 10000); // Batch every 10 seconds

    return () => clearInterval(interval);
  }, [user]);

  // Helper to create event
  const createEvent = (eventType: VideoViewEvent["eventType"]): VideoViewEvent => {
    const video = videoElement;
    if (!video) return null as any;

    return {
      eventType,
      videoId,
      userId: user?.userId || "anonymous",
      sessionId: sessionIdRef.current,
      timestamp: Date.now(),
      currentTime: video.currentTime,
      duration: video.duration,
      percentWatched: (video.currentTime / video.duration) * 100,
      isCompleted: video.currentTime >= video.duration - 0.5,
      watchCount: watchCountRef.current,
      pauseCount: pauseCountRef.current,
      location: locationRef.current,
      deviceType: getDeviceType(),
      userAgent: navigator.userAgent,
    };
  };

  // Queue event for batching
  const queueEvent = (event: VideoViewEvent) => {
    eventsBufferRef.current.push(event);
  };

  // Send event immediately (for critical events)
  const sendEventNow = (event: VideoViewEvent) => {
    sendAnalyticsEvent(event);
  };

  useEffect(() => {
    if (!videoElement) return;

    const video = videoElement;

    // View start
    const handlePlay = () => {
      if (!hasStarted) {
        setHasStarted(true);
        const event = createEvent("view_start");
        sendEventNow(event); // Critical event - send immediately
      } else {
        queueEvent(createEvent("resume"));
      }
    };

    // Pause
    const handlePause = () => {
      pauseCountRef.current++;
      queueEvent(createEvent("pause"));
    };

    // View progress (every 5 seconds)
    const handleTimeUpdate = () => {
      const now = video.currentTime;
      if (now - lastProgressTimeRef.current >= 5) {
        lastProgressTimeRef.current = now;
        queueEvent(createEvent("view_progress"));
      }
    };

    // Video ended
    const handleEnded = () => {
      watchCountRef.current++;
      const event = createEvent("view_end");
      sendEventNow(event); // Critical event - send immediately
    };

    // Seek/scrub
    const handleSeeking = () => {
      queueEvent(createEvent("seek"));
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("seeking", handleSeeking);

    return () => {
      // Abandon event if user leaves mid-watch
      if (hasStarted && video.currentTime < video.duration - 0.5) {
        const event = createEvent("abandon");
        sendEventNow(event);
      }

      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("seeking", handleSeeking);
    };
  }, [videoElement, hasStarted, user]);

  return {
    sessionId: sessionIdRef.current,
    watchCount: watchCountRef.current,
    pauseCount: pauseCountRef.current,
  };
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return "tablet";
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return "mobile";
  }
  return "desktop";
}