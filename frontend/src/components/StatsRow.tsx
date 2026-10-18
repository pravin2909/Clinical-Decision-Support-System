import type { ConfidenceTier, PipelineState } from "../types";

const TIER: Record<Exclude<ConfidenceTier, null>, { cls: string; icon: string; label: string }> = {
  high: { cls: "text-accent-600", icon: "trending_up", label: "High" },
  moderate: { cls: "text-yellow-500", icon: "warning", label: "Moderate" },
  low: { cls: "text-red-500", icon: "error", label: "Low" },
};

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-ink/40 rounded-xl p-4 border border-line shadow-sm dark:border-slate-800 flex flex-col gap-1">
      <p className="text-slate-500 text-xs uppercase font-bold tracking-wider">{label}</p>
      <div className="flex items-baseline gap-2">{children}</div>
    </div>
  );
}

export default function StatsRow({ state }: { state: PipelineState }) {
  const tier = state.confidenceTier ? TIER[state.confidenceTier] : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card label="Confidence Score">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">
          {state.confidence}
        </span>
        {tier && (
          <span className={`text-xs font-semibold flex items-center ${tier.cls}`}>
            <span className="material-symbols-outlined text-sm">{tier.icon}</span> {tier.label}
          </span>
        )}
      </Card>

      <Card label="Inference Time">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">
          {state.inferenceTime}
        </span>
        <span className="text-slate-400 text-xs font-mono">CDS Pipeline</span>
      </Card>

      <Card label="Identified Domain">
        <span className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
          {state.domain}
        </span>
        <span className="text-slate-400 text-xs font-mono">Auto-Routing</span>
      </Card>
    </div>
  );
}
