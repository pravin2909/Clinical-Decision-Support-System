import { useRef, useState } from "react";
import type React from "react";

import { analyzeDoctorStream, streamSSE } from "../lib/api";
import { formatReport } from "../lib/format";
import type { Source } from "../types";
import { accentChip, appleFont, btnPrimary, glassControl, glassPanel, glassStrong } from "../lib/ui";

const SUGGESTIONS = [
  "First-line management of type 2 diabetes with CKD?",
  "Extended-window thrombolysis criteria in acute ischemic stroke?",
  "Empiric antibiotics for community-acquired pneumonia?",
  "Management of acute pancreatitis with organ failure?",
];

const STORE = "medcore.copilot.threads";
const MAX_THREADS = 20;
const uid = () => Math.random().toString(36).slice(2, 10);

interface DoctorMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  pending?: boolean;
}

interface Thread {
  id: string;
  title: string;
  msgs: DoctorMsg[];
  ts: number;
}

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
    localStorage.setItem(STORE, JSON.stringify(threads.slice(0, MAX_THREADS)));
  } catch { /* ignore */ }
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const glassRaised = {
  background: "var(--chat-raised-bg)",
  border: "1px solid var(--chat-raised-border)",
  backdropFilter: "var(--chat-blur)",
  WebkitBackdropFilter: "var(--chat-blur)",
  boxShadow: "var(--chat-raised-shadow)",
} as const;

