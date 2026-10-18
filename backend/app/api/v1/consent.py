"""
Consent endpoints: a patient grants or revokes a doctor's scoped access; patients
and doctors can list the grants relevant to them. Logic lives in ``app.consent``.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app import consent
from app.auth import get_current_user
from app.core.ratelimit import rate_limit
from app.models_db import ConsentScope, User
from app.schemas import ConsentCreate

router = APIRouter(prefix="/consents", tags=["consent"])


@router.get("")
async def list_consents(user: User = Depends(get_current_user)):
    """List consent grants: a patient's own, or those granted to a doctor."""
    return await consent.list_consents(user)


@router.post(
    "",
    status_code=201,
    dependencies=[Depends(rate_limit("consent_write", capacity=30, refill_rate=1.0))],
)
async def grant_consent(body: ConsentCreate, user: User = Depends(get_current_user)):
    """Grant (or re-activate) consent for a doctor + scope. Patient only."""
    try:
        return await consent.grant(user, body.doctor_id, body.scope)
    except consent.ConsentError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("")
async def revoke_consent(
    doctor_id: int = Query(gt=0),
    scope: ConsentScope = Query(...),
    user: User = Depends(get_current_user),
):
    """Revoke a patient's consent for a doctor + scope. Idempotent. Patient only."""
    try:
        return await consent.revoke(user, scope, doctor_id)
    except consent.ConsentError as e:
        msg = str(e)
        status = 404 if "no such" in msg.lower() else 400
        raise HTTPException(status_code=status, detail=msg)
