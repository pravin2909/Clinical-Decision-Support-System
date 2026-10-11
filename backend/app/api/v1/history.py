"""
Consultation history endpoints.

Access control is delegated to ``app.users`` (admin sees all; doctors see their
own + assigned patients'; patients see their own). A missing *or* forbidden item
returns 404 so IDs are not enumerable.
"""

from fastapi import APIRouter, Depends, HTTPException

from app import users
from app.auth import get_current_user
from app.models_db import User

router = APIRouter(prefix="/history", tags=["history"])


@router.get("")
async def get_history(
    limit: int = 50, offset: int = 0,
    current_user: User = Depends(get_current_user),
):
    """List past consultations the current user is allowed to see."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    return await users.list_history_for(current_user, limit=limit, offset=offset)


@router.get("/{consultation_id}")
async def get_history_item(
    consultation_id: int, current_user: User = Depends(get_current_user)
):
    """Fetch a single past consultation in full (if the user may see it)."""
    item = await users.get_consultation_for(current_user, consultation_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Consultation not found.")
    return item
