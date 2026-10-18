import type { CSSProperties, ReactNode } from "react";
import { appleFont } from "../lib/ui";

/**
 * Consistent page shell used across every main page so the whole app reads as
 * one product: a breadcrumb, a 22px title, a muted subtitle, and an optional
 * right-aligned action slot. Matches the dashboard's header treatment.
 */
export function PageShell({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...appleFont, ...style }} className={"min-h-full antialiased " + className}>
      <div className="w-full px-6 py-6 md:px-10">{children}</div>
    </div>
  );
}

export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.025em] text-content">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
    </>
  );
}
