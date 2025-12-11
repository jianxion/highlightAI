import { RouterProvider } from "react-router-dom";
import { routes } from "./routes";
import Providers from "./providers";

export default function App() {
  return (
    <Providers>
      <RouterProvider router={routes} />
    </Providers>
  );
}
