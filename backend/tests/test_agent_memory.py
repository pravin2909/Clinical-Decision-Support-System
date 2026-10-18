"""
Conversation memory (DB-backed; skipped without TEST_DATABASE_URL).

The regression test for "forgets on follow-up": a turn saved to a conversation
must reload as history on the next turn, and conversations are owner-scoped.
"""

import uuid

from app.agents import memory
from app.auth import _load_user


async def _patient(db_client):
    email = f"m-{uuid.uuid4().hex[:8]}@example.com"
    r = await db_client.post("/api/v1/auth/register", json={
        "email": email, "password": "pw123456", "full_name": "M", "role": "patient",
    })
    return await _load_user(r.json()["id"])


async def test_turn_is_saved_and_reloaded(db_client):
    user = await _patient(db_client)
    convo = await memory.create_conversation(user, "patient", "first question")
    cid = convo["id"]

    # No history yet.
    assert await memory.load_history(user, cid) == []

    await memory.save_turn(cid, user_text="what is my glucose?", assistant_text="It is 142 mg/dL.")

    hist = await memory.load_history(user, cid)
    # One user + one assistant message come back, in order.
    assert [m.type for m in hist] == ["human", "ai"]
    assert "glucose" in hist[0].content
    assert "142" in hist[1].content


async def test_conversation_is_owner_scoped(db_client):
    owner = await _patient(db_client)
    other = await _patient(db_client)
    convo = await memory.create_conversation(owner, "patient", "mine")
    cid = convo["id"]

    assert await memory.get_conversation(owner, cid) is not None
    # Another user cannot read it, and gets no history from it.
    assert await memory.get_conversation(other, cid) is None
    assert await memory.load_history(other, cid) == []


async def test_chat_requires_auth(db_client):
    assert (await db_client.get("/api/v1/chat/conversations")).status_code == 401
