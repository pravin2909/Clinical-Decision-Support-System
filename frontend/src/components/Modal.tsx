import { useEffect } from "react";
import type { ReactNode } from "react";

/** Centered modal with a dimmed backdrop. Closes on backdrop click / Esc. */
export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-backdrop-in absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-modal-pop relative flex max-h-[85vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-black/5 bg-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]`}
      >
        {(title || icon) && (
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            {icon}
            <div className="min-w-0 flex-1">
              {title && <h2 className="truncate text-base font-bold tracking-tight text-content">{title}</h2>}
              {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface2 hover:text-content"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
