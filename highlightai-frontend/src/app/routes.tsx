import { createBrowserRouter } from "react-router-dom";

import SignInPage from "../features/auth/pages/SignInPage";
import SignUpPage from "../features/auth/pages/SignUpPage";
import FeedPage from "../features/feed/pages/FeedPage";
import UploadPage from "../features/upload/pages/UploadPage";

export const routes = createBrowserRouter([
  { path: "/", element: <FeedPage /> },
  { path: "/signin", element: <SignInPage /> },
  { path: "/signup", element: <SignUpPage /> },
  { path: "/upload", element: <UploadPage /> },
]);
