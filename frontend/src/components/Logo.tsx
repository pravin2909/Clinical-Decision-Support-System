interface LogoProps {
  /** show the "MedCore" wordmark next to the mark */
  withText?: boolean;
  /** tailwind size classes for the mark, e.g. "size-9" */
  markClassName?: string;
  /** tailwind classes for the wordmark text */
  textClassName?: string;
}

export function LogoMark({ className = "size-9" }: { className?: string }) {
  // Four gradient petals swirl into a medical cross (pinwheel), in brand blues.
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="MedCore">
      <defs>
        <linearGradient id="medcore-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6d28d9" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
        <linearGradient id="medcore-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c1d95" />
          <stop offset="0.55" stopColor="#6d28d9" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <g>
        {/* top + left petals: blue */}
        <rect x="19" y="3.5" width="8" height="16" rx="4" fill="url(#medcore-blue)" />
        <rect
          x="19"
          y="3.5"
          width="8"
          height="16"
          rx="4"
          fill="url(#medcore-blue)"
          transform="rotate(270 20 20)"
        />
        {/* right + bottom petals: green */}
        <rect
          x="19"
          y="3.5"
          width="8"
          height="16"
          rx="4"
          fill="url(#medcore-green)"
          transform="rotate(90 20 20)"
        />
        <rect
          x="19"
          y="3.5"
          width="8"
          height="16"
          rx="4"
          fill="url(#medcore-green)"
          transform="rotate(180 20 20)"
        />
      </g>
      {/* bright core */}
      <circle cx="20" cy="20" r="2.4" fill="#ffffff" />
    </svg>
  );
}

export default function Logo({
  withText = true,
  markClassName = "size-9",
  textClassName = "text-content",
}: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className={markClassName} />
      {withText && (
        <span className={"font-extrabold tracking-tight text-lg " + textClassName}>
          Med<span className="text-[#8b5cf6]">Core</span>
        </span>
      )}
    </div>
  );
}
