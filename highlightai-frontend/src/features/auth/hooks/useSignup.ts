import { useNavigate } from "react-router-dom";
import { signUpApi } from "../api/authApi";

export function useSignup() {
  const navigate = useNavigate();

  const handleSignup = async (name: string, email: string, password: string) => {
    // 1. Create user
    await signUpApi({ name, email, password });

    // 2. Redirect user to confirmation page
    navigate(`/confirm?email=${encodeURIComponent(email)}`);
  };

  return { handleSignup };
}
