"""
Direct patient↔doctor messaging.

A thread is the message history between one patient and one doctor. Either side
can send, but only when an **active care relationship** connects them (checked on
every send and read). Listings are enriched with the other party's name so the
UI can show a contacts list.

"Real-time" is delivered by the client polling the thread endpoint on a short
interval — simple and reliable for a project of this size (no websocket server).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import session_scope
from app.models_db import (
    CareRelationship,
    CareStatus,
    Doctor,
    Patient,
    Role,
    ThreadMessage,
)


class MessagingError(Exception):
    """Expected, user-facing failures."""


def _role(user) -> Role:
    return user.role if isinstance(user.role, Role) else Role(user.role)


def _resolve_pair(user, other_id: int) -> tuple[int, int, str]:
    """Return (patient_id, doctor_id, sender_role). ``other_id`` is the counterparty."""
    role = _role(user)
    if role == Role.patient:
        if user.patient is None:
            raise MessagingError("No patient profile.")
        return user.patient.id, other_id, "patient"
    if role == Role.doctor:
        if user.doctor is None:
            raise MessagingError("No doctor profile.")
        return other_id, user.doctor.id, "doctor"
    raise MessagingError("Only patients and doctors can message.")


async def _care_active(session, patient_id: int, doctor_id: int) -> bool:
    status = (await session.execute(
        select(CareRelationship.status).where(
            CareRelationship.patient_id == patient_id,
            CareRelationship.doctor_id == doctor_id,
        )
    )).scalar_one_or_none()
    return status == CareStatus.active


async def send(user, other_id: int, body: str) -> dict:
    patient_id, doctor_id, sender_role = _resolve_pair(user, other_id)
    body = (body or "").strip()
    if not body:
        raise MessagingError("Message cannot be empty.")
    async with session_scope() as session:
        if session is None:
            raise MessagingError("Database is unavailable.")
        if not await _care_active(session, patient_id, doctor_id):
            raise MessagingError("You can only message a connected care contact.")
        row = ThreadMessage(
            patient_id=patient_id, doctor_id=doctor_id, sender_role=sender_role, body=body,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row.to_dict()


async def thread(user, other_id: int, after_id: int | None = None) -> dict:
    """Messages in the thread, oldest→newest. ``after_id`` fetches only newer ones (polling)."""
    patient_id, doctor_id, _ = _resolve_pair(user, other_id)
    async with session_scope() as session:
        if session is None:
            return {"items": []}
        if not await _care_active(session, patient_id, doctor_id):
            raise MessagingError("No active care relationship with this contact.")
        stmt = select(ThreadMessage).where(
            ThreadMessage.patient_id == patient_id, ThreadMessage.doctor_id == doctor_id,
        )
        if after_id:
            stmt = stmt.where(ThreadMessage.id > after_id)
        rows = (await session.execute(stmt.order_by(ThreadMessage.id))).scalars().all()
        return {"items": [m.to_dict() for m in rows]}


async def contacts(user) -> dict:
    """The caller's messageable contacts (active care), with name + last message."""
    role = _role(user)
    async with session_scope() as session:
        if session is None:
            return {"items": []}

        if role == Role.patient and user.patient:
            pid = user.patient.id
            doctor_ids = (await session.execute(
                select(CareRelationship.doctor_id).where(
                    CareRelationship.patient_id == pid, CareRelationship.status == CareStatus.active,
                )
            )).scalars().all()
            if not doctor_ids:
                return {"items": []}
            docs = (await session.execute(
                select(Doctor).options(selectinload(Doctor.user)).where(Doctor.id.in_(doctor_ids))
            )).scalars().all()
            items = []
            for d in docs:
                last = await _last_message(session, pid, d.id)
                items.append({
                    "id": d.id,  # other_id to message
                    "name": d.user.full_name if d.user else None,
                    "role": "doctor",
                    "specialty": d.specialty,
                    "last_message": last,
                })
            return {"items": items}

        if role == Role.doctor and user.doctor:
            did = user.doctor.id
            patient_ids = (await session.execute(
                select(CareRelationship.patient_id).where(
                    CareRelationship.doctor_id == did, CareRelationship.status == CareStatus.active,
                )
            )).scalars().all()
            if not patient_ids:
                return {"items": []}
            pats = (await session.execute(
                select(Patient).options(selectinload(Patient.user)).where(Patient.id.in_(patient_ids))
            )).scalars().all()
            items = []
            for p in pats:
                last = await _last_message(session, p.id, did)
                items.append({
                    "id": p.id,  # other_id to message
                    "name": p.user.full_name if p.user else None,
                    "role": "patient",
                    "specialty": None,
                    "last_message": last,
                })
            return {"items": items}

        return {"items": []}


async def _last_message(session, patient_id: int, doctor_id: int) -> str | None:
    row = (await session.execute(
        select(ThreadMessage.body).where(
            ThreadMessage.patient_id == patient_id, ThreadMessage.doctor_id == doctor_id,
        ).order_by(ThreadMessage.id.desc()).limit(1)
    )).scalar_one_or_none()
    return row[:80] if row else None


async def send_from_patient(patient_id: int, doctor_id: int, body: str) -> dict:
    """Core insert used by the patient agent's message_my_doctor tool."""
    async with session_scope() as session:
        if session is None:
            return {"ok": False, "error": "db unavailable"}
        row = ThreadMessage(
            patient_id=patient_id, doctor_id=doctor_id, sender_role="patient", body=body,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return {"ok": True, "id": row.id}
