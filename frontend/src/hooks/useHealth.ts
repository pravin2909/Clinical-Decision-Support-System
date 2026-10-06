import { useEffect, useState } from "react";
import type { HealthResponse } from "../types";

/** Polls the backend /health endpoint for live system status. */
export function useHealth(intervalMs = 15000) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/health");
        const data = (await res.json()) as HealthResponse;
        if (active) setHealth(data);
      } catch {
        if (active) setHealth(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, intervalMs);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return { health, loading };
}
