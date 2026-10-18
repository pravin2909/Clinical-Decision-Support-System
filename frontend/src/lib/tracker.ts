/** Health-tracker API calls (all go through authFetch). */
import { authFetch } from "./auth";

export interface Observation {
  id: number;
  patient_id: number;
  type: string;
  value: Record<string, number>;
  unit: string | null;
  source: string | null;
  recorded_at: string;
}

export interface TrendPoint {
  recorded_at: string;
  value: Record<string, number>;
}

export interface DashboardSummary {
  types: Record<
    string,
    { latest: Observation | null; unit: string | null; trend: TrendPoint[] }
  >;
}

export interface NewObservation {
  type: string;
  value: Record<string, number>;
  unit?: string;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function recordObservation(body: NewObservation): Promise<Observation> {
  const res = await authFetch("/api/v1/observations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not save observation."));
  return res.json();
}

export async function listObservations(type?: string): Promise<{ items: Observation[] }> {
  const q = type ? `?type=${encodeURIComponent(type)}` : "";
  const res = await authFetch(`/api/v1/observations${q}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Could not load observations."));
  return res.json();
}

export async function dashboardSummary(): Promise<DashboardSummary> {
  const res = await authFetch("/api/v1/dashboard/summary");
  if (!res.ok) throw new Error(await errorMessage(res, "Could not load the dashboard."));
  return res.json();
}

/** Human-readable value, e.g. "120/80" for BP or "72.5" for a single metric. */
export function formatValue(value: Record<string, number>): string {
  if (value.systolic != null && value.diastolic != null) {
    return `${value.systolic}/${value.diastolic}`;
  }
  if (value.value != null) return `${value.value}`;
  // Fallback: join whatever keys exist.
  return Object.values(value).join(" / ");
}

/** Numeric series for a sparkline (BP uses systolic). */
export function numericSeries(points: TrendPoint[]): number[] {
  return points.map((p) =>
    p.value.systolic != null ? p.value.systolic : p.value.value ?? 0,
  );
}
