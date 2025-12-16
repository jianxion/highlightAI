import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useFeed } from "../hooks/useFeed";
import VideoList from "../components/VideoList";
import { dbg } from "../../../shared/utils/debug";

/**
 * Main feed page
 * - Infinite scroll
 * - Minimal navigation
 */
export default function FeedPage() {
  const { items, loading, loadMore, hasMore } = useFeed();
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
    <div className="min-h-screen bg-slate-950 text-white px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">HighlightAI</h1>

        <div className="flex gap-3 text-sm">
          <Link to="/upload">Upload</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/signin">Sign in</Link>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading feed…</p>}

      <VideoList videos={items} />

      <div ref={sentinelRef} className="h-10" />

      {!hasMore && (
        <p className="text-xs text-center text-slate-500 mt-4">
          You’re all caught up
        </p>
      )}
    </div>
  );
}
