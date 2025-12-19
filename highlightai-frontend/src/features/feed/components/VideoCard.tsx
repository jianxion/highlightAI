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
import CommentSection from "./CommentSection";

export default function VideoCard({ video }: { video: FeedVideo }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewedRef = useRef(false);

  const [isMuted, setIsMuted] = useState(true);
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [stats, setStats] = useState({
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    viewCount: video.viewCount,
  });

  const [likeVideo] = useMutation(LIKE_VIDEO);
  const [unlikeVideo] = useMutation(UNLIKE_VIDEO);
  const [recordView] = useMutation(RECORD_VIEW);

  const getVideoUrl = (video: FeedVideo) => {
    if (video.filename?.startsWith('http')) {
      return video.filename;
    }
    if (video.s3Key) {
      const bucket = 'highlightai-raw-videos-642570498207';
      const region = 'us-east-1';
      return `https://${bucket}.s3.${region}.amazonaws.com/${video.s3Key}`;
    }
    return video.filename || '';
  };

  useSubscription(ON_ENGAGEMENT_UPDATE, {
    variables: { videoId: video.videoId },
    onData: ({ data }) => {
      const update = data.data?.onVideoEngagementUpdate;
      if (!update) return;
      dbg("FEED", "Engagement update received", { videoId: video.videoId, update });
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
              const res = await recordView({ variables: { videoId: video.videoId } });
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

  const handleCommentAdded = () => {
    setStats(prev => ({ ...prev, commentCount: (prev.commentCount || 0) + 1 }));
  };

  return (
    <div className="rounded-3xl overflow-hidden bg-black border border-white/10 relative">
      <video
        ref={videoRef}
        src={getVideoUrl(video)}
        muted={isMuted}
        loop
        playsInline
        className="w-full aspect-[9/16] object-cover cursor-pointer"
        onClick={() => setIsMuted(!isMuted)}
      />
      
      {isMuted && (
        <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-1 pointer-events-none">
          <span>🔇</span>
          <span>Tap to unmute</span>
        </div>
      )}

      <div className="p-3 flex justify-between items-center text-white text-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
            {video.userEmail?.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <div className="font-semibold text-sm">{video.userEmail?.split('@')[0] || "Anonymous"}</div>
            <div className="text-xs text-slate-400">
              {new Date((video.createdAt || 0) * 1000).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <button onClick={toggleLike} className="hover:scale-110 transition flex items-center gap-1">
            <span className="text-base">{liked ? "♥" : "♡"}</span>
            <span className="text-xs">{stats.likeCount || 0}</span>
          </button>
          <button onClick={() => setShowComments(!showComments)} className="hover:scale-110 transition flex items-center gap-1">
            <span className="text-base">💬</span>
            <span className="text-xs">{stats.commentCount || 0}</span>
          </button>
          <div className="flex items-center gap-1">
            <span className="text-base">👁</span>
            <span className="text-xs">{stats.viewCount || 0}</span>
          </div>
        </div>
      </div>

      {showComments && (
        <CommentSection videoId={video.videoId} onCommentAdded={handleCommentAdded} />
      )}
    </div>
  );
}