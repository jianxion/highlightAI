import { createBrowserRouter } from "react-router-dom";

import SignInPage from "../features/auth/pages/SignInPage";
import SignUpPage from "../features/auth/pages/SignUpPage";
import FeedPage from "../features/feed/pages/FeedPage";
import UploadPage from "../features/upload/pages/UploadPage";
import ConfirmSignUpPage from "../features/auth/pages/ConfirmSignUpPage";
import ProfilePage from "../features/profile/pages/ProfilePage";

import VideoDetailPage from "../features/video/pages/VideoDetailPage";


export const routes = createBrowserRouter([
  { path: "/", element: <FeedPage /> },
  { path: "/signin", element: <SignInPage /> },
  { path: "/signup", element: <SignUpPage /> },
  { path: "/upload", element: <UploadPage /> },
  { path: "/confirm", element: <ConfirmSignUpPage /> },

  { path: "/profile", element: <ProfilePage /> }, // Current user's profile only

  { path: "/profile", element: <ProfilePage /> },
  { path: "/video/:videoId", element: <VideoDetailPage /> },  // ✅ Add this route
]);