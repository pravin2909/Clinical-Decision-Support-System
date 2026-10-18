import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AuthShell from "../components/AuthShell";
import { useAuth } from "../context/AuthProvider";
import { btnPrimary, inputClass } from "../lib/ui";

export default function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<"patient" | "doctor">("patient");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError("Enter an email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        full_name: fullName.trim() || undefined,
        role,
      });
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  const ROLES: { key: "patient" | "doctor"; label: string; icon: string; note: string }[] = [
    { key: "patient", label: "Patient", icon: "person", note: "Track health, get screenings" },
    { key: "doctor", label: "Doctor", icon: "stethoscope", note: "Clinical copilot & patients" },
  ];

  return (
    <AuthShell
      title="Create your account"
      subtitle="A few details and you're in."
      topRight={
        <>
          Have an account?{" "}
          <Link to="/login" className="font-semibold text-accent-600 hover:underline">
            Sign in
          </Link>
        </>
      }
      footer={
        <p className="text-xs leading-relaxed text-muted">
          By creating an account, you agree to our{" "}
          <a className="underline hover:text-content" href="#">Terms of Service</a> and{" "}
          <a className="underline hover:text-content" href="#">Privacy Policy</a>.
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <span className="text-sm font-medium text-content">I am a</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2.5">
            {ROLES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                className={
                  "rounded-xl border p-3 text-left transition " +
                  (role === r.key
                    ? "border-accent-500 bg-accent-500/10"
                    : "border-line hover:border-accent-500/50")
                }
              >
                <span className="material-symbols-outlined text-accent-600">{r.icon}</span>
                <p className="mt-1 text-sm font-semibold text-content">{r.label}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted">{r.note}</p>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-content">Full name</span>
          <div className="relative mt-1.5">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-muted">
              person
            </span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`${inputClass} !pl-10`}
              placeholder={role === "doctor" ? "Dr. Jane Doe" : "Jane Doe"}
            />
          </div>
        </label>

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
              placeholder="At least 6 characters"
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

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-rose-500">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={`${btnPrimary} w-full !rounded-xl !py-3`}>
          {busy ? "Creating…" : "Create account"}
          {!busy && <span className="material-symbols-outlined text-base">arrow_forward</span>}
        </button>
      </form>
    </AuthShell>
  );
}
