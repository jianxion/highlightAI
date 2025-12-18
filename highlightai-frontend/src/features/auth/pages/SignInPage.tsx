import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import AuthInput from "../components/AuthInput";
import AuthButton from "../components/AuthButton";
import { useLogin } from "../hooks/useLogin";

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignInForm = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const { handleLogin } = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInForm) => {
    setServerError(null);
    try {
      await handleLogin(data.email, data.password);
    } catch (err: any) {
      setServerError(
        err?.response?.data?.message || "Failed to sign in. Please try again."
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Sign in to continue to <span className="font-semibold">HighlightAI</span>
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/40 backdrop-blur-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <AuthInput
              label="Email"
              type="email"
              placeholder="you@example.com"
              {...register("email")}
              error={errors.email?.message}
            />

            <AuthInput
              label="Password"
              type="password"
              placeholder="••••••••"
              {...register("password")}
              error={errors.password?.message}
            />

            {serverError && (
              <p className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg px-3 py-2">
                {serverError}
              </p>
            )}

            <AuthButton type="submit" loading={isSubmitting}>
              Sign In
            </AuthButton>
          </form>

          <p className="mt-4 text-xs text-slate-300 text-center">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="font-semibold text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
