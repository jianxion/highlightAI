import { useQuery } from "@apollo/client";
import { GET_USER_VIDEOS } from "../graphql/operations";
import { dbg, dbgError } from "../../../shared/utils/debug";

export interface ProfileVideo {
  videoId: string;
  userId: string;
  userEmail?: string;
  filename: string;
  s3Key?: string;  // ✅ Add this field
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
  }

  const videos: ProfileVideo[] = (data?.getUserVideos ?? []).map((v: any) => ({
    videoId: String(v.videoId),
    userId: String(v.userId),
    userEmail: v.userEmail,
    filename: String(v.filename),
    s3Key: v.s3Key,  // ✅ Include s3Key
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