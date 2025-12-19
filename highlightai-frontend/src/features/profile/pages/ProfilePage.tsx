import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import ProfileHeader from "../components/ProfileHeader";
import ProfileVideoGrid from "../components/ProfileVideoGrid";
import { dbg } from "../../../shared/utils/debug";

/**
 * User profile page - shows only the logged-in user's videos
 * Route: /profile
 */
export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      dbg("PROFILE", "User not authenticated, redirecting to sign-in");
      navigate("/signin");
    }
  }, [isAuthenticated, navigate]);

  const userId = user?.userId || "";
  const userEmail = user?.email || "";

  const { videos, loading, error } = useProfile(userId);

  useEffect(() => {
    dbg("PROFILE", "Profile page mounted", { userId, userEmail });
  }, [userId, userEmail]);

  if (!isAuthenticated || !user) {
    return null; // Will redirect in useEffect
  }

  const handleSignOut = () => {
    if (confirm("Are you sure you want to sign out?")) {
      logout();
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header Navigation */}
      <div className="border-b border-white/10 backdrop-blur-md bg-slate-950/50 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold hover:text-indigo-400 transition">
            ← Back to Feed
          </Link>
          <div className="flex gap-3 text-sm">
            <Link to="/upload" className="hover:text-indigo-400 transition">
              Upload
            </Link>
            <button
              onClick={handleSignOut}
              className="hover:text-red-400 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Profile Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <ProfileHeader userEmail={userEmail} videos={videos} />

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">
            MY VIDEOS
          </h2>

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
              <p className="text-sm text-slate-400 mt-4">Loading videos...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              Failed to load videos. Please try again.
            </div>
          )}

          {!loading && !error && <ProfileVideoGrid videos={videos} />}
        </div>
      </div>
    </div>
  );
}