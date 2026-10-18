"""
Patient↔doctor messaging endpoints.

- GET  /messages/contacts        → connected contacts (name + last message)
- GET  /messages/thread/{id}     → the thread with that contact (after= for polling)
- POST /messages                 → send a message to a connected contact
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app import messaging
from app.auth import get_current_user
from app.core.ratelimit import rate_limit
from app.models_db import User

router = APIRouter(prefix="/messages", tags=["messages"])


class MessageCreate(BaseModel):
    to_id: int = Field(gt=0)  # the other party's profile id (doctor_id or patient_id)
    body: str = Field(min_length=1, max_length=4000)


@router.get("/contacts")
async def list_contacts(user: User = Depends(get_current_user)):
    """Connected people the caller can message."""
    return await messaging.contacts(user)


@router.get("/thread/{other_id}")
async def get_thread(
    other_id: int,
    after: int | None = Query(default=None),
    user: User = Depends(get_current_user),
):
    """Messages with one contact. Pass ``after`` (last seen id) to poll for new ones."""
    try:
        return await messaging.thread(user, other_id, after_id=after)
    except messaging.MessagingError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post(
    "",
    status_code=201,
    dependencies=[Depends(rate_limit("message", capacity=30, refill_rate=1.0))],
)
async def send_message(body: MessageCreate, user: User = Depends(get_current_user)):
    """Send a message to a connected contact."""
    try:
        return await messaging.send(user, body.to_id, body.body)
    except messaging.MessagingError as e:
        raise HTTPException(status_code=400, detail=str(e))
