import { useEffect, useState } from "react";
import { useHealth } from "../hooks/useHealth";
import { applyTheme, getTheme, type Theme } from "../lib/theme";

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-line last:border-0">
      <span className="text-muted">{label}</span>
      {tone ? (
        <span
          className={
            "inline-flex items-center gap-1.5 text-sm font-semibold " +
            (tone === "ok" ? "text-emerald-500" : "text-amber-500")
          }
        >
          <span className={"size-2 rounded-full " + (tone === "ok" ? "bg-emerald-500" : "bg-amber-500")} />
          {value}
        </span>
      ) : (
        <span className="font-semibold text-content">{value}</span>
      )}
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
      className={
        "flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold " +
        (theme === t
          ? "bg-surface2 text-accent-700 border border-line"
          : "text-muted hover:text-content")
      }
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
  return (
    <div className="inline-grid grid-cols-2 gap-1 p-1 rounded-xl border border-line">
      {opt("light", "light_mode", "Light")}
      {opt("dark", "dark_mode", "Dark")}
    </div>
  );
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { health, loading } = useHealth();

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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl animate-fade-in">
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

        <div className="p-5 space-y-6">
          <div>
            <p className="text-sm font-semibold text-content mb-2">Appearance</p>
            <ThemeToggle />
          </div>

          <div>
            <p className="text-sm font-semibold text-content mb-1">System status</p>
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
          </div>
        </div>
      </div>
    </div>
  );
}
