import { useState } from "react";
import { authFetch } from "../lib/auth";

/** A single scope's grant/revoke toggle for a given doctor. */
export default function ConsentToggle({
  doctorId,
  scope,
  granted,
  onChange,
}: {
  doctorId: number;
  scope: "records" | "images" | "chat";
  granted: boolean;
  onChange?: (granted: boolean) => void;
}) {
  const [on, setOn] = useState(granted);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await authFetch(`/api/v1/consents?doctor_id=${doctorId}&scope=${scope}`, { method: "DELETE" });
      } else {
        await authFetch("/api/v1/consents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doctor_id: doctorId, scope }),
        });
      }
      setOn(!on);
      onChange?.(!on);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      className={
        "inline-flex items-center gap-2.5 rounded-full border bg-surface px-3 py-1.5 text-xs font-medium capitalize transition " +
        (on ? "border-accent-500/60 text-content" : "border-line text-muted hover:text-content") +
        (busy ? " opacity-50" : "")
      }
    >
      {/* switch */}
      <span
        className={
          "relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors " +
          (on ? "bg-accent-500" : "bg-surface2 ring-1 ring-inset ring-line")
        }
      >
        <span
          className={
            "absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all " +
            (on ? "left-[14px]" : "left-0.5")
          }
        />
      </span>
      {scope}
    </button>
  );
}
