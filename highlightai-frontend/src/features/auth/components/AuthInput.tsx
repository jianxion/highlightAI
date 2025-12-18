import { type InputHTMLAttributes } from "react";

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export default function AuthInput({
  label,
  error,
  ...props
}: AuthInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-200">{label}</label>
      <input
        {...props}
        className={`w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-slate-50 placeholder:text-slate-400 backdrop-blur-md outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 ${
          props.className ?? ""
        }`}
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
