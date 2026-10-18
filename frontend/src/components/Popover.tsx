import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** A small click-to-open popover with a labeled button trigger. Closes on
 *  outside click / Esc. Used to tuck away controls (e.g. sharing toggles). */
export default function Popover({
  label,
  icon,
  children,
  align = "left",
  width = "w-64",
}: {
  label: string;
  icon?: string;
  children: ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition " +
          (open ? "border-accent-500 bg-accent-500/10 text-accent-700" : "border-line text-content hover:bg-surface2")
        }
      >
        {icon && <span className="material-symbols-outlined text-[16px]">{icon}</span>}
        {label}
        <span className={"material-symbols-outlined text-[16px] text-muted transition-transform " + (open ? "rotate-180" : "")}>
          expand_more
        </span>
      </button>
      {open && (
        <div
          className={
            "animate-fade-in absolute z-30 mt-1.5 rounded-xl border border-line bg-surface p-3 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)] " +
            width +
            (align === "right" ? " right-0" : " left-0")
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}
