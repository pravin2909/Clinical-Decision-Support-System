# Agentic Rebuild Plan — LangGraph + MCP + Memory

Scope: turn the current single-shot chat into a real **agentic** system — a
LangGraph-orchestrated agent on `gpt-oss-20b`, tools exposed over **MCP**,
**persistent conversation memory** (LangGraph checkpointer), consent-gated
patient data, and real-time SSE streaming. Covers backend, ML/LLM layer,
database, frontend, infra, and tests.


---

## 0. Target architecture

```
gpt-oss-20b (LM Studio, OpenAI-compatible)
        │  drives
LangGraph agent graph  ──────────────────────────────┐
  nodes: triage → agent(LLM) → tools → generate       │ checkpointer (Postgres)
  conditional edges, human-in-the-loop interrupts     │ = conversation memory
        │  MCP client                                  │
        ├──────────────► Patient MCP server (tools)    │
        └──────────────► Doctor  MCP server (tools)    │
                                 │                      │
                          app.policy (consent) ◀────────┘
```

- **LangGraph** = orchestration + state + memory + human-in-the-loop.
- **MCP** = the tools, as standalone servers the agent connects to as a client.
- **Memory** = LangGraph's checkpointer persisting graph state per `thread_id`
  (one thread = one conversation) in Postgres. This is the fix for "forgets on
  follow-up".
- **Safety** = deterministic triage node runs before the LLM; every patient-data
  tool calls `app.policy.require_access`.

---

## 1. LLM / model migration

- Switch `LLM_MODEL` → the `gpt-oss-20b` id LM Studio exposes (confirm via
  `GET /v1/models`; likely `openai/gpt-oss-20b`). Keep provider-agnostic.
- New `app/llm/client.py` — one wrapper with:
  - `chat(messages, tools=None)` non-streaming,
  - `chat_stream(messages, tools=None)` streaming **with tool-call delta
    accumulation** (gpt-oss streams `tool_calls` in fragments that must be
    reassembled before execution),
  - timeout + graceful error payloads (reuse current behaviour).
- Retire the one-off prompt builders in `reasoning.py`/`research.py` by routing
  them through the new client (keep the literature-retrieval logic in
  `research.py`, it becomes a tool).

## 2. New dependencies (`backend/requirements.txt`)

- `langgraph`, `langchain-core` (graph + messages/state).
- `langgraph-checkpoint-postgres` (persistent memory).
- `mcp` (official Python SDK — server + client).
- `rapidfuzz` or similar only if needed for drug-name matching.
- OCR: `pytesseract` + `Pillow` (already present) + system `tesseract`; or a
  pure-python fallback. (Document the system dep in README + Dockerfile.)
- `pgvector` Python bindings + enable the `vector` extension (compose image
  already is `pgvector/pgvector:pg16`).

## 3. Backend structure (new/changed)

```
backend/app/
├── llm/client.py              # NEW provider wrapper (tools + streaming)
├── agents/
│   ├── graph.py               # NEW LangGraph: nodes, edges, checkpointer
│   ├── state.py               # NEW typed graph state (messages, patient_id, role…)
│   ├── patient_graph.py       # NEW patient system prompt + tool binding
│   ├── doctor_graph.py        # NEW doctor system prompt + tool binding
│   └── run.py                 # NEW: stream a graph run as SSE events
├── mcp_servers/
│   ├── patient_tools.py       # NEW MCP server: patient tools
│   ├── doctor_tools.py        # NEW MCP server: doctor tools
│   └── shared.py              # NEW: consent checks, serialization helpers
├── rag/
│   ├── store.py               # NEW pgvector upsert/query
│   └── ingest.py              # NEW chunk + embed + upsert (worker-able)
├── ocr/extract.py             # NEW prescription OCR + structured parse
├── api/v1/chat.py             # NEW SSE chat endpoint + conversations list
├── api/v1/documents.py        # NEW upload/list documents
├── api/v1/prescriptions.py    # NEW list/create prescriptions
├── api/v1/doctor.py           # NEW doctor copilot + patient summary
└── models_db.py               # +Conversation, Message, Document, Prescription, KbDocument, KbChunk
```

