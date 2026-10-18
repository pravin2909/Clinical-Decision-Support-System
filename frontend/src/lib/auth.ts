/**
 * Auth client: token storage + the auth API calls, plus `authFetch`, a wrapper
 * around fetch that attaches the access token and transparently retries once
 * after refreshing when the server returns 401.
 *
 * Tokens live in localStorage (simple for a dev/portfolio app). The access token
 * is sent as a Bearer header; the refresh token is used only to mint a new
 * access token via /auth/refresh.
 */
import { apiUrl } from "./config";

const ACCESS_KEY = "cds.access";
const REFRESH_KEY = "cds.refresh";

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: "patient" | "doctor" | "admin";
  patient_id: number | null;
  doctor_id: number | null;
}

export interface RegisterBody {
  email: string;
  password: string;
  full_name?: string;
  role: "patient" | "doctor";
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setTokens(access: string, refresh?: string | null) {
  try {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    /* ignore (private mode etc.) */
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

export const getAccess = () => read(ACCESS_KEY);
export const getRefresh = () => read(REFRESH_KEY);
export const isAuthed = () => !!getAccess();

/** Pull a human message out of our standard error envelope. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message || data?.detail || fallback;
  } catch {
    return fallback;
  }
}

export async function register(body: RegisterBody): Promise<User> {
  const res = await fetch(apiUrl("/api/v1/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Registration failed."));
  return res.json();
}

export async function login(email: string, password: string): Promise<void> {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);
  const res = await fetch(apiUrl("/api/v1/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Invalid email or password."));
  const data = await res.json();
  setTokens(data.access_token, data.refresh_token);
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefresh();
  if (!refresh) return false;
  const res = await fetch(apiUrl("/api/v1/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return true;
}

export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const withAuth = (): RequestInit => ({
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${getAccess()}` },
  });

  let res = await fetch(apiUrl(path), withAuth());
  if (res.status === 401 && getRefresh()) {
    if (await tryRefresh()) {
      res = await fetch(apiUrl(path), withAuth());
    } else {
      clearTokens();
    }
  }
  return res;
}

export async function me(): Promise<User> {
  const res = await authFetch("/api/v1/auth/me");
  if (!res.ok) throw new Error("Not authenticated.");
  return res.json();
}

export async function logout(): Promise<void> {
  const refresh = getRefresh();
  if (refresh) {
    try {
      await fetch(apiUrl("/api/v1/auth/logout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
    } catch {
      /* best effort */
    }
  }
  clearTokens();
}
