import type { CSSProperties } from "react";

interface LogoProps {
  /** kept for backwards-compat; the logo is now text-only */
  withText?: boolean;
  /** kept for backwards-compat; no icon mark is rendered anymore */
  markClassName?: string;
  /** tailwind classes for the wordmark text */
  textClassName?: string;
}

// Black/white → blue gradient fill with a soft glassy glow (flips in dark mode).
const wordmarkStyle: CSSProperties = {
  background: "var(--logo-gradient)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  filter: "var(--logo-glow)",
};

/**
 * Compact monogram ("MC") in the display font — used where space is tight,
 * e.g. the collapsed sidebar.
 */
export function LogoMark({ className = "text-2xl" }: { className?: string }) {
  return (
    <span
      style={wordmarkStyle}
      className={"font-display font-bold tracking-tight leading-none " + className}
    >
      MC
    </span>
  );
}

/**
 * The MedCore wordmark — a text-only, Google-style logo set in Space Grotesk,
 * filled with a black→blue (white→blue in dark) gradient and a glassy glow.
 */
export default function Logo({ textClassName = "" }: LogoProps) {
  return (
    <span
      style={wordmarkStyle}
      className={"font-display font-bold tracking-tight text-xl leading-none " + textClassName}
    >
      MedCore
    </span>
  );
}
