import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { signInApi } from "../api/authApi";

export function useLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (email: string, password: string) => {
    const res = await signInApi({ email, password });
    const data = res.data;

    login({
      email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      idToken: data.idToken,
    });

    navigate("/"); // go to feed
  };

  return { handleLogin };
}
