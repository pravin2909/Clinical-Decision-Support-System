import { useEffect, useState } from "react";
import {
  approveAppointment,
  cancelAppointment,
  completeAppointment,
  declineAppointment,
  listAppointments,
} from "../lib/api";
import type { Appointment } from "../types";
import PageHeader, { PageShell } from "../components/PageHeader";

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-secondary-100 text-secondary-700 dark:bg-secondary-500/15",
  approved: "bg-accent-100 text-accent-700 dark:bg-accent-500/15",
  completed: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15",
  declined: "bg-rose-50 text-rose-500 dark:bg-rose-500/15",
  cancelled: "bg-black/5 text-muted dark:bg-white/10",
};

const sectionLabel = "mb-3 text-xs font-semibold uppercase tracking-widest text-muted";

const initials = (name: string | null | undefined, id: number) =>
  (name || `P${id}`).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/* Hoisted to module scope so typing in the inline forms doesn't remount inputs. */
function ApptCard({ a, children }: { a: Appointment; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-xs font-bold text-accent-700">
          {initials(a.patient_name, a.patient_id)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-content">{a.patient_name || `Patient #${a.patient_id}`}</span>
            <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + (STATUS_STYLE[a.status] || "")}>
              {a.status}
            </span>
          </div>
          {a.reason && <p className="mt-0.5 text-[13px] text-content">{a.reason}</p>}
          <div className="mt-1 space-y-0.5">
            {a.preferred_time && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                Preferred: {a.preferred_time}
              </p>
            )}
            {a.scheduled_for && (
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-accent-700">
                <span className="material-symbols-outlined text-[14px]">event_available</span>
                {new Date(a.scheduled_for).toLocaleString()}
              </p>
            )}
          </div>
          {a.doctor_notes && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface2 px-3 py-1.5 text-[12px] text-content">
              <span className="material-symbols-outlined text-[14px] text-muted">sticky_note_2</span>
              {a.doctor_notes}
            </span>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export default function DoctorAppointmentsPage() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [approving, setApproving] = useState<number | null>(null);
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");

  const load = () => listAppointments().then((r) => setAppts(r.items)).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const wrap = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await load();
    } finally {
      setBusy(null);
    }
  };

  const confirmApprove = async (id: number) => {
    await wrap(id, () => approveAppointment(id, when ? new Date(when).toISOString() : undefined, notes || undefined));
    setApproving(null);
    setWhen("");
    setNotes("");
  };

  const requests = appts.filter((a) => a.status === "requested");
  const upcoming = appts.filter((a) => a.status === "approved");
  const past = appts.filter((a) => ["completed", "declined", "cancelled"].includes(a.status));

  return (
    <PageShell>
      <PageHeader title="Appointments" subtitle="Review visit requests from your patients and schedule them." />
      <div className="space-y-6">
        <section>
          <h2 className={sectionLabel}>
            Requests {requests.length > 0 && <span className="text-secondary-600">· {requests.length}</span>}
          </h2>
          {requests.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted shadow-[0_1px_2px_rgba(16,24,40,0.05)]">No pending requests.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {requests.map((a) => (
                <ApptCard key={a.id} a={a}>
                  {approving === a.id ? (
                    <div className="mt-3 space-y-3 rounded-xl border border-line bg-surface2 p-3.5">
                      <p className="text-xs font-semibold text-content">Schedule this visit</p>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-muted">Date &amp; time</span>
                        <input
                          type="datetime-local"
                          value={when}
                          onChange={(e) => setWhen(e.target.value)}
                          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-muted">Note to patient (optional)</span>
                        <input
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="e.g. Please arrive 10 minutes early"
                          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                        />
                      </label>
                      <div className="flex gap-2 pt-0.5">
                        <button onClick={() => confirmApprove(a.id)} disabled={busy === a.id}
                          className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50">
                          Confirm &amp; schedule
                        </button>
                        <button onClick={() => setApproving(null)}
                          className="rounded-lg border border-line px-4 py-2 text-xs font-semibold text-muted transition hover:text-content">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex gap-2">
                      <button onClick={() => { setApproving(a.id); setWhen(""); setNotes(""); }}
                        className="rounded-lg bg-accent-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-600">
                        Approve
                      </button>
                      <button onClick={() => wrap(a.id, () => declineAppointment(a.id))} disabled={busy === a.id}
                        className="rounded-lg border border-line px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:text-rose-500 disabled:opacity-50">
                        Decline
                      </button>
                    </div>
                  )}
                </ApptCard>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className={sectionLabel}>Upcoming {upcoming.length > 0 && <span className="text-accent-600">· {upcoming.length}</span>}</h2>
          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted shadow-[0_1px_2px_rgba(16,24,40,0.05)]">No scheduled visits.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {upcoming.map((a) => (
                <ApptCard key={a.id} a={a}>
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => wrap(a.id, () => completeAppointment(a.id))} disabled={busy === a.id}
                      className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50">
                      Mark completed
                    </button>
                    <button onClick={() => wrap(a.id, () => cancelAppointment(a.id))} disabled={busy === a.id}
                      className="rounded-lg border border-line px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:text-rose-500 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </ApptCard>
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className={sectionLabel}>Past</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {past.map((a) => <ApptCard key={a.id} a={a} />)}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
