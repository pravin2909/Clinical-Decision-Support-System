import { useState } from "react";
import type { InputType } from "../types";
import { useAnalysis } from "../hooks/useAnalysis";
import ModePicker from "../components/ModePicker";
import ImageUpload from "../components/ImageUpload";
import TextSymptoms from "../components/TextSymptoms";
import VoiceInput from "../components/VoiceInput";
import DiagnosisResult from "../components/DiagnosisResult";

const MODE_HINT: Record<InputType, string> = {
  image: "Upload a retinal, dental, or skin image for screening.",
  text: "Describe the symptoms in plain language.",
  voice: "Record the symptoms and we'll transcribe them.",
};

export default function GeneralDiagnosisPage() {
  const [mode, setMode] = useState<InputType>("image");
  const { state, analyzeImage, analyzeText, analyzeAudio } = useAnalysis();

  const busy = state.progress > 0 && state.progress < 100 && state.progressColor !== "red";

  return (
    <div className="px-6 md:px-10 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-content">General Diagnosis</h1>
        <p className="text-muted mt-1">
          Preliminary AI screening from an image, symptoms, or voice.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Input card */}
        <div className="bg-surface rounded-2xl border border-line shadow-sm p-6">
          <ModePicker active={mode} onChange={setMode} />
          <p className="text-sm text-muted mt-4 mb-4">{MODE_HINT[mode]}</p>

          {mode === "image" && <ImageUpload onFile={analyzeImage} busy={busy} />}
          {mode === "text" && <TextSymptoms onAnalyze={analyzeText} busy={busy} />}
          {mode === "voice" && <VoiceInput onAnalyze={analyzeAudio} busy={busy} />}
        </div>

        {/* Result card */}
        <DiagnosisResult state={state} />
      </div>
    </div>
  );
}
