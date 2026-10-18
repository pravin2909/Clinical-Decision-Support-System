// API response shapes (mirror the FastAPI backend)

export interface HealthResponse {
  status: string;
  models_loaded: boolean;
  llm_available: boolean;
  llm_model: string;
  llm_base_url: string;
  device: string;
}


export interface RoutingResult {
  domain: string;
  confidence: number;
  all_probabilities: Record<string, number>;
}

export interface ClassificationResult {
  disease: string;
  raw_class: string;
  confidence: number;
  all_probabilities: Record<string, number>;
}

export interface Source {
  title: string;
  authors: string;
  journal: string;
  year: string;
  abstract: string;
  url: string | null;
}

// Server-Sent Event payloads emitted by the /analyze/*/stream endpoints
export type StreamEvent =
  | { type: "classification"; routing: RoutingResult; classification: ClassificationResult }
  | { type: "text_start"; symptoms: string }
  | { type: "audio_start"; transcription: string }
  | { type: "sources"; sources: Source[] }
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

// --- Agentic chat (/api/v1/chat/messages) ---
export interface Citation {
  title?: string | null;
  url?: string | null;
}

export interface PrescriptionDraft {
  patient_id: number;
  items: MedicationItem[];
  notes?: string | null;
}

export type AgentStreamEvent =
  | { type: "start"; conversation_id: number }
  | { type: "status"; phase: string; tool?: string }
  | { type: "token"; content: string }
  | { type: "citation"; title?: string; url?: string }
  | { type: "confirm"; action: string; payload: PrescriptionDraft }
  | { type: "done"; conversation_id: number; citations?: Citation[] }
  | { type: "error"; message: string };

export interface MessageContact {
  id: number; // the other party's profile id (doctor_id or patient_id)
  name: string | null;
  role: "doctor" | "patient";
  specialty: string | null;
  last_message: string | null;
}

export interface ThreadMessage {
  id: number;
  patient_id: number;
  doctor_id: number;
  sender_role: "patient" | "doctor";
  body: string;
  created_at: string | null;
}

export interface ConversationSummary {
  id: number;
  role_context: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChatMessage {
  id: number;
  role: string;
  content: string | null;
  tool_calls: string[] | null;
  citations: Citation[] | null;
  created_at: string | null;
}

export interface MedicationItem {
  drug: string;
  dose?: string | null;
  frequency?: string | null;
  duration?: string | null;
}

export interface DocumentOut {
  id: number;
  patient_id: number;
  type: string;
  status: "queued" | "processing" | "done" | "failed";
  extracted_text: string | null;
  parsed: { medications?: MedicationItem[]; prescriber?: string | null } | null;
  created_at: string | null;
}

export interface Prescription {
  id: number;
  patient_id: number;
  doctor_id: number | null;
  doctor_name?: string | null;
  doctor_specialty?: string | null;
  prescriber_name?: string | null;
  items: MedicationItem[];
  notes: string | null;
  status: string;
  issued_at: string | null;
}

export interface CareRelationship {
  id: number;
  patient_id: number;
  doctor_id: number;
  status: "pending" | "active" | "revoked";
  initiated_by: string;
  doctor_name?: string | null;
  doctor_specialty?: string | null;
  patient_name?: string | null;
  consented_scopes: string[];
}

export interface DoctorDirectoryItem {
  doctor_id: number;
  name: string | null;
  specialty: string | null;
  bio?: string | null;
  years_experience?: number | null;
}

export type AppointmentStatus =
  | "requested"
  | "approved"
  | "declined"
  | "cancelled"
  | "completed";

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  reason: string | null;
  preferred_time: string | null;
  scheduled_for: string | null;
  status: AppointmentStatus;
  doctor_notes: string | null;
  doctor_name?: string | null;
  doctor_specialty?: string | null;
  patient_name?: string | null;
  created_at: string | null;
}

// --- UI pipeline state ---

export type NodeStatus = "idle" | "active" | "done";
export type InputType = "image" | "text" | "voice";
export type LiveStatus = "ready" | "scanning" | "complete";
export type ProgressColor = "blue" | "emerald" | "red";
export type ConfidenceTier = "high" | "moderate" | "low" | null;

export interface NodeState {
  status: NodeStatus;
  text: string;
  /** render the label in an accent color (used after classification) */
  accent?: "blue" | "emerald" | null;
  /** for the LLM node, use emerald styling when active instead of blue */
  emerald?: boolean;
  /** show a spinning icon (work in progress) */
  spinning?: boolean;
}

export interface PipelineState {
  // image hero
  liveStatus: LiveStatus;
  statusText: string;
  scanning: boolean;

  // reasoning nodes
  router: NodeState;
  vit: NodeState;
  llm: NodeState;
  routeLine1Active: boolean;
  routeLine2Active: boolean;

  // progress bar
  progress: number;
  progressColor: ProgressColor;
  progressPulse: boolean;
  progressLabel: string;
  progressText: string;

  // stats
  confidence: string;
  confidenceTier: ConfidenceTier;
  inferenceTime: string;
  domain: string;

  // report
  reportVisible: boolean;
  report: string;
  transcription: string | null;
}
