import type { StreamEvent } from "../types";
import { apiUrl } from "./config";

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

export function analyzeTextStream(symptoms: string): Promise<Response> {
  const body = new URLSearchParams();
  body.append("symptoms", symptoms);
  return postStream("/analyze/text/stream", body, {
    "Content-Type": "application/x-www-form-urlencoded",
  });
}

export function analyzeAudioStream(audio: Blob): Promise<Response> {
  const form = new FormData();
  form.append("file", audio, "recording.wav");
  return postStream("/analyze/audio/stream", form);
}

export function analyzeDoctorStream(question: string): Promise<Response> {
  const body = new URLSearchParams();
  body.append("question", question);
  return postStream("/analyze/doctor/stream", body, {
    "Content-Type": "application/x-www-form-urlencoded",
  });
}
