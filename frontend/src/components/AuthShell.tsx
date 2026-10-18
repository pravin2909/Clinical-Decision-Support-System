import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import Logo from "./Logo";
import { appleFont } from "../lib/ui";

/* Faint thematic glyphs that drift behind the card. */
const GLYPHS = [
  { icon: "ecg_heart", top: "14%", left: "10%", size: "92px", op: 0.1, cls: "auth-drift", delay: "0s" },
  { icon: "medication", top: "68%", left: "8%", size: "76px", op: 0.09, cls: "auth-drift-2", delay: "1.5s" },
  { icon: "health_and_safety", top: "22%", left: "84%", size: "104px", op: 0.08, cls: "auth-drift-2", delay: "0.6s" },
  { icon: "stethoscope", top: "74%", left: "82%", size: "84px", op: 0.1, cls: "auth-drift", delay: "2.2s" },
  { icon: "monitoring", top: "46%", left: "48%", size: "70px", op: 0.06, cls: "auth-drift", delay: "3s" },
];

/* A smooth, horizontally-repeating wave path (period 250) for the flowing lines. */
function wavePath(yBase: number, amp: number, period = 250, width = 1250): string {
  let d = `M -125 ${yBase}`;
  let x = -125;
  let dir = -1;
  while (x < width) {
    const nx = x + period / 2;
    const cx = x + period / 4;
    const cy = yBase + dir * amp;
    d += ` Q ${cx} ${cy} ${nx} ${yBase}`;
    x = nx;
    dir = -dir;
  }
  return d;
}

const WAVES = [
  { y: 200, amp: 34, op: 0.16, dur: 16, sw: 1.5 },
  { y: 340, amp: 26, op: 0.1, dur: 23, sw: 1.2 },
  { y: 500, amp: 42, op: 0.08, dur: 13, sw: 1.5 },
  { y: 640, amp: 24, op: 0.07, dur: 19, sw: 1.2 },
];

/* Full-screen animated green backdrop that the centered auth card floats over.
   Reacts to the cursor: a spotlight follows it, and layers parallax for depth. */
