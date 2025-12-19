import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { ADD_COMMENT, GET_COMMENTS } from "../graphql/operations";
import { useAuth } from "../../auth/hooks/useAuth";

interface Comment {
  commentId: string;
  userEmail: string;
  content: string;
  createdAt: number;
}

interface CommentSectionProps {
  videoId: string;
  onCommentAdded?: () => void;
}

export default function CommentSection({ videoId, onCommentAdded }: CommentSectionProps) {
  const { user } = useAuth();
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch comments - using getVideoComments
  const { data, loading, refetch } = useQuery(GET_COMMENTS, {
    variables: { videoId },
    fetchPolicy: "cache-and-network",
  });

  // Add comment mutation
  const [addComment] = useMutation(ADD_COMMENT);

  // Access data from getVideoComments query
  const comments: Comment[] = data?.getVideoComments || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!commentText.trim() || !user) return;

    setIsSubmitting(true);
    try {
      await addComment({
        variables: {
          videoId,
          content: commentText.trim(),
        },
      });

      setCommentText("");
      refetch(); // Refresh comments
      onCommentAdded?.(); // Notify parent to update count
    } catch (err) {
      console.error("Failed to add comment:", err);
      alert("Failed to add comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-t border-white/10 bg-black/40">
      {/* Comment input */}
      {user ? (
        <form onSubmit={handleSubmit} className="p-3 border-b border-white/10">
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400"
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={!commentText.trim() || isSubmitting}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isSubmitting ? "..." : "Post"}
            </button>
          </div>
        </form>
      ) : (
        <div className="p-3 text-center text-xs text-slate-400 border-b border-white/10">
          Sign in to comment
        </div>
      )}

      {/* Comments list */}
      <div className="max-h-60 overflow-y-auto">
        {loading && comments.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No comments yet. Be the first! 💬
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {comments.map((comment) => (
              <div key={comment.commentId} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {comment.userEmail?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-white">
                        {comment.userEmail?.split('@')[0] || "Anonymous"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(comment.createdAt * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-200 break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}