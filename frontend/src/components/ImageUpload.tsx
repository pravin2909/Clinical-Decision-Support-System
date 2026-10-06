import { useRef, useState } from "react";

interface ImageUploadProps {
  onFile: (file: File) => void;
  busy?: boolean;
}

export default function ImageUpload({ onFile, busy }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  const handleFile = (file?: File) => {
    if (!file) return;
    setName(file.name);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    onFile(file);
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className="w-full rounded-xl border-2 border-dashed border-accent-300 bg-brand-500/10 hover:bg-brand-500/10 hover:border-accent-400 transition-colors aspect-video flex flex-col items-center justify-center text-center overflow-hidden relative"
      >
        {preview ? (
          <img src={preview} alt="Selected scan" className="w-full h-full object-cover" />
        ) : (
          <>
            <span className="material-symbols-outlined text-5xl text-accent-400 mb-2">
              add_photo_alternate
            </span>
            <p className="font-semibold text-content">Click or drop a medical image</p>
            <p className="text-xs text-muted mt-1">Eye · Dental · Skin · JPG, PNG, WebP</p>
          </>
        )}
      </button>

      {name && (
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted truncate">
            <span className="material-symbols-outlined text-base text-accent-500">image</span>
            <span className="truncate">{name}</span>
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-accent-600 font-semibold hover:underline disabled:opacity-50"
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
}
