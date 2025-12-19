import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import AuthInput from "../components/AuthInput";
import AuthButton from "../components/AuthButton";
import { useSignup } from "../hooks/useSignup";

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpForm = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const { handleSignup } = useSignup();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpForm) => {
    setServerError(null);
    try {
      await handleSignup(data.name, data.email, data.password);
    } catch (err: any) {
      console.error("Signup error:", err);
      console.error("Response data:", err?.response?.data);
      setServerError(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to create account. Please try again."
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Join <span className="font-semibold">HighlightAI</span> and start sharing clips.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/40 backdrop-blur-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <AuthInput
              label="Name"
              placeholder="John Doe"
              {...register("name")}
              error={errors.name?.message}
            />

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
              Sign Up
            </AuthButton>
          </form>

          <p className="mt-4 text-xs text-slate-300 text-center">
            Already have an account?{" "}
            <Link
              to="/signin"
              className="font-semibold text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
