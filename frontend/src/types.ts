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

// Server-Sent Event payloads emitted by the /analyze/*/stream endpoints
export type StreamEvent =
  | { type: "classification"; routing: RoutingResult; classification: ClassificationResult }
  | { type: "text_start"; symptoms: string }
  | { type: "audio_start"; transcription: string }
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

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
