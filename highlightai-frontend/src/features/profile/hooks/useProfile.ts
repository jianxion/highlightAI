import { useQuery } from "@apollo/client";
import { GET_USER_VIDEOS } from "../graphql/operations";
import { dbg, dbgError } from "../../../shared/utils/debug";

export interface ProfileVideo {
  videoId: string;
  userId: string;
  userEmail?: string;
  filename: string;
  s3Key?: string;
  processedS3Key?: string;
  processedBucket?: string;
  contentType?: string;
  fileSize?: number;
  status: string;
  createdAt?: number;
  likeCount: number;
  commentCount: number;
  viewCount: number;
}

/**
 * Hook to fetch videos for a specific user
 */
export function useProfile(userId: string) {
  const { data, loading, error, refetch } = useQuery(GET_USER_VIDEOS, {
    variables: { userId },
    fetchPolicy: "cache-and-network",
    skip: !userId,
  });

  if (error) {
    dbgError("PROFILE", "getUserVideos query failed", error);
    console.error("Full GraphQL error:", error);
  }

  dbg("PROFILE", "useProfile hook state", { userId, loading, hasError: !!error, hasData: !!data, dataValue: data });

  const videos: ProfileVideo[] = (data?.getUserVideos ?? [])
    .filter((v: any) => v.status === 'COMPLETED' && v.processedS3Key && v.processedBucket)
    .map((v: any) => ({
      videoId: String(v.videoId),
      userId: String(v.userId),
      userEmail: v.userEmail,
      filename: String(v.filename),
      s3Key: v.s3Key,
      processedS3Key: v.processedS3Key,
      processedBucket: v.processedBucket,
      contentType: v.contentType,
      fileSize: v.fileSize,
      status: String(v.status),
      createdAt: v.createdAt,
      likeCount: Number(v.likeCount ?? 0),
      commentCount: Number(v.commentCount ?? 0),
      viewCount: Number(v.viewCount ?? 0),
    }));

  dbg("PROFILE", `Loaded ${videos.length} videos for user ${userId}`, videos);

  return {
    videos,
    loading,
    error,
    refetch,
  };
}