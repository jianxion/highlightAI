import { AuthProvider } from "../features/auth/context/AuthContext.tsx";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
