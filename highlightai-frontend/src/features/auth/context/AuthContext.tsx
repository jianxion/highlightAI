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

  // Load auth state on mount
  useEffect(() => {
    const saved = localStorage.getItem("highlightai_auth");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        console.log("Loaded auth from localStorage:", {
          hasIdToken: !!parsed.idToken,
          hasAccessToken: !!parsed.accessToken,
          user: parsed.user,
        });
        setState(parsed);
      } catch (err) {
        console.error("Failed to parse auth from localStorage:", err);
        localStorage.removeItem("highlightai_auth");
      }
    }
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (state.accessToken) {
      console.log("Saving auth to localStorage:", {
        hasIdToken: !!state.idToken,
        hasAccessToken: !!state.accessToken,
        user: state.user,
      });
      localStorage.setItem("highlightai_auth", JSON.stringify(state));
    }
  }, [state]);

  const login: AuthContextValue["login"] = ({
    email,
    accessToken,
    refreshToken,
    idToken,
  }) => {
    console.log("Login called with tokens:", {
      hasIdToken: !!idToken,
      hasAccessToken: !!accessToken,
      email,
    });

    const newState: AuthState = {
      accessToken,
      refreshToken,
      idToken,
      user: { email },
    };

    setState(newState);
  };

  const logout = () => {
    console.log("Logout called");
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

  // Debug log
  useEffect(() => {
    console.log("AuthContext value updated:", {
      hasIdToken: !!value.idToken,
      hasAccessToken: !!value.accessToken,
      isAuthenticated: value.isAuthenticated,
      user: value.user,
    });
  }, [value]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
  return ctx;
}