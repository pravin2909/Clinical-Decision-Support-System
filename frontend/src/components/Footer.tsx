export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 px-6 py-3 flex justify-between items-center bg-white dark:bg-primary text-xs text-slate-500">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <span className="size-2 bg-brand-500 rounded-full"></span>
          API: Online
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">database</span>
          v1.0.0
        </span>
      </div>
      <p>© 2026 MedCore. AI Proof of Concept.</p>
    </footer>
  );
}
