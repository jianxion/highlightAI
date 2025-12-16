import { useEffect, useRef, useState } from "react";
import { useMutation, useSubscription } from "@apollo/client";
import {
  LIKE_VIDEO,
  UNLIKE_VIDEO,
  RECORD_VIEW,
  ON_ENGAGEMENT_UPDATE,
} from "../graphql/operations";
import type { FeedVideo } from "../hooks/useFeed";
import { dbg, dbgError } from "../../../shared/utils/debug";

/**
 * Video card
 * - Autoplay / pause
 * - Records views
 * - Like / unlike
 * - Subscribes to engagement updates
 */
export default function VideoCard({ video }: { video: FeedVideo }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewedRef = useRef(false);

  const [liked, setLiked] = useState(false);
  const [stats, setStats] = useState({
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    viewCount: video.viewCount,
  });

  const [likeVideo] = useMutation(LIKE_VIDEO);
  const [unlikeVideo] = useMutation(UNLIKE_VIDEO);
  const [recordView] = useMutation(RECORD_VIEW);

  useSubscription(ON_ENGAGEMENT_UPDATE, {
    variables: { videoId: video.videoId },
    onData: ({ data }) => {
      const update = data.data?.onVideoEngagementUpdate;
      if (!update) return;

      dbg("FEED", "Engagement update received", {
        videoId: video.videoId,
        update,
      });

      setStats({
        likeCount: update.likeCount,
        commentCount: update.commentCount,
        viewCount: update.viewCount,
      });
    },
  });

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
          if (!viewedRef.current) {
            viewedRef.current = true;
            try {
              dbg("FEED", "Recording view", video.videoId);
              const res = await recordView({
                variables: { videoId: video.videoId },
              });
              setStats(res.data.recordView);
            } catch (e) {
              dbgError("FEED", "recordView failed", e);
            }
          }
        } else {
          el.pause();
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [recordView, video.videoId]);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);

    try {
      dbg("FEED", next ? "Liking video" : "Unliking video", video.videoId);

      const res = next
        ? await likeVideo({ variables: { videoId: video.videoId } })
        : await unlikeVideo({ variables: { videoId: video.videoId } });

      setStats(res.data[next ? "likeVideo" : "unlikeVideo"]);
    } catch (e) {
      dbgError("FEED", "Like toggle failed", e);
      setLiked(!next);
    }
  }

  return (
    <div className="rounded-3xl overflow-hidden bg-black border border-white/10">
      <video
        ref={videoRef}
        src={video.filename}
        muted
        loop
        playsInline
        className="w-full aspect-[9/16] object-cover"
      />

      <div className="p-3 flex justify-between items-center text-white text-sm">
        <div>
          <div className="font-semibold">{video.videoId}</div>
          <div className="text-xs text-slate-400">{video.status}</div>
        </div>

        <div className="flex gap-3 items-center">
          <button onClick={toggleLike}>
            {liked ? "♥" : "♡"} {stats.likeCount}
          </button>
          <span>💬 {stats.commentCount}</span>
          <span>👁 {stats.viewCount}</span>
        </div>
      </div>
    </div>
  );
}
