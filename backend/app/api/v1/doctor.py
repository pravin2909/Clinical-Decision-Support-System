"""
Doctor-facing endpoints: list authorized patients and read a consent-gated
patient summary. The doctor AI copilot is the shared ``/chat/messages`` endpoint,
which routes to the doctor agent automatically based on role.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.agents import toolcore
from app.auth import get_current_user
from app.db import session_scope
from app.models_db import (
    CareRelationship,
    CareStatus,
    Consent,
    ConsentScope,
    Patient,
    Role,
    User,
)
from app.policy import require_access

router = APIRouter(prefix="/doctor", tags=["doctor"])


def _require_doctor(user: User) -> int:
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    if role != Role.doctor or user.doctor is None:
        raise HTTPException(status_code=403, detail="Doctors only.")
    return user.doctor.id


@router.get("/patients")
async def list_patients(user: User = Depends(get_current_user)):
    """List patients with an active care relationship, plus their consented scopes."""
    doctor_id = _require_doctor(user)
    async with session_scope() as session:
        if session is None:
            return {"items": []}
        care_rows = (await session.execute(
            select(CareRelationship.patient_id).where(
                CareRelationship.doctor_id == doctor_id,
                CareRelationship.status == CareStatus.active,
            )
        )).scalars().all()
        if not care_rows:
            return {"items": []}

        consents = (await session.execute(
            select(Consent.patient_id, Consent.scope).where(
                Consent.doctor_id == doctor_id,
                Consent.patient_id.in_(care_rows),
                Consent.revoked_at.is_(None),
            )
        )).all()
        scopes: dict[int, list[str]] = {}
        for pid, scope in consents:
            scopes.setdefault(pid, []).append(scope.value if hasattr(scope, "value") else scope)

        patients = (await session.execute(
            select(Patient).options(selectinload(Patient.user)).where(Patient.id.in_(care_rows))
        )).scalars().all()
        items = [{
            "patient_id": p.id,
            "name": p.user.full_name if p.user else None,
            "email": p.user.email if p.user else None,
            "gender": p.gender,
            "date_of_birth": p.date_of_birth,
            "consented_scopes": scopes.get(p.id, []),
        } for p in patients]
        return {"items": items}


@router.get("/patients/{patient_id}/summary")
async def patient_summary(patient_id: int, user: User = Depends(get_current_user)):
    """Consent-gated aggregated summary for one patient."""
    _require_doctor(user)
    await require_access(user, patient_id, ConsentScope.records)
    return await toolcore.patient_summary(patient_id)
