import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useSubscription } from "@apollo/client";
import { gql } from "@apollo/client";
import { useVideoAnalytics } from "../../analytics/hooks/useVideoAnalytics";
import {
  LIKE_VIDEO,
  UNLIKE_VIDEO,
  RECORD_VIEW,
  ON_ENGAGEMENT_UPDATE,
} from "../../feed/graphql/operations";

// Query to get single video details
const GET_VIDEO = gql`
  query GetVideo($videoId: ID!) {
    getVideo(videoId: $videoId) {
      videoId
      userId
      userEmail
      filename
      s3Key
      status
      createdAt
      likeCount
      commentCount
      viewCount
    }
  }
`;

export default function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewedRef = useRef(false);

  const [liked, setLiked] = useState(false);
  const [stats, setStats] = useState({
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
  });

  // Fetch video details
  const { data, loading, error } = useQuery(GET_VIDEO, {
    variables: { videoId },
    skip: !videoId,
  });

  const video = data?.getVideo;

  // Analytics
  const analytics = useVideoAnalytics(videoId || "", videoRef.current);

  const [likeVideo] = useMutation(LIKE_VIDEO);
  const [unlikeVideo] = useMutation(UNLIKE_VIDEO);
  const [recordView] = useMutation(RECORD_VIEW);

  // Helper to get S3 URL
  const getVideoUrl = (video: any) => {
    if (!video) return '';
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
    variables: { videoId: videoId || "" },
    skip: !videoId,
    onData: ({ data }) => {
      const update = data.data?.onVideoEngagementUpdate;
      if (!update) return;
      setStats({
        likeCount: update.likeCount,
        commentCount: update.commentCount,
        viewCount: update.viewCount,
      });
    },
  });

  // Record view when video loads
  useEffect(() => {
    if (!video || viewedRef.current) return;
    
    viewedRef.current = true;
    recordView({ variables: { videoId: videoId || "" } })
      .then((res) => {
        if (res.data?.recordView) {
          setStats(res.data.recordView);
        }
      })
      .catch((err) => console.error("Failed to record view:", err));
  }, [video, videoId, recordView]);

  // Update stats when video loads
  useEffect(() => {
    if (video) {
      setStats({
        likeCount: video.likeCount || 0,
        commentCount: video.commentCount || 0,
        viewCount: video.viewCount || 0,
      });
    }
  }, [video]);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);

    try {
      const res = next
        ? await likeVideo({ variables: { videoId: videoId || "" } })
        : await unlikeVideo({ variables: { videoId: videoId || "" } });

      setStats(res.data[next ? "likeVideo" : "unlikeVideo"]);
    } catch (e) {
      console.error("Like toggle failed:", e);
      setLiked(!next);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent mb-4"></div>
          <p className="text-slate-400">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center text-white max-w-md">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2">Video Not Found</h1>
          <p className="text-slate-400 mb-6">
            This video doesn't exist or has been removed.
          </p>
          <Link
            to="/"
            className="inline-block px-6 py-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 font-semibold hover:opacity-90 transition"
          >
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-white/10 backdrop-blur-md bg-slate-950/80 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M15 19l-7-7 7-7" 
              />
            </svg>
            <span className="font-medium">Back</span>
          </button>

          <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            HighlightAI
          </h1>

          <Link 
            to="/" 
            className="text-slate-300 hover:text-white text-sm transition"
          >
            Feed
          </Link>
        </div>
      </div>

      {/* Video Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="rounded-3xl overflow-hidden bg-black border border-white/10">
          <video
            ref={videoRef}
            src={getVideoUrl(video)}
            controls
            autoPlay
            className="w-full aspect-[9/16] object-cover"
          />

          {/* Video Info */}
          <div className="p-6 text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold mb-2">{video.videoId}</h2>
                <p className="text-sm text-slate-400">
                  Uploaded by {video.userEmail || "Unknown"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {new Date(video.createdAt * 1000).toLocaleDateString()}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs bg-green-500/20 text-green-300 border border-green-500/30">
                {video.status}
              </span>
            </div>

            {/* Engagement */}
            <div className="flex items-center gap-6 py-4 border-t border-b border-white/10">
              <button
                onClick={toggleLike}
                className="flex items-center gap-2 hover:text-pink-400 transition"
              >
                <span className="text-2xl">{liked ? "♥" : "♡"}</span>
                <span className="text-sm font-semibold">{stats.likeCount}</span>
              </button>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-xl">💬</span>
                <span className="text-sm">{stats.commentCount}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-xl">👁</span>
                <span className="text-sm">{stats.viewCount}</span>
              </div>
            </div>

            {/* Analytics (Debug) */}
            {analytics && (
              <div className="mt-4 text-xs text-slate-500 font-mono">
                Session: {analytics.sessionId.substring(0, 12)}... | 
                Watches: {analytics.watchCount} | 
                Pauses: {analytics.pauseCount}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}