import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** A compact kebab (⋮) dropdown for per-card actions. Closes on outside click / Esc. */
export default function Menu({ items, align = "right" }: { items: MenuItem[]; align?: "right" | "left" }) {
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
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="More actions"
        className={
          "flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface2 hover:text-content " +
          (open ? "bg-surface2 text-content" : "")
        }
      >
        <span className="material-symbols-outlined text-[20px]">more_vert</span>
      </button>
      {open && (
        <div
          className={
            "animate-fade-in absolute z-30 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)] " +
            (align === "right" ? "right-0" : "left-0")
          }
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              disabled={it.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onClick();
              }}
              className={
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-40 " +
                (it.danger ? "text-rose-500 hover:bg-rose-500/10" : "text-content hover:bg-surface2")
              }
            >
              {it.icon && <span className="material-symbols-outlined text-[18px]">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
