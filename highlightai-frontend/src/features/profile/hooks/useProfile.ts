import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { LIST_VIDEOS_FOR_PROFILE } from "../graphql/operations";
import { dbg, dbgError } from "../../../shared/utils/debug";

export function useProfile(userId: string) {
  const { data, loading, error } = useQuery(
    LIST_VIDEOS_FOR_PROFILE,
    {
      variables: { limit: 50 },
      fetchPolicy: "cache-and-network",
    }
  );

  if (error) {
    dbgError("PROFILE", "Profile video query failed", error);
  }

  const videos = useMemo(() => {
    const all = data?.listVideos ?? [];

    dbg("PROFILE", "Raw videos from listVideos", all);

    // TEMP: client-side filter
    const filtered = all.filter((v: any) =>
      v.videoId.includes(userId)
    );

    dbg("PROFILE", "Filtered profile videos", filtered);

    return filtered;
  }, [data, userId]);

  return {
    videos,
    loading,
  };
}
