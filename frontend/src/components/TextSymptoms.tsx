import { useState } from "react";

interface TextSymptomsProps {
  onAnalyze: (symptoms: string) => void;
  busy?: boolean;
}

export default function TextSymptoms({ onAnalyze, busy }: TextSymptomsProps) {
  const [text, setText] = useState("");

  const handleClick = () => {
    if (!text.trim()) return;
    onAnalyze(text.trim());
  };

  return (
    <div className="space-y-3">
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full bg-surface2 border border-line rounded-xl p-4 focus:ring-2 focus:ring-accent-400 focus:border-accent-400 focus:outline-none resize-none text-content placeholder:text-muted"
        placeholder="Describe the symptoms… e.g. 'Red, itchy, flaky patches on both elbows for two weeks, getting worse.'"
      />
      <button
        onClick={handleClick}
        disabled={busy || !text.trim()}
        className="w-full bg-content hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-app px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined">auto_awesome</span>
        Analyze symptoms
      </button>
    </div>
  );
}
