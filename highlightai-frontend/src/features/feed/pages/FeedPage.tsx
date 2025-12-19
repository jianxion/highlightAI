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
        {loading && items.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
            <p className="text-sm text-slate-400 mt-4">Loading feed...</p>
          </div>
        )}

        <VideoList videos={items} />

        <div ref={sentinelRef} className="h-10" />

        {!hasMore && items.length > 0 && (
          <p className="text-xs text-center text-slate-500 mt-4">
            You're all caught up! 🎉
          </p>
        )}
      </div>
    </div>
  );
}