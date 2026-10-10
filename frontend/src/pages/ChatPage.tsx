import { useEffect, useRef, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  streamSSE,
  analyzeTextStream,
  analyzeImageStream,
  analyzeAudioStream,
  analyzeDoctorStream,
} from "../lib/api";
import { exportToWav } from "../lib/audio";
import { formatReport } from "../lib/format";
import type { Source } from "../types";

type Role = "user" | "assistant";
type Mode = "doctor" | "patient";
interface Msg {
  id: string;
  role: Role;
  text: string;
  image?: string; // ephemeral object URL (not persisted)
  pending?: boolean;
  sources?: Source[];
}
interface Thread {
  id: string;
  title: string;
  msgs: Msg[];
  ts: number;
}

const STORE = "medcore.chats";
const uid = () => Math.random().toString(36).slice(2, 10);

/* Source titles sometimes arrive as escaped html, like &lt;i&gt;Name&lt;/i&gt; */
const cleanTitle = (s: string) =>
  (s || "")
    .replace(/&lt;\/?[a-z]+&gt;/gi, "")
    .replace(/<\/?[a-z]+>/gi, "")
    .replace(/&amp;/g, "&")
    .trim();

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Thread[]) : [];
  } catch {
    return [];
  }
}
function saveThreads(threads: Thread[]) {
  try {
    // keep only persistable fields (drop ephemeral image URLs / pending flags)
    const clean = threads.map((t) => ({
      id: t.id,
      title: t.title,
      ts: t.ts,
      msgs: t.msgs.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        sources: m.sources?.map((s) => ({ ...s, abstract: "" })),
      })),
    }));
    localStorage.setItem(STORE, JSON.stringify(clean));
  } catch {
    /* ignore */
  }
}

/* ------------------------------ glass styles ------------------------------ */
const appleFont: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Inter, "Segoe UI", Roboto, Arial, sans-serif',
  letterSpacing: "-0.01em",
};

// Chat surfaces: glassy in light mode, flat/solid in dark (driven by CSS vars).
const glassPanel: CSSProperties = {
  background: "var(--chat-panel-bg)",
  border: "1px solid var(--chat-panel-border)",
  backdropFilter: "var(--chat-blur)",
  WebkitBackdropFilter: "var(--chat-blur)",
  boxShadow: "var(--chat-panel-shadow)",
};

const glassControl: CSSProperties = {
  background: "var(--chat-control-bg)",
  border: "1px solid var(--chat-control-border)",
  backdropFilter: "var(--chat-blur)",
  WebkitBackdropFilter: "var(--chat-blur)",
  boxShadow: "var(--chat-control-shadow)",
};

const glassStrong: CSSProperties = {
  background: "var(--chat-raised-bg)",
  border: "1px solid var(--chat-raised-border)",
  backdropFilter: "var(--chat-blur)",
  WebkitBackdropFilter: "var(--chat-blur)",
  boxShadow: "var(--chat-raised-shadow)",
};

const glassRecording: CSSProperties = {
  background: "var(--chat-raised-bg)",
  border: "1px solid rgba(225, 29, 72, 0.4)",
  backdropFilter: "var(--chat-blur)",
  WebkitBackdropFilter: "var(--chat-blur)",
};

const iconTile = "shrink-0 flex items-center justify-center text-accent-700";
const lift =
  "transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0";

