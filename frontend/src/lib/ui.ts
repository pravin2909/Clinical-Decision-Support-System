/**
 * Shared visual language, mirrored from the landing page + dashboard so every
 * screen reads as one product. Glass surfaces are driven by CSS variables in
 * index.css (frosted in light mode, flat solid in dark mode).
 */
import type { CSSProperties } from "react";

export const appleFont: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, "Segoe UI", Roboto, Arial, sans-serif',
  letterSpacing: "-0.01em",
};

/* Unified flat card + control surfaces (match the dashboard look app-wide):
   a 1px hairline on the surface with a subtle shadow, no frosted glass. */
export const glassPanel: CSSProperties = {
  background: "rgb(var(--surface))",
  border: "1px solid rgb(var(--border))",
  boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
};

export const glassControl: CSSProperties = {
  background: "rgb(var(--surface-2))",
  border: "1px solid rgb(var(--border))",
  boxShadow: "none",
};

export const glassStrong: CSSProperties = {
  background: "rgb(var(--surface-2))",
  border: "1px solid rgb(var(--border))",
  boxShadow: "none",
};

/** Raised surface for primary CTAs / cards (flat, no frosted glass). */
export const glassHero: CSSProperties = {
  background: "rgb(var(--surface))",
  border: "1px solid rgb(var(--border))",
  boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
};

/* Reusable class strings (match LandingPage.tsx). */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-content text-app font-semibold px-6 py-3 text-sm transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-60 disabled:pointer-events-none";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line text-content font-semibold px-6 py-3 text-sm transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:-translate-y-0.5";

export const iconChip =
  "flex items-center justify-center rounded-xl border border-line bg-surface2 text-accent-500";

/** Blue-tinted icon chip that stays visible in dark mode (unlike flat glass). */
export const accentChip =
  "flex items-center justify-center rounded-xl bg-accent-500/10 text-accent-700 border border-accent-500/25";

export const eyebrow = "text-xs font-semibold tracking-[0.2em] uppercase text-accent-500";

export const inputClass =
  "w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-content outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 placeholder:text-muted/70";
