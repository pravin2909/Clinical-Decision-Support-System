import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";

const appleFont: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, "Segoe UI", Roboto, Arial, sans-serif',
  letterSpacing: "-0.01em",
};

/* Reusable classes */
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-content text-app font-semibold px-6 py-3 text-sm transition-all hover:opacity-90 hover:-translate-y-0.5";
const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line text-content font-semibold px-6 py-3 text-sm transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:-translate-y-0.5";
const iconChip =
  "flex items-center justify-center rounded-xl border border-line bg-surface2 text-accent-500";
const eyebrow = "text-xs font-semibold tracking-[0.2em] uppercase text-accent-500";

/* Fade/slide in when scrolled into view */
function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${shown ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

function SectionHead({ eyebrowText, title, sub }: { eyebrowText: string; title: string; sub?: string }) {
  return (
    <div className="max-w-2xl mx-auto text-center mb-10">
      <p className={eyebrow}>{eyebrowText}</p>
      <h2 className="font-display text-3xl md:text-[2.6rem] font-bold tracking-tight text-content mt-3 leading-tight">
        {title}
      </h2>
      {sub && <p className="mt-4 text-muted leading-relaxed">{sub}</p>}
    </div>
  );
}

function Navbar() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-app/70 border-b border-line/60">
      <div className="max-w-6xl mx-auto h-14 px-5 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-muted">
          <a href="#capabilities" className="px-3 py-2 rounded-lg hover:text-content transition-colors">Capabilities</a>
          <a href="#how" className="px-3 py-2 rounded-lg hover:text-content transition-colors">How it works</a>
          <a href="#report" className="px-3 py-2 rounded-lg hover:text-content transition-colors">The report</a>
          <a href="#privacy" className="px-3 py-2 rounded-lg hover:text-content transition-colors">Privacy</a>
        </nav>
      </div>
    </header>
  );
}

const PIPE = [
  { icon: "add_a_photo", label: "Input", note: "Image, text or voice" },
  { icon: "account_tree", label: "Router", note: "Eye, dental or skin" },
  { icon: "neurology", label: "Classifier", note: "Condition and confidence" },
  { icon: "clinical_notes", label: "DPT report", note: "Plain language output" },
];

