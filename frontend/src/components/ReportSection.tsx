import { useEffect, useRef } from "react";
import type { PipelineState } from "../types";
import { formatReport } from "../lib/format";

export default function ReportSection({ state }: { state: PipelineState }) {
  const ref = useRef<HTMLDivElement>(null);
  const wasVisible = useRef(false);

  // Scroll into view the first time the report becomes visible (matches original).
  useEffect(() => {
    if (state.reportVisible && !wasVisible.current) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    wasVisible.current = state.reportVisible;
  }, [state.reportVisible]);

  if (!state.reportVisible) return null;

  return (
    <div
      ref={ref}
      className="animate-fade-in bg-white dark:bg-ink/40 rounded-xl border border-brand-600/50 shadow-lg shadow-brand-600/10 overflow-hidden"
    >
      <div className="bg-brand-600/10 border-b border-brand-600/20 px-6 py-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-brand-600">description</span>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Diagnostic, Prognostic &amp; Therapeutic Report
        </h3>
      </div>
      <div className="p-6">
        <div className="prose prose-slate dark:prose-invert max-w-none font-medium leading-relaxed">
          {state.transcription && (
            <div className="mb-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm italic border-l-4 border-brand-600">
              <strong className="not-italic text-brand-600 mb-1 block">
                Audio Transcription:
              </strong>{" "}
              {state.transcription}
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: formatReport(state.report) }} />
        </div>
      </div>
    </div>
  );
}
