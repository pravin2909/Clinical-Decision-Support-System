"""
Prescriptions: patients read their own; doctors issue them (consent-gated) and
read ones they issued.
"""

from fastapi import APIRouter, Depends, HTTPException

from app import documents
from app.agents import toolcore
from app.auth import get_current_user
from app.db import session_scope
from app.models_db import ConsentScope, Prescription, Role, User
from app.policy import require_access
from app.schemas import PrescriptionCreate

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@router.get("")
async def list_prescriptions(user: User = Depends(get_current_user)):
    """List prescriptions: a patient's own, or those a doctor has issued."""
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    if role == Role.patient and user.patient:
        return {"items": await documents.list_prescriptions_for(user.patient.id, None)}
    if role == Role.doctor and user.doctor:
        return {"items": await documents.list_prescriptions_for(None, user.doctor.id)}
    return {"items": []}


@router.post("", status_code=201)
async def create_prescription(body: PrescriptionCreate, user: User = Depends(get_current_user)):
    """
    Create a prescription.
    - Doctor: issues it to a patient (consent-gated); doctor_id is the doctor.
    - Patient: saves their own (e.g. from an uploaded prescription), recording the
      external prescriber's name; doctor_id is null.
    """
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    items = [i.model_dump() for i in body.items]

    if role == Role.patient and user.patient is not None:
        doctor_id = None
        prescriber_name = body.prescriber_name
        # If they picked a connected doctor, verify the active care link and attach it.
        if body.doctor_id:
            from sqlalchemy import select

            from app.db import session_scope
            from app.models_db import CareRelationship, CareStatus
            async with session_scope() as s:
                if s is not None:
                    ok = (await s.execute(
                        select(CareRelationship.id).where(
                            CareRelationship.patient_id == user.patient.id,
                            CareRelationship.doctor_id == body.doctor_id,
                            CareRelationship.status == CareStatus.active,
                        )
                    )).scalar_one_or_none()
                    if ok is None:
                        raise HTTPException(status_code=403, detail="You are not connected to that doctor.")
            doctor_id = body.doctor_id
            prescriber_name = None  # the doctor name comes from the link
        return await toolcore.create_prescription(
            user.patient.id, doctor_id, items, body.notes, prescriber_name=prescriber_name,
        )

    if role == Role.doctor and user.doctor is not None:
        if not body.patient_id:
            raise HTTPException(status_code=400, detail="patient_id is required.")
        await require_access(user, body.patient_id, ConsentScope.records)
        return await toolcore.create_prescription(body.patient_id, user.doctor.id, items, body.notes)

    raise HTTPException(status_code=403, detail="Not allowed to create prescriptions.")


@router.delete("/{prescription_id}", status_code=204)
async def delete_prescription(prescription_id: int, user: User = Depends(get_current_user)):
    """Delete a prescription: a patient deletes their own; a doctor deletes ones they issued."""
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    async with session_scope() as session:
        if session is None:
            raise HTTPException(status_code=503, detail="Database unavailable.")
        rx = await session.get(Prescription, prescription_id)
        allowed = rx is not None and (
            (role == Role.patient and user.patient and rx.patient_id == user.patient.id)
            or (role == Role.doctor and user.doctor and rx.doctor_id == user.doctor.id)
        )
        if not allowed:
            raise HTTPException(status_code=404, detail="Prescription not found.")
        await session.delete(rx)
        await session.commit()
    return None
