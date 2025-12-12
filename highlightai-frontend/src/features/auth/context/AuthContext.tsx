import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useMemo,
  useEffect,
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

  // 🔥 LOAD AUTH STATE ON PAGE LOAD
  useEffect(() => {
    const saved = localStorage.getItem("highlightai_auth");
    if (saved) {
      setState(JSON.parse(saved));
    }
  }, []);

  // 🔥 SAVE AUTH STATE TO LOCALSTORAGE
  const login: AuthContextValue["login"] = ({
    email,
    accessToken,
    refreshToken,
    idToken,
  }) => {
    const newState: AuthState = {
      accessToken,
      refreshToken,
      idToken,
      user: { email },
    };

    localStorage.setItem("highlightai_auth", JSON.stringify(newState));
    setState(newState);
  };

  const logout = () => {
    localStorage.removeItem("highlightai_auth");
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
  if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
  return ctx;
}
