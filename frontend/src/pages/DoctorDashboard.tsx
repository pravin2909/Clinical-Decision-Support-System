import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthProvider";
import {
  acceptCare,
  listAppointments,
  listCare,
  listDoctorPatients,
  listPrescriptions,
  revokeCare,
} from "../lib/api";
import type { DoctorPatient } from "../lib/api";
import type { Appointment, CareRelationship, Prescription } from "../types";
import { Card, DataTable, MetricCard } from "../components/DashboardWidgets";
import type { TableRow } from "../components/DashboardWidgets";
import { PageShell } from "../components/PageHeader";

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-secondary-100 text-secondary-700 dark:bg-secondary-500/15",
  approved: "bg-accent-100 text-accent-700 dark:bg-accent-500/15",
  completed: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15",
  declined: "bg-rose-50 text-rose-500 dark:bg-rose-500/15",
  cancelled: "bg-black/5 text-muted dark:bg-white/10",
};

const BREAKDOWN: { key: string; label: string; color: string }[] = [
  { key: "completed", label: "Completed", color: "#2a9d59" },
  { key: "approved", label: "Upcoming", color: "#7f77dd" },
  { key: "requested", label: "Requested", color: "#f4a13a" },
  { key: "declined", label: "Declined", color: "#f43f5e" },
];

