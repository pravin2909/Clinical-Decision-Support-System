import type { InputType } from "../types";

interface ModePickerProps {
  active: InputType;
  onChange: (mode: InputType) => void;
}

const MODES: { id: InputType; label: string; icon: string }[] = [
  { id: "image", label: "Image", icon: "add_a_photo" },
  { id: "text", label: "Symptoms", icon: "edit_note" },
  { id: "voice", label: "Voice", icon: "mic" },
];

export default function ModePicker({ active, onChange }: ModePickerProps) {
  return (
    <div className="grid grid-cols-3 gap-1 p-1 bg-surface2 rounded-xl">
      {MODES.map((m) => {
        const isActive = active === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={
              "flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all " +
              (isActive
                ? "bg-accent-500/15 text-accent-700 dark:text-accent-300 ring-1 ring-accent-500/25 shadow-sm backdrop-blur-sm"
                : "text-muted hover:text-content")
            }
          >
            <span className="material-symbols-outlined text-lg">{m.icon}</span>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
