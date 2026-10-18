"""
Server-side conversation memory.

This is the fix for "it forgets on follow-up". The old chat relied on the client
re-sending history; here the server owns it. Each turn (the user message and the
assistant's final reply, with its tool calls + citations) is persisted to the
``messages`` table, and on the next request the prior turns are reloaded and
prepended before the model runs — so follow-ups always have context, even across
refreshes or devices.
"""

from __future__ import annotations

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from sqlalchemy import select

from app.db import session_scope
from app.models_db import Conversation, Message, Role, User

# Keep at most this many prior turns verbatim in the prompt (older ones would be
# summarized in a fuller build; this bound keeps context from overflowing).
_HISTORY_LIMIT = 20


async def create_conversation(user: User, role_context: str, first_message: str) -> dict:
    async with session_scope() as session:
        if session is None:
            return {"id": None}
        convo = Conversation(
            user_id=user.id,
            role_context=role_context,
            title=(first_message or "New conversation")[:80],
        )
        session.add(convo)
        await session.commit()
        await session.refresh(convo)
        return convo.to_dict()


async def _owned_conversation(session, user: User, conversation_id: int) -> Conversation | None:
    convo = await session.get(Conversation, conversation_id)
    if convo is None or convo.user_id != user.id:
        return None
    return convo


async def get_conversation(user: User, conversation_id: int) -> dict | None:
    async with session_scope() as session:
        if session is None:
            return None
        convo = await _owned_conversation(session, user, conversation_id)
        if convo is None:
            return None
        rows = (await session.execute(
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id)
        )).scalars().all()
        return {**convo.to_dict(), "messages": [m.to_dict() for m in rows]}


async def list_conversations(user: User) -> dict:
    async with session_scope() as session:
        if session is None:
            return {"items": []}
        rows = (await session.execute(
            select(Conversation).where(Conversation.user_id == user.id)
            .order_by(Conversation.updated_at.desc())
        )).scalars().all()
        return {"items": [c.to_dict() for c in rows]}


async def delete_conversation(user: User, conversation_id: int) -> bool:
    """Delete a conversation the caller owns (messages cascade). Returns success."""
    async with session_scope() as session:
        if session is None:
            return False
        convo = await _owned_conversation(session, user, conversation_id)
        if convo is None:
            return False
        await session.delete(convo)
        await session.commit()
        return True


async def load_history(user: User, conversation_id: int) -> list[BaseMessage]:
    """Reload prior user/assistant turns as LangChain messages for the agent."""
    async with session_scope() as session:
        if session is None:
            return []
        convo = await _owned_conversation(session, user, conversation_id)
        if convo is None:
            return []
        rows = (await session.execute(
            select(Message).where(
                Message.conversation_id == conversation_id,
                Message.role.in_(["user", "assistant"]),
            ).order_by(Message.id.desc()).limit(_HISTORY_LIMIT)
        )).scalars().all()
    rows = list(reversed(rows))
    out: list[BaseMessage] = []
    for m in rows:
        if not m.content:
            continue
        out.append(HumanMessage(m.content) if m.role == "user" else AIMessage(m.content))
    return out


async def save_turn(
    conversation_id: int, *, user_text: str, assistant_text: str,
    tool_calls: list | None = None, citations: list | None = None,
) -> None:
    async with session_scope() as session:
        if session is None:
            return
        session.add(Message(conversation_id=conversation_id, role="user", content=user_text))
        session.add(Message(
            conversation_id=conversation_id, role="assistant",
            content=assistant_text, tool_calls=tool_calls or None, citations=citations or None,
        ))
        convo = await session.get(Conversation, conversation_id)
        if convo is not None:
            # bump updated_at via a no-op touch
            convo.title = convo.title
        await session.commit()


def role_context_for(user: User) -> str:
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    return "doctor" if role == Role.doctor else "patient"
