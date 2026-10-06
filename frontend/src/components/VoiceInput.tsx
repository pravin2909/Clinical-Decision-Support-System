import { useRef, useState } from "react";
import { exportToWav } from "../lib/audio";

interface VoiceInputProps {
  onAnalyze: (audio: Blob) => void;
  busy?: boolean;
}

export default function VoiceInput({ onAnalyze, busy }: VoiceInputProps) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Tap to start recording");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);

  const toggleRecording = async () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      setRecording(false);
      setStatus("Processing…");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const webmBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const wav = await exportToWav(webmBlob);
        blobRef.current = wav;
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(wav);
        });
        setStatus("Recording ready — play it back or analyze.");
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      setRecording(true);
      setStatus("Recording… tap to stop");
      setAudioUrl(null);
    } catch {
      alert("Microphone access denied or not available.");
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 py-2">
      <div className="relative flex justify-center items-center h-28 w-28">
        <button
          onClick={toggleRecording}
          className={
            "absolute z-10 size-20 rounded-full text-white flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-lg " +
            (recording ? "bg-rose-500 shadow-rose-500/30" : "bg-accent-600 hover:bg-accent-700 shadow-accent-600/30")
          }
        >
          <span className="material-symbols-outlined text-4xl">{recording ? "stop" : "mic"}</span>
        </button>
        {recording && (
          <div className="absolute inset-0 rounded-full border-2 border-rose-400 animate-ping"></div>
        )}
      </div>

      <p className="text-muted font-medium text-center text-sm h-5">{status}</p>

      {audioUrl && (
        <div className="w-full space-y-3">
          <audio src={audioUrl} className="w-full" controls />
          <button
            onClick={() => blobRef.current && onAnalyze(blobRef.current)}
            disabled={busy}
            className="w-full bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">auto_awesome</span>
            Analyze recording
          </button>
        </div>
      )}
    </div>
  );
}
