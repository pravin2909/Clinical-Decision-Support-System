/**
 * API base URL. The backend is a separate service; point the frontend at it
 * with VITE_API_BASE_URL (e.g. "http://localhost:8000"). Falls back to
 * same-origin ("") so a combined/proxied deployment still works.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

/** Build an absolute API URL from a root-relative path like "/health". */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
