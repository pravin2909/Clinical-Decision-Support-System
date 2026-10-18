import { useEffect, useState } from "react";
import {
  acceptCare,
  cancelAppointment,
  listAppointments,
  listCare,
  listDoctorDirectory,
  requestAppointment,
  requestCare,
  revokeCare,
} from "../lib/api";
import type { Appointment, CareRelationship, DoctorDirectoryItem } from "../types";
import PageHeader, { PageShell } from "../components/PageHeader";
import ConsentToggle from "../components/ConsentToggle";
import Modal from "../components/Modal";

const SCOPES: Array<"records" | "images" | "chat"> = ["records", "images", "chat"];

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-secondary-100 text-secondary-700 dark:bg-secondary-500/15",
  approved: "bg-accent-100 text-accent-700 dark:bg-accent-500/15",
  completed: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15",
  declined: "bg-rose-50 text-rose-500 dark:bg-rose-500/15",
  cancelled: "bg-black/5 text-muted dark:bg-white/10",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + (STATUS_STYLE[status] || "")}>
      {status}
    </span>
  );
}

function docInitials(name: string | null | undefined): string {
  const clean = (name || "").trim().split(/\s+/).filter((w) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w));
  const src = clean.length ? clean : (name || "Dr").trim().split(/\s+/);
  return src.map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "DR";
}

function DocAvatar({ name }: { name: string | null | undefined }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-500/15 text-sm font-bold text-accent-700">
      {docInitials(name)}
    </span>
  );
}

