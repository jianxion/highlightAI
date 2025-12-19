import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@apollo/client";
import { LIST_VIDEOS } from "../graphql/operations";
import { dbg, dbgError } from "../../../shared/utils/debug";

export type FeedVideo = {
  videoId: string;
  filename: string;
  s3Key?: string;  // ✅ Added s3Key
  status: string;
  createdAt?: number;
  likeCount: number;
  commentCount: number;
  viewCount: number;
};

const PAGE_SIZE = 5;

/**
 * Feed data hook
 * - Progressive pagination (limit-based)
 * - Defensive normalization
 * - Debug logging at every step
 */
export function useFeed() {
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, loading, error, refetch } = useQuery(LIST_VIDEOS, {
    variables: { limit },
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    if (error) dbgError("FEED", "listVideos query failed", error);
  }, [error]);

  const items = useMemo<FeedVideo[]>(() => {
    const raw = data?.listVideos ?? [];

    dbg("FEED", "Raw listVideos payload", raw);

    return raw.map((v: any) => ({
      videoId: String(v.videoId),
      filename: String(v.filename),
      s3Key: v.s3Key,  // ✅ Include s3Key
      status: String(v.status),
      createdAt: v.createdAt,
      likeCount: Number(v.likeCount ?? 0),
      commentCount: Number(v.commentCount ?? 0),
      viewCount: Number(v.viewCount ?? 0),
    }));
  }, [data]);

  const hasMore = items.length >= limit;

  const loadMore = useCallback(async () => {
    const next = limit + PAGE_SIZE;
    dbg("FEED", "Loading more videos", { from: limit, to: next });

    setLimit(next);

    try {
      await refetch({ limit: next });
    } catch (e) {
      dbgError("FEED", "Pagination refetch failed", e);
    }
  }, [limit, refetch]);

  return {
    items,
    loading,
    hasMore,
    loadMore,
  };
}