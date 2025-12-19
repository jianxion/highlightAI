// ✅ Export Location interface so it can be imported elsewhere
export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export type VideoEventType =
  | "view_start"
  | "resume"
  | "pause"
  | "view_progress"
  | "view_end"
  | "seek"
  | "abandon";

export type UploadEventType = "upload_start" | "upload_complete" | "upload_failed";

export interface VideoViewEvent {
  eventType: VideoEventType;
  videoId: string;
  userId: string;
  sessionId: string;
  timestamp: number;
  currentTime: number;
  duration: number;
  percentWatched: number;
  isCompleted: boolean;
  watchCount: number;
  pauseCount: number;
  location: Location | null;
  deviceType: "mobile" | "tablet" | "desktop";
  userAgent: string;
}

export interface VideoUploadEvent {
  eventType: UploadEventType;
  videoId: string;
  userId: string;
  timestamp: number;
  fileSize: number;
  duration: number;
  uploadDuration?: number;
  recordingLocation?: Location;
  error?: string;
}

export interface AnalyticsBatch {
  events: VideoViewEvent[];
  sessionId: string;
  userId: string;
}