import { useEffect, useRef, useState } from "react";
import { useMutation, useSubscription } from "@apollo/client";
import { useVideoAnalytics } from "../../analytics/hooks/useVideoAnalytics";
import {
  LIKE_VIDEO,
  UNLIKE_VIDEO,
  RECORD_VIEW,
  ON_ENGAGEMENT_UPDATE,
} from "../graphql/operations";
import type { FeedVideo } from "../hooks/useFeed";
import { dbg, dbgError } from "../../../shared/utils/debug";

export default function VideoCard({ video }: { video: FeedVideo }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewedRef = useRef(false);

  // 🔥 Add analytics tracking
  const analytics = useVideoAnalytics(video.videoId, videoRef.current);

  const [liked, setLiked] = useState(false);
  const [stats, setStats] = useState({
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    viewCount: video.viewCount,
  });

  const [likeVideo] = useMutation(LIKE_VIDEO);
  const [unlikeVideo] = useMutation(UNLIKE_VIDEO);
  const [recordView] = useMutation(RECORD_VIEW);

  // ✅ Helper function to get proper S3 URL
  const getVideoUrl = (video: FeedVideo) => {
    // If filename is already a full URL, use it
    if (video.filename?.startsWith('http')) {
      return video.filename;
    }
    
    // Build S3 URL from s3Key if available
    if (video.s3Key) {
      const bucket = 'highlightai-raw-videos-642570498207';
      const region = 'us-east-1';
      return `https://${bucket}.s3.${region}.amazonaws.com/${video.s3Key}`;
    }
    
    // Fallback: return filename as-is
    return video.filename || '';
  };

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
        src={getVideoUrl(video)}
        muted
        loop
        playsInline
        className="w-full aspect-[9/16] object-cover"
      />

      <div className="p-3 flex justify-between items-center text-white text-sm">
        <div>
          <div className="font-semibold">{video.videoId}</div>
          <div className="text-xs text-slate-400">{video.status}</div>
          {/* 🔥 Show analytics data */}
          <div className="text-xs text-slate-500 mt-1">
            Session: {analytics.sessionId.substring(0, 8)}... | 
            Watches: {analytics.watchCount} | 
            Pauses: {analytics.pauseCount}
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <button onClick={toggleLike}>
            {liked ? "♥" : "♡"} {stats.likeCount || 0}
          </button>
          <span>💬 {stats.commentCount || 0}</span>
          <span>👁 {stats.viewCount || 0}</span>
        </div>
      </div>
    </div>
  );
}