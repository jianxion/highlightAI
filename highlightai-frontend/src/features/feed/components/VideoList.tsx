import VideoCard from "./VideoCard";
import type { FeedVideo } from "../hooks/useFeed";

/**
 * Simple list renderer
 */
export default function VideoList({ videos }: { videos: FeedVideo[] }) {
  if (!videos.length) {
    return (
      <p className="text-sm text-slate-400 text-center">
        No videos yet
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {videos.map((v) => (
        <VideoCard key={v.videoId} video={v} />
      ))}
    </div>
  );
}