function PipelineConsole() {
  return (
    <div className="float-soft relative rounded-2xl border border-line bg-surface/60 backdrop-blur-xl shadow-2xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 h-10 border-b border-line/70">
        <span className="size-2.5 rounded-full bg-rose-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-3 text-[11px] font-mono text-muted">diagnosis_pipeline.run()</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {PIPE.map((n, i) => (
          <div
            key={n.label}
            className="relative p-5 border-line border-b md:border-b-0 md:border-r last:border-r-0 [&:nth-child(2)]:border-r-0 md:[&:nth-child(2)]:border-r"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`${iconChip} size-9`}>
                <span className="material-symbols-outlined text-xl">{n.icon}</span>
              </span>
              <span className="text-[11px] font-mono text-muted">0{i + 1}</span>
            </div>
            <p className="font-semibold text-content text-sm">{n.label}</p>
            <p className="text-xs text-muted mt-0.5">{n.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hero() {
  const stats = [
    { k: "3", v: "Input modalities" },
    { k: "4", v: "Vision models" },
    { k: "21", v: "Conditions" },
    { k: "100%", v: "Local & private" },
  ];
  return (
    <section className="relative overflow-hidden">
      {/* background layers */}
      <div className="landing-aurora absolute inset-0 pointer-events-none" />
      <div className="landing-grid absolute inset-0 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 pt-14 pb-14 text-center">
        <Reveal className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 backdrop-blur px-3.5 py-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-accent-500 opacity-60 animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-accent-500" />
          </span>
          <span className="text-[11px] font-semibold tracking-[0.16em] text-muted">
            AI CLINICAL DECISION SUPPORT
          </span>
        </Reveal>

        <Reveal delay={60}>
          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight text-content leading-[1.03] max-w-4xl mx-auto mt-7">
            From image to insight,
            <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-sky-400 to-blue-600 bg-clip-text text-transparent">
              {" "}in seconds
            </span>
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
            A multimodal engine that reads medical images, symptom text or voice and returns a structured report,
            powered by domain trained vision transformers and a private, local reasoning model.
          </p>
        </Reveal>

        <Reveal delay={180} className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/app/diagnosis" className={`group ${btnPrimary}`}>
            <span className="material-symbols-outlined text-lg">stethoscope</span>
            Try a diagnosis
            <span className="material-symbols-outlined text-base transition-transform group-hover:translate-x-0.5">
              arrow_forward
            </span>
          </Link>
          <a href="#how" className={btnGhost}>See how it works</a>
        </Reveal>

        <Reveal delay={220}>
          <p className="mt-5 text-xs text-muted/80 max-w-md mx-auto">
            Educational proof of concept. Not a medical device and not a substitute for professional care.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10 max-w-4xl mx-auto">
          <PipelineConsole />
        </Reveal>

        <Reveal delay={160} className="mt-8 max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-line bg-surface/40 backdrop-blur divide-x divide-y md:divide-y-0 divide-line">
          {stats.map((s) => (
            <div key={s.v} className="py-6 px-4">
              <p className="font-display text-3xl font-bold text-content">{s.k}</p>
              <p className="text-xs font-medium text-muted mt-1">{s.v}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  { icon: "add_a_photo", title: "Multimodal intake", body: "Upload a medical image, type your symptoms, or speak. One engine, three ways in, with the same structured result every time." },
  { icon: "account_tree", title: "Smart routing", body: "A MobileNet router sends each image to the right domain, eye, dental or skin, automatically." },
  { icon: "neurology", title: "Vision transformers", body: "Domain specific ViT classifiers identify the likely condition and return a calibrated confidence score." },
  { icon: "clinical_notes", title: "DPT reasoning", body: "A local language model turns the finding into a structured, plain language report that is easy to read and act on." },
];

function Capabilities() {
  return (
    <section id="capabilities" className="max-w-6xl mx-auto px-6 py-16">
      <Reveal><SectionHead eyebrowText="Capabilities" title="Everything the screening needs, in one flow" sub="Four modular services working together from the first upload to the final report." /></Reveal>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {CAPABILITIES.map((c, i) => (
          <Reveal key={c.title} delay={i * 70}>
            <div className="card-hairline h-full rounded-2xl bg-surface/50 p-6 hover:bg-surface">
              <span className={`${iconChip} size-11 mb-5`}>
                <span className="material-symbols-outlined">{c.icon}</span>
              </span>
              <h3 className="font-semibold text-content mb-2">{c.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{c.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", icon: "alt_route", title: "Route", body: "The router detects the clinical domain of the input in milliseconds." },
  { n: "02", icon: "biotech", title: "Classify", body: "A domain trained transformer predicts the most likely condition." },
  { n: "03", icon: "description", title: "Reason", body: "The reasoning model drafts a full DPT report, grounded in the finding." },
];

function HowItWorks() {
  return (
    <section id="how" className="border-y border-line bg-surface/30">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <Reveal><SectionHead eyebrowText="The pipeline" title="Three stages, one report" /></Reveal>
        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 90}>
              <div className="card-hairline h-full rounded-2xl bg-surface/50 p-7 hover:bg-surface">
                <div className="flex items-center justify-between mb-5">
                  <span className={`${iconChip} size-12`}>
                    <span className="material-symbols-outlined">{s.icon}</span>
                  </span>
                  <span className="font-display text-2xl font-bold text-line">{s.n}</span>
                </div>
                <h3 className="text-lg font-semibold text-content mb-2">{s.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const REPORT = [
  { letter: "D", title: "Diagnostic", body: "The identified condition with its confidence score, explained in clear, plain language." },
  { letter: "P", title: "Prognostic", body: "What the likely course looks like and which factors can change the outcome." },
  { letter: "T", title: "Therapeutic", body: "Suggested next steps and care considerations to discuss with a professional." },
];

function ReportSection() {
  return (
    <section id="report" className="max-w-6xl mx-auto px-6 py-16">
      <div className="grid lg:grid-cols-5 gap-10 items-center">
        <Reveal className="lg:col-span-2">
          <p className={eyebrow}>The report</p>
          <h2 className="font-display text-3xl md:text-[2.4rem] font-bold tracking-tight text-content leading-tight mt-3">
            One structured report, three clear sections
          </h2>
          <p className="mt-4 text-muted leading-relaxed">
            Every result follows the same Diagnostic, Prognostic and Therapeutic layout, consistent whether it began
            as a photo, a typed description, or a voice note.
          </p>
        </Reveal>
        <div className="lg:col-span-3 grid gap-4">
          {REPORT.map((r, i) => (
            <Reveal key={r.title} delay={i * 80}>
              <div className="card-hairline flex items-start gap-5 bg-surface/50 rounded-2xl p-5 hover:bg-surface">
                <span className={`${iconChip} size-12 shrink-0 font-display font-bold text-lg !text-accent-500`}>
                  {r.letter}
                </span>
                <div>
                  <h3 className="font-semibold text-content">{r.title}</h3>
                  <p className="text-sm text-muted leading-relaxed mt-1">{r.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  const points = [
    { icon: "lock", title: "Runs locally", body: "The reasoning model runs on your own machine, so inputs stay with you." },
    { icon: "visibility_off", title: "Private by design", body: "No images, symptoms or voice recordings are sent to an outside service." },
    { icon: "bolt", title: "Fast results", body: "Routing and classification complete in moments, ahead of the written report." },
  ];
  return (
    <section id="privacy" className="border-y border-line bg-surface/30">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <Reveal><SectionHead eyebrowText="Privacy" title="Your data stays on your machine" /></Reveal>
        <div className="grid sm:grid-cols-3 gap-5">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <div className="card-hairline h-full rounded-2xl bg-surface/50 p-7 hover:bg-surface">
                <span className={`${iconChip} size-11 mb-5`}>
                  <span className="material-symbols-outlined">{p.icon}</span>
                </span>
                <h3 className="font-semibold text-content mb-2">{p.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface/40 backdrop-blur-xl px-8 py-12 text-center">
          <div className="landing-aurora absolute inset-0 pointer-events-none opacity-70" />
          <div className="relative">
            <h2 className="font-display text-3xl md:text-5xl font-bold text-content tracking-tight">
              Ready to see it in action?
            </h2>
            <p className="mt-4 text-muted max-w-xl mx-auto">
              Open the platform and run a diagnosis from an image, text, or your voice.
            </p>
            <Link to="/app" className={`mt-9 ${btnPrimary}`}>
              Open Platform
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Logo />
        <p className="text-xs text-muted">© 2026 MedCore. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div style={appleFont} className="landing bg-app antialiased">
      <Navbar />
      <Hero />
      <Capabilities />
      <HowItWorks />
      <ReportSection />
      <Privacy />
      <CTA />
      <Footer />
    </div>
  );
}
