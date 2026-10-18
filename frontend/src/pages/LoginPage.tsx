import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import AuthShell from "../components/AuthShell";
import { useAuth } from "../context/AuthProvider";
import { btnPrimary, inputClass } from "../lib/ui";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your account to continue."
      topRight={
        <>
          New here?{" "}
          <Link to="/register" className="font-semibold text-accent-600 hover:underline">
            Create account
          </Link>
        </>
      }
      footer={
        <p className="text-xs leading-relaxed text-muted">
          By signing in, you agree to our{" "}
          <a className="underline hover:text-content" href="#">Terms of Service</a> and{" "}
          <a className="underline hover:text-content" href="#">Privacy Policy</a>.
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-content">Email address</span>
          <div className="relative mt-1.5">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-muted">
              mail
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className={`${inputClass} !pl-10`}
              placeholder="you@example.com"
            />
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-content">Password</span>
          <div className="relative mt-1.5">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-muted">
              lock
            </span>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} !pl-10 !pr-16`}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted hover:text-content"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 rounded border-line text-accent-600 accent-accent-600"
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={() => setError("Password reset isn't set up in this demo yet.")}
            className="text-sm font-semibold text-accent-600 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-rose-500">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={`${btnPrimary} w-full !rounded-xl !py-3`}>
          {busy ? "Signing in…" : "Sign in"}
          {!busy && <span className="material-symbols-outlined text-base">arrow_forward</span>}
        </button>
      </form>
    </AuthShell>
  );
}
