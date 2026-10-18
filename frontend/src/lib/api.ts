import type {
  AgentStreamEvent,
  Appointment,
  CareRelationship,
  ConversationSummary,
  DoctorDirectoryItem,
  DocumentOut,
  MedicationItem,
  MessageContact,
  Prescription,
  StreamEvent,
  ThreadMessage,
} from "../types";
import { apiUrl } from "./config";
import { authFetch } from "./auth";

/**
 * Parse a fetch Response body as Server-Sent Events, yielding each parsed
 * `data:` payload. Matches the backend format: `data: {json}\n\n`.
 */
export async function* streamSSE(res: Response): AsyncGenerator<StreamEvent> {
  if (!res.body) throw new Error("No response body to stream.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      if (!chunk.startsWith("data: ")) continue;
      const dataStr = chunk.slice(6);
      if (!dataStr) continue;
      try {
        yield JSON.parse(dataStr) as StreamEvent;
      } catch {
        // ignore malformed lines
      }
    }
  }
}

async function postStream(path: string, body: BodyInit, headers?: HeadersInit): Promise<Response> {
  const res = await fetch(apiUrl(path), { method: "POST", body, headers });
  if (!res.ok) throw new Error("Server error: " + res.statusText);
  return res;
}

export function analyzeImageStream(file: File): Promise<Response> {
  const form = new FormData();
  form.append("file", file);
  return postStream("/analyze/image/stream", form);
}

export function analyzeTextStream(
  symptoms: string,
  history?: Array<{ role: string; content: string }>,
): Promise<Response> {
  const body = new URLSearchParams();
  body.append("symptoms", symptoms);
  if (history && history.length > 0) {
    body.append("history", JSON.stringify(history));
  }
  return postStream("/analyze/text/stream", body, {
    "Content-Type": "application/x-www-form-urlencoded",
  });
}

export function analyzeAudioStream(audio: Blob): Promise<Response> {
  const form = new FormData();
  form.append("file", audio, "recording.wav");
  return postStream("/analyze/audio/stream", form);
}

export function analyzeDoctorStream(
  question: string,
  history?: Array<{ role: string; content: string }>,
): Promise<Response> {
  const body = new URLSearchParams();
  body.append("question", question);
  if (history && history.length > 0) {
    body.append("history", JSON.stringify(history));
  }
  return postStream("/analyze/doctor/stream", body, {
    "Content-Type": "application/x-www-form-urlencoded",
  });
}

/* ───────────────────────── Agentic chat (server-side memory) ───────────────────────── */

/**
 * Parse an authenticated SSE stream as AgentStreamEvents. Unlike the legacy
 * analyze streams, this is driven through authFetch (so the bearer token is
 * attached) and the client sends only conversation_id — history lives on the
 * server, which is what keeps follow-up questions in context.
 */
export async function* sendChatMessage(
  message: string,
  conversationId?: number | null,
): AsyncGenerator<AgentStreamEvent> {
  const res = await authFetch("/api/v1/chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId ?? null }),
  });
  if (!res.ok) {
    if (res.status === 429) {
      const retry = res.headers.get("retry-after") || "a few";
      throw new Error(`Too many requests — please wait ${retry}s and try again.`);
    }
    throw new Error(`Chat failed: ${res.status} ${res.statusText}`);
  }
  if (!res.body) throw new Error("No response body to stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      if (!chunk.startsWith("data: ")) continue;
      const dataStr = chunk.slice(6);
      if (!dataStr) continue;
      try {
        yield JSON.parse(dataStr) as AgentStreamEvent;
      } catch {
        /* ignore malformed */
      }
    }
  }
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await authFetch(path);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const listConversations = () =>
  getJSON<{ items: ConversationSummary[] }>("/api/v1/chat/conversations");

export const getConversation = (id: number) =>
  getJSON<ConversationSummary & { messages: unknown[] }>(`/api/v1/chat/conversations/${id}`);

export async function deleteConversation(id: number): Promise<void> {
  await authFetch(`/api/v1/chat/conversations/${id}`, { method: "DELETE" });
}

export interface ImageAnalysis {
  routing?: { domain: string; confidence: number };
  classification?: { disease: string; confidence: number; uncertain?: boolean };
  report?: string;
  error?: string;
}

