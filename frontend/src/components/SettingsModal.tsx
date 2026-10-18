import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthProvider";
import { useHealth } from "../hooks/useHealth";
import { applyTheme, getTheme, type Theme } from "../lib/theme";
import { glassControl } from "../lib/ui";

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-0">
      <span className="text-muted text-sm">{label}</span>
      {tone ? (
        <span
          className={
            "inline-flex items-center gap-1.5 text-sm font-semibold " +
            (tone === "ok" ? "text-emerald-600" : "text-amber-600")
          }
        >
          <span className={"size-2 rounded-full " + (tone === "ok" ? "bg-emerald-500" : "bg-amber-500")} />
          {value}
        </span>
      ) : (
        <span className="font-semibold text-content text-sm">{value}</span>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);

  const glassActive = {
    background: "var(--chat-raised-bg)",
    border: "1px solid var(--chat-raised-border)",
    backdropFilter: "var(--chat-blur)",
    WebkitBackdropFilter: "var(--chat-blur)",
    boxShadow: "var(--chat-raised-shadow)",
  };

  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };

  const opt = (t: Theme, icon: string, label: string) => (
    <button
      onClick={() => choose(t)}
      style={theme === t ? glassActive : undefined}
      className={
        "flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold " +
        (theme === t ? "text-accent-700" : "text-muted hover:text-content")
      }
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );

  return (
    <div style={glassControl} className="inline-grid grid-cols-2 gap-1 p-1 rounded-xl">
      {opt("light", "light_mode", "Light")}
      {opt("dark", "dark_mode", "Dark")}
    </div>
  );
}

function initials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { health, loading } = useHealth();
  const isDoctor = user?.role === "doctor";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const val = (v?: string) => (loading ? "Checking" : v ?? "Unavailable");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-semibold text-content">Settings</h2>
          <button
            onClick={onClose}
            title="Close"
            className="size-8 rounded-lg flex items-center justify-center text-muted hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Account */}
          {user && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Account</p>
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-2xl bg-accent-500/10 text-accent-700 border border-accent-500/25 flex items-center justify-center font-bold text-sm shrink-0">
                  {initials(user.full_name, user.email)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-content text-sm leading-tight truncate">
                    {user.full_name || user.email.split("@")[0]}
                  </p>
                  <p className="text-muted text-xs truncate">{user.email}</p>
                  <p className="text-xs mt-0.5 text-accent-700 font-medium capitalize">{user.role}</p>
                </div>
              </div>
            </div>
          )}

          {/* Appearance */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Appearance</p>
            <ThemeToggle />
          </div>

          {/* Service status — same shape for both roles, role-appropriate labels */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-1">
              Service status
            </p>
            <div className="text-sm">
              <Row
                label={isDoctor ? "Clinical Copilot" : "AI assistant"}
                value={val(health?.llm_available ? "Available" : "Unavailable")}
                tone={health?.llm_available ? "ok" : "warn"}
              />
              <Row
                label={isDoctor ? "Image analysis" : "Image screening"}
                value={val(health?.models_loaded ? "Ready" : "Loading")}
                tone={health?.models_loaded ? "ok" : "warn"}
              />
              {isDoctor && (
                <Row
                  label="Literature search"
                  value="Active"
                  tone="ok"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
