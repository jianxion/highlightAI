import { useNavigate } from "react-router-dom";
import { signUpApi, signInApi } from "../api/authApi";
import { useAuth } from "./useAuth";

export function useSignup() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSignup = async (name: string, email: string, password: string) => {
    // 1. Create user
    await signUpApi({ name, email, password });

    // 2. Auto sign-in after signup
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

  return { handleSignup };
}
