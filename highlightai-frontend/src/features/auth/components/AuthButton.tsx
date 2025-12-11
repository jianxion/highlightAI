import { type ButtonHTMLAttributes } from "react";

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
}

export default function AuthButton({
  loading,
  children,
  ...props
}: AuthButtonProps) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`w-full rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 ${
        props.className ?? ""
      }`}
    >
      {loading ? "Please wait..." : children}
    </button>
  );
}
