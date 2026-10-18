"""
Care-relationship endpoints: request, accept, revoke, and list the doctor↔patient
link. Business rules (who may accept, legal transitions) live in ``app.care``;
this module maps outcomes to HTTP.

A relationship being *active* is one half of the access check — the patient must
also grant scoped consent (see ``/consents``). Both halves are enforced by
``app.policy`` on the data-serving endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException

from app import care, users
from app.auth import get_current_user
from app.core.ratelimit import rate_limit
from app.models_db import User
from app.schemas import CareRequestCreate

router = APIRouter(prefix="/care", tags=["care"])


@router.get("/doctors")
async def doctor_directory(_: User = Depends(get_current_user)):
    """Directory of doctors a patient can request to connect with."""
    return {"items": await users.list_doctors()}


@router.post(
    "/requests",
    status_code=201,
    dependencies=[Depends(rate_limit("care_write", capacity=20, refill_rate=1.0))],
)
async def request_care(body: CareRequestCreate, user: User = Depends(get_current_user)):
    """Open a care request to the other party (doctor_id if patient, else patient_id)."""
    try:
        return await care.request_relationship(user, body.target_id)
    except care.CareError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/requests/{relationship_id}/accept")
async def accept_care(relationship_id: int, user: User = Depends(get_current_user)):
    """Accept a pending request addressed to the caller → the link becomes active."""
    try:
        return await care.accept_relationship(user, relationship_id)
    except care.CareError as e:
        # "not found" is a 404 so non-parties can't probe ids; rule violations 409.
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=409, detail=msg)


@router.delete("/{relationship_id}")
async def revoke_care(relationship_id: int, user: User = Depends(get_current_user)):
    """Revoke a care relationship (either party, any live state). Idempotent."""
    try:
        return await care.revoke_relationship(user, relationship_id)
    except care.CareError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("")
async def list_care(user: User = Depends(get_current_user)):
    """List the caller's care relationships."""
    return await care.list_relationships(user)
