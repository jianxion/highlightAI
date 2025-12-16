import { Link } from "react-router-dom";
import { dbg } from "../../../shared/utils/debug";

export default function ProfileVideoGrid({
  videos,
}: {
  videos: any[];
}) {
  dbg("PROFILE", "Rendering video grid", videos.length);

  if (!videos.length) {
    return (
      <p className="text-sm text-slate-400">
        No videos yet
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {videos.map((v) => (
        <Link
          key={v.videoId}
          to={`/video/${v.videoId}`}
        >
          <video
            src={v.filename}
            muted
            className="aspect-square object-cover rounded-lg"
          />
        </Link>
      ))}
    </div>
  );
}
