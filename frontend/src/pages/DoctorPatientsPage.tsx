import { useEffect, useMemo, useState } from "react";
import { acceptCare, getPatientSummary, issuePrescription, listCare, listDoctorPatients, revokeCare } from "../lib/api";
import type { DoctorPatient } from "../lib/api";
import type { CareRelationship, MedicationItem } from "../types";
import PageHeader, { PageShell } from "../components/PageHeader";
import Modal from "../components/Modal";

interface Summary {
  observations: Record<string, { latest?: { value: Record<string, number> }; unit?: string }>;
  prescriptions: Array<{ items: Array<{ drug: string; dose?: string | null }>; status: string }>;
}

function fmtValue(v: Record<string, number>): string {
  if ("systolic" in v && "diastolic" in v) return `${v.systolic}/${v.diastolic}`;
  if ("value" in v) return String(v.value);
  return Object.values(v).join(", ");
}
const initials = (name: string | null, email: string | null) =>
  (name || email || "P").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function DoctorPatientsPage() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [care, setCare] = useState<CareRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<DoctorPatient | null>(null);
  const [summaries, setSummaries] = useState<Record<number, Summary | "loading" | "denied">>({});

  // Issue-prescription modal
  const blankMed = (): MedicationItem => ({ drug: "", dose: "", frequency: "", duration: "" });
  const [prescribeFor, setPrescribeFor] = useState<DoctorPatient | null>(null);
  const [rxItems, setRxItems] = useState<MedicationItem[]>([blankMed()]);
  const [rxNotes, setRxNotes] = useState("");
  const [rxBusy, setRxBusy] = useState(false);
  const [rxError, setRxError] = useState<string | null>(null);

  const openPrescribe = (p: DoctorPatient) => {
    setActive(null);
    setPrescribeFor(p);
    setRxItems([blankMed()]);
    setRxNotes("");
    setRxError(null);
  };
  const setMed = (i: number, field: keyof MedicationItem, value: string) =>
    setRxItems((items) => items.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  const submitRx = async () => {
    if (!prescribeFor) return;
    const items = rxItems.filter((m) => m.drug.trim());
    if (items.length === 0) {
      setRxError("Add at least one medication.");
      return;
    }
    setRxBusy(true);
    setRxError(null);
    try {
      await issuePrescription(prescribeFor.patient_id, items, rxNotes.trim() || null);
      setPrescribeFor(null);
    } catch (e) {
      setRxError(e instanceof Error ? e.message : "Could not issue the prescription.");
    } finally {
      setRxBusy(false);
    }
  };

  const reload = () =>
    Promise.all([
      listDoctorPatients().then((r) => setPatients(r.items)).catch(() => setPatients([])),
      listCare().then((r) => setCare(r.items)).catch(() => setCare([])),
    ]);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const act = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const requests = care.filter((c) => c.status === "pending");

  const openPatient = async (p: DoctorPatient) => {
    setActive(p);
    if (!summaries[p.patient_id]) {
      setSummaries((s) => ({ ...s, [p.patient_id]: "loading" }));
      try {
        const data = await getPatientSummary(p.patient_id);
        setSummaries((s) => ({ ...s, [p.patient_id]: data as unknown as Summary }));
      } catch {
        setSummaries((s) => ({ ...s, [p.patient_id]: "denied" }));
      }
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      [p.name, p.email].filter(Boolean).some((s) => s!.toLowerCase().includes(q))
    );
  }, [patients, query]);

  const sum = active ? summaries[active.patient_id] : undefined;
  const obs = sum && sum !== "loading" && sum !== "denied" ? Object.entries(sum.observations || {}) : [];
  const meds =
    sum && sum !== "loading" && sum !== "denied" ? (sum.prescriptions || []).flatMap((rx) => rx.items) : [];

  return (
    <PageShell>
      <PageHeader
        title="Patients"
        subtitle="Patients connected to you, with the data they've shared."
        actions={
          patients.length > 0 ? (
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-muted">search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patients…"
                className="w-56 rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
              />
            </div>
          ) : undefined
        }
      />

      {/* Connection requests (patients asking to connect) */}
      {requests.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Connection requests <span className="text-secondary-600">· {requests.length}</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {requests.map((r) => {
              const fromPatient = r.initiated_by === "patient";
              return (
                <div key={r.id} className="rounded-2xl border border-accent-500/30 bg-accent-500/5 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-500/15 text-sm font-bold text-accent-700">
                      {initials(r.patient_name ?? null, null)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-content">{r.patient_name || `Patient #${r.patient_id}`}</p>
                      <p className="truncate text-xs text-muted">
                        {fromPatient ? "Wants to connect with you" : "Awaiting their acceptance"}
                      </p>
                    </div>
                  </div>
                  {fromPatient ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => act(r.id, () => acceptCare(r.id))}
                        disabled={busy === r.id}
                        className="flex-1 rounded-lg bg-accent-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => act(r.id, () => revokeCare(r.id))}
                        disabled={busy === r.id}
                        className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted transition hover:text-rose-500 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => act(r.id, () => revokeCare(r.id))}
                      disabled={busy === r.id}
                      className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted transition hover:text-rose-500 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />
          ))}
        </div>
      ) : patients.length === 0 && requests.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-12 text-center shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-700">
            <span className="material-symbols-outlined text-3xl">groups</span>
          </span>
          <p className="mt-4 font-semibold text-content">No patients connected yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            When a patient connects with you and accepts, they'll appear here with the records they share.
          </p>
        </div>
      ) : patients.length === 0 ? (
        <p className="py-6 text-sm text-muted">No connected patients yet — accept a request above to get started.</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No patients match “{query}”.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <button
              key={p.patient_id}
              onClick={() => openPatient(p)}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(16,24,40,0.2)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-500/15 text-sm font-bold text-accent-700">
                  {initials(p.name, p.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-content">{p.name || `Patient #${p.patient_id}`}</p>
                  <p className="truncate text-xs text-muted">{p.email || "No email"}</p>
                </div>
                <span className="material-symbols-outlined text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-600">chevron_right</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                {[p.gender, p.date_of_birth].filter(Boolean).join(" · ") || "No profile details"}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/70 pt-3">
                {p.consented_scopes.length === 0 ? (
                  <span className="text-[11px] text-muted">No data shared</span>
                ) : (
                  p.consented_scopes.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface2 px-2 py-0.5 text-[10px] font-semibold capitalize text-muted">
                      <span className="material-symbols-outlined text-[12px]">check</span>
                      {s}
                    </span>
                  ))
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Patient details modal */}
      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        icon={
          active ? (
            <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-500/15 text-sm font-bold text-accent-700">
              {initials(active.name, active.email)}
            </span>
          ) : undefined
        }
        title={active?.name || (active ? `Patient #${active.patient_id}` : "")}
        subtitle={active ? [active.email, active.gender, active.date_of_birth].filter(Boolean).join(" · ") || "No profile details" : ""}
        footer={
          active ? (
            <div className="flex justify-end">
              <button
                onClick={() => openPrescribe(active)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600"
              >
                <span className="material-symbols-outlined text-[18px]">edit_document</span>
                Issue prescription
              </button>
            </div>
          ) : undefined
        }
      >
        {sum === "loading" ? (
          <p className="py-6 text-center text-sm text-muted">Loading summary…</p>
        ) : sum === "denied" || !sum ? (
          <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-rose-500">
            <span className="material-symbols-outlined text-base">lock</span>
            No records consent for this patient — ask them to share “records”.
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">Latest readings</p>
              {obs.length === 0 ? (
                <p className="text-sm text-muted">No observations recorded.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {obs.map(([type, d]) => (
                    <div key={type} className="rounded-xl border border-line bg-surface2/40 p-3">
                      <p className="text-[11px] capitalize text-muted">{type.replace(/_/g, " ")}</p>
                      <p className="mt-0.5 text-lg font-bold tracking-tight text-content">
                        {d.latest ? fmtValue(d.latest.value) : "—"}
                        {d.unit && <span className="ml-1 text-xs font-normal text-muted">{d.unit}</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">Medications</p>
              {meds.length === 0 ? (
                <p className="text-sm text-muted">No prescriptions.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {meds.map((it, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-sm text-content">
                      <span className="material-symbols-outlined text-[16px] text-accent-600">pill</span>
                      {it.drug}
                      {it.dose && <span className="text-xs text-muted">{it.dose}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Issue prescription modal */}
      <Modal
        open={prescribeFor !== null}
        onClose={() => setPrescribeFor(null)}
        icon={
          <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-700">
            <span className="material-symbols-outlined">edit_document</span>
          </span>
        }
        title="Issue prescription"
        subtitle={prescribeFor ? `For ${prescribeFor.name || `Patient #${prescribeFor.patient_id}`}` : ""}
        footer={
          <div className="flex items-center justify-between gap-2">
            {rxError ? (
              <p className="flex items-center gap-1.5 text-sm text-rose-500">
                <span className="material-symbols-outlined text-base">error</span>
                {rxError}
              </p>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setPrescribeFor(null)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:text-content"
              >
                Cancel
              </button>
              <button
                onClick={submitRx}
                disabled={rxBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                {rxBusy ? "Issuing…" : "Issue to patient"}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {rxItems.map((m, i) => (
            <div key={i} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/12 text-accent-600">
                  <span className="material-symbols-outlined text-[16px]">pill</span>
                </span>
                <input
                  value={m.drug}
                  onChange={(e) => setMed(i, "drug", e.target.value)}
                  placeholder="Medication name"
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                />
                {rxItems.length > 1 && (
                  <button
                    onClick={() => setRxItems((items) => items.filter((_, idx) => idx !== i))}
                    aria-label="Remove medication"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface2 hover:text-rose-500"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input value={m.dose ?? ""} onChange={(e) => setMed(i, "dose", e.target.value)} placeholder="Dose (e.g. 500 mg)"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
                <input value={m.frequency ?? ""} onChange={(e) => setMed(i, "frequency", e.target.value)} placeholder="Frequency (e.g. twice daily)"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
                <input value={m.duration ?? ""} onChange={(e) => setMed(i, "duration", e.target.value)} placeholder="Duration (e.g. 30 days)"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
              </div>
            </div>
          ))}
          <button
            onClick={() => setRxItems((items) => [...items, blankMed()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent-500 hover:text-accent-700"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add medication
          </button>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-content">Notes for the patient (optional)</span>
            <textarea
              rows={2}
              value={rxNotes}
              onChange={(e) => setRxNotes(e.target.value)}
              placeholder="e.g. Monitor fasting glucose; review in 4 weeks."
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
            />
          </label>
          <p className="text-xs text-muted">The patient needs to share “records” with you for this to go through.</p>
        </div>
      </Modal>
    </PageShell>
  );
}
