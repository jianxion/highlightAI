import { apiClient } from "../../../shared/utils/apiClient";
import type { VideoViewEvent, VideoUploadEvent } from "../types/analytics";

export interface AnalyticsBatchPayload {
  events: VideoViewEvent[];
  sessionId: string;
  userId: string;
}

export async function sendAnalyticsEvent(event: VideoViewEvent): Promise<void> {
  try {
    await apiClient.post("/analytics/event", event);
  } catch (error) {
    console.error("Failed to send analytics event:", error);
  }
}

export async function sendAnalyticsBatch(
  batch: AnalyticsBatchPayload
): Promise<void> {
  try {
    await apiClient.post("/analytics/batch", batch);
  } catch (error) {
    console.error("Failed to send analytics batch:", error);
  }
}

export async function sendUploadAnalytics(
  event: VideoUploadEvent
): Promise<void> {
  try {
    await apiClient.post("/analytics/upload", event);
  } catch (error) {
    console.error("Failed to send upload analytics:", error);
  }
}