export default function DoctorsPage() {
  const [tab, setTab] = useState<"care" | "find">("care");
  const [care, setCare] = useState<CareRelationship[]>([]);
  const [directory, setDirectory] = useState<DoctorDirectoryItem[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  // Booking form state
  const [bookingDoctor, setBookingDoctor] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [preferred, setPreferred] = useState("");

  // Doctor profile modal (opened from "Find doctors" before requesting).
  const [profileDoctor, setProfileDoctor] = useState<DoctorDirectoryItem | null>(null);

  const load = async () => {
    const [c, d, a] = await Promise.all([
      listCare().catch(() => ({ items: [] })),
      listDoctorDirectory().catch(() => ({ items: [] })),
      listAppointments().catch(() => ({ items: [] })),
    ]);
    setCare(c.items);
    setDirectory(d.items);
    setAppts(a.items);
  };
  useEffect(() => {
    load();
  }, []);

  const connectedIds = new Set(care.filter((r) => r.status !== "revoked").map((r) => r.doctor_id));
  const activeCare = care.filter((r) => r.status === "active");
  const pendingCare = care.filter((r) => r.status === "pending");
  const available = directory.filter((d) => !connectedIds.has(d.doctor_id));

  const wrap = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await load();
    } finally {
      setBusy(null);
    }
  };

  const closeBooking = () => {
    setBookingDoctor(null);
    setReason("");
    setPreferred("");
  };

  const submitBooking = async (doctorId: number) => {
    if (!reason.trim()) return;
    const when = preferred ? new Date(preferred).toLocaleString() : undefined;
    await wrap(doctorId, () => requestAppointment(doctorId, reason.trim(), when));
    closeBooking();
  };

  const TabBtn = ({ id, label }: { id: "care" | "find"; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={
        "rounded-lg px-4 py-2 text-sm font-semibold transition " +
        (tab === id
          ? "bg-accent-500 text-white"
          : "border border-line text-content hover:bg-surface2")
      }
    >
      {label}
    </button>
  );

  return (
    <PageShell>
      <PageHeader title="Doctors & appointments" subtitle="Connect with a doctor, book visits, and control what you share." />
      <div className="space-y-6">
        <div className="flex gap-2">
          <TabBtn id="care" label="My care" />
          <TabBtn id="find" label="Find doctors" />
        </div>

        {tab === "care" && (
          <>
            {/* Connected doctors */}
            {activeCare.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-700">
                  <span className="material-symbols-outlined text-2xl">stethoscope</span>
                </span>
                <p className="mt-3 font-semibold text-content">No connected doctors yet</p>
                <p className="mt-1 text-sm text-muted">
                  Switch to <b>Find doctors</b> to connect and start sharing.
                </p>
                <button
                  onClick={() => setTab("find")}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600"
                >
                  Find doctors
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
              {activeCare.map((r) => (
                <div key={r.id} className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                  <div className="flex items-center gap-3">
                    <DocAvatar name={r.doctor_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-content">{r.doctor_name || `Doctor #${r.doctor_id}`}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                        {r.doctor_specialty || "General"}
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-700 dark:bg-accent-500/15">
                          <span className="size-1.5 rounded-full bg-accent-500" /> connected
                        </span>
                      </p>
                    </div>
                  </div>

                  {bookingDoctor === r.doctor_id && (
                    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-content">Book an appointment</p>
                        <button
                          onClick={closeBooking}
                          aria-label="Close"
                          className="inline-flex size-7 items-center justify-center rounded-full text-muted transition hover:bg-surface2 hover:text-content"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      </div>
                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-content">Reason for the visit</span>
                          <textarea
                            rows={2}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Follow-up on blood pressure"
                            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-content">Preferred date &amp; time <span className="font-normal text-muted">(optional)</span></span>
                          <input
                            type="datetime-local"
                            value={preferred}
                            onChange={(e) => setPreferred(e.target.value)}
                            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => submitBooking(r.doctor_id)}
                          disabled={!reason.trim() || busy === r.doctor_id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-muted"
                        >
                          <span className="material-symbols-outlined text-[18px]">send</span>
                          Send request
                        </button>
                        <button
                          onClick={closeBooking}
                          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:text-content"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
                    <button
                      onClick={() => setBookingDoctor(bookingDoctor === r.doctor_id ? null : r.doctor_id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-600"
                    >
                      <span className="material-symbols-outlined text-[16px]">event</span>
                      Book appointment
                    </button>
                    <button
                      onClick={() => wrap(r.id, () => revokeCare(r.id))}
                      disabled={busy === r.id}
                      className="ml-auto rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-rose-300 hover:text-rose-500 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </div>

                  <div className="mt-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
                      Sharing with {r.doctor_name || "this doctor"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SCOPES.map((scope) => (
                        <ConsentToggle
                          key={scope}
                          doctorId={r.doctor_id}
                          scope={scope}
                          granted={r.consented_scopes.includes(scope)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            )}

            {/* Pending care */}
            {pendingCare.map((r) => (
              <div key={r.id} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                <DocAvatar name={r.doctor_name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-content">
                    {r.doctor_name || `Doctor #${r.doctor_id}`}
                    <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[10px] font-semibold text-secondary-700 dark:bg-secondary-500/15">pending</span>
                  </p>
                  <p className="text-[12px] text-muted">
                    {r.initiated_by === "doctor" ? "Wants to connect with you" : "Awaiting doctor's acceptance"}
                  </p>
                </div>
                {r.initiated_by === "doctor" ? (
                  <button onClick={() => wrap(r.id, () => acceptCare(r.id))} disabled={busy === r.id}
                    className="rounded-lg bg-accent-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50">
                    Accept
                  </button>
                ) : (
                  <button onClick={() => wrap(r.id, () => revokeCare(r.id))} disabled={busy === r.id}
                    className="rounded-lg border border-line px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:text-rose-500 disabled:opacity-50">
                    Cancel
                  </button>
                )}
              </div>
            ))}

            {/* Appointments */}
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Your appointments</h2>
              {appts.length === 0 ? (
                <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                  No appointments yet. Book one with a connected doctor above.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {appts.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/12 text-accent-600">
                        <span className="material-symbols-outlined text-[22px]">event</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-content">{a.doctor_name || `Doctor #${a.doctor_id}`}</span>
                          <Badge status={a.status} />
                        </div>
                        {a.reason && <p className="mt-0.5 text-[13px] text-content">{a.reason}</p>}
                        <p className="mt-0.5 text-[12px] text-muted">
                          {a.scheduled_for
                            ? `Scheduled: ${new Date(a.scheduled_for).toLocaleString()}`
                            : a.preferred_time
                              ? `Preferred: ${a.preferred_time}`
                              : ""}
                        </p>
                        {a.doctor_notes && (
                          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface2 px-3 py-1.5 text-[12px] text-content">
                            <span className="material-symbols-outlined text-[14px] text-muted">sticky_note_2</span>
                            {a.doctor_notes}
                          </span>
                        )}
                        {(a.status === "requested" || a.status === "approved") && (
                          <button onClick={() => wrap(a.id, () => cancelAppointment(a.id))} disabled={busy === a.id}
                            className="mt-2 rounded-lg border border-line px-3 py-1 text-[12px] font-semibold text-muted transition hover:text-rose-500 disabled:opacity-50">
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === "find" && (
          <div>
            {available.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                No other doctors available right now.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {available.map((d) => (
                  <button
                    key={d.doctor_id}
                    onClick={() => setProfileDoctor(d)}
                    className="group flex flex-col rounded-2xl border border-line bg-surface p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(16,24,40,0.2)]"
                  >
                    <div className="flex items-center gap-3">
                      <DocAvatar name={d.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-content">{d.name || `Doctor #${d.doctor_id}`}</p>
                        <p className="truncate text-[12px] text-muted">
                          {d.specialty || "General"}
                          {d.years_experience ? ` · ${d.years_experience} yrs exp` : ""}
                        </p>
                      </div>
                      <span className="material-symbols-outlined text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-600">chevron_right</span>
                    </div>
                    {d.bio && <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted">{d.bio}</p>}
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-600">
                      View profile
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Doctor profile (open before requesting a connection) */}
      <Modal
        open={profileDoctor !== null}
        onClose={() => setProfileDoctor(null)}
        icon={profileDoctor ? <DocAvatar name={profileDoctor.name} /> : undefined}
        title={profileDoctor?.name || (profileDoctor ? `Doctor #${profileDoctor.doctor_id}` : "")}
        subtitle={
          profileDoctor
            ? [profileDoctor.specialty || "General", profileDoctor.years_experience ? `${profileDoctor.years_experience} yrs experience` : null]
                .filter(Boolean)
                .join(" · ")
            : ""
        }
        footer={
          profileDoctor ? (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setProfileDoctor(null)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:text-content"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  const id = profileDoctor.doctor_id;
                  setProfileDoctor(null);
                  await wrap(id, () => requestCare(id));
                }}
                disabled={busy === profileDoctor.doctor_id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                Request connection
              </button>
            </div>
          ) : undefined
        }
      >
        {profileDoctor && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-content">
              {profileDoctor.bio || "This doctor hasn't added a profile description yet."}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface2/40 px-2.5 py-1.5 text-xs text-content">
                <span className="material-symbols-outlined text-[16px] text-accent-600">medical_services</span>
                {profileDoctor.specialty || "General"}
              </span>
              {profileDoctor.years_experience ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface2/40 px-2.5 py-1.5 text-xs text-content">
                  <span className="material-symbols-outlined text-[16px] text-accent-600">workspace_premium</span>
                  {profileDoctor.years_experience} years experience
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              After you connect and the doctor accepts, you can book visits and choose what to share.
            </p>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
