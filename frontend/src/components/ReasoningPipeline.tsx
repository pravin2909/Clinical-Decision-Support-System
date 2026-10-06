import type { NodeState, PipelineState } from "../types";

function nodeContainerClass(node: NodeState): string {
  const base = "size-12 rounded-full flex items-center justify-center mb-2 transition-all ";
  if (node.status === "active") {
    return (
      base +
      (node.emerald
        ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30"
        : "bg-brand-600 text-white shadow-lg shadow-brand-600/30")
    );
  }
  if (node.status === "done") {
    return (
      base +
      (node.emerald
        ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30"
        : "bg-brand-500/20 text-brand-600")
    );
  }
  return base + "bg-slate-100 dark:bg-slate-800 text-slate-400";
}

function nodeTextClass(node: NodeState): string {
  const base = "text-xs h-4 ";
  if (node.accent === "blue") return base + "text-brand-600 font-bold";
  if (node.accent === "emerald") return base + "text-brand-500 font-bold";
  return base + "text-slate-500 font-semibold";
}

function nodeIcon(node: NodeState, defaultIcon: string) {
  if (node.spinning) {
    return (
      <span className="material-symbols-outlined animate-spin" style={{ animationDuration: "3s" }}>
        memory
      </span>
    );
  }
  if (node.status === "done") {
    return <span className="material-symbols-outlined">check_circle</span>;
  }
  return <span className="material-symbols-outlined">{defaultIcon}</span>;
}

function PipelineNode({
  node,
  title,
  defaultIcon,
}: {
  node: NodeState;
  title: string;
  defaultIcon: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center text-center">
      <div className={nodeContainerClass(node)}>{nodeIcon(node, defaultIcon)}</div>
      <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
      <p className={nodeTextClass(node)}>{node.text}</p>
    </div>
  );
}

const BAR_COLOR = {
  blue: "bg-brand-600",
  emerald: "bg-brand-500",
  red: "bg-red-500",
} as const;

const PERCENT_COLOR = {
  blue: "text-brand-600",
  emerald: "text-brand-500",
  red: "text-red-500",
} as const;

export default function ReasoningPipeline({ state }: { state: PipelineState }) {
  const line1 = state.routeLine1Active
    ? "hidden md:block h-px flex-1 bg-gradient-to-r from-brand-500 to-brand-600"
    : "hidden md:block h-px flex-1 bg-slate-200 dark:bg-slate-700";
  const line2 = state.routeLine2Active
    ? "hidden md:block h-px flex-1 bg-gradient-to-r from-brand-500 to-brand-500"
    : "hidden md:block h-px flex-1 bg-slate-200 dark:bg-slate-700";

  return (
    <div className="bg-white dark:bg-ink/40 rounded-xl p-6 border border-line shadow-sm dark:border-slate-800 shadow-sm">
      <h2 className="text-slate-900 dark:text-white text-xl font-bold mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-brand-600">account_tree</span>
        AI Reasoning Pipeline
      </h2>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative">
        <PipelineNode node={state.router} title="MobileNet V2 Router" defaultIcon="route" />
        <div className={line1}></div>
        <PipelineNode node={state.vit} title="Vision Transformer" defaultIcon="memory" />
        <div className={line2}></div>
        <PipelineNode node={state.llm} title="Reasoning LLM (Gemma)" defaultIcon="psychology" />
      </div>

      <div className="mt-10 space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-slate-900 dark:text-white font-semibold">{state.progressLabel}</p>
            <p className="text-slate-500 text-sm">{state.progressText}</p>
          </div>
          <span className={`font-mono font-bold text-lg ${PERCENT_COLOR[state.progressColor]}`}>
            {state.progress}%
          </span>
        </div>
        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${BAR_COLOR[state.progressColor]} ${
              state.progressPulse ? "animate-pulse" : ""
            }`}
            style={{ width: `${state.progress}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
