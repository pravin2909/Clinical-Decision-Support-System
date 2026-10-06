export default function Header() {
  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 dark:border-slate-800 px-6 py-3 bg-white dark:bg-primary">
      <div className="flex items-center gap-4 text-primary dark:text-slate-100">
        <div className="size-8 flex items-center justify-center bg-primary text-white rounded">
          <span className="material-symbols-outlined text-xl">biotech</span>
        </div>
        <h2 className="text-primary dark:text-slate-100 text-lg font-bold leading-tight tracking-[-0.015em]">
          MedCore
        </h2>
      </div>
    </header>
  );
}
