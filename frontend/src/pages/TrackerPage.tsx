import { useEffect, useMemo, useState } from "react";

import {
  dashboardSummary,
  formatValue,
  listObservations,
  numericSeries,
  recordObservation,
} from "../lib/tracker";
import type { DashboardSummary, Observation } from "../lib/tracker";
import { btnPrimary, glassControl, glassPanel, inputClass } from "../lib/ui";
import PageHeader, { PageShell } from "../components/PageHeader";

const METRICS = [
  { key: "weight", label: "Weight", unit: "kg", icon: "monitor_weight", fields: ["value"] },
  { key: "bmi", label: "BMI", unit: "", icon: "straighten", fields: ["value"] },
  { key: "bp", label: "Blood Pressure", unit: "mmHg", icon: "cardiology", fields: ["systolic", "diastolic"] },
  { key: "glucose", label: "Glucose", unit: "mg/dL", icon: "water_drop", fields: ["value"] },
  { key: "heart_rate", label: "Heart Rate", unit: "bpm", icon: "ecg_heart", fields: ["value"] },
  { key: "temperature", label: "Temperature", unit: "°C", icon: "thermostat", fields: ["value"] },
] as const;

const metricFor = (key: string) => METRICS.find((m) => m.key === key);

// A distinct color per metric so the dashboard isn't all one blue.
const METRIC_COLOR: Record<string, string> = {
  weight: "#1d9e75", // teal
  bmi: "#7f77dd", // purple
  bp: "#e24b4a", // red
  glucose: "#ba7517", // amber
  heart_rate: "#d4537e", // pink
  temperature: "#378add", // blue
};
const colorFor = (key: string) => METRIC_COLOR[key] || "#2a9d59";

const activePill = {
  background: "rgba(54,183,107,0.12)",
  border: "1px solid rgba(54,183,107,0.40)",
  boxShadow: "none",
} as const;

function Sparkline({ values, color = "#2a9d59" }: { values: number[]; color?: string }) {
  if (values.length < 2) {
    return <div className="h-8 text-xs text-muted flex items-center">No trend yet</div>;
  }
  const w = 96;
  const h = 34;
  const pad = 4; // keep the stroke + end dot inside the box so it can't overlap
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = h - ((v - min) / span) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastY = Number(pts.split(" ").pop()!.split(",")[1]);
  return (
    <svg width={w} height={h} className="block" style={{ color }}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w - pad} cy={lastY} r="2.5" fill="currentColor" />
    </svg>
  );
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function TrackerPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recent, setRecent] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [metric, setMetric] = useState<string>("weight");
  const [fields, setFields] = useState<Record<string, string>>({ value: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const metricDef = useMemo(() => metricFor(metric)!, [metric]);

  async function load() {
    setError(null);
    try {
      const [s, r] = await Promise.all([dashboardSummary(), listObservations()]);
      setSummary(s);
      setRecent(r.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the tracker.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const blank: Record<string, string> = {};
    metricDef.fields.forEach((f) => (blank[f] = ""));
    setFields(blank);
    setFormError(null);
  }, [metric, metricDef]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const value: Record<string, number> = {};
    for (const f of metricDef.fields) {
      const n = Number(fields[f]);
      if (fields[f] === "" || Number.isNaN(n)) {
        setFormError("Enter a valid number.");
        return;
      }
      value[f] = n;
    }
    setSaving(true);
    try {
      await recordObservation({ type: metric, value, unit: metricDef.unit || undefined });
      await load();
      const blank: Record<string, string> = {};
      metricDef.fields.forEach((f) => (blank[f] = ""));
      setFields(blank);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const summaryTypes = summary ? Object.entries(summary.types) : [];

  return (
    <PageShell>
      <PageHeader title="Health Tracker" subtitle="Record your vitals and watch the trends over time." />
      <div className="space-y-8">
      {/* Add measurement */}
      <section style={glassPanel} className="rounded-3xl p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Add a measurement</h2>

        {/* Metric selector pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              style={metric === m.key ? activePill : glassControl}
              className={
                "flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 " +
                (metric === m.key ? "text-accent-700" : "text-muted hover:text-content")
              }
            >
              <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3">
          {metricDef.fields.map((f) => (
            <label key={f} className="block">
              <span className="text-xs font-medium text-muted">
                {metricDef.fields.length > 1
                  ? `${f.charAt(0).toUpperCase() + f.slice(1)}${metricDef.unit ? ` (${metricDef.unit})` : ""}`
                  : metricDef.unit
                  ? `${metricDef.label} (${metricDef.unit})`
                  : metricDef.label}
              </span>
              <input
                inputMode="decimal"
                value={fields[f] ?? ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [f]: e.target.value }))}
                className={`mt-1.5 w-32 ${inputClass}`}
                placeholder="0"
              />
            </label>
          ))}

          <button type="submit" disabled={saving} className={`${btnPrimary} !py-2.5 self-end`}>
            {saving ? "Saving…" : "Add"}
            {!saving && <span className="material-symbols-outlined text-base">add</span>}
          </button>
        </form>
        {formError && (
          <p className="mt-3 text-sm text-rose-500 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">error</span>
            {formError}
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.07] text-rose-600 p-4 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined">error</span>
            {error}
          </span>
          <button onClick={load} className="text-sm font-semibold underline">Retry</button>
        </div>
      )}

      {/* Latest readings */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Your latest readings</h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={glassPanel} className="rounded-3xl h-28 animate-pulse" />
            ))}
          </div>
        ) : summaryTypes.length === 0 ? (
          <div style={glassPanel} className="rounded-3xl p-10 text-center">
            <span className="material-symbols-outlined text-4xl text-accent-600">monitoring</span>
            <p className="text-muted mt-3">No measurements yet. Add your first one above.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summaryTypes.map(([type, data]) => {
              const def = metricFor(type);
              return (
                <div key={type} style={glassPanel} className="rounded-3xl p-5">
                  <div className="flex items-center gap-2.5 text-muted">
                    <span
                      className="inline-flex size-9 items-center justify-center rounded-xl"
                      style={{ color: colorFor(type), background: `${colorFor(type)}1f` }}
                    >
                      <span className="material-symbols-outlined text-xl">{def?.icon ?? "monitoring"}</span>
                    </span>
                    <span className="text-sm font-medium capitalize">{def?.label ?? type.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-3xl font-semibold tracking-tight text-content leading-none">
                        {data.latest ? formatValue(data.latest.value) : "No data"}
                        {data.unit && <span className="text-sm font-normal text-muted ml-1">{data.unit}</span>}
                      </div>
                      {data.latest && <div className="text-xs text-muted mt-1.5">{fmtTime(data.latest.recorded_at)}</div>}
                    </div>
                    <div className="shrink-0">
                      <Sparkline values={numericSeries(data.trend)} color={colorFor(type)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent history */}
      {recent.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Recent history</h2>
          <div style={glassPanel} className="rounded-3xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line/70">
                  <th className="text-left font-medium px-5 py-3">Metric</th>
                  <th className="text-left font-medium px-5 py-3">Value</th>
                  <th className="text-left font-medium px-5 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-b border-line/50 last:border-0">
                    <td className="px-5 py-3 text-content capitalize">
                      {metricFor(o.type)?.label ?? o.type.replace(/_/g, " ")}
                    </td>
                    <td className="px-5 py-3 text-content font-medium">
                      {formatValue(o.value)}
                      {o.unit && <span className="text-muted font-normal ml-1">{o.unit}</span>}
                    </td>
                    <td className="px-5 py-3 text-muted">{fmtTime(o.recorded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      </div>
    </PageShell>
  );
}
