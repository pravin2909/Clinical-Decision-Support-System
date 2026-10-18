import { useEffect, useRef, useState } from "react";
import {
  deletePrescription,
  getDocument,
  listCare,
  listPrescriptions,
  savePrescription,
  uploadDocument,
} from "../lib/api";
import type { CareRelationship, DocumentOut, MedicationItem, Prescription } from "../types";
import PageHeader, { PageShell } from "../components/PageHeader";
import Menu from "../components/Menu";

function MedRow({ m }: { m: MedicationItem }) {
  const schedule = [m.dose, m.frequency, m.duration].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/12 text-accent-600">
        <span className="material-symbols-outlined text-[16px]">medication</span>
      </span>
      <span className="font-medium text-content">{m.drug}</span>
      {schedule && <span className="text-[13px] text-muted">{schedule}</span>}
    </div>
  );
}

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [doctors, setDoctors] = useState<CareRelationship[]>([]);
  const [doc, setDoc] = useState<DocumentOut | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only asked for when OCR did NOT detect the prescriber.
  const [doctorChoice, setDoctorChoice] = useState<string>(""); // "" | "<doctorId>" | "other"
  const [customPrescriber, setCustomPrescriber] = useState("");
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadList = () => listPrescriptions().then((r) => setPrescriptions(r.items)).catch(() => {});

  useEffect(() => {
    loadList();
    listCare().then((r) => setDoctors(r.items.filter((c) => c.status === "active"))).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const onFile = async (file: File) => {
    setError(null);
    setUploading(true);
    setDoc(null);
    setDoctorChoice("");
    setCustomPrescriber("");
    try {
      const created = await uploadDocument(file);
      setDoc(created);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const fresh = await getDocument(created.id);
          setDoc(fresh);
          if (fresh.status === "done" || fresh.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const meds = doc?.parsed?.medications || [];
  const detectedPrescriber = doc?.parsed?.prescriber || null;
  const needsDoctor = !detectedPrescriber; // ask only if OCR didn't find it

  const canSave =
    meds.length > 0 && (!needsDoctor || (doctorChoice && (doctorChoice !== "other" || customPrescriber.trim())));

  const reset = () => {
    setDoc(null);
    setDoctorChoice("");
    setCustomPrescriber("");
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const items = meds.map((m) => ({
        drug: m.drug,
        dose: m.dose ?? null,
        frequency: m.frequency ?? null,
        duration: m.duration ?? null,
      }));
      let doctorId: number | null = null;
      let prescriberName: string | undefined;
      if (detectedPrescriber) {
        prescriberName = detectedPrescriber;
      } else if (doctorChoice === "other") {
        prescriberName = customPrescriber.trim();
      } else if (doctorChoice) {
        doctorId = Number(doctorChoice);
      }
      await savePrescription({ items, doctorId, prescriberName });
      reset();
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const prescriberLabel = (p: Prescription) =>
    p.doctor_name
      ? /^\s*(dr|prof)\.?\s/i.test(p.doctor_name)
        ? p.doctor_name
        : `Dr. ${p.doctor_name}`
      : p.prescriber_name || "Self-added";

  return (
    <PageShell>
      <PageHeader title="Prescriptions" subtitle="Prescriptions from your doctors, plus any you upload from elsewhere." />
      <div className="space-y-6">
        {/* Upload — compact; for storing a copy from an outside doctor */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-4 py-4 transition hover:border-accent-500/60 sm:flex-row sm:text-left"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-700">
            <span className="material-symbols-outlined text-[22px]">upload_file</span>
          </span>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-sm font-semibold text-content">Add a prescription from another doctor</p>
            <p className="text-xs text-muted">Store a copy as PNG / JPG / WEBP / PDF (max 15 MB). We read it automatically.</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="shrink-0 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-content transition hover:border-accent-500 hover:text-accent-700 disabled:opacity-50">
            {uploading ? "Uploading…" : "Choose file"}
          </button>
          {error && <p className="text-[13px] text-rose-500">{error}</p>}
        </div>

        {/* OCR result */}
        {doc && (
          <div className="rounded-2xl border border-line bg-app p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-content">Scanned prescription</span>
              <span className={
                "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                (doc.status === "done" ? "bg-emerald-500/15 text-emerald-600"
                  : doc.status === "failed" ? "bg-rose-500/15 text-rose-500"
                  : "bg-amber-500/15 text-amber-600")
              }>
                {doc.status === "done" ? "read" : doc.status === "failed" ? "failed" : "reading…"}
              </span>
            </div>

            {(doc.status === "queued" || doc.status === "processing") && (
              <p className="text-sm text-muted">Reading your prescription…</p>
            )}

            {doc.status === "failed" && (
              <p className="text-sm text-rose-500">Couldn't read this file. Try a clearer photo or a PDF.</p>
            )}

            {doc.status === "done" && (
              <>
                {meds.length === 0 ? (
                  <p className="text-sm text-rose-500">
                    No medications could be detected in this prescription. Try a clearer photo or a PDF.
                  </p>
                ) : (
                  <>
                    {/* Detected medications (read-only) */}
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Detected medications</p>
                    <div className="rounded-xl border border-line divide-y divide-line px-3">
                      {meds.map((m, i) => <MedRow key={i} m={m} />)}
                    </div>

                    {/* Prescriber: use detected, or ask */}
                    <div className="mt-3">
                      {detectedPrescriber ? (
                        <p className="text-sm text-content">
                          <span className="text-muted">Prescribed by:</span>{" "}
                          <span className="font-medium">{detectedPrescriber}</span>{" "}
                          <span className="text-[12px] text-emerald-600">· detected</span>
                        </p>
                      ) : (
                        <>
                          <p className="mb-1 text-[12px] text-muted">
                            We couldn't find the doctor's name on this prescription — who prescribed it?
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={doctorChoice}
                              onChange={(e) => setDoctorChoice(e.target.value)}
                              className="rounded-lg border border-line bg-app px-2.5 py-1.5 text-sm text-content outline-none focus:border-accent-500"
                            >
                              <option value="">Select a doctor…</option>
                              {doctors.map((d) => (
                                <option key={d.doctor_id} value={String(d.doctor_id)}>
                                  Dr. {d.doctor_name || `#${d.doctor_id}`}
                                </option>
                              ))}
                              <option value="other">Other / external doctor…</option>
                            </select>
                            {doctorChoice === "other" && (
                              <input
                                value={customPrescriber}
                                onChange={(e) => setCustomPrescriber(e.target.value)}
                                placeholder="Doctor / clinic name"
                                className="w-64 rounded-lg border border-line bg-app px-2.5 py-1.5 text-sm text-content outline-none focus:border-accent-500"
                              />
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button onClick={save} disabled={!canSave || saving}
                        className="rounded-lg bg-accent-500/15 px-4 py-1.5 text-sm font-semibold text-accent-700 disabled:opacity-50">
                        {saving ? "Saving…" : "Save to my prescriptions"}
                      </button>
                      <button onClick={reset} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted">Discard</button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Saved prescriptions */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Your prescriptions</h2>
          {prescriptions.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-700">
                <span className="material-symbols-outlined text-2xl">prescriptions</span>
              </span>
              <p className="mt-3 font-semibold text-content">No prescriptions yet</p>
              <p className="mt-1 text-sm text-muted">Upload one above, or get one from your doctor.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {prescriptions.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(16,24,40,0.18)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-700">
                      <span className="material-symbols-outlined">prescriptions</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-content">{prescriberLabel(p)}</p>
                      <p className="truncate text-xs text-muted">
                        {[p.doctor_specialty, p.issued_at ? new Date(p.issued_at).toLocaleDateString() : null]
                          .filter(Boolean)
                          .join(" · ") || "Prescription"}
                      </p>
                    </div>
                    <Menu
                      items={[
                        {
                          label: "Delete",
                          icon: "delete",
                          danger: true,
                          onClick: async () => {
                            if (!confirm("Delete this prescription?")) return;
                            await deletePrescription(p.id).catch(() => {});
                            await loadList();
                          },
                        },
                      ]}
                    />
                  </div>
                  <div className="mt-2.5">
                    <span className={
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " +
                      (p.status === "active" ? "bg-accent-100 text-accent-700 dark:bg-accent-500/15" : "bg-black/5 text-muted dark:bg-white/10")
                    }>
                      <span className={"size-1.5 rounded-full " + (p.status === "active" ? "bg-accent-500" : "bg-muted/50")} />
                      {p.status}
                    </span>
                  </div>
                  <div className="mt-2 divide-y divide-line border-t border-line pt-1">
                    {p.items.map((m, i) => <MedRow key={i} m={m} />)}
                  </div>
                  {p.notes && (
                    <span className="mt-2 inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-surface2 px-3 py-1.5 text-[12px] text-content">
                      <span className="material-symbols-outlined text-[14px] text-muted">sticky_note_2</span>
                      {p.notes}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
