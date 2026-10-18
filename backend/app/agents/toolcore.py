"""
Tool data-access layer (pure): functions that read/write the DB for a given
patient id. No consent logic and no request context here — that lives in
``tools.py``, which resolves the caller, enforces ``app.policy``, then calls these.
Keeping them separate means the consent rules are applied in exactly one place
and these functions stay trivially testable.
"""

from __future__ import annotations

from sqlalchemy import select

from app import tracker
from app.db import session_scope
from sqlalchemy.orm import selectinload

from app.models_db import (
    CareRelationship,
    CareStatus,
    Consent,
    Consultation,
    Document,
    Patient,
    Prescription,
)


async def profile(patient_id: int) -> dict:
    async with session_scope() as session:
        if session is None:
            return {}
        p = await session.get(Patient, patient_id)
        if p is None:
            return {}
        return {
            "patient_id": p.id,
            "date_of_birth": p.date_of_birth,
            "gender": p.gender,
        }


async def recent_observations(patient_id: int, metric: str | None = None) -> dict:
    """Latest reading + recent trend per metric (reuses the tracker dashboard)."""
    summary = await tracker.dashboard_summary(patient_id=patient_id)
    types = summary.get("types", {})
    if metric:
        return {metric: types.get(metric, {"latest": None, "trend": []})}
    return types


async def prescriptions(patient_id: int) -> list[dict]:
    async with session_scope() as session:
        if session is None:
            return []
        rows = (await session.execute(
            select(Prescription)
            .where(Prescription.patient_id == patient_id)
            .order_by(Prescription.issued_at.desc())
        )).scalars().all()
        return [r.to_dict() for r in rows]


async def image_cases(patient_id: int, limit: int = 5) -> list[dict]:
    async with session_scope() as session:
        if session is None:
            return []
        rows = (await session.execute(
            select(Consultation)
            .where(Consultation.patient_id == patient_id, Consultation.input_type == "image")
            .order_by(Consultation.created_at.desc())
            .limit(limit)
        )).scalars().all()
        return [r.to_summary() for r in rows]


async def document(patient_id: int, document_id: int) -> dict | None:
    async with session_scope() as session:
        if session is None:
            return None
        doc = await session.get(Document, document_id)
        if doc is None or doc.patient_id != patient_id:
            return None
        return doc.to_dict()


async def active_care_doctor_id(patient_id: int) -> int | None:
    async with session_scope() as session:
        if session is None:
            return None
        return (await session.execute(
            select(CareRelationship.doctor_id).where(
                CareRelationship.patient_id == patient_id,
                CareRelationship.status == CareStatus.active,
            ).limit(1)
        )).scalar_one_or_none()


async def record_patient_message(patient_id: int, doctor_id: int, note: str) -> dict:
    """Persist a patient→doctor note as a consultation row the doctor can see."""
    async with session_scope() as session:
        if session is None:
            return {"ok": False, "error": "db unavailable"}
        row = Consultation(
            patient_id=patient_id, doctor_id=doctor_id,
            input_type="patient_message", input_text=note,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return {"ok": True, "id": row.id, "doctor_id": doctor_id}


async def doctor_patients(doctor_id: int) -> list[dict]:
    """A doctor's connected patients with name/email and consented scopes.

    Lets the agent resolve a patient referred to by name/email into a patient_id.
    """
    async with session_scope() as session:
        if session is None:
            return []
        pids = (await session.execute(
            select(CareRelationship.patient_id).where(
                CareRelationship.doctor_id == doctor_id,
                CareRelationship.status == CareStatus.active,
            )
        )).scalars().all()
        if not pids:
            return []
        consents: dict[int, list[str]] = {}
        for pid, scope in (await session.execute(
            select(Consent.patient_id, Consent.scope).where(
                Consent.doctor_id == doctor_id,
                Consent.patient_id.in_(pids),
                Consent.revoked_at.is_(None),
            )
        )).all():
            consents.setdefault(pid, []).append(scope.value if hasattr(scope, "value") else scope)

        patients = (await session.execute(
            select(Patient).options(selectinload(Patient.user)).where(Patient.id.in_(pids))
        )).scalars().all()
        return [{
            "patient_id": p.id,
            "name": p.user.full_name if p.user else None,
            "email": p.user.email if p.user else None,
            "consented_scopes": consents.get(p.id, []),
        } for p in patients]


async def patient_summary(patient_id: int) -> dict:
    """Aggregate view for a doctor: profile + observations + prescriptions + images."""
    return {
        "profile": await profile(patient_id),
        "observations": await recent_observations(patient_id),
        "prescriptions": await prescriptions(patient_id),
        "image_cases": await image_cases(patient_id),
    }


async def create_prescription(
    patient_id: int, doctor_id: int | None, items: list[dict], notes: str | None,
    prescriber_name: str | None = None,
) -> dict:
    async with session_scope() as session:
        if session is None:
            return {"ok": False, "error": "db unavailable"}
        row = Prescription(
            patient_id=patient_id, doctor_id=doctor_id, items=items,
            notes=notes, prescriber_name=prescriber_name,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row.to_dict()
