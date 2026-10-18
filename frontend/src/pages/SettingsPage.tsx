import { useState } from "react";

import { useAuth } from "../context/AuthProvider";
import { useHealth } from "../hooks/useHealth";
import { applyTheme, getTheme, type Theme } from "../lib/theme";
import { accentChip, glassControl, glassPanel } from "../lib/ui";
import PageHeader, { PageShell } from "../components/PageHeader";

function SectionTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className={`${accentChip} size-11 rounded-2xl shrink-0`}>
        <span className="material-symbols-outlined">{icon}</span>
      </span>
      <div>
        <h2 className="font-semibold text-content text-lg leading-tight">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-line last:border-0">
      <span className="text-muted text-sm">{label}</span>
      {tone ? (
        <span
          style={glassControl}
          className={
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold " +
            (tone === "ok" ? "text-emerald-600" : "text-amber-600")
          }
        >
          <span
            className={
              "size-2 rounded-full " + (tone === "ok" ? "bg-emerald-500" : "bg-amber-500")
            }
          />
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

export default function SettingsPage() {
  const { user } = useAuth();
  const { health, loading } = useHealth();
  const isDoctor = user?.role === "doctor";
  const val = (v?: string) => (loading ? "Checking" : v ?? "Unavailable");

  return (
    <PageShell>
      <PageHeader title="Settings" subtitle="Preferences and account details." />
      <div className="space-y-6">
      {/* Account */}
      {user && (
        <div style={glassPanel} className="rounded-3xl p-6">
          <SectionTitle icon="person" title="Account" />
          <div className="flex items-center gap-4 mb-5">
            <div className={`${accentChip} size-14 rounded-2xl text-xl font-bold shrink-0`}>
              {initials(user.full_name, user.email)}
            </div>
            <div>
              <p className="font-semibold text-content text-lg leading-tight">
                {user.full_name || user.email.split("@")[0]}
              </p>
              <p className="text-muted text-sm">{user.email}</p>
            </div>
          </div>
          <div className="text-sm">
            <Row
              label="Role"
              value={user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            />
          </div>
        </div>
      )}

      {/* Appearance */}
      <div style={glassPanel} className="rounded-3xl p-6">
        <SectionTitle icon="palette" title="Appearance" hint="Choose how MedCore looks." />
        <ThemeToggle />
      </div>

      {/* Service status */}
      <div style={glassPanel} className="rounded-3xl p-6">
        <SectionTitle
          icon="monitoring"
          title="Service status"
          hint="Live status of the services powering MedCore."
        />
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

        {!loading && !health?.llm_available && (
          <div
            style={glassControl}
            className="mt-4 flex items-start gap-3 rounded-2xl p-4 text-sm text-amber-700"
          >
            <span className="material-symbols-outlined text-amber-500 shrink-0">warning</span>
            <p>
              {isDoctor
                ? "The reasoning model is offline. Start your local LLM server to enable Copilot answers."
                : "The AI assistant is temporarily unavailable. Image screening and symptom analysis may not work."}
            </p>
          </div>
        )}
      </div>
      </div>
    </PageShell>
  );
}
