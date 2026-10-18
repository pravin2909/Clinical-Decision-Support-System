import { useEffect, useRef, useState } from "react";
import {
  analyzeImageJSON,
  deleteConversation,
  getConversation,
  issuePrescription,
  listConversations,
  sendChatMessage,
  transcribeAudio,
} from "../lib/api";
import { exportToWav } from "../lib/audio";
import { formatReport } from "../lib/format";
import { useAuth } from "../context/AuthProvider";
import type { Citation, ConversationSummary, PrescriptionDraft } from "../types";
import CitationChip from "../components/CitationChip";
import DisclaimerBanner from "../components/DisclaimerBanner";

interface UIMessage {
  role: "user" | "assistant";
  text: string;
  image?: string;
  citations?: Citation[];
  pending?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  get_my_observations: "Reading your health data",
  get_my_prescriptions: "Checking your prescriptions",
  get_my_image_cases: "Reviewing your scans",
  recommend_lifestyle: "Tailoring advice to your data",
  triage_check: "Checking for red flags",
  search_patient_kb: "Searching health library",
  search_clinical_literature: "Searching medical literature",
  search_doctor_kb: "Searching clinical knowledge base",
  check_drug_interactions: "Checking drug interactions",
  get_patient_summary: "Loading patient summary",
  summarize_case: "Summarizing the case",
  message_my_doctor: "Messaging your doctor",
};

