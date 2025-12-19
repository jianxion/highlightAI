import { Link } from "react-router-dom";
import type { ProfileVideo } from "../hooks/useProfile";

export default function ProfileVideoGrid({
  videos,
}: {
  videos: ProfileVideo[];
}) {
  // Helper function to get proper S3 URL
  const getVideoUrl = (video: ProfileVideo) => {
    // If filename is already a full URL, use it
    if (video.filename?.startsWith('http')) {
      return video.filename;
    }
    
    // Prefer processed/edited video if available
    if (video.processedS3Key && video.processedBucket && video.status === 'COMPLETED') {
      const bucket = video.processedBucket;
      const region = 'us-east-1';
      return `https://${bucket}.s3.${region}.amazonaws.com/${video.processedS3Key}`;
    }
    
    // Fallback to raw video if processing not complete
    if (video.s3Key) {
      const bucket = 'highlightai-raw-videos-642570498207';
      const region = 'us-east-1';
      return `https://${bucket}.s3.${region}.amazonaws.com/${video.s3Key}`;
    }
    
    // Final fallback: return filename as-is
    return video.filename || '';
  };

  if (!videos.length) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎥</div>
        <p className="text-slate-400 text-sm">No videos yet</p>
        <p className="text-slate-500 text-xs mt-2">
          Upload your first highlight to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {videos.map((video) => (
        <Link
          key={video.videoId}
          to={`/video/${video.videoId}`}
          className="group relative aspect-square overflow-hidden rounded-lg bg-slate-900"
        >
          <video
            src={getVideoUrl(video)}
            className="h-full w-full object-cover transition group-hover:scale-105"
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
          
          {/* Hover overlay with stats */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="text-white text-xs space-y-1">
              <div className="flex items-center gap-1">
                <span>♥</span>
                <span>{video.likeCount || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>💬</span>
                <span>{video.commentCount || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>👁</span>
                <span>{video.viewCount || 0}</span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}