export default function DoctorCopilotPage() {
  const [threads, setThreads] = useState<Thread[]>(loadThreads);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = loadThreads();
    return saved.length > 0 ? saved[0].id : null;
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;
  const msgs: DoctorMsg[] = activeThread?.msgs ?? [];

  const mutateThreads = (fn: (prev: Thread[]) => Thread[]) => {
    setThreads((prev) => {
      const next = fn(prev);
      saveThreads(next);
      return next;
    });
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 30);
  };

  const startNew = () => setActiveId(null);

  async function ask(q: string) {
    if (!q.trim() || busy) return;

    const currentHistory = msgs
      .filter((m) => m.text && !m.pending)
      .map((m) => ({ role: m.role as string, content: m.text }));

    const aId = uid();
    const userMsg: DoctorMsg = { id: uid(), role: "user", text: q.trim() };
    const assistantMsg: DoctorMsg = { id: aId, role: "assistant", text: "", pending: true };

    let tid = activeId;
    if (!tid) {
      tid = uid();
      const newThread: Thread = {
        id: tid,
        title: q.trim().slice(0, 65),
        msgs: [userMsg, assistantMsg],
        ts: Date.now(),
      };
      setActiveId(tid);
      mutateThreads((prev) => [newThread, ...prev].slice(0, MAX_THREADS));
    } else {
      mutateThreads((prev) =>
        prev.map((t) =>
          t.id === tid
            ? { ...t, msgs: [...t.msgs, userMsg, assistantMsg], ts: Date.now() }
            : t
        )
      );
    }

    setInput("");
    setBusy(true);
    scrollToBottom();

    const patch = (fn: (m: DoctorMsg) => DoctorMsg) => {
      mutateThreads((prev) =>
        prev.map((t) =>
          t.id === tid ? { ...t, msgs: t.msgs.map((m) => (m.id === aId ? fn(m) : m)) } : t
        )
      );
    };

    try {
      const res = await analyzeDoctorStream(q.trim(), currentHistory);
      for await (const ev of streamSSE(res)) {
        if (ev.type === "sources") patch((m) => ({ ...m, sources: ev.sources }));
        else if (ev.type === "token") {
          patch((m) => ({ ...m, text: m.text + ev.content }));
          scrollToBottom();
        } else if (ev.type === "error") {
          patch((m) => ({ ...m, text: ev.message }));
        }
      }
    } catch (err) {
      patch((m) => ({
        ...m,
        text: "Error: " + (err instanceof Error ? err.message : "Something went wrong."),
      }));
    } finally {
      patch((m) => ({ ...m, pending: false }));
      setBusy(false);
      scrollToBottom();
    }
  }

  const isEmpty = msgs.length === 0;

  return (
    <div style={appleFont} className="flex h-full min-h-0 antialiased">
      {/* History sidebar */}
      <aside
        style={glassPanel}
        className="hidden lg:flex w-52 shrink-0 flex-col border-r border-line rounded-none"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">History</p>
          <button
            onClick={startNew}
            style={glassControl}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-muted hover:text-content transition"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {threads.length === 0 ? (
            <p className="text-xs text-muted px-3 py-6 text-center leading-relaxed">
              No conversations yet. Ask your first question.
            </p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                style={t.id === activeId ? glassStrong : undefined}
                className={
                  "w-full text-left rounded-xl px-3 py-2.5 flex flex-col gap-0.5 transition-all " +
                  (t.id === activeId
                    ? "text-content"
                    : "text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-content")
                }
              >
                <span className="text-[13px] font-medium leading-snug line-clamp-2">{t.title}</span>
                <span className="text-[10px] text-muted">{fmtTs(t.ts)}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main chat column */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div
          style={glassPanel}
          className="shrink-0 flex items-center justify-between gap-3 px-5 md:px-8 py-4 border-b border-line"
        >
          <div className="flex items-center gap-3">
            <span className={`${accentChip} size-9 rounded-xl shrink-0`}>
              <span className="material-symbols-outlined text-lg">neurology</span>
            </span>
            <div>
              <p className="font-semibold text-content text-sm leading-tight">Clinical Copilot</p>
              <p className="text-[11px] text-muted">Evidence-grounded answers from medical literature.</p>
            </div>
          </div>
          {/* New button visible on mobile (sidebar hidden) */}
          <button
            onClick={startNew}
            style={glassControl}
            className="lg:hidden inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-muted hover:text-content transition"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 md:px-8 py-6 space-y-6">
            {isEmpty && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span className={`${accentChip} inline-flex size-14 rounded-2xl mb-5`}>
                  <span className="material-symbols-outlined text-3xl">science</span>
                </span>
                <h2 className="text-2xl font-semibold tracking-tight text-content">Clinical Copilot</h2>
                <p className="text-muted text-sm mt-2 max-w-xs leading-relaxed">
                  Ask a clinical question and get an evidence-based answer with real citations from the
                  medical literature.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-6">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      style={glassControl}
                      className="rounded-full px-3.5 py-1.5 text-sm text-content transition hover:-translate-y-0.5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div
                    style={glassRaised}
                    className="max-w-[82%] rounded-3xl rounded-br-lg px-4 py-3 text-content"
                  >
                    <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{m.text}</p>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-3">
                  <span className={`${accentChip} size-9 rounded-xl shrink-0 mt-1`}>
                    <span className="material-symbols-outlined text-lg">neurology</span>
                  </span>
                  <div className="flex-1 min-w-0 space-y-3">
                    {m.pending && !m.text && !m.sources ? (
                      <div
                        style={glassPanel}
                        className="inline-flex items-center gap-2 rounded-3xl rounded-tl-lg px-5 py-3 text-muted text-sm"
                      >
                        <span className="material-symbols-outlined text-base animate-spin">
                          progress_activity
                        </span>
                        Searching literature…
                      </div>
                    ) : (
                      <>
                        {m.text && (
                          <div
                            style={glassPanel}
                            className="rounded-3xl rounded-tl-lg px-5 py-4 text-[15px] leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: formatReport(m.text) }}
                          />
                        )}
                        {m.pending && m.text && (
                          <span className="inline-block w-2 h-4 bg-accent-500 animate-pulse ml-0.5 align-middle rounded-sm" />
                        )}
                        {m.sources && m.sources.length > 0 && (
                          <SourceList sources={m.sources} />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 px-5 md:px-8 py-4 border-t border-line">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <div style={glassStrong} className="flex items-end gap-2 rounded-3xl p-2 pl-5">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(input);
                    }
                  }}
                  rows={2}
                  placeholder="Ask a clinical question…"
                  className="flex-1 resize-none bg-transparent text-content text-[15px] outline-none placeholder:text-muted/70 py-2 max-h-36"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className={btnPrimary + " !rounded-2xl !px-5 shrink-0"}
                >
                  {busy ? "Searching…" : "Ask"}
                  {!busy && (
                    <span className="material-symbols-outlined text-base">arrow_upward</span>
                  )}
                </button>
              </div>
            </form>
            <p className="text-[11px] text-muted mt-2 px-1">
              Answers cite real sources. For clinical decision support only, not a patient diagnosis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div style={glassControl as React.CSSProperties} className="rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-accent-700">menu_book</span>
        Sources ({sources.length})
      </p>
      <ol className="space-y-2 text-sm">
        {sources.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="text-accent-700 font-semibold shrink-0">[{i + 1}]</span>
            <div className="min-w-0">
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-content font-medium hover:text-accent-600 hover:underline"
                >
                  {s.title}
                </a>
              ) : (
                <span className="text-content font-medium">{s.title}</span>
              )}
              <div className="text-muted text-xs mt-0.5">
                {[s.journal, s.year].filter(Boolean).join(" · ")}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
