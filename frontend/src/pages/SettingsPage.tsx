import { useState } from "react";
import type { CSSProperties } from "react";
import { useHealth } from "../hooks/useHealth";
import { applyTheme, getTheme, type Theme } from "../lib/theme";

/* Apple style type */
const appleFont: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, "Segoe UI", Roboto, Arial, sans-serif',
  letterSpacing: "-0.01em",
};

/* Surfaces: glassy in light mode, flat/solid in dark (driven by CSS vars). */
const glassPanel: CSSProperties = {
  background: "var(--chat-panel-bg)",
  border: "1px solid var(--chat-panel-border)",
  backdropFilter: "var(--chat-blur)",
  WebkitBackdropFilter: "var(--chat-blur)",
  boxShadow: "var(--chat-panel-shadow)",
};

const glassControl: CSSProperties = {
  background: "var(--chat-control-bg)",
  border: "1px solid var(--chat-control-border)",
  backdropFilter: "var(--chat-blur)",
  WebkitBackdropFilter: "var(--chat-blur)",
  boxShadow: "var(--chat-control-shadow)",
};

const glassActive: CSSProperties = {
  background: "var(--chat-raised-bg)",
  border: "1px solid var(--chat-raised-border)",
  backdropFilter: "var(--chat-blur)",
  WebkitBackdropFilter: "var(--chat-blur)",
  boxShadow: "var(--chat-raised-shadow)",
};

const iconTile = "shrink-0 flex items-center justify-center text-accent-700";

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-line last:border-0">
      <span className="text-muted">{label}</span>
      {tone ? (
        <span
          style={glassControl}
          className={
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold " +
            (tone === "ok" ? "text-emerald-600" : "text-amber-600")
          }
        >
          <span
            className={"size-2 rounded-full " + (tone === "ok" ? "bg-emerald-500" : "bg-amber-500")}
          />
          {value}
        </span>
      ) : (
        <span className="font-semibold text-content">{value}</span>
      )}
    </div>
  );
}

function SectionTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span style={glassControl} className={"size-11 rounded-2xl " + iconTile}>
        <span className="material-symbols-outlined">{icon}</span>
      </span>
      <div>
        <h2 className="font-semibold text-content text-lg leading-tight">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
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

export default function SettingsPage() {
  const { health, loading } = useHealth();
  const val = (v?: string) => (loading ? "Checking" : v ?? "Unavailable");

  return (
    <div style={appleFont} className="max-w-3xl mx-auto px-6 md:px-8 py-10 antialiased">
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight text-content">Settings</h1>
        <p className="text-lg text-muted mt-2">Appearance and system status.</p>
      </div>

      {/* Appearance */}
      <div style={glassPanel} className="rounded-3xl p-6 mb-6">
        <SectionTitle icon="palette" title="Appearance" hint="Choose how MedCore looks." />
        <ThemeToggle />
      </div>

      {/* System status */}
      <div style={glassPanel} className="rounded-3xl p-6">
        <SectionTitle icon="monitoring" title="System status" hint="Live health of the local services." />
        <div className="text-sm">
          <Row
            label="Reasoning model"
            value={val(health?.llm_available ? "Online" : "Offline")}
            tone={health?.llm_available ? "ok" : "warn"}
          />
          <Row label="Model" value={val(health?.llm_model)} />
          <Row
            label="Vision models"
            value={val(health?.models_loaded ? "Loaded" : "Not loaded")}
            tone={health?.models_loaded ? "ok" : "warn"}
          />
        </div>
        {!loading && !health?.llm_available && (
          <div
            style={glassControl}
            className="mt-4 flex items-start gap-3 rounded-2xl p-4 text-sm text-amber-700"
          >
            <span className="material-symbols-outlined text-amber-500">warning</span>
            <p>The reasoning model is offline. Start your local LLM server to enable report generation.</p>
          </div>
        )}
      </div>

    </div>
  );
}