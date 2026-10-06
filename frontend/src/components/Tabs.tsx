import type { InputType } from "../types";

interface TabsProps {
  active: InputType;
  onChange: (tab: InputType) => void;
}

const ACTIVE =
  "px-6 py-2 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-semibold transition-all";
const INACTIVE =
  "px-6 py-2 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold transition-all";

export default function Tabs({ active, onChange }: TabsProps) {
  return (
    <div className="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-lg max-w-fit mx-auto mb-2 shadow-sm">
      <button
        className={active === "image" ? ACTIVE : INACTIVE}
        onClick={() => onChange("image")}
      >
        Image Scan
      </button>
      <button
        className={active === "text" ? ACTIVE : INACTIVE}
        onClick={() => onChange("text")}
      >
        Text Symptoms
      </button>
      <button
        className={
          (active === "voice" ? ACTIVE : INACTIVE) + " flex items-center gap-2"
        }
        onClick={() => onChange("voice")}
      >
        <span className="material-symbols-outlined text-sm">mic</span> Voice Input
      </button>
    </div>
  );
}
