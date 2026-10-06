import { Link } from "react-router-dom";

const ACTIONS = [
  {
    icon: "add_a_photo",
    title: "Image screening",
    body: "Upload an eye, dental, or skin image for an AI screening.",
  },
  {
    icon: "edit_note",
    title: "Describe symptoms",
    body: "Type what you're experiencing and get a clear report.",
  },
  {
    icon: "mic",
    title: "Speak symptoms",
    body: "Record your symptoms — we transcribe and analyze them.",
  },
];

export default function OverviewPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-content">Welcome to MedCore</h1>
        <p className="text-muted mt-1">Your AI clinical screening assistant.</p>
      </div>

      {/* Glassy hero */}
      <div className="relative mb-10">
        {/* accent glow behind the glass */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="absolute -top-16 right-10 size-72 rounded-full bg-accent-500/30 blur-3xl"></div>
          <div className="absolute -bottom-20 left-10 size-72 rounded-full bg-accent-400/20 blur-3xl"></div>
        </div>
        <div className="relative rounded-3xl border border-line bg-surface/60 backdrop-blur-xl shadow-soft p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-content">
              Start a general diagnosis
            </h2>
            <p className="text-muted mt-2 max-w-lg">
              Get a preliminary Diagnostic, Prognostic &amp; Therapeutic report from an image, your
              symptoms, or your voice in seconds.
            </p>
          </div>
          <Link
            to="/app/diagnosis"
            className="inline-flex items-center gap-2 bg-content text-app font-bold px-6 py-3 rounded-xl hover:opacity-90 transition-all w-fit shrink-0"
          >
            <span className="material-symbols-outlined">stethoscope</span>
            New diagnosis
          </Link>
        </div>
      </div>

      {/* What you can do */}
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted mb-4">What you can do</h3>
      <div className="grid sm:grid-cols-3 gap-5">
        {ACTIONS.map((a) => (
          <Link
            key={a.title}
            to="/app/diagnosis"
            className="group bg-surface rounded-2xl border border-line shadow-card p-6 hover:border-accent-400/40 hover:-translate-y-0.5 transition-all"
          >
            <div className="size-11 rounded-xl bg-accent-500/10 text-accent-600 flex items-center justify-center mb-4 group-hover:bg-accent-500/15 transition-colors">
              <span className="material-symbols-outlined">{a.icon}</span>
            </div>
            <p className="font-bold text-content">{a.title}</p>
            <p className="text-sm text-muted mt-1">{a.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
