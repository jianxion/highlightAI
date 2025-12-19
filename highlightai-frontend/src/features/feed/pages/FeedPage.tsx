import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useFeed } from "../hooks/useFeed";
import VideoList from "../components/VideoList";
import { dbg } from "../../../shared/utils/debug";

/**
 * Main feed page
 * - Shows all videos (not filtered by user)
 * - Infinite scroll
 * - Navigation to profile, upload, auth
 */
export default function FeedPage() {
  const { items, loading, loadMore, hasMore } = useFeed();
  const { isAuthenticated } = useAuth();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingRef.current) {
          loadingRef.current = true;
          dbg("FEED", "Infinite scroll triggered");
          await loadMore();
          loadingRef.current = false;
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-white/10 backdrop-blur-md bg-slate-950/80">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            HighlightAI
          </h1>

          <div className="flex gap-4 text-sm items-center">
            {isAuthenticated ? (
              <>
                <Link
                  to="/upload"
                  className="px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 font-medium hover:opacity-90 transition"
                >
                  Upload
                </Link>
                <Link
                  to="/profile"
                  className="hover:text-indigo-400 transition"
                >
                  Profile
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/signin"
                  className="hover:text-indigo-400 transition"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 font-medium hover:opacity-90 transition"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Feed Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Show sign-in prompt for unauthenticated users */}
        {!isAuthenticated && (
          <div className="text-center py-16">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Welcome to HighlightAI</h2>
            <p className="text-slate-400 mb-6">Sign in to view and share highlight videos</p>
            <div className="flex gap-3 justify-center">
              <Link
                to="/signin"
                className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 font-medium hover:bg-white/20 transition"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 font-medium hover:opacity-90 transition"
              >
                Sign Up
              </Link>
            </div>
          </div>
        )}

        {/* Show loading spinner when authenticated and loading */}
        {isAuthenticated && loading && items.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
            <p className="text-sm text-slate-400 mt-4">Loading feed...</p>
          </div>
        )}

        {/* Show videos when authenticated */}
        {isAuthenticated && <VideoList videos={items} />}

        <div ref={sentinelRef} className="h-10" />

        {isAuthenticated && !hasMore && items.length > 0 && (
          <p className="text-xs text-center text-slate-500 mt-4">
            You're all caught up! 🎉
          </p>
        )}
      </div>
    </div>
  );
}