function AnimatedBackground() {
  // position in [0,1] across the viewport; starts centered-ish.
  const [pos, setPos] = useState({ x: 0.5, y: 0.4 });
  useEffect(() => {
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setPos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight })
      );
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const dx = (pos.x - 0.5) * 2; // -1..1
  const dy = (pos.y - 0.5) * 2;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: "linear-gradient(150deg, #0c3a24 0%, #15803d 45%, #2fae66 100%)" }}
      aria-hidden
    >
      {/* cursor-following spotlight */}
      <div
        className="absolute inset-0 transition-[background] duration-200 ease-out"
        style={{
          background: `radial-gradient(520px circle at ${pos.x * 100}% ${pos.y * 100}%, rgba(255,255,255,0.14), transparent 55%)`,
        }}
      />
      <div
        className="auth-shimmer absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(55% 50% at 80% 8%, rgba(255,255,255,0.14), transparent 60%), radial-gradient(50% 45% at 5% 100%, rgba(0,0,0,0.22), transparent 55%)",
        }}
      />

      {/* drifting thematic health glyphs (parallax: foreground) */}
      <div
        className="absolute inset-0"
        style={{ transform: `translate3d(${dx * 18}px, ${dy * 18}px, 0)`, transition: "transform 0.4s ease-out" }}
      >
        {GLYPHS.map((g) => (
          <span
            key={g.icon}
            className={"material-symbols-outlined absolute text-white " + g.cls}
            style={{ top: g.top, left: g.left, fontSize: g.size, opacity: g.op, animationDelay: g.delay }}
          >
            {g.icon}
          </span>
        ))}
      </div>

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 500 800"
        preserveAspectRatio="xMidYMid slice"
        style={{ transform: `translate3d(${dx * 10}px, ${dy * 10}px, 0)`, transition: "transform 0.5s ease-out" }}
      >
        <defs>
          <linearGradient id="authEcgFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="30%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
          </linearGradient>
          <filter id="authBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="26" />
          </filter>
          <path
            id="authEcgPath"
            d="M-20,640 L80,640 L100,640 L112,600 L124,700 L136,560 L150,640 L240,640 L260,640 L272,604 L284,690 L296,580 L310,640 L420,640 L440,640 L452,610 L464,680 L476,590 L490,640 L560,640"
          />
        </defs>

        {/* drifting blurred orbs */}
        <g filter="url(#authBlur)" opacity="0.5">
          <circle className="auth-drift" cx="110" cy="160" r="90" fill="#ffffff" opacity="0.16" />
          <circle className="auth-drift-2" cx="390" cy="560" r="110" fill="#0b3b25" opacity="0.5" />
        </g>

        {/* flowing silk waves */}
        {WAVES.map((wv, i) => (
          <g key={`wv${i}`} className="auth-wave" style={{ animation: `auth-wave-flow ${wv.dur}s linear infinite` }}>
            <path d={wavePath(wv.y, wv.amp)} fill="none" stroke={`rgba(255,255,255,${wv.op})`} strokeWidth={wv.sw} strokeLinecap="round" />
          </g>
        ))}

        {/* orbiting particle system */}
        <g>
          <circle cx="400" cy="160" r="60" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <circle cx="400" cy="160" r="100" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          <circle cx="400" cy="160" r="4" fill="#ffffff" style={{ transformOrigin: "400px 160px", animation: "auth-node-pulse 4s ease-in-out infinite" }} />
          <g className="auth-orbit" style={{ transformOrigin: "400px 160px", animation: "auth-orbit 11s linear infinite" }}>
            <circle cx="460" cy="160" r="3.5" fill="#ffffff" />
          </g>
          <g className="auth-orbit" style={{ transformOrigin: "400px 160px", animation: "auth-orbit 17s linear infinite reverse" }}>
            <circle cx="500" cy="160" r="2.5" fill="#ffffff" opacity="0.8" />
          </g>
        </g>

        {/* floating particle field */}
        {[
          [60, 120, 1.6, 5, 0], [210, 90, 2.2, 7, 1.2], [120, 300, 2.4, 9, 1.6], [250, 360, 1.5, 6, 3],
          [90, 470, 1.8, 8, 2.4], [300, 560, 2.2, 7, 1], [60, 580, 1.4, 6, 3.4], [450, 620, 1.8, 9, 0.8],
          [200, 660, 2, 8, 2.2], [350, 720, 1.6, 7, 1.8], [110, 730, 2.2, 9, 0.2], [470, 700, 1.4, 6, 2.8],
        ].map(([cx, cy, r, dur, delay], i) => (
          <circle
            key={`pt${i}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="#ffffff"
            className="auth-twinkle-el"
            style={{ transformOrigin: `${cx}px ${cy}px`, animation: `auth-twinkle ${dur}s ease-in-out ${delay}s infinite` }}
          />
        ))}

        {/* ECG heartbeat + gliding pulse */}
        <use href="#authEcgPath" className="auth-ecg" fill="none" stroke="url(#authEcgFade)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        <circle r="7" fill="#ffffff" opacity="0.2">
          <animateMotion dur="4.5s" repeatCount="indefinite"><mpath href="#authEcgPath" /></animateMotion>
        </circle>
        <circle r="3" fill="#ffffff">
          <animateMotion dur="4.5s" repeatCount="indefinite"><mpath href="#authEcgPath" /></animateMotion>
        </circle>
      </svg>
    </div>
  );
}

/** Centered auth card floating over an animated green backdrop. */
export default function AuthShell({
  title,
  subtitle,
  topRight,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  topRight?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div style={appleFont} className="relative min-h-screen w-full overflow-y-auto antialiased">
      <AnimatedBackground />

      {/* Back to home */}
      <Link
        to="/"
        className="absolute left-5 top-5 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-white/25"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Back to home
      </Link>

      {/* Centered card */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-20">
        <div className="w-full max-w-md rounded-3xl border border-black/5 bg-surface p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] sm:p-10">
          <div className="flex flex-col items-center text-center">
            <Link to="/" aria-label="MedCore home" className="inline-block transition hover:opacity-90">
              <Logo />
            </Link>
            <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-content sm:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          </div>

          <div className="mt-8 text-left">{children}</div>

          {topRight && <p className="mt-6 text-center text-sm text-muted">{topRight}</p>}
          {footer && <div className="mt-4 text-center">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
