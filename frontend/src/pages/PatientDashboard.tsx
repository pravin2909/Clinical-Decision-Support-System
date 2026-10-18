import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthProvider";
import { dashboardSummary, formatValue, numericSeries } from "../lib/tracker";
import type { DashboardSummary } from "../lib/tracker";
import { appleFont } from "../lib/ui";
import { ActivityChart, Card, DataTable, MetricCard, TrendBadge } from "../components/DashboardWidgets";
import type { Series, TableRow } from "../components/DashboardWidgets";

const METRIC_META: Record<string, { label: string; icon: string; color: string }> = {
  weight: { label: "Weight", icon: "monitor_weight", color: "#36b76b" },
  bmi: { label: "BMI", icon: "straighten", color: "#7f77dd" },
  bp: { label: "Blood Pressure", icon: "cardiology", color: "#e24b4a" },
  glucose: { label: "Glucose", icon: "water_drop", color: "#f4a13a" },
  heart_rate: { label: "Heart Rate", icon: "ecg_heart", color: "#d4537e" },
  temperature: { label: "Temperature", icon: "thermostat", color: "#2a9d59" },
};
const metaFor = (key: string) =>
  METRIC_META[key] ?? { label: key.replace(/_/g, " "), icon: "monitoring", color: "#36b76b" };

const RANGES = ["7 days", "30 days", "All"] as const;
type Range = (typeof RANGES)[number];
const windowFor = (r: Range) => (r === "7 days" ? 7 : r === "30 days" ? 30 : Infinity);

