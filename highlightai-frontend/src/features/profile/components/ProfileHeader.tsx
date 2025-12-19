import type { ProfileVideo } from "../hooks/useProfile";

interface ProfileHeaderProps {
  userEmail: string;
  videos: ProfileVideo[];
}

export default function ProfileHeader({ userEmail, videos }: ProfileHeaderProps) {
  const totalLikes = videos.reduce((sum, v) => sum + v.likeCount, 0);
  const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);

  return (
    <div className="flex flex-col items-center gap-4 pb-6 border-b border-white/10">
      {/* Avatar */}
      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
        {userEmail.charAt(0).toUpperCase()}
      </div>

      {/* User info */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-white">{userEmail}</h1>
        <p className="text-sm text-slate-400 mt-1">HighlightAI Creator</p>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-center">
        <div>
          <div className="text-xl font-bold text-white">{videos.length}</div>
          <div className="text-xs text-slate-400">Videos</div>
        </div>
        <div>
          <div className="text-xl font-bold text-white">{totalLikes}</div>
          <div className="text-xs text-slate-400">Likes</div>
        </div>
        <div>
          <div className="text-xl font-bold text-white">{totalViews}</div>
          <div className="text-xs text-slate-400">Views</div>
        </div>
      </div>
    </div>
  );
}