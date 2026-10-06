import { Link } from "react-router-dom";
import Logo from "../components/Logo";

function Navbar() {
  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-muted">
          <a href="#capabilities" className="hover:text-content transition-colors">Capabilities</a>
          <a href="#how" className="hover:text-content transition-colors">How it works</a>
          <a href="#roadmap" className="hover:text-content transition-colors">Roadmap</a>
        </nav>
        <Link
          to="/app"
          className="inline-flex items-center gap-2 bg-content text-app hover:opacity-90 text-sm font-bold px-4 py-2 rounded-lg transition-all shadow-sm hover:shadow-accent-500/20"
        >
          Open Platform
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero-wash border-b border-line">
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
        <p className="text-accent-700 font-bold tracking-[0.15em] text-sm mb-5">
          AI CLINICAL DECISION SUPPORT
        </p>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-content leading-[1.05] max-w-3xl mx-auto">
          From image to insight,<br className="hidden md:block" /> in seconds
        </h1>
        <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
          A multimodal engine that reads medical images, symptom text, or voice and returns a
          structured <span className="font-semibold text-content">Diagnostic, Prognostic &amp; Therapeutic</span> report —
          powered by domain-specific vision transformers and a private, local reasoning model.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/app/diagnosis"
            className="inline-flex items-center gap-2 bg-content text-app hover:opacity-90 font-bold px-6 py-3 rounded-lg transition-all shadow-lg shadow-accent-600/20 hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined">stethoscope</span>
            Try a diagnosis
          </Link>
          <a
            href="#how"
            className="inline-flex items-center gap-2 bg-surface border border-line hover:border-muted text-content font-bold px-6 py-3 rounded-lg transition-all"
          >
            See how it works
          </a>
        </div>
        <p className="mt-6 text-xs text-muted max-w-md mx-auto">
          Educational proof-of-concept. Not a medical device and not a substitute for professional care.
        </p>

        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[
            { k: "3", v: "Input modalities" },
            { k: "4", v: "Vision models" },
            { k: "21", v: "Conditions" },
            { k: "100%", v: "Local & private" },
          ].map((s) => (
            <div key={s.v} className="bg-surface/70 rounded-xl border border-line py-4">
              <p className="text-2xl font-extrabold text-accent-700">{s.k}</p>
              <p className="text-xs font-semibold text-muted mt-1">{s.v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    icon: "add_a_photo",
    title: "Multimodal intake",
    body: "Upload a medical image, type symptoms, or just speak. One engine, three ways in.",
  },
  {
    icon: "account_tree",
    title: "Smart routing",
    body: "A MobileNet router sends each image to the right domain — eye, dental, or skin — automatically.",
  },
  {
    icon: "neurology",
    title: "Vision transformers",
    body: "Domain-specific ViT classifiers identify the likely condition with a calibrated confidence score.",
  },
  {
    icon: "clinical_notes",
    title: "DPT reasoning",
    body: "A local LLM synthesizes a structured Diagnostic, Prognostic & Therapeutic report in plain language.",
  },
];

function Capabilities() {
  return (
    <section id="capabilities" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h2 className="text-3xl font-extrabold tracking-tight text-content">
          Everything the screening needs, in one flow
        </h2>
        <p className="mt-3 text-muted">
          Built as modular services so new capabilities slot in without disrupting the clinician's flow.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {CAPABILITIES.map((c) => (
          <div
            key={c.title}
            className="bg-surface rounded-2xl border border-line p-6 hover:shadow-lg hover:shadow-soft hover:-translate-y-1 transition-all"
          >
            <div className="size-11 rounded-xl bg-surface2 text-accent-700 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined">{c.icon}</span>
            </div>
            <h3 className="font-bold text-content mb-1.5">{c.title}</h3>
            <p className="text-sm text-muted leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", title: "Route", body: "The router detects the clinical domain of the input in milliseconds." },
  { n: "02", title: "Classify", body: "A domain-specific transformer predicts the most likely condition." },
  { n: "03", title: "Reason", body: "The reasoning model drafts a full DPT report, grounded in the finding." },
];

function HowItWorks() {
  return (
    <section id="how" className="bg-surface2 border-y border-line">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-accent-600 font-bold tracking-[0.15em] text-sm mb-3">THE PIPELINE</p>
          <h2 className="text-3xl font-extrabold tracking-tight text-content">Three stages, one report</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-surface border border-line shadow-sm rounded-2xl p-7">
              <p className="text-accent-600 font-mono font-bold text-sm mb-3">{s.n}</p>
              <h3 className="text-xl font-bold text-content mb-2">{s.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const ROADMAP = [
  { icon: "folder_shared", title: "Patient records (EHR)", body: "Structured, FHIR-lite patient history and a secure audit trail." },
  { icon: "forum", title: "Agentic assistant", body: "Ask follow-up questions grounded in the patient's own history and guidelines." },
  { icon: "medication", title: "Prescriptions & medicines", body: "Read prescriptions, look up medicines, and route to a doctor for approval." },
];

function Roadmap() {
  return (
    <section id="roadmap" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <p className="text-accent-700 font-bold tracking-[0.15em] text-sm mb-3">ON THE ROADMAP</p>
        <h2 className="text-3xl font-extrabold tracking-tight text-content">Built to grow into a care platform</h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-5">
        {ROADMAP.map((r) => (
          <div key={r.title} className="bg-surface2 rounded-2xl border border-brand-500/20 p-6">
            <div className="size-11 rounded-xl bg-surface text-accent-700 flex items-center justify-center mb-4 border border-brand-500/20">
              <span className="material-symbols-outlined">{r.icon}</span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="font-bold text-content">{r.title}</h3>
              <span className="text-[10px] font-bold uppercase tracking-wide text-accent-700 bg-brand-500/15 px-1.5 py-0.5 rounded">Soon</span>
            </div>
            <p className="text-sm text-muted leading-relaxed">{r.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-20">
      <div className="relative">
        {/* accent glow behind the glass */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="absolute -top-16 left-1/4 size-80 rounded-full bg-accent-500/30 blur-3xl"></div>
          <div className="absolute -bottom-20 right-1/4 size-80 rounded-full bg-accent-600/25 blur-3xl"></div>
        </div>
        <div className="relative rounded-3xl border border-line bg-surface/50 backdrop-blur-xl shadow-soft px-8 py-14 text-center">
          <h2 className="text-3xl font-extrabold text-content tracking-tight">
            Ready to see it in action?
          </h2>
          <p className="mt-3 text-muted max-w-xl mx-auto">
            Open the platform and run a diagnosis from an image, text, or your voice.
          </p>
          <Link
            to="/app"
            className="mt-7 inline-flex items-center gap-2 bg-content text-app font-bold px-6 py-3 rounded-xl hover:opacity-90 transition-all"
          >
            Open Platform
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <Logo />
        <p className="text-xs text-muted">© 2026 MedCore · AI Proof of Concept</p>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-surface">
      <Navbar />
      <Hero />
      <Capabilities />
      <HowItWorks />
      <Roadmap />
      <CTA />
      <Footer />
    </div>
  );
}