function firstName(name: string | null, email: string): string {
  if (name && name.trim()) return name.trim().split(/\s+/)[0];
  return email.split("@")[0];
}
function deltaPct(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const prev = vals[vals.length - 2];
  const last = vals[vals.length - 1];
  if (!prev) return null;
  return ((last - prev) / prev) * 100;
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("7 days");

  useEffect(() => {
    dashboardSummary()
      .then(setSummary)
      .catch(() => setSummary({ types: {} }))
      .finally(() => setLoading(false));
  }, []);

  const entries = useMemo(() => (summary ? Object.entries(summary.types) : []), [summary]);
  const hasData = entries.length > 0;

  const metrics = entries.slice(0, 4).map(([type, d]) => {
    const meta = metaFor(type);
    const series = numericSeries(d.trend);
    return {
      type,
      ...meta,
      value: d.latest ? formatValue(d.latest.value) : "—",
      unit: d.unit,
      delta: deltaPct(series),
      bars: series,
    };
  });

  const activity = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b[1].trend.length - a[1].trend.length);
    const top = sorted[0];
    if (!top || top[1].trend.length < 2) return null;
    const meta = metaFor(top[0]);
    const win = windowFor(range);
    const points = win === Infinity ? top[1].trend : top[1].trend.slice(-win * 2);
    const half = Math.ceil(points.length / 2);
    const prior = points.slice(0, points.length - half);
    const recent = points.slice(points.length - half);
    const labels = recent.map((p) =>
      new Date(p.recorded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
    const series: Series[] = [
      { label: "This period", color: "#36b76b", data: numericSeries(recent) },
      { label: "Previous", color: "#f4a13a", data: numericSeries(prior) },
    ];
    const latest = recent.length ? numericSeries(recent)[numericSeries(recent).length - 1] : 0;
    return { title: `${meta.label} trend`, summary: `${latest}${top[1].unit ? " " + top[1].unit : ""}`, series, labels };
  }, [entries, range]);

  const rows: TableRow[] = entries.map(([type, d]) => {
    const meta = metaFor(type);
    const series = numericSeries(d.trend);
    const when = d.latest?.recorded_at
      ? new Date(d.latest.recorded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "—";
    return {
      icon: meta.icon,
      iconColor: meta.color,
      name: meta.label,
      cols: [
        <>
          {d.latest ? formatValue(d.latest.value) : "—"}
          {d.unit && <span className="ml-1 font-normal text-muted">{d.unit}</span>}
        </>,
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700 dark:bg-accent-500/15">
          <span className="size-1.5 rounded-full bg-accent-500" /> Logged
        </span>,
        <TrendBadge delta={deltaPct(series)} />,
        <span className="font-normal text-muted">{when}</span>,
      ],
    };
  });

  function exportCsv() {
    const header = ["Metric", "Value", "Unit", "Date"];
    const lines = entries.map(([type, d]) => {
      const meta = metaFor(type);
      const value = d.latest ? formatValue(d.latest.value) : "";
      const when = d.latest?.recorded_at ? new Date(d.latest.recorded_at).toISOString() : "";
      return [meta.label, value, d.unit ?? "", when].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "medcore-readings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div style={appleFont} className="min-h-full antialiased">
      <div className="w-full px-6 py-6 md:px-10">
        {/* Title row */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.025em] text-content">
              Welcome back, {user ? firstName(user.full_name, user.email) : "there"}
            </h1>
            <p className="mt-1 text-[13px] text-muted">Here's a snapshot of your health.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-content">
              <span className="material-symbols-outlined text-[16px] text-muted">calendar_today</span>
              {today}
            </span>
            <button
              onClick={exportCsv}
              disabled={!hasData}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-accent-600 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export CSV
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-line bg-surface" />
            ))}
          </div>
        ) : !hasData ? (
          <EmptyState />
        ) : (
          <>
            {/* Metric grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((m, i) => (
                <MetricCard
                  key={m.type}
                  label={m.label}
                  icon={m.icon}
                  color={m.color}
                  value={m.value}
                  unit={m.unit}
                  delta={m.delta}
                  bars={m.bars}
                  delay={i * 50}
                />
              ))}
            </div>

            {/* Chart + companion */}
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {activity ? (
                  <ActivityChart
                    title={activity.title}
                    summary={activity.summary}
                    series={activity.series}
                    xLabels={activity.labels}
                    tabs={[...RANGES]}
                    activeTab={range}
                    onTab={(t) => setRange(t as Range)}
                  />
                ) : (
                  <Card className="flex h-full items-center justify-center text-sm text-muted">
                    Log a few more readings to see your trend chart.
                  </Card>
                )}
              </div>

              {/* Companion: your vitals */}
              <Card className="fade-in-up">
                <h3 className="text-sm font-semibold text-content">Your vitals</h3>
                <p className="mt-1 text-xs text-muted">{entries.length} metric{entries.length === 1 ? "" : "s"} tracked</p>
                <div className="mt-4 space-y-3">
                  {entries.slice(0, 6).map(([type, d]) => {
                    const meta = metaFor(type);
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <span
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ color: meta.color, background: `${meta.color}1f` }}
                        >
                          <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-muted">{meta.label}</span>
                        <span className="text-sm font-semibold text-content">
                          {d.latest ? formatValue(d.latest.value) : "—"}
                          {d.unit && <span className="ml-0.5 text-xs font-normal text-muted">{d.unit}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Link
                  to="/app/tracker"
                  className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-accent-600 hover:underline"
                >
                  Open tracker
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </Card>
            </div>

            {/* Table */}
            <div className="mt-6">
              <DataTable
                title="Recent readings"
                headers={["Metric", "Value", "Status", "Trend", "Date"]}
                rows={rows}
                action={
                  <Link
                    to="/app/tracker"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-600"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add reading
                  </Link>
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-line bg-surface p-10 text-center">
      <span className="material-symbols-outlined text-4xl text-accent-600">monitoring</span>
      <p className="mt-3 font-semibold text-content">No vitals yet</p>
      <p className="mt-1 text-sm text-muted">Start by logging your first measurement.</p>
      <Link
        to="/app/tracker"
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600"
      >
        Add a measurement
        <span className="material-symbols-outlined text-base">arrow_forward</span>
      </Link>
    </div>
  );
}