### LangGraph graph (per role)

Nodes:
1. `triage` (patient only) — deterministic red-flag rules; if urgent, short-circuit
   with an emergency message (no LLM).
2. `agent` — the LLM node; sees tools, decides to call one or answer.
3. `tools` — executes the requested MCP tool(s), appends results.
4. `generate` — final streamed answer.
Edges: `agent → tools → agent` loop while tool calls are requested; `agent →
generate` when it answers. `draft_prescription` triggers a LangGraph
**interrupt** → returns to the doctor for confirm → resume saves the record.

### Memory (the follow-up fix)

- LangGraph `PostgresSaver` checkpointer keyed by `thread_id = conversation_id`.
- Client sends only `conversation_id` + the new message; the server reloads the
  full graph state (prior turns + tool results) automatically.
- Long threads: a `summarize` step compresses old turns into a running summary
  stored in state, keeping context bounded. No more mid-chat drift/hallucination.
- `conversations` / `messages` tables also persist a human-readable transcript
  for the history UI (separate from the checkpointer's internal state).

### Tools (over MCP)

Patient MCP server (all patient-data tools call `require_access(user, pid, scope)`,
which for a patient = own-data check):
- `get_my_profile`, `get_my_observations`, `get_my_prescriptions`,
  `get_my_image_cases`, `search_patient_kb`, `triage_check` (deterministic),
  `recommend_lifestyle` (grounded in their observations),
  `parse_my_prescription` (OCR), `message_my_doctor` (write → confirm).

Doctor MCP server:
- `search_clinical_literature` (existing Europe PMC + Semantic Scholar),
  `search_doctor_kb` (pgvector), `get_patient_summary` (consent),
  `get_patient_observations` (consent), `check_drug_interactions` (RxNorm/openFDA),
  `summarize_case` (consent), `draft_prescription` (consent + human-in-loop).

## 4. Database changes (Alembic migration)

New tables (FHIR-ish names per master plan):
- `conversations` (id, user_id, role_context, title, summary, created_at)
- `messages` (id, conversation_id, role, content, tool_calls JSONB, citations JSONB, created_at)
- `documents` (id, patient_id, type, file_uri, extracted_text, parsed JSONB, status)
- `prescriptions` (id, patient_id, doctor_id, items JSONB, notes, status, issued_at)
- `kb_documents` (id, audience, title, source_url, license, ingested_at)
- `kb_chunks` (id, document_id, chunk_text, embedding VECTOR(n), metadata JSONB)
- LangGraph checkpoint tables (created by the checkpointer's own migration).
- Enable `CREATE EXTENSION vector;` in the migration.

## 5. API surface (v1)

- `POST /api/v1/chat/messages` — SSE stream; body `{conversation_id?, message}`.
- `GET  /api/v1/chat/conversations` — list the caller's conversations.
- `GET  /api/v1/chat/conversations/{id}` — full transcript.
- `POST /api/v1/documents` — upload prescription/report (async OCR).
- `GET  /api/v1/documents/{id}` — status + parsed result.
- `GET/POST /api/v1/prescriptions` — list / doctor-create.
- `GET  /api/v1/doctor/patients/{id}/summary` — consent-gated summary.
- `POST /api/v1/doctor/copilot` — doctor agent (SSE).
- `POST /api/v1/admin/kb/ingest` — ingest KB docs.
- Rate-limit the chat + upload endpoints (reuse `app.core.ratelimit`).
- Auth: all require a token; **SSE must send the bearer token** (see frontend fix).

## 6. Real-time SSE event protocol

```
status   {"phase":"triage|tool|generating","tool":"<name>"}
token    {"content":"…"}                 # streamed answer text
citation {"n":1,"title":"…","url":"…","source":"guideline|paper|kb"}
confirm  {"action":"draft_prescription","payload":{…}}   # human-in-loop pause
done     {"conversation_id":42}
error    {"message":"…"}
```

## 7. Frontend changes (`frontend/src/`)

Current gaps found in code: `lib/api.ts` streaming sends **no Authorization
header** and posts chat **history from the client** (the forgetting cause). Both
are replaced by server-side memory.

- `lib/api.ts`
  - New `sendChatMessage({conversationId, message})` → SSE, **with bearer token**.
  - Drop client-sent `history`; send `conversation_id` only.
  - New typed calls: `listConversations`, `getConversation`, `uploadDocument`,
    `getDocument`, `listPrescriptions`, `getPatientSummary`, `doctorCopilot`.
  - Central 401→logout, 403→permission message, 429→retry-after handling.
- `types.ts` — extend `StreamEvent` with `status | citation | confirm` variants.
- Pages
  - `ChatPage.tsx` — rewire to `sendChatMessage`; render `status` chips
    ("Reading your glucose…"), streamed tokens, citation chips; keep
    `conversation_id` in state; load prior conversation on open.
  - `DoctorCopilotPage.tsx` — point at `/doctor/copilot`; evidence-source badges,
    expandable citation drawer, confirm-dialog for `draft_prescription`.
  - `PatientDashboard.tsx` — surface agent recommendations + triage result banner.
  - `HistoryPage.tsx` — list conversations (from server), reopen to continue.
  - NEW `PrescriptionsPage.tsx` — upload prescription (drag-drop), OCR status,
    parsed meds + daily schedule.
- Components (new, reusable — from master plan §13)
  - `StreamingMessage`, `CitationChip`, `CitationDrawer`, `ConfidenceBadge`,
    `DisclaimerBanner`, `ConsentToggle`, `EmptyState`, `ErrorState`, skeletons.
- Consent UI: a page/section where a patient grants/revokes doctor access per
  scope (wires to the `/consents` API already built).

## 8. Infra / config

- `.env.example` + `config.py`: `LLM_MODEL=gpt-oss-20b`, embedding model config,
  `MCP_PATIENT_URL` / `MCP_DOCTOR_URL` (if run as separate processes), OCR flag.
- `docker-compose.yml`: already has pgvector + redis; add the MCP servers as
  services if run out-of-process (or run in-process initially), add `tesseract`
  to the backend image.
- Readiness `/readyz`: include LLM reachable + MCP servers up.

## 9. Build order (each slice is demoable)

1. **LLM client + model migration** — `gpt-oss-20b`, tool-calling + streaming.
2. **LangGraph engine + memory** — graph, Postgres checkpointer, `conversations`
   /`messages`, chat SSE endpoint. ⟶ follow-ups keep context.
3. **Patient tools over MCP** — observations/triage/lifestyle; frontend ChatPage
   rewire. ⟶ "what should I eat?" uses real data.
4. **Prescription upload + OCR** — documents table, upload, parse tool, new page.
5. **pgvector RAG + doctor copilot** — KB ingest, doctor tools, copilot page,
   draft-prescription human-in-loop.
6. **Polish** — citation UI, consent UI, disclaimers, empty/error states.

## 10. Testing

- Pure: triage rules, tool-arg schemas, SSE event serialization.
- Graph: a fake LLM that emits scripted tool calls → assert the loop executes
  tools, enforces consent (403 path), and reaches a final answer.
- Memory: two messages in one `conversation_id` → second run sees the first
  (the regression test for the forgetting bug).
- API: DB-backed chat/documents/prescriptions flows (existing `db_client`).
- Keep the no-DB CI path green (skip DB-backed tests without `TEST_DATABASE_URL`).

## 11. Open items to confirm

- Exact `gpt-oss-20b` model id from LM Studio `/v1/models`.
- Embedding model for pgvector (local via LM Studio, or a small sentence-transformer).
- MCP servers in-process first, or separate services from the start.
- OCR engine (tesseract system dep acceptable?).
