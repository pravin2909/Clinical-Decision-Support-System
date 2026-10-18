/**
 * Dashboard building blocks, built to the "Modern SaaS Professional" spec:
 * trend badges, metric cards, an animated dual-bar activity chart, progress
 * performance cards, a data table, and a compact AI assistant panel with
 * nested option buttons. Everything is driven by the app's semantic tokens
 * (accent = clinical green, secondary = amber) so it flips cleanly in dark mode.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

/* 12px-radius card with a 1px hairline and the spec's subtle shadow (no heavy drops). */
export const cardStyle: CSSProperties = {
  boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
};

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{ ...cardStyle, ...style }}
      className={"rounded-xl border border-line bg-surface p-5 " + className}
    >
      {children}
    </div>
  );
}

/* ── Layered trend badge ──────────────────────────────────────────────── */
export function TrendBadge({ delta }: { delta: number | null }) {
  if (delta === null || Number.isNaN(delta)) return null;
  const up = delta >= 0;
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold " +
        (up
          ? "bg-accent-100 text-accent-700 dark:bg-accent-500/15"
          : "bg-red-50 text-red-500 dark:bg-red-500/15")
      }
    >
      <span className="material-symbols-outlined text-[13px] leading-none">
        {up ? "trending_up" : "trending_down"}
      </span>
      {up ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

/* Tiny inline bar chart for metric cards. */
function MiniBars({ data, color }: { data: number[]; color: string }) {
  const bars = data.slice(-7);
  const max = Math.max(1, ...bars);
  return (
    <div className="flex h-9 items-end gap-[3px]">
      {bars.map((v, i) => (
        <span
          key={i}
          className="grow-up w-1.5 rounded-sm"
          style={{
            height: `${Math.max((v / max) * 100, 12)}%`,
            background: color,
            opacity: i === bars.length - 1 ? 1 : 0.4,
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Metric card (reference: label · value + mini-chart · info + delta) ─── */
export function MetricCard({
  label,
  icon,
  color,
  value,
  unit,
  delta,
  deltaLabel = "vs last period",
  bars,
  delay = 0,
}: {
  label: string;
  icon: string;
  color: string;
  value: string;
  unit?: string | null;
  delta?: number | null;
  deltaLabel?: string;
  bars?: number[];
  delay?: number;
}) {
  const hasDelta = delta !== undefined && delta !== null && !Number.isNaN(delta);
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        <span
          className="inline-flex size-7 items-center justify-center rounded-lg"
          style={{ color, background: `${color}1f` }}
        >
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-[28px] font-bold leading-none tracking-[-0.03em] text-content">
          {value}
          {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
        </p>
        {bars && bars.length > 0 && <MiniBars data={bars} color={color} />}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3">
        <span className="material-symbols-outlined text-[15px] text-muted/70" title={label}>
          info
        </span>
        {hasDelta ? (
          <span className={"text-xs font-semibold " + (up ? "text-accent-600" : "text-rose-500")}>
            {up ? "+" : ""}
            {delta!.toFixed(2)}% {deltaLabel}
          </span>
        ) : (
          <span className="text-xs text-muted/70">—</span>
        )}
      </div>
    </Card>
  );
}

/* ── Animated dual-bar activity chart ─────────────────────────────────── */
export interface Series {
  label: string;
  color: string;
  data: number[];
}

export function ActivityChart({
  title = "Activity",
  summary,
  series,
  xLabels,
  height = 180,
  tabs,
  activeTab,
  onTab,
}: {
  title?: string;
  summary?: string;
  series: Series[];
  xLabels: string[];
  height?: number;
  tabs?: string[];
  activeTab?: string;
  onTab?: (t: string) => void;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  // Round the top of the axis to a friendly number.
  const niceMax = niceCeil(max);
  const ticks = [niceMax, niceMax * 0.75, niceMax * 0.5, niceMax * 0.25, 0];

  return (
    <Card className="fade-in-up">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-content">{title}</h3>
          {summary && <p className="mt-1 text-xl font-bold tracking-tight text-content">{summary}</p>}
        </div>
        {tabs && tabs.length > 0 && (
          <div className="flex rounded-lg border border-line bg-surface2/60 p-0.5">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => onTab?.(t)}
                className={
                  "rounded-md px-3 py-1 text-xs font-medium transition " +
                  (t === activeTab ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content")
                }
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mb-5 flex items-center gap-4">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="flex gap-3">
        {/* Y axis */}
        <div
          className="flex flex-col justify-between text-right text-[10px] text-muted"
          style={{ height }}
        >
          {ticks.map((t) => (
            <span key={t}>{formatTick(t)}</span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative flex-1">
          {/* gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="border-t border-line/70" />
            ))}
          </div>
          <div className="relative flex items-end justify-between" style={{ height }}>
            {xLabels.map((_, i) => (
              <div key={i} className="flex items-end gap-[3px]">
                {series.map((s, si) => {
                  const h = (s.data[i] ?? 0) / niceMax;
                  return (
                    <div
                      key={s.label}
                      className="grow-up w-3.5 rounded-t"
                      style={{
                        height: `${Math.max(h * height, h > 0 ? 3 : 0)}px`,
                        background: s.color,
                        animationDelay: `${i * 0.1 + si * 0.05}s`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* X axis */}
      <div className="mt-2 flex justify-between pl-9 text-[10px] text-muted">
        {xLabels.map((l, i) => (
          <span key={i} className="flex-1 text-center">
            {l}
          </span>
        ))}
      </div>
    </Card>
  );
}

/* ── Progress performance card ────────────────────────────────────────── */
export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(100, pct))));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="h-[7px] w-full overflow-hidden rounded-full bg-surface2">
      <div className="progress-fill h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function ProgressCard({
  title,
  value,
  status,
  statusColor,
  bars,
  delay = 0,
}: {
  title: string;
  value: string;
  status: string;
  statusColor: string;
  bars: { label: string; pct: number; color: string; caption?: string }[];
  delay?: number;
}) {
  return (
    <Card className="fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content">{title}</h3>
        <span
          className="material-symbols-outlined text-[18px] text-muted"
          title="How this is calculated"
        >
          info
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <p className="text-[28px] font-bold leading-none tracking-[-0.03em] text-content">{value}</p>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <span className="size-2 rounded-full" style={{ background: statusColor }} />
          {status}
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>{b.label}</span>
              <span className="font-semibold text-content">{b.caption ?? `${Math.round(b.pct)}%`}</span>
            </div>
            <ProgressBar pct={b.pct} color={b.color} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Data table ───────────────────────────────────────────────────────── */
export interface TableRow {
  icon: string;
  iconColor: string;
  name: string;
  cols: ReactNode[];
}

export function DataTable({
  title,
  headers,
  rows,
  action,
}: {
  title: string;
  headers: string[];
  rows: TableRow[];
  action?: ReactNode;
}) {
  return (
    <Card className="fade-in-up p-0">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="text-sm font-semibold text-content">{title}</h3>
        {action}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr className="border-y border-line/80 text-[10px] uppercase tracking-wider text-muted">
              <th className="py-2 pl-5 pr-3 font-semibold">{headers[0]}</th>
              {headers.slice(1).map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-8 text-center text-sm text-muted">
                  Nothing to show yet.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr
                  key={i}
                  className="border-b border-line/50 transition-colors last:border-0 hover:bg-surface2/60"
                >
                  <td className="py-3 pl-5 pr-3">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="inline-flex size-7 items-center justify-center rounded-lg"
                        style={{ color: r.iconColor, background: `${r.iconColor}1f` }}
                      >
                        <span className="material-symbols-outlined text-[16px]">{r.icon}</span>
                      </span>
                      <span className="text-xs font-medium text-content">{r.name}</span>
                    </span>
                  </td>
                  {r.cols.map((c, ci) => (
                    <td key={ci} className="px-3 py-3 text-xs font-semibold text-content">
                      {c}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── AI response card with nested option buttons ──────────────────────── */
export interface AssistantOption {
  icon: string;
  color: string;
  title: string;
  caption: string;
  to: string;
}

function OptionButton({ opt }: { opt: AssistantOption }) {
  return (
    <Link
      to={opt.to}
      className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5 transition-all hover:bg-surface2"
    >
      <span
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md"
        style={{ color: opt.color, background: `${opt.color}1f` }}
      >
        <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-content">{opt.title}</span>
        <span className="block text-[10px] text-muted">{opt.caption}</span>
      </span>
      <span className="material-symbols-outlined ml-auto text-[16px] text-muted transition-transform group-hover:translate-x-0.5">
        chevron_right
      </span>
    </Link>
  );
}

/** The 340px right-side assistant panel from the spec. */
export function AssistantPanel({
  greeting,
  options,
  assistantHref,
}: {
  greeting: string;
  options: AssistantOption[];
  assistantHref: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-l border-line bg-surface xl:flex">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <span className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-accent-500/15 text-accent-600">
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
          </span>
          <span className="text-sm font-semibold text-content">New conversation</span>
        </span>
        <Link
          to={assistantHref}
          title="Open full assistant"
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface2"
        >
          <span className="material-symbols-outlined text-[18px]">open_in_full</span>
        </Link>
      </div>

      {/* Feed */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* AI message with nested option buttons */}
        <div className="flex gap-2.5">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white">
            <span className="material-symbols-outlined text-[16px]">neurology</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="rounded-xl rounded-tl-sm border border-line bg-surface p-3">
              <p className="text-xs leading-relaxed text-content">{greeting}</p>
            </div>
            <div className="mt-2.5 space-y-2 rounded-xl bg-app p-2.5">
              {options.map((o) => (
                <OptionButton key={o.title} opt={o} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-line p-4">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface2/60 px-3 py-2 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20"
        >
          <button type="button" className="text-muted hover:text-content" title="Attach">
            <span className="material-symbols-outlined text-[20px]">attach_file</span>
          </button>
          <input
            ref={inputRef}
            placeholder="Ask about your health…"
            className="min-w-0 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-muted/70"
          />
          <Link
            to={assistantHref}
            title="Send"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white transition hover:bg-accent-600"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
          </Link>
        </form>
      </div>
    </aside>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const step = pow / 2;
  return Math.ceil(n / step) * step;
}

function formatTick(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}