export default function AgentChatPage() {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor";

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<PrescriptionDraft | null>(null);
  const [issuing, setIssuing] = useState<"idle" | "saving" | "done">("idle");

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const atBottom = useRef(true);

  const refreshConversations = () =>
    listConversations().then((r) => setConversations(r.items)).catch(() => {});

  useEffect(() => {
    refreshConversations();
  }, []);

  useEffect(() => {
    if (atBottom.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const openConversation = async (id: number) => {
    setActiveId(id);
    setStatus(null);
    atBottom.current = true;
    try {
      const convo = await getConversation(id);
      const msgs = (convo.messages as Array<{ role: string; content: string; citations?: Citation[] }>)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          text: m.content || "",
          citations: m.citations || undefined,
        }));
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setStatus(null);
  };

  const removeConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(id).catch(() => {});
    if (id === activeId) newChat();
    refreshConversations();
  };

  const patchLast = (fn: (m: UIMessage) => UIMessage) =>
    setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? fn(m) : m)));

  // Core: stream one agent turn. `text` is what the model receives; the user
  // bubble is added unless we already showed one (e.g. an image upload).
  const runAgent = async (text: string, opts?: { userBubble?: boolean }) => {
    atBottom.current = true;
    if (opts?.userBubble !== false) {
      setMessages((m) => [...m, { role: "user", text }]);
    }
    setMessages((m) => [...m, { role: "assistant", text: "", pending: true }]);
    setBusy(true);
    try {
      for await (const ev of sendChatMessage(text, activeId)) {
        if (ev.type === "start") {
          if (activeId === null) {
            setActiveId(ev.conversation_id);
            refreshConversations();
          }
        } else if (ev.type === "status") {
          setStatus(ev.tool ? TOOL_LABELS[ev.tool] || `Using ${ev.tool}` : "Thinking");
        } else if (ev.type === "token") {
          patchLast((m) => ({ ...m, text: m.text + ev.content }));
        } else if (ev.type === "citation") {
          patchLast((m) => ({ ...m, citations: [...(m.citations || []), { title: ev.title, url: ev.url }] }));
        } else if (ev.type === "confirm" && ev.action === "draft_prescription") {
          setDraft(ev.payload);
          setIssuing("idle");
        } else if (ev.type === "done") {
          patchLast((m) => ({ ...m, pending: false }));
          setStatus(null);
          refreshConversations();
        } else if (ev.type === "error") {
          patchLast((m) => ({ ...m, text: "⚠️ " + ev.message, pending: false }));
        }
      }
    } catch (err) {
      patchLast((m) => ({ ...m, text: "⚠️ " + (err instanceof Error ? err.message : "Error"), pending: false }));
    } finally {
      setStatus(null);
      setBusy(false);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    runAgent(text);
  };

  const issueDraft = async () => {
    if (!draft) return;
    setIssuing("saving");
    try {
      await issuePrescription(draft.patient_id, draft.items, draft.notes);
      setIssuing("done");
      setTimeout(() => {
        setDraft(null);
        setIssuing("idle");
      }, 1500);
    } catch {
      setIssuing("idle");
    }
  };

  const onImage = async (file: File) => {
    if (busy) return;
    const url = URL.createObjectURL(file);
    setMessages((m) => [...m, { role: "user", text: "Uploaded an image for screening", image: url }]);
    setBusy(true);
    setStatus("Analyzing image");
    try {
      const res = await analyzeImageJSON(file);
      if (res.error || !res.classification) {
        setMessages((m) => [...m, { role: "assistant", text: "⚠️ " + (res.error || "Couldn't analyze that image.") }]);
        return;
      }
      const cls = res.classification;
      const dom = res.routing?.domain || "image";
      const msg =
        `I uploaded a medical image. The image classifier detected ${cls.disease} ` +
        `with ${cls.confidence.toFixed(0)}% confidence in the ${dom} category. ` +
        `Please explain this in simple terms and advise what I should do.`;
      await runAgent(msg, { userBubble: false });
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "⚠️ " + (e instanceof Error ? e.message : "Image error") }]);
    } finally {
      setStatus(null);
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
        setStatus("Transcribing");
        try {
          const wav = await exportToWav(new Blob(chunksRef.current, { type: "audio/webm" }));
          const text = await transcribeAudio(wav);
          setStatus(null);
          if (text.trim()) runAgent(text.trim());
        } catch (e) {
          setStatus(null);
          setMessages((m) => [...m, { role: "assistant", text: "⚠️ " + (e instanceof Error ? e.message : "Transcription failed") }]);
        }
      };
      mr.start();
      setRecording(true);
    } catch {
      alert("Microphone access denied or not available.");
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-3 p-3 bg-app">
      {/* Conversations */}
      <div className="hidden lg:flex w-60 shrink-0 flex-col rounded-2xl border border-line bg-app">
        <div className="p-3">
          <button
            onClick={newChat}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-content hover:border-accent-500"
          >
            <span className="material-symbols-outlined text-base text-accent-700">add</span>
            New chat
          </button>
        </div>
        <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">Conversations</p>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {conversations.length === 0 && <p className="px-3 text-sm text-muted">No conversations yet.</p>}
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={
                "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer " +
                (c.id === activeId ? "bg-accent-500/10 text-content font-semibold" : "text-muted hover:text-content")
              }
            >
              <span className="flex-1 truncate">{c.title || "Conversation"}</span>
              <button
                onClick={(e) => removeConversation(c.id, e)}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-500"
                title="Delete"
              >
                <span className="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat column */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0 rounded-2xl border border-line bg-app overflow-hidden">
        <div className="shrink-0 border-b border-line px-5 py-3">
          <p className="text-sm font-semibold text-content">{isDoctor ? "Clinical copilot" : "Health assistant"}</p>
          <p className="text-[11px] text-muted">
            {isDoctor
              ? "Evidence based answers with citations."
              : "Grounded in your own health data ask, upload an image, or speak."}
          </p>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-5">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.length === 0 && (
              <div className="pt-10 text-center text-muted">
                <span className="material-symbols-outlined mb-2 text-4xl text-accent-700">neurology</span>
                <p className="text-lg font-semibold text-content">{isDoctor ? "Ask a clinical question" : "Ask about your health"}</p>
                <p className="mt-1 text-sm">
                  {isDoctor
                    ? "e.g. “first-line therapy for type 2 diabetes with CKD?”"
                    : "e.g. “what’s my latest glucose and what should I eat?”"}
                </p>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md border border-line bg-accent-500/10 px-4 py-2.5 text-content">
                    {m.image && <img src={m.image} alt="upload" className="mb-2 max-h-44 rounded-xl object-cover" />}
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line text-accent-700">
                    <span className="material-symbols-outlined">neurology</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {m.pending && !m.text ? (
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-line px-4 py-2 text-sm text-muted">
                        <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                        {status || "Thinking…"}
                      </div>
                    ) : (
                      <>
                        {m.pending ? (
                          <div className="rounded-2xl rounded-tl-md border border-line bg-app px-4 py-3 leading-relaxed text-content whitespace-pre-wrap">
                            {m.text}
                          </div>
                        ) : (
                          <div
                            className="rounded-2xl rounded-tl-md border border-line bg-app px-4 py-3 leading-relaxed text-content"
                            dangerouslySetInnerHTML={{ __html: formatReport(m.text) }}
                          />
                        )}
                        {m.citations && m.citations.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.citations.map((c, ci) => (
                              <CitationChip key={ci} citation={c} index={ci} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Draft prescription confirmation (doctor) */}
        {draft && (
          <div className="shrink-0 border-t border-line px-4 md:px-6 py-3">
            <div className="mx-auto max-w-3xl rounded-2xl border border-accent-500/40 bg-accent-500/[0.06] p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-accent-700">prescriptions</span>
                <p className="text-sm font-semibold text-content">Draft prescription — review & confirm</p>
                <span className="ml-auto text-[12px] text-muted">Patient #{draft.patient_id}</span>
              </div>
              <div className="divide-y divide-line rounded-xl border border-line bg-app px-3">
                {draft.items.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm">
                    <span className="font-medium text-content">{m.drug}</span>
                    <span className="text-[13px] text-muted">
                      {[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
              {draft.notes && <p className="mt-2 text-[12px] text-muted">{draft.notes}</p>}
              {issuing === "done" ? (
                <p className="mt-3 text-sm font-medium text-emerald-600">✓ Prescription issued to the patient.</p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={issueDraft}
                    disabled={issuing === "saving"}
                    className="rounded-lg bg-accent-500/20 px-4 py-1.5 text-sm font-semibold text-accent-700 disabled:opacity-50"
                  >
                    {issuing === "saving" ? "Issuing…" : "Confirm & issue"}
                  </button>
                  <button onClick={() => setDraft(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted">
                    Discard
                  </button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Nothing is saved until you confirm. Requires an active care relationship + records consent.
              </p>
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-line px-4 md:px-6 py-3">
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-app p-2">
              {!isDoctor && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onImage(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    title="Upload image"
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-accent-700 hover:border-accent-500 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined">image</span>
                  </button>
                </>
              )}
              <button
                onClick={toggleMic}
                disabled={busy && !recording}
                title="Voice"
                className={
                  "flex size-10 shrink-0 items-center justify-center rounded-xl border disabled:opacity-40 " +
                  (recording ? "border-rose-400 text-rose-500" : "border-line text-accent-700 hover:border-accent-500")
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
                    send();
                  }
                }}
                placeholder={isDoctor ? "Ask a clinical question…" : "Ask about your health…"}
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-content outline-none placeholder:text-muted"
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                title="Send"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-accent-700 hover:border-accent-500 disabled:opacity-40"
              >
                <span className="material-symbols-outlined">arrow_upward</span>
              </button>
            </div>
            <DisclaimerBanner />
          </div>
        </div>
      </div>
    </div>
  );
}
