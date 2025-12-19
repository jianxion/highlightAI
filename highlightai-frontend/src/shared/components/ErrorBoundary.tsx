import React from "react";
import { dbgError } from "../utils/debug";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, message: err instanceof Error ? err.message : "Unknown error" };
  }

  componentDidCatch(err: unknown) {
    dbgError("FEED", "💥 React ErrorBoundary caught an error", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
          <h1 className="text-xl font-bold">Something crashed.</h1>
          <p className="mt-2 text-sm text-slate-400">
            Check the console for details. ErrorBoundary prevented a blank screen.
          </p>
          {this.state.message && (
            <pre className="mt-4 text-xs bg-black/40 p-4 rounded-xl overflow-auto">
              {this.state.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;