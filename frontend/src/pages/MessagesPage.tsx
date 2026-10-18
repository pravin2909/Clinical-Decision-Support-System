import { useEffect, useRef, useState } from "react";
import { getThread, listAppointments, listMessageContacts, sendMessage } from "../lib/api";
import { useAuth } from "../context/AuthProvider";
import type { Appointment, MessageContact, ThreadMessage } from "../types";

const initials = (name: string | null, fallback: string) =>
  (name || fallback).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function hhmm(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
function apptWhen(a: Appointment): string {
  const iso = a.scheduled_for || a.created_at || null;
  if (a.scheduled_for) return new Date(a.scheduled_for).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (a.preferred_time) return a.preferred_time;
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

export default function MessagesPage() {
  const { user } = useAuth();
  const myRole = user?.role === "doctor" ? "doctor" : "patient";

  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [refVisit, setRefVisit] = useState<Appointment | null>(null);
  const [refOpen, setRefOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastIdRef = useRef<number>(0);

  useEffect(() => {
    listMessageContacts().then((r) => setContacts(r.items)).catch(() => {});
    listAppointments().then((r) => setAppts(r.items)).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const open = async (id: number) => {
    setActiveId(id);
    setMessages([]);
    setRefVisit(null);
    setRefOpen(false);
    lastIdRef.current = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      const r = await getThread(id);
      setMessages(r.items);
      lastIdRef.current = r.items.length ? r.items[r.items.length - 1].id : 0;
    } catch {
      setMessages([]);
    }
    pollRef.current = setInterval(async () => {
      try {
        const r = await getThread(id, lastIdRef.current);
        if (r.items.length) {
          setMessages((prev) => [...prev, ...r.items]);
          lastIdRef.current = r.items[r.items.length - 1].id;
        }
      } catch {
        /* ignore transient errors */
      }
    }, 3000);
  };

  const send = async () => {
    let body = input.trim();
    if (!body || activeId === null || sending) return;
    if (refVisit) {
      body = `↪ Re: ${refVisit.reason || "our visit"}${apptWhen(refVisit) ? ` (${apptWhen(refVisit)})` : ""}\n\n${body}`;
    }
    setInput("");
    setRefVisit(null);
    setSending(true);
    try {
      const msg = await sendMessage(activeId, body);
      setMessages((prev) => [...prev, msg]);
      lastIdRef.current = msg.id;
    } catch {
      setInput(input.trim()); // restore on failure
    } finally {
      setSending(false);
    }
  };

  const activeContact = contacts.find((c) => c.id === activeId) || null;
  const title = (c: MessageContact) => (c.role === "doctor" ? `Dr. ${c.name || `#${c.id}`}` : c.name || `Patient #${c.id}`);

  // Appointments shared with the active contact (for referencing a past visit).
  const contactAppts = appts.filter((a) => (myRole === "patient" ? a.doctor_id === activeId : a.patient_id === activeId));

  return (
    <div className="flex h-full min-h-0 gap-3 bg-app p-3">
      {/* Contacts */}
      <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <p className="px-4 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">Messages</p>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {contacts.length === 0 && (
            <p className="px-3 text-sm text-muted">
              No contacts yet. Connect with a {myRole === "doctor" ? "patient" : "doctor"} first.
            </p>
          )}
          {contacts.map((c) => (
            <button
              key={c.id}
              onClick={() => open(c.id)}
              className={
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition " +
                (c.id === activeId ? "bg-accent-500/10" : "hover:bg-surface2")
              }
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-bold text-accent-700">
                {initials(c.name, c.role === "doctor" ? "DR" : "P")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-content">{title(c)}</span>
                  <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                    {c.role}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted">
                  {c.last_message || c.specialty || "Tap to message"}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        {activeContact ? (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-500/15 text-xs font-bold text-accent-700">
                {initials(activeContact.name, activeContact.role === "doctor" ? "DR" : "P")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-content">{title(activeContact)}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="size-1.5 rounded-full bg-accent-500" />
                  {activeContact.specialty || (activeContact.role === "doctor" ? "Your doctor" : "Your patient")}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
              <div className="mx-auto max-w-2xl space-y-1">
                {messages.length === 0 && (
                  <p className="pt-10 text-center text-sm text-muted">No messages yet. Say hello 👋</p>
                )}
                {messages.map((m, i) => {
                  const mine = m.sender_role === myRole;
                  const prev = messages[i - 1];
                  const curDay = m.created_at ? dayLabel(m.created_at) : "";
                  const prevDay = prev?.created_at ? dayLabel(prev.created_at) : "";
                  const showDay = i === 0 || curDay !== prevDay;
                  const startGroup = showDay || !prev || prev.sender_role !== m.sender_role;

                  // Split off a leading "↪ Re: …" reference line into a quoted chip.
                  let refLine: string | null = null;
                  let text = m.body;
                  if (m.body.startsWith("↪ Re:")) {
                    const nl = m.body.indexOf("\n");
                    refLine = (nl === -1 ? m.body : m.body.slice(0, nl)).replace(/^↪\s*/, "");
                    text = nl === -1 ? "" : m.body.slice(nl).trim();
                  }

                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="my-4 flex items-center gap-3">
                          <span className="h-px flex-1 bg-line" />
                          <span className="rounded-full bg-surface2 px-3 py-0.5 text-[11px] font-medium text-muted">{curDay}</span>
                          <span className="h-px flex-1 bg-line" />
                        </div>
                      )}
                      <div className={"flex items-end gap-2 " + (mine ? "justify-end" : "justify-start") + (startGroup ? " mt-2.5" : " mt-0.5")}>
                        {!mine && (
                          <span
                            className={
                              "flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-[10px] font-bold text-accent-700 " +
                              (startGroup ? "" : "invisible")
                            }
                          >
                            {initials(activeContact.name, activeContact.role === "doctor" ? "DR" : "P")}
                          </span>
                        )}
                        <div
                          className={
                            "max-w-[78%] px-3.5 py-2 text-sm shadow-[0_1px_1px_rgba(16,24,40,0.04)] " +
                            (mine
                              ? "rounded-2xl rounded-br-md bg-accent-500 text-white"
                              : "rounded-2xl rounded-bl-md border border-line bg-surface text-content")
                          }
                        >
                          {refLine && (
                            <span
                              className={
                                "mb-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium " +
                                (mine ? "bg-white/15 text-white/90" : "bg-accent-500/10 text-accent-700")
                              }
                            >
                              <span className="material-symbols-outlined text-[13px]">event</span>
                              {refLine}
                            </span>
                          )}
                          {text && <p className="whitespace-pre-wrap">{text}</p>}
                          <p className={"mt-0.5 text-[10px] " + (mine ? "text-white/70" : "text-muted")}>{hhmm(m.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-line px-4 py-3 md:px-6">
              <div className="mx-auto max-w-2xl">
                {/* Reference-a-visit chip */}
                {refVisit && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-sm">
                    <span className="material-symbols-outlined text-[18px] text-accent-600">event</span>
                    <span className="min-w-0 flex-1 truncate text-content">
                      Referencing: <span className="font-medium">{refVisit.reason || "our visit"}</span>
                      {apptWhen(refVisit) && <span className="text-muted"> · {apptWhen(refVisit)}</span>}
                    </span>
                    <button onClick={() => setRefVisit(null)} className="text-muted hover:text-rose-500" aria-label="Remove reference">
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                )}

                <div className="relative flex items-end gap-2 rounded-2xl border border-line bg-surface2/50 p-2">
                  {/* Reference a visit */}
                  <div className="relative">
                    <button
                      onClick={() => setRefOpen((o) => !o)}
                      title="Reference a past visit"
                      className={
                        "flex size-9 items-center justify-center rounded-xl transition " +
                        (refOpen ? "bg-accent-500/15 text-accent-700" : "text-muted hover:bg-surface2 hover:text-content")
                      }
                    >
                      <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                    </button>
                    {refOpen && (
                      <div className="absolute bottom-12 left-0 z-20 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)] animate-fade-in">
                        <p className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Reference a visit
                        </p>
                        <div className="max-h-60 overflow-y-auto p-1.5">
                          {contactAppts.length === 0 ? (
                            <p className="px-2 py-3 text-center text-xs text-muted">No visits with this contact yet.</p>
                          ) : (
                            contactAppts.map((a) => (
                              <button
                                key={a.id}
                                onClick={() => {
                                  setRefVisit(a);
                                  setRefOpen(false);
                                }}
                                className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition hover:bg-surface2"
                              >
                                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/12 text-accent-600">
                                  <span className="material-symbols-outlined text-[16px]">event</span>
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium text-content">{a.reason || "Visit"}</span>
                                  <span className="block text-[11px] text-muted">
                                    {apptWhen(a)} · <span className="capitalize">{a.status}</span>
                                  </span>
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

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
                    placeholder="Type a message…"
                    className="max-h-28 flex-1 resize-none bg-transparent px-1 py-1.5 text-content outline-none placeholder:text-muted"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !input.trim()}
                    className="flex size-9 items-center justify-center rounded-xl bg-accent-500 text-white transition hover:bg-accent-600 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-muted">
            <div>
              <span className="material-symbols-outlined mb-2 text-5xl text-accent-600">forum</span>
              <p className="font-semibold text-content">Select a conversation</p>
              <p className="text-sm">Choose someone on the left to start messaging.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
