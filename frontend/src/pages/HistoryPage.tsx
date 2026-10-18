import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { authFetch } from "../lib/auth";
import { listAppointments } from "../lib/api";
import type { Appointment } from "../types";
import PageHeader, { PageShell } from "../components/PageHeader";

interface Consultation {
  id: number;
  created_at: string;
  input_type: string;
  domain: string | null;
  disease: string | null;
  confidence: number | null;
  input_text: string | null;
}

type TimelineItem =
  | { kind: "appointment"; at: string; appt: Appointment }
  | { kind: "consultation"; at: string; c: Consultation };

const TYPE_ICON: Record<string, string> = {
  image: "image",
  text: "edit_note",
  audio: "mic",
  doctor: "neurology",
  patient_message: "forum",
};

/* Icon tint by consultation input type / appointment. */
const TYPE_COLOR: Record<string, string> = {
  image: "#36b76b",
  text: "#7f77dd",
  audio: "#f4a13a",
  doctor: "#2a9d59",
  patient_message: "#d4537e",
};

const APPT_PILL: Record<string, string> = {
  requested: "bg-secondary-100 text-secondary-700 dark:bg-secondary-500/15",
  approved: "bg-accent-100 text-accent-700 dark:bg-accent-500/15",
  completed: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15",
  declined: "bg-rose-50 text-rose-500 dark:bg-rose-500/15",
  cancelled: "bg-black/5 text-muted dark:bg-white/10",
};

function confTier(c: number): { label: string; cls: string } {
  if (c >= 70) return { label: `${c}% confidence`, cls: "bg-accent-100 text-accent-700 dark:bg-accent-500/15" };
  if (c >= 40) return { label: `${c}% confidence`, cls: "bg-secondary-100 text-secondary-700 dark:bg-secondary-500/15" };
  return { label: `${c}% confidence`, cls: "bg-rose-50 text-rose-500 dark:bg-rose-500/15" };
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function time(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function HistoryPage() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [histRes, apptRes] = await Promise.all([
          authFetch("/api/v1/history").then((r) => (r.ok ? r.json() : { items: [] })),
          listAppointments().catch(() => ({ items: [] })),
        ]);
        const merged: TimelineItem[] = [
          ...(histRes.items ?? []).map((c: Consultation) => ({ kind: "consultation" as const, at: c.created_at, c })),
          ...(apptRes.items ?? []).map((a: Appointment) => ({ kind: "appointment" as const, at: a.created_at || "", appt: a })),
        ].sort((x, y) => (y.at > x.at ? 1 : -1));
        setItems(merged);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group by day, preserving the sorted order.
  const groups: { label: string; items: TimelineItem[] }[] = [];
  for (const it of items) {
    const label = it.at ? dayLabel(it.at) : "Earlier";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }

  return (
    <PageShell>
      <PageHeader title="History" subtitle="Your appointments and past consultations." />

      <div>
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-line bg-surface" />
            ))}
          </div>
        ) : error ? (
          <p className="text-rose-500">{error}</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-12 text-center shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
            <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-700">
              <span className="material-symbols-outlined text-3xl">history</span>
            </span>
            <p className="mt-4 font-semibold text-content">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Your appointments and consultations will show up here as a timeline.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Link to="/app/doctors" className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600">
                <span className="material-symbols-outlined text-base">event</span>
                Book an appointment
              </Link>
              <Link to="/app/assistant" className="inline-flex items-center gap-2 rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-content transition hover:bg-surface2">
                <span className="material-symbols-outlined text-base">neurology</span>
                Ask the assistant
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-7">
            {groups.map((g) => (
              <section key={g.label}>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted">{g.label}</p>
                {/* timeline rail */}
                <div className="relative space-y-2.5 pl-6">
                  <span className="absolute bottom-2 left-[9px] top-2 w-px bg-line" aria-hidden />
                  {g.items.map((it) => {
                    const color = it.kind === "appointment" ? "#2a9d59" : TYPE_COLOR[it.c.input_type] ?? "#36b76b";
                    const icon = it.kind === "appointment" ? "event" : TYPE_ICON[it.c.input_type] ?? "description";
                    return (
                      <div key={it.kind === "appointment" ? `a-${it.appt.id}` : `c-${it.c.id}`} className="relative">
                        {/* node dot */}
                        <span
                          className="absolute -left-[22px] top-4 size-2.5 rounded-full ring-4 ring-app"
                          style={{ background: color }}
                          aria-hidden
                        />
                        <div className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:bg-surface2/40">
                          <span
                            className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                            style={{ color, background: `${color}1f` }}
                          >
                            <span className="material-symbols-outlined text-[22px]">{icon}</span>
                          </span>
                          <div className="min-w-0 flex-1">
                            {it.kind === "appointment" ? (
                              <>
                                <p className="truncate font-semibold text-content">
                                  {it.appt.doctor_name ? `Dr. ${it.appt.doctor_name}` : `Doctor #${it.appt.doctor_id}`}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + (APPT_PILL[it.appt.status] || "")}>
                                    {it.appt.status}
                                  </span>
                                  {it.appt.reason && <span className="truncate text-[13px] text-muted">{it.appt.reason}</span>}
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="truncate font-semibold text-content">
                                  {it.c.disease || it.c.input_text || `${it.c.input_type} consultation`}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  {it.c.domain && (
                                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-medium capitalize text-muted">
                                      {it.c.domain}
                                    </span>
                                  )}
                                  {it.c.confidence != null && (
                                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + confTier(it.c.confidence).cls}>
                                      {confTier(it.c.confidence).label}
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-muted">{time(it.at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
