import { useRef, useState } from "react";
import type { PipelineState } from "../types";

interface ImageScanProps {
  state: PipelineState;
  onFile: (file: File) => void;
}

const BADGE: Record<PipelineState["liveStatus"], { cls: string; text: string; pulse: boolean }> = {
  ready: { cls: "bg-slate-500", text: "SYSTEM READY", pulse: false },
  scanning: { cls: "bg-brand-600", text: "LIVE SCAN", pulse: true },
  complete: { cls: "bg-brand-500", text: "ANALYSIS COMPLETE", pulse: false },
};

// Light gradient so the dark status text stays readable over an uploaded image.
const PREVIEW_OVERLAY =
  "linear-gradient(to top, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.4) 32%, rgba(255,255,255,0) 62%)";

export default function ImageScan({ state, onFile }: ImageScanProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    onFile(file);
  };

  const badge = BADGE[state.liveStatus];

  return (
    <div
      className={
        "relative overflow-hidden rounded-xl bg-brand-50 border border-line shadow-sm group cursor-pointer hover:shadow-lg hover:shadow-brand-500/20 transition-all" +
        (state.scanning ? " scanning" : "")
      }
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleChange}
      />
      <div
        className="aspect-video w-full bg-cover bg-center bg-brand-50 transition-all"
        style={{
          backgroundImage: preview ? `${PREVIEW_OVERLAY}, url(${preview})` : undefined,
        }}
      >
        <div className="scanning-line"></div>

        {!preview && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-brand-700/60 group-hover:text-brand-700 transition-colors">
            <span className="material-symbols-outlined text-6xl mb-2">upload_file</span>
            <p className="text-lg font-semibold tracking-widest uppercase">
              Click to Upload Medical Scan
            </p>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 p-6 w-full flex justify-between items-end">
        <div>
          <span
            className={
              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white mb-2 transition-colors " +
              badge.cls
            }
          >
            <span
              className={
                "size-2 bg-white rounded-full mr-2" + (badge.pulse ? " animate-pulse" : "")
              }
            ></span>
            <span>{badge.text}</span>
          </span>
          <h1 className="text-ink text-3xl font-bold">{state.statusText}</h1>
        </div>
      </div>
    </div>
  );
}
