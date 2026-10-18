"""
Agentic chat endpoint (SSE).

``POST /chat/messages`` runs the role-appropriate LangGraph agent for one turn and
streams the result. The client sends only ``conversation_id`` (optional) + the
message — history lives on the server (see ``agents.memory``), which is what makes
follow-ups keep context. A new conversation is created on the first message.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.agents import memory, runner
from app.auth import get_current_user
from app.core.ratelimit import rate_limit
from app.models_db import User
from app.schemas import ChatMessageRequest

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/conversations")
async def list_conversations(user: User = Depends(get_current_user)):
    """List the caller's conversations (newest first)."""
    return await memory.list_conversations(user)


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: int, user: User = Depends(get_current_user)):
    """Full transcript of one conversation the caller owns (404 otherwise)."""
    convo = await memory.get_conversation(user, conversation_id)
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return convo


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: int, user: User = Depends(get_current_user)):
    """Delete a conversation the caller owns."""
    ok = await memory.delete_conversation(user, conversation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return None


@router.post(
    "/messages",
    dependencies=[Depends(rate_limit("chat", capacity=20, refill_rate=0.5))],
)
async def send_message(
    body: ChatMessageRequest, user: User = Depends(get_current_user),
):
    """Send a chat message; streams the agent's response as SSE."""
    role_context = memory.role_context_for(user)

    conversation_id = body.conversation_id
    if conversation_id is None:
        convo = await memory.create_conversation(user, role_context, body.message)
        conversation_id = convo["id"]

    async def event_stream():
        # Tell the client the conversation id up front so it can keep the thread.
        import json
        yield f"data: {json.dumps({'type': 'start', 'conversation_id': conversation_id})}\n\n"
        async for chunk in runner.run_chat_stream(user, conversation_id, body.message):
            yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")
