"""
The LangGraph agent graph.

A minimal, standard tool-calling loop:

    START → agent → (tools → agent)* → END

- ``agent`` node calls the LLM (bound to the role's tools). If the model asks for
  tools, we go to the ``tools`` node, run them, and loop back so the model can
  use the results. When the model answers without tool calls, we stop.
- ``AGENT_MAX_STEPS`` bounds the loop so a confused model can't spin forever.

Two compiled graphs are built once (patient, doctor); they differ only in the
system prompt and the bound tool set. Per-request user identity is carried in a
``ContextVar`` (see ``agents.context``), not in the graph, so the graphs are
shared safely across requests.
"""

from __future__ import annotations

from functools import lru_cache

from langchain_core.messages import SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import Annotated, TypedDict

from app.agents.prompts import DOCTOR_AGENT_PROMPT, PATIENT_AGENT_PROMPT
from app.agents.tools import DOCTOR_TOOLS, PATIENT_TOOLS
from app.config import AGENT_MAX_STEPS
from app.llm.model import get_chat_model


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


def _build(system_prompt: str, tools: list):
    model = get_chat_model().bind_tools(tools)
    tool_node = ToolNode(tools)

    async def agent_node(state: AgentState):
        msgs = state["messages"]
        # Ensure the system prompt leads the conversation exactly once.
        if not msgs or not isinstance(msgs[0], SystemMessage):
            msgs = [SystemMessage(content=system_prompt), *msgs]
        response = await model.ainvoke(msgs)
        return {"messages": [response]}

    def should_continue(state: AgentState) -> str:
        last = state["messages"][-1]
        return "tools" if getattr(last, "tool_calls", None) else END

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile()


@lru_cache(maxsize=1)
def patient_graph():
    return _build(PATIENT_AGENT_PROMPT, PATIENT_TOOLS)


@lru_cache(maxsize=1)
def doctor_graph():
    return _build(DOCTOR_AGENT_PROMPT, DOCTOR_TOOLS)


def graph_for(role_context: str):
    return doctor_graph() if role_context == "doctor" else patient_graph()


# Exposed so the runner can pass a recursion limit derived from AGENT_MAX_STEPS.
RECURSION_LIMIT = AGENT_MAX_STEPS * 2 + 1