export async function analyzeImageJSON(file: File): Promise<ImageAnalysis> {
  const form = new FormData();
  form.append("file", file);
  const res = await authFetch("/analyze/image", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Image analysis failed: ${res.status}`);
  return res.json();
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "recording.wav");
  const res = await authFetch("/analyze/transcribe", { method: "POST", body: form });
  if (!res.ok) {
    const m = await res.json().catch(() => null);
    throw new Error(m?.error?.message || "Could not transcribe audio.");
  }
  const data = await res.json();
  return data.text || "";
}

export const listPrescriptions = () =>
  getJSON<{ items: Prescription[] }>("/api/v1/prescriptions");

export async function uploadDocument(file: File): Promise<DocumentOut> {
  const form = new FormData();
  form.append("file", file);
  const res = await authFetch("/api/v1/documents", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export const getDocument = (id: number) => getJSON<DocumentOut>(`/api/v1/documents/${id}`);

export async function deletePrescription(id: number): Promise<void> {
  const res = await authFetch(`/api/v1/prescriptions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export const savePrescription = (opts: {
  items: Array<{ drug: string; dose?: string | null; frequency?: string | null; duration?: string | null }>;
  doctorId?: number | null;
  prescriberName?: string;
  notes?: string;
}) =>
  postJSON<Prescription>("/api/v1/prescriptions", {
    items: opts.items,
    doctor_id: opts.doctorId ?? null,
    prescriber_name: opts.prescriberName || null,
    notes: opts.notes || null,
  });

/* ───────────────────────── Care relationships / doctor directory ───────────────────────── */

export const listCare = () => getJSON<{ items: CareRelationship[] }>("/api/v1/care");

export const listDoctorDirectory = () =>
  getJSON<{ items: DoctorDirectoryItem[] }>("/api/v1/care/doctors");

export async function requestCare(targetId: number): Promise<CareRelationship> {
  const res = await authFetch("/api/v1/care/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_id: targetId }),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export async function acceptCare(relationshipId: number): Promise<CareRelationship> {
  const res = await authFetch(`/api/v1/care/requests/${relationshipId}/accept`, { method: "POST" });
  if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
  return res.json();
}

export async function revokeCare(relationshipId: number): Promise<void> {
  await authFetch(`/api/v1/care/${relationshipId}`, { method: "DELETE" });
}

/* ───────────────────────── Appointments ───────────────────────── */

export const listAppointments = (status?: string) =>
  getJSON<{ items: Appointment[] }>(`/api/v1/appointments${status ? `?status=${status}` : ""}`);

export const appointmentsPendingCount = () =>
  getJSON<{ count: number }>("/api/v1/appointments/pending-count");

/* ───────────────────────── Doctor → patients ───────────────────────── */

export interface DoctorPatient {
  patient_id: number;
  name: string | null;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  consented_scopes: string[];
}

export const listDoctorPatients = () =>
  getJSON<{ items: DoctorPatient[] }>("/api/v1/doctor/patients");

export const getPatientSummary = (patientId: number) =>
  getJSON<{
    profile: Record<string, unknown>;
    observations: Record<string, { latest?: { value: Record<string, number> }; unit?: string }>;
    prescriptions: Prescription[];
    image_cases: unknown[];
  }>(`/api/v1/doctor/patients/${patientId}/summary`);

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await authFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => null);
    throw new Error(msg?.error?.message || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const requestAppointment = (doctorId: number, reason: string, preferredTime?: string) =>
  postJSON<Appointment>("/api/v1/appointments", {
    doctor_id: doctorId,
    reason,
    preferred_time: preferredTime || null,
  });

export const approveAppointment = (id: number, scheduledFor?: string, notes?: string) =>
  postJSON<Appointment>(`/api/v1/appointments/${id}/approve`, {
    scheduled_for: scheduledFor || null,
    notes: notes || null,
  });

export const declineAppointment = (id: number, notes?: string) =>
  postJSON<Appointment>(`/api/v1/appointments/${id}/decline`, { notes: notes || null });

export const completeAppointment = (id: number, notes?: string) =>
  postJSON<Appointment>(`/api/v1/appointments/${id}/complete`, { notes: notes || null });

export const cancelAppointment = (id: number) =>
  postJSON<Appointment>(`/api/v1/appointments/${id}/cancel`);

/* ───────────────────────── Messaging ───────────────────────── */

export const listMessageContacts = () =>
  getJSON<{ items: MessageContact[] }>("/api/v1/messages/contacts");

export const getThread = (otherId: number, after?: number) =>
  getJSON<{ items: ThreadMessage[] }>(
    `/api/v1/messages/thread/${otherId}${after ? `?after=${after}` : ""}`,
  );

export const sendMessage = (toId: number, body: string) =>
  postJSON<ThreadMessage>("/api/v1/messages", { to_id: toId, body });

/* Doctor issues a prescription from an agent draft (consent-gated server-side). */
export const issuePrescription = (
  patientId: number,
  items: MedicationItem[],
  notes?: string | null,
) =>
  postJSON<Prescription>("/api/v1/prescriptions", {
    patient_id: patientId,
    items,
    notes: notes || null,
  });