export default function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>(loadThreads);
  const [activeId, setActiveId] = useState<string | null>(
    () => loadThreads()[0]?.id ?? null
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mode, setMode] = useState<Mode>("doctor");
  const [showJump, setShowJump] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const atBottom = useRef(true);

  const active = threads.find((t) => t.id === activeId) ?? null;

  useEffect(() => saveThreads(threads), [threads]);

  /* Follow new messages only while the reader is at the bottom */
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [active?.msgs]);

  /* Switching chats always lands on the latest message */
  useEffect(() => {
    atBottom.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [activeId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottom.current = near;
    setShowJump(!near);
  };

  const jumpToLatest = () => {
    atBottom.current = true;
    setShowJump(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  // ---- thread helpers ----
  const ensureThread = useCallback(
    (firstText: string): string => {
      if (activeId && threads.some((t) => t.id === activeId)) return activeId;
      const id = uid();
      const title = firstText.slice(0, 40) || "New chat";
      setThreads((prev) => [{ id, title, msgs: [], ts: Date.now() }, ...prev]);
      setActiveId(id);
      return id;
    },
    [activeId, threads]
  );

  const addMsg = (threadId: string, msg: Msg) =>
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, msgs: [...t.msgs, msg] } : t))
    );

  const patchMsg = (threadId: string, msgId: string, fn: (m: Msg) => Msg) =>
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? { ...t, msgs: t.msgs.map((m) => (m.id === msgId ? fn(m) : m)) }
          : t
      )
    );

  const newChat = () => {
    setActiveId(null);
    setInput("");
  };

  const deleteChat = (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(null);
  };

  // ---- streaming runner ----
  const runStream = async (
    threadId: string,
    getRes: () => Promise<Response>,
    opts?: { onClassification?: (header: string) => void }
  ) => {
    const aId = uid();
    addMsg(threadId, { id: aId, role: "assistant", text: "", pending: true });
    setBusy(true);
    let acc = "";
    try {
      const res = await getRes();
      for await (const ev of streamSSE(res)) {
        if (ev.type === "classification") {
          const d = ev.classification.disease;
          const c = ev.classification.confidence.toFixed(1);
          const header = `**Detected: ${d}** (${c}% confidence)\n\n`;
          acc = header;
          opts?.onClassification?.(header);
          patchMsg(threadId, aId, (m) => ({ ...m, text: acc }));
        } else if (ev.type === "sources") {
          patchMsg(threadId, aId, (m) => ({ ...m, sources: ev.sources }));
        } else if (ev.type === "token") {
          acc += ev.content;
          patchMsg(threadId, aId, (m) => ({ ...m, text: acc }));
        } else if (ev.type === "error") {
          acc = "⚠️ " + ev.message;
          patchMsg(threadId, aId, (m) => ({ ...m, text: acc }));
        }
      }
    } catch (err) {
      acc = "⚠️ " + (err instanceof Error ? err.message : "Something went wrong.");
      patchMsg(threadId, aId, (m) => ({ ...m, text: acc }));
    } finally {
      patchMsg(threadId, aId, (m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  };

  // ---- send actions ----
  const sendText = () => {
    const text = input.trim();
    if (!text || busy) return;
    atBottom.current = true;
    const tId = ensureThread(text);
    addMsg(tId, { id: uid(), role: "user", text });
    setInput("");
    runStream(tId, () =>
      mode === "doctor" ? analyzeDoctorStream(text) : analyzeTextStream(text)
    );
  };

  const sendImage = (file: File) => {
    if (busy) return;
    atBottom.current = true;
    const tId = ensureThread(file.name);
    const url = URL.createObjectURL(file);
    addMsg(tId, { id: uid(), role: "user", text: "Uploaded an image for screening", image: url });
    runStream(tId, () => analyzeImageStream(file));
  };

  const sendAudio = async (wav: Blob) => {
    atBottom.current = true;
    const tId = ensureThread("Voice note");
    const uId = uid();
    const aId = uid();
    addMsg(tId, { id: uId, role: "user", text: "🎤 Voice note" });
    addMsg(tId, { id: aId, role: "assistant", text: "", pending: true });
    setBusy(true);
    let acc = "";
    try {
      const res = await analyzeAudioStream(wav);
      for await (const ev of streamSSE(res)) {
        if (ev.type === "audio_start") {
          patchMsg(tId, uId, (m) => ({ ...m, text: ev.transcription || "Voice note" }));
        } else if (ev.type === "token") {
          acc += ev.content;
          patchMsg(tId, aId, (m) => ({ ...m, text: acc }));
        } else if (ev.type === "error") {
          acc = "⚠️ " + ev.message;
          patchMsg(tId, aId, (m) => ({ ...m, text: acc }));
        }
      }
    } catch (err) {
      acc = "⚠️ " + (err instanceof Error ? err.message : "Something went wrong.");
      patchMsg(tId, aId, (m) => ({ ...m, text: acc }));
    } finally {
      patchMsg(tId, aId, (m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  };

  const toggleMic = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const wav = await exportToWav(new Blob(chunksRef.current, { type: "audio/webm" }));
        sendAudio(wav);
      };
      mr.start();
      setRecording(true);
    } catch {
      alert("Microphone access denied or not available.");
    }
  };

  return (
    <div style={appleFont} className="flex h-full min-h-0 gap-3 p-3 antialiased bg-app">
      {/* History panel */}
      <div style={glassPanel} className="hidden lg:flex w-60 shrink-0 flex-col rounded-3xl">
        <div className="p-3">
          <button
            onClick={newChat}
            style={glassControl}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-content px-3 py-1.5 rounded-lg hover:brightness-110 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base text-accent-700">add</span>
            New chat
          </button>
        </div>
        <p className="px-5 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
          History
        </p>
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
          {threads.length === 0 && (
            <p className="text-sm text-muted text-center mt-6 px-4">Your chats will appear here.</p>
          )}
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveId(t.id)}
              style={t.id === activeId ? glassStrong : undefined}
              className={
                "group flex items-center gap-2.5 px-3 py-2.5 rounded-2xl cursor-pointer text-sm " +
                (t.id === activeId
                  ? "text-content font-semibold"
                  : "text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-content")
              }
            >
              <span className="material-symbols-outlined text-lg shrink-0 text-accent-700">chat_bubble</span>
              <span className="flex-1 truncate">{t.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(t.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-500 transition"
                title="Delete"
              >
                <span className="material-symbols-outlined text-lg">delete</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat column */}
      <div style={glassPanel} className="flex-1 flex flex-col min-w-0 min-h-0 rounded-3xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-white/70">
          <span className="text-sm font-semibold text-content flex items-center gap-2 truncate">
            {mode === "doctor" ? "Evidence mode cites medical literature" : "General mode"}
          </span>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>

        <div className="relative flex-1 min-h-0">
          <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
              {!active || active.msgs.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-6">
                  {active.msgs.map((m) => (
                    <Bubble key={m.id} msg={m} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {showJump && (
            <button
              onClick={jumpToLatest}
              style={glassStrong}
              className={"absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-content " + lift}
            >
              <span className="material-symbols-outlined text-base text-accent-700">arrow_downward</span>
              Latest
            </button>
          )}
        </div>

        {/* Composer, always pinned at the bottom */}
        <div className="shrink-0">
          <div className="max-w-3xl mx-auto px-4 md:px-6 pb-3 pt-2">
            <div style={glassStrong} className="flex items-end gap-2 rounded-3xl p-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) sendImage(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                title="Upload image"
                style={glassControl}
                className={"size-11 rounded-2xl " + iconTile + " " + lift}
              >
                <span className="material-symbols-outlined">image</span>
              </button>
              <button
                onClick={toggleMic}
                disabled={busy && !recording}
                title="Voice"
                style={recording ? glassRecording : glassControl}
                className={
                  "size-11 rounded-2xl flex items-center justify-center shrink-0 " +
                  (recording ? "text-rose-600" : "text-accent-700") +
                  " " +
                  lift
                }
              >
                <span className="material-symbols-outlined">{recording ? "stop" : "mic"}</span>
              </button>
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                placeholder="Ask a clinical question…"
                className="flex-1 bg-transparent resize-none outline-none text-content placeholder:text-muted px-2 py-3 max-h-32"
              />
              <button
                onClick={sendText}
                disabled={busy || !input.trim()}
                title="Send"
                style={glassControl}
                className={"size-11 rounded-2xl " + iconTile + " " + lift + " disabled:opacity-40"}
              >
                <span className="material-symbols-outlined">arrow_upward</span>
              </button>
            </div>
            <p className="text-[11px] text-muted text-center mt-2">
              AI generated, not a medical diagnosis. Always consult a clinician.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opt = (m: Mode, icon: string, label: string) => (
    <button
      onClick={() => onChange(m)}
      style={mode === m ? glassStrong : undefined}
      className={
        "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-semibold " +
        (mode === m ? "text-accent-700" : "text-muted hover:text-content")
      }
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
  return (
    <div style={glassControl} className="flex gap-1 p-1 rounded-2xl shrink-0">
      {opt("doctor", "stethoscope", "Doctor")}
      {opt("patient", "person", "Patient")}
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div style={glassControl} className="mt-4 rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-accent-700">menu_book</span>
        Sources
      </p>
      <ol className="space-y-2 text-sm">
        {sources.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="text-accent-700 font-semibold shrink-0">[{i + 1}]</span>
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-content hover:text-accent-700 hover:underline"
              >
                {cleanTitle(s.title)}{" "}
                <span className="text-muted">
                  · {s.journal} {s.year && `(${s.year})`}
                </span>
              </a>
            ) : (
              <span className="text-content">
                {cleanTitle(s.title)} <span className="text-muted">· {s.journal}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Empty() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-16">
      <div style={glassControl} className={"size-16 rounded-3xl mb-5 " + iconTile}>
        <span className="material-symbols-outlined text-4xl">forum</span>
      </div>
      <h2 className="text-3xl font-semibold tracking-tight text-content">General Diagnosis</h2>
      <p className="text-muted mt-2 max-w-sm">
        Ask a clinical question, upload a medical image, or use voice, and get a preliminary AI
        screening.
      </p>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          style={glassStrong}
          className="max-w-[85%] text-content rounded-3xl rounded-br-lg px-4 py-3"
        >
          {msg.image && (
            <img src={msg.image} alt="upload" className="rounded-2xl mb-2 max-h-48 object-cover" />
          )}
          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div style={glassControl} className={"size-9 rounded-xl " + iconTile}>
        <span className="material-symbols-outlined text-xl">neurology</span>
      </div>
      <div className="flex-1 min-w-0">
        {msg.pending && msg.text === "" ? (
          <div
            style={glassPanel}
            className="inline-flex items-center gap-2 rounded-3xl rounded-tl-lg px-5 py-3 text-muted text-sm"
          >
            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
            Thinking…
          </div>
        ) : (
          <>
            <div style={glassPanel} className="rounded-3xl rounded-tl-lg px-5 py-4 leading-relaxed">
              <div dangerouslySetInnerHTML={{ __html: formatReport(msg.text) }} />
            </div>
            {msg.sources && msg.sources.length > 0 && <Sources sources={msg.sources} />}
          </>
        )}
      </div>
    </div>
  );
}