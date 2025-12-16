import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { dbg } from "../../../shared/utils/debug";

/**
 * User profile page
 * - Shows user info (later)
 * - Shows user's videos (next step)
 */
export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();

  useEffect(() => {
    dbg("PROFILE", "Profile page mounted", userId);
  }, [userId]);

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-6">
      <h1 className="text-xl font-bold">Profile</h1>
      <p className="text-sm text-slate-400">
        Viewing profile for user: {userId}
      </p>
    </div>
  );
}
