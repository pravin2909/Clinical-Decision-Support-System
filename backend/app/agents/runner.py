"""
Run an agent graph for one chat turn and stream it as SSE events.

Flow:
1. Resolve the role (patient/doctor) and load prior turns from memory.
2. Set the acting user in the context var (tools read it).
3. Stream the graph with ``astream_events``: emit ``status`` on tool calls,
   ``token`` as the answer streams, collect ``citation`` payloads from retrieval
   tools, and finally ``done``.
4. Persist the user message + assistant reply so the next turn remembers it.

Event shapes match the frontend protocol (status / token / citation / done / error).
"""

from __future__ import annotations

import json
import logging

from langchain_core.messages import HumanMessage
from langgraph.errors import GraphRecursionError

from app.agents import memory
from app.agents.context import reset_current_user, set_current_user
from app.agents.graph import RECURSION_LIMIT, graph_for
from app.models_db import User

log = logging.getLogger("dpt.agent")

# Tools whose output carries citable sources.
_CITATION_TOOLS = {"search_clinical_literature", "search_doctor_kb", "search_patient_kb"}


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _as_obj(output):
    """Best-effort decode of a tool output (ToolMessage content) into a Python obj."""
    if isinstance(output, str):
        try:
            return json.loads(output)
        except Exception:
            try:
                import ast
                return ast.literal_eval(output)
            except Exception:
                return None
    return output


def _citations_from_output(output) -> list[dict]:
    """Extract {title,url} citations from a retrieval tool's output."""
    items = output
    if isinstance(output, str):
        try:
            items = json.loads(output)
        except Exception:
            return []
    if not isinstance(items, list):
        return []
    cites = []
    for it in items:
        if isinstance(it, dict) and (it.get("title") or it.get("url")):
            cites.append({"title": it.get("title"), "url": it.get("url")})
    return cites


async def run_chat_stream(user: User, conversation_id: int, message: str):
    """Async generator of SSE strings for one chat message."""
    role_context = memory.role_context_for(user)
    history = await memory.load_history(user, conversation_id)
    inputs = {"messages": [*history, HumanMessage(message)]}

    graph = graph_for(role_context)
    token = set_current_user(user)
    answer_parts: list[str] = []
    citations: list[dict] = []
    tools_used: list[str] = []

    try:
        yield _sse({"type": "status", "phase": "thinking"})
        async for ev in graph.astream_events(
            inputs, version="v2", config={"recursion_limit": RECURSION_LIMIT}
        ):
            kind = ev.get("event")
            if kind == "on_chat_model_stream":
                chunk = ev["data"].get("chunk")
                text = getattr(chunk, "content", "") if chunk else ""
                if text:
                    answer_parts.append(text)
                    yield _sse({"type": "token", "content": text})
            elif kind == "on_tool_start":
                name = ev.get("name", "tool")
                tools_used.append(name)
                yield _sse({"type": "status", "phase": "tool", "tool": name})
            elif kind == "on_tool_end":
                name = ev.get("name", "")
                out = ev["data"].get("output")
                content = getattr(out, "content", out)
                if name in _CITATION_TOOLS:
                    for c in _citations_from_output(content):
                        if c not in citations:
                            citations.append(c)
                            yield _sse({"type": "citation", **c})
                elif name == "draft_prescription":
                    obj = _as_obj(content)
                    if isinstance(obj, dict) and obj.get("requires_confirmation"):
                        yield _sse({
                            "type": "confirm",
                            "action": "draft_prescription",
                            "payload": {
                                "patient_id": obj.get("patient_id"),
                                "items": obj.get("items") or [],
                                "notes": obj.get("notes"),
                            },
                        })
    except GraphRecursionError:
        # The model looped on tools without concluding — bounded, not a crash.
        log.warning("agent_recursion_limit")
        if not answer_parts:
            msg = "I couldn't settle on an answer for that. Could you rephrase or be more specific?"
            answer_parts.append(msg)
            yield _sse({"type": "token", "content": msg})
    except Exception as e:  # pragma: no cover
        log.exception("agent_run_failed")
        yield _sse({"type": "error", "message": f"Agent error: {e}"})
    finally:
        reset_current_user(token)

    answer = "".join(answer_parts).strip()
    if answer:
        await memory.save_turn(
            conversation_id, user_text=message, assistant_text=answer,
            tool_calls=tools_used or None, citations=citations or None,
        )
    yield _sse({"type": "done", "conversation_id": conversation_id, "citations": citations})
