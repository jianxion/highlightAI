import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useMemo,
} from "react";

interface AuthUser {
  email: string;
  name?: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  user: AuthUser | null;
}

interface AuthContextValue extends AuthState {
  login: (data: {
    email: string;
    accessToken: string;
    refreshToken: string;
    idToken: string;
  }) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    refreshToken: null,
    idToken: null,
    user: null,
  });

  const login: AuthContextValue["login"] = ({
    email,
    accessToken,
    refreshToken,
    idToken,
  }) => {
    setState({
      accessToken,
      refreshToken,
      idToken,
      user: { email },
    });
  };

  const logout = () => {
    setState({
      accessToken: null,
      refreshToken: null,
      idToken: null,
      user: null,
    });
  };

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
      isAuthenticated: !!state.accessToken,
    }),
    [state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used inside AuthProvider");
  }
  return ctx;
}
