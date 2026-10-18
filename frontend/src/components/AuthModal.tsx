import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Logo from "./Logo";
import { useAuth } from "../context/AuthProvider";
import { btnPrimary, inputClass } from "../lib/ui";

type Mode = "signin" | "signup";

/**
 * Production-style auth modal: a centered card over a frosted backdrop that
 * blurs the page behind it. Opened from the landing page CTAs so sign in feels
 * instant instead of a full navigation. Supports sign in and create account.
 */
export default function AuthModal({
  open,
  initialMode = "signin",
  onClose,
}: {
  open: boolean;
  initialMode?: Mode;
  onClose: () => void;
}) {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"patient" | "doctor">("patient");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset to the requested mode each time it opens.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
    }
  }, [open, initialMode]);

  // Esc to close + lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Use a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp({ email: email.trim(), password, full_name: fullName.trim() || undefined, role });
      }
      onClose();
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Frosted backdrop blurs the page behind the modal */}
      <div
        className="animate-backdrop-in absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        className="animate-modal-pop relative w-full max-w-md rounded-3xl border border-black/5 bg-surface p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] sm:p-9"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-surface2 hover:text-content"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-content">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {mode === "signin" ? "Sign in to your account to continue." : "A few details and you're in."}
          </p>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === "signup" && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  { key: "patient", label: "Patient", icon: "person" },
                  { key: "doctor", label: "Doctor", icon: "stethoscope" },
                ] as const).map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRole(r.key)}
                    className={
                      "rounded-xl border p-2.5 text-left transition " +
                      (role === r.key ? "border-accent-500 bg-accent-500/10" : "border-line hover:border-accent-500/50")
                    }
                  >
                    <span className="material-symbols-outlined text-accent-600">{r.icon}</span>
                    <p className="mt-0.5 text-sm font-semibold text-content">{r.label}</p>
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="text-sm font-medium text-content">Full name</span>
                <div className="relative mt-1.5">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-muted">person</span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={`${inputClass} !pl-10`} placeholder={role === "doctor" ? "Dr. Jane Doe" : "Jane Doe"} />
                </div>
              </label>
            </>
          )}

          <label className="block">
            <span className="text-sm font-medium text-content">Email address</span>
            <div className="relative mt-1.5">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-muted">mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus className={`${inputClass} !pl-10`} placeholder="you@example.com" />
            </div>
          </label>

          <label className="block">
            <span className="flex items-center justify-between">
              <span className="text-sm font-medium text-content">Password</span>
              {mode === "signin" && (
                <button type="button" onClick={() => setError("Password reset isn't set up in this demo yet.")} className="text-xs font-semibold text-accent-600 hover:underline">
                  Forgot?
                </button>
              )}
            </span>
            <div className="relative mt-1.5">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-muted">lock</span>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} !pl-10 !pr-16`}
                placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted hover:text-content">
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {mode === "signin" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 rounded border-line accent-accent-600" />
              Remember me
            </label>
          )}

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-rose-500">
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`${btnPrimary} w-full !rounded-xl !py-3`}>
            {busy ? (mode === "signin" ? "Signing in…" : "Creating…") : mode === "signin" ? "Sign in" : "Create account"}
            {!busy && <span className="material-symbols-outlined text-base">arrow_forward</span>}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="font-semibold text-accent-600 hover:underline"
          >
            {mode === "signin" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