function firstName(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter((w) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w));
    return (parts[0] || name.trim().split(/\s+/)[0]);
  }
  return email.split("@")[0];
}
function initialsOf(name: string | null, email: string): string {
  return (name || email || "U").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [care, setCare] = useState<CareRelationship[]>([]);
  const [rx, setRx] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCare, setBusyCare] = useState<number | null>(null);

  const loadCare = useCallback(
    () => listCare().then((r) => setCare(r.items)).catch(() => setCare([])),
    [],
  );

  useEffect(() => {
    Promise.all([
      listDoctorPatients().then((r) => setPatients(r.items)).catch(() => setPatients([])),
      listAppointments().then((r) => setAppts(r.items)).catch(() => setAppts([])),
      listPrescriptions().then((r) => setRx(r.items)).catch(() => setRx([])),
      loadCare(),
    ]).finally(() => setLoading(false));
  }, [loadCare]);

  const counts = useMemo(() => {
    const by = (s: string) => appts.filter((a) => a.status === s).length;
    return {
      patients: patients.length,
      requested: by("requested"),
      upcoming: by("approved"),
      completed: by("completed"),
    };
  }, [patients, appts]);

  const breakdown = useMemo(() => {
    const total = appts.length || 1;
    return BREAKDOWN.map((b) => {
      const n = appts.filter((a) => a.status === b.key).length;
      return { ...b, n, pct: Math.round((n / total) * 100) };
    });
  }, [appts]);

  const pendingRequests = useMemo(
    () => care.filter((c) => c.status === "pending"),
    [care],
  );

  const patientNameById = useCallback(
    (id: number) => patients.find((p) => p.patient_id === id)?.name || `Patient #${id}`,
    [patients],
  );

  const act = async (id: number, fn: () => Promise<unknown>) => {
    setBusyCare(id);
    try {
      await fn();
      await loadCare();
      await listDoctorPatients().then((r) => setPatients(r.items)).catch(() => {});
    } finally {
      setBusyCare(null);
    }
  };

  const rows: TableRow[] = appts.slice(0, 6).map((a) => ({
    icon: "event",
    iconColor: "#36b76b",
    name: a.patient_name || `Patient #${a.patient_id}`,
    cols: [
      <span className="text-muted">{a.reason || "—"}</span>,
      <span className={"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + (STATUS_STYLE[a.status] || "")}>
        {a.status}
      </span>,
      <span className="font-normal text-muted">
        {a.scheduled_for
          ? new Date(a.scheduled_for).toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : a.preferred_time || "—"}
      </span>,
    ],
  }));

  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <PageShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.025em] text-content">
            Welcome, Dr. {user ? firstName(user.full_name, user.email) : ""}
          </h1>
          <p className="mt-1 text-[13px] text-muted">Your clinical workspace at a glance.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-content">
          <span className="material-symbols-outlined text-[16px] text-muted">calendar_today</span>
          {today}
        </span>
      </header>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Patients" icon="groups" color="#36b76b" value={String(counts.patients)} delay={0} />
            <MetricCard label="Pending requests" icon="pending_actions" color="#f4a13a" value={String(counts.requested)} delay={50} />
            <MetricCard label="Upcoming visits" icon="event_available" color="#7f77dd" value={String(counts.upcoming)} delay={100} />
            <MetricCard label="Completed" icon="task_alt" color="#2a9d59" value={String(counts.completed)} delay={150} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {/* Recent appointments table */}
            <div className="lg:col-span-2">
              <DataTable
                title="Recent appointments"
                headers={["Patient", "Reason", "Status", "When"]}
                rows={rows}
                action={
                  <Link to="/app/appointments" className="text-xs font-semibold text-accent-600 hover:underline">
                    Manage →
                  </Link>
                }
              />
            </div>

            {/* Patients companion */}
            <Card className="fade-in-up">
              <h3 className="text-sm font-semibold text-content">Your patients</h3>
              <p className="mt-1 text-xs text-muted">
                {patients.length} connected
              </p>
              <div className="mt-4 space-y-3">
                {patients.length === 0 ? (
                  <p className="text-sm text-muted">No patients connected yet.</p>
                ) : (
                  patients.slice(0, 6).map((p) => (
                    <div key={p.patient_id} className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-700">
                        {initialsOf(p.name, p.email || "")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-content">
                        {p.name || `Patient #${p.patient_id}`}
                      </span>
                      <span className="text-[11px] text-muted">{p.consented_scopes.length} shared</span>
                    </div>
                  ))
                )}
              </div>
              <Link
                to="/app/patients"
                className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-accent-600 hover:underline"
              >
                View patients
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </Card>
          </div>

          {/* ───────── Secondary row: requests · prescriptions · breakdown ───────── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {/* Connection requests (actionable) */}
            <Card className="flex flex-col fade-in-up">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-content">Connection requests</h3>
                {pendingRequests.length > 0 && (
                  <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[11px] font-semibold text-secondary-700 dark:bg-secondary-500/15">
                    {pendingRequests.length}
                  </span>
                )}
              </div>
              <div className="mt-4 flex-1 space-y-3">
                {pendingRequests.length === 0 ? (
                  <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-center">
                    <span className="material-symbols-outlined text-[28px] text-muted">how_to_reg</span>
                    <p className="text-sm text-muted">No pending requests.</p>
                  </div>
                ) : (
                  pendingRequests.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface2 p-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-700">
                        {initialsOf(c.patient_name || null, "")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-content">
                          {c.patient_name || `Patient #${c.patient_id}`}
                        </p>
                        <p className="text-[11px] text-muted">wants to connect</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => act(c.id, () => acceptCare(c.id))}
                          disabled={busyCare === c.id}
                          className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => act(c.id, () => revokeCare(c.id))}
                          disabled={busyCare === c.id}
                          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-rose-500 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Recent prescriptions issued */}
            <Card className="flex flex-col fade-in-up">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-content">Recent prescriptions</h3>
                <Link to="/app/patients" className="text-xs font-semibold text-accent-600 hover:underline">
                  Issue →
                </Link>
              </div>
              <div className="mt-4 flex-1 space-y-3">
                {rx.length === 0 ? (
                  <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-center">
                    <span className="material-symbols-outlined text-[28px] text-muted">prescriptions</span>
                    <p className="text-sm text-muted">No prescriptions issued yet.</p>
                  </div>
                ) : (
                  rx.slice(0, 4).map((p) => (
                    <div key={p.id} className="rounded-xl border border-line bg-surface2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-content">{patientNameById(p.patient_id)}</span>
                        <span className="shrink-0 text-[11px] text-muted">{shortDate(p.issued_at)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        {p.items.map((i) => i.drug).filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Appointment breakdown */}
            <Card className="flex flex-col fade-in-up">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-content">Appointment breakdown</h3>
                <span className="text-xs text-muted">{appts.length} total</span>
              </div>
              <div className="mt-4 flex-1 space-y-3.5">
                {appts.length === 0 ? (
                  <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-center">
                    <span className="material-symbols-outlined text-[28px] text-muted">bar_chart</span>
                    <p className="text-sm text-muted">No appointments yet.</p>
                  </div>
                ) : (
                  breakdown.map((b) => (
                    <div key={b.key}>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-1.5 font-medium text-content">
                          <span className="size-2 rounded-full" style={{ background: b.color }} />
                          {b.label}
                        </span>
                        <span className="text-muted">{b.n}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface2">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${b.pct}%`, background: b.color, minWidth: b.n > 0 ? "0.5rem" : 0 }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}
