import { useState } from "react";
import { useHealth } from "../hooks/useHealth";
import { applyTheme, getTheme, type Theme } from "../lib/theme";

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-line last:border-0">
      <span className="text-muted">{label}</span>
      <span
        className={
          "font-semibold " +
          (tone === "ok" ? "text-accent-600" : tone === "warn" ? "text-amber-500" : "text-content")
        }
      >
        {value}
      </span>
    </div>
  );
}

const STEPS = [
  { n: "1", title: "Route", body: "The image is routed to the matching domain (eye, dental, or skin)." },
  { n: "2", title: "Classify", body: "A vision transformer predicts the most likely condition." },
  { n: "3", title: "Reason", body: "A language model drafts the full clinical report." },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };
  const opt = (t: Theme, icon: string, label: string) => (
    <button
      onClick={() => choose(t)}
      className={
        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all " +
        (theme === t ? "bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-1 ring-accent-500/25 shadow-sm backdrop-blur-sm" : "text-muted hover:text-content")
      }
    >
      <span className="material-symbols-outlined text-lg">{icon}</span>
      {label}
    </button>
  );
  return (
    <div className="grid grid-cols-2 gap-1 p-1 bg-surface2 rounded-xl max-w-xs">
      {opt("light", "light_mode", "Light")}
      {opt("dark", "dark_mode", "Dark")}
    </div>
  );
}

export default function SettingsPage() {
  const { health, loading } = useHealth();
  const val = (v?: string) => (loading ? "…" : v ?? "—");

  return (
    <div className="max-w-3xl mx-auto px-6 md:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-content">Settings</h1>
        <p className="text-muted mt-1">Appearance, system status, and how MedCore works.</p>
      </div>

      {/* Appearance */}
      <div className="bg-surface rounded-2xl border border-line shadow-card p-6 mb-6">
        <h2 className="font-bold text-content mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-500">palette</span>
          Appearance
        </h2>
        <p className="text-sm text-muted mb-4">Choose how MedCore looks.</p>
        <ThemeToggle />
      </div>

      {/* System status */}
      <div className="bg-surface rounded-2xl border border-line shadow-card p-6 mb-6">
        <h2 className="font-bold text-content mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-500">monitoring</span>
          System status
        </h2>
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
          <Row label="Compute device" value={val(health?.device?.toUpperCase())} />
          <Row label="Data" value="Processed locally" tone="ok" />
        </div>
        {!loading && !health?.llm_available && (
          <p className="mt-4 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            The reasoning model is offline. Start your local LLM server to enable report generation.
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="bg-surface rounded-2xl border border-line shadow-card p-6">
        <h2 className="font-bold text-content mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-500">account_tree</span>
          How it works
        </h2>
        <div className="space-y-4">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-4">
              <div className="size-8 shrink-0 rounded-lg bg-accent-500/10 text-accent-600 font-bold flex items-center justify-center">
                {s.n}
              </div>
              <div>
                <p className="font-semibold text-content">{s.title}</p>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
