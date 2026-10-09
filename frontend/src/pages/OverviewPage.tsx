import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

const ACTIONS = [
  {
    icon: "add_a_photo",
    title: "Image screening",
    body: "Upload an eye, dental, or skin image for an AI screening.",
  },
  {
    icon: "edit_note",
    title: "Describe symptoms",
    body: "Type what you're experiencing and get a clear report.",
  },
  {
    icon: "mic",
    title: "Speak symptoms",
    body: "Record your symptoms we transcribe and analyze them.",
  },
];

/* Neutral glass surfaces, matching the dashboard layout */
const glassPanel: CSSProperties = {
  background: "var(--glass-panel-bg)",
  border: "1px solid var(--glass-panel-border)",
  backdropFilter: "blur(22px) saturate(180%)",
  WebkitBackdropFilter: "blur(22px) saturate(180%)",
  boxShadow: "var(--glass-panel-shadow)",
};

const glassControl: CSSProperties = {
  background: "var(--glass-control-bg)",
  border: "1px solid var(--glass-control-border)",
  backdropFilter: "blur(18px) saturate(190%)",
  WebkitBackdropFilter: "blur(18px) saturate(190%)",
  boxShadow: "var(--glass-control-shadow)",
};

/* Apple style type: San Francisco on Apple devices, clean fallbacks elsewhere */
const appleFont: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, "Segoe UI", Roboto, Arial, sans-serif',
  letterSpacing: "-0.01em",
};

export default function OverviewPage() {
  return (
    <div style={appleFont} className="max-w-6xl mx-auto px-6 md:px-8 py-10 antialiased">
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight text-content">Welcome to MedCore</h1>
        <p className="text-lg text-muted mt-2">Your AI clinical screening assistant.</p>
      </div>

      {/* Glass hero */}
      <div
        style={glassPanel}
        className="rounded-3xl p-8 mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
      >
        <div className="flex items-start gap-5">
          <div
            style={glassControl}
            className="hidden sm:flex size-14 shrink-0 rounded-2xl items-center justify-center text-accent-700"
          >
            <span className="material-symbols-outlined text-3xl">stethoscope</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-content">
              Start a general diagnosis
            </h2>
            <p className="text-muted mt-2 max-w-lg leading-relaxed">
              Get a preliminary Diagnostic, Prognostic &amp; Therapeutic report from an image, your
              symptoms, or your voice in seconds.
            </p>
          </div>
        </div>
        <Link
          to="/app/diagnosis"
          style={glassControl}
          className="group inline-flex items-center gap-2 font-semibold text-content px-6 py-3.5 rounded-2xl w-fit shrink-0 transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0"
        >
          New diagnosis
          <span className="material-symbols-outlined text-base text-accent-700 transition-transform group-hover:translate-x-1">
            arrow_forward
          </span>
        </Link>
      </div>

      {/* What you can do */}
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">What you can do</h3>
      <div className="grid sm:grid-cols-3 gap-5">
        {ACTIONS.map((a) => (
          <Link
            key={a.title}
            to="/app/diagnosis"
            style={glassPanel}
            className="group h-full rounded-3xl p-6 flex flex-col transition-all hover:-translate-y-1 hover:brightness-105"
          >
            <div className="flex items-start justify-between mb-5">
              <div
                style={glassControl}
                className="size-12 rounded-2xl text-accent-700 flex items-center justify-center"
              >
                <span className="material-symbols-outlined">{a.icon}</span>
              </div>
              <span
                style={glassControl}
                className="size-8 rounded-full text-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </span>
            </div>
            <p className="font-semibold text-content text-lg">{a.title}</p>
            <p className="text-sm text-muted mt-1.5 leading-relaxed">{a.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}