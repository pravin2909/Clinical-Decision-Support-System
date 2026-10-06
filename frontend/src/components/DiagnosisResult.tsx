import type { PipelineState } from "../types";
import { formatReport } from "../lib/format";

const TIER = {
  high: "bg-brand-500/10 text-accent-600 border-brand-500/20",
  moderate: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low: "bg-rose-500/10 text-rose-600 border-rose-500/20",
} as const;

const DOMAIN_LABEL: Record<string, string> = {
  eye: "Ophthalmology",
  dental: "Dentistry",
  skin: "Dermatology",
};

export default function DiagnosisResult({ state }: { state: PipelineState }) {
  const error = state.progressColor === "red";
  const analyzing = !error && state.progress > 0 && state.progress < 100;
  const hasReport = state.reportVisible && state.report.length > 0;
  const generating = analyzing && hasReport;

  const showConfidence = state.confidence.endsWith("%");
  const domainLabel = DOMAIN_LABEL[state.domain];

  // ---- Error ----
  if (error) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center py-10">
          <span className="material-symbols-outlined text-4xl text-rose-500 mb-3">error</span>
          <p className="font-semibold text-content">Something went wrong</p>
          <p className="text-sm text-muted mt-1 max-w-sm">{state.progressText}</p>
        </div>
      </Shell>
    );
  }

  // ---- Loading (no report yet) ----
  if (analyzing && !hasReport) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center py-12">
          <span className="material-symbols-outlined text-4xl text-brand-500 animate-spin mb-4">
            progress_activity
          </span>
          <p className="font-semibold text-content">Analyzing…</p>
          <p className="text-sm text-muted mt-1">This usually takes a few seconds.</p>
        </div>
      </Shell>
    );
  }

  // ---- Idle ----
  if (!hasReport) {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center py-14 text-muted">
          <span className="material-symbols-outlined text-5xl mb-3">clinical_notes</span>
          <p className="font-semibold text-muted">Your report will appear here</p>
          <p className="text-sm mt-1 max-w-xs">
            Choose an input on the left and run an analysis to see the result.
          </p>
        </div>
      </Shell>
    );
  }

  // ---- Result ----
  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent-600">description</span>
          <h3 className="font-bold text-content">Clinical Report</h3>
        </div>
        <div className="flex items-center gap-2">
          {domainLabel && (
            <span className="text-xs font-semibold text-muted bg-surface2 px-2 py-0.5 rounded-full">
              {domainLabel}
            </span>
          )}
          {showConfidence && state.confidenceTier && (
            <span
              className={
                "text-xs font-bold px-2 py-0.5 rounded-full border " + TIER[state.confidenceTier]
              }
            >
              {state.confidence} confidence
            </span>
          )}
        </div>
      </div>

      {state.transcription && (
        <div className="mb-4 text-sm italic text-muted bg-surface2 border-l-4 border-brand-300 rounded-r-lg px-4 py-3">
          <span className="not-italic font-semibold text-accent-600 block mb-0.5">You said</span>
          “{state.transcription}”
        </div>
      )}

      <div dangerouslySetInnerHTML={{ __html: formatReport(state.report) }} />

      {generating && (
        <p className="flex items-center gap-2 text-sm text-accent-600 mt-3">
          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
          Generating…
        </p>
      )}

      <p className="mt-6 pt-4 border-t border-line text-xs text-muted">
        AI-generated for informational purposes only. Not a medical diagnosis — consult a qualified
        clinician.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl border border-line shadow-sm p-6 min-h-[22rem]">{children}</div>
  );
}
