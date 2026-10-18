"""
Appointment scheduling between patients and doctors.

State machine:
    requested --approve--> approved --complete--> completed
            \--decline--> declined
    requested/approved --cancel--> cancelled   (either party)

Scheduling is independent of data-sharing consent: a doctor can accept a visit
without yet being able to read the patient's records (that still needs consent).
Listings are enriched with the other party's name for display.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import session_scope
from app.models_db import Appointment, Doctor, Patient, Role, User


class AppointmentError(Exception):
    """Expected, user-facing failures."""


def _patient_id(user: User) -> int:
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    if role != Role.patient or user.patient is None:
        raise AppointmentError("Only patients can request appointments.")
    return user.patient.id


def _doctor_id(user: User) -> int:
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    if role != Role.doctor or user.doctor is None:
        raise AppointmentError("Only doctors can manage appointment requests.")
    return user.doctor.id


async def request(user: User, doctor_id: int, reason: str, preferred_time: str | None) -> dict:
    patient_id = _patient_id(user)
    async with session_scope() as session:
        if session is None:
            raise AppointmentError("Database is unavailable.")
        if await session.get(Doctor, doctor_id) is None:
            raise AppointmentError(f"Doctor {doctor_id} not found.")
        appt = Appointment(
            patient_id=patient_id, doctor_id=doctor_id,
            reason=reason, preferred_time=preferred_time, status="requested",
        )
        session.add(appt)
        await session.commit()
        await session.refresh(appt)
        return appt.to_dict()


def _is_party(user: User, appt: Appointment) -> bool:
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    if role == Role.admin:
        return True
    if role == Role.patient and user.patient:
        return appt.patient_id == user.patient.id
    if role == Role.doctor and user.doctor:
        return appt.doctor_id == user.doctor.id
    return False


async def _transition(user: User, appointment_id: int, *, allowed_from: set[str],
                      new_status: str, doctor_only: bool,
                      scheduled_for: datetime | None = None, notes: str | None = None) -> dict:
    async with session_scope() as session:
        if session is None:
            raise AppointmentError("Database is unavailable.")
        appt = await session.get(Appointment, appointment_id)
        if appt is None or not _is_party(user, appt):
            raise AppointmentError("Appointment not found.")
        role = user.role if isinstance(user.role, Role) else Role(user.role)
        if doctor_only and role != Role.doctor:
            raise AppointmentError("Only the doctor can do that.")
        if appt.status not in allowed_from:
            raise AppointmentError(f"Cannot move an appointment from '{appt.status}'.")
        appt.status = new_status
        if scheduled_for is not None:
            appt.scheduled_for = scheduled_for
        if notes is not None:
            appt.doctor_notes = notes
        await session.commit()
        await session.refresh(appt)
        return appt.to_dict()


async def approve(user, appointment_id, scheduled_for=None, notes=None):
    _doctor_id(user)
    return await _transition(user, appointment_id, allowed_from={"requested"},
                             new_status="approved", doctor_only=True,
                             scheduled_for=scheduled_for, notes=notes)


async def decline(user, appointment_id, notes=None):
    _doctor_id(user)
    return await _transition(user, appointment_id, allowed_from={"requested"},
                             new_status="declined", doctor_only=True, notes=notes)


async def complete(user, appointment_id, notes=None):
    _doctor_id(user)
    return await _transition(user, appointment_id, allowed_from={"approved"},
                             new_status="completed", doctor_only=True, notes=notes)


async def cancel(user, appointment_id):
    return await _transition(user, appointment_id,
                             allowed_from={"requested", "approved"},
                             new_status="cancelled", doctor_only=False)


async def list_for(user: User, status: str | None = None) -> dict:
    """List the caller's appointments, enriched with the other party's name."""
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    async with session_scope() as session:
        if session is None:
            return {"items": []}
        stmt = select(Appointment)
        if role == Role.patient and user.patient:
            stmt = stmt.where(Appointment.patient_id == user.patient.id)
        elif role == Role.doctor and user.doctor:
            stmt = stmt.where(Appointment.doctor_id == user.doctor.id)
        elif role != Role.admin:
            return {"items": []}
        if status:
            stmt = stmt.where(Appointment.status == status)
        rows = (await session.execute(stmt.order_by(Appointment.created_at.desc()))).scalars().all()

        doc_ids = {r.doctor_id for r in rows}
        pat_ids = {r.patient_id for r in rows}
        doctors = {d.id: d for d in (await session.execute(
            select(Doctor).options(selectinload(Doctor.user)).where(Doctor.id.in_(doc_ids))
        )).scalars().all()} if doc_ids else {}
        patients = {p.id: p for p in (await session.execute(
            select(Patient).options(selectinload(Patient.user)).where(Patient.id.in_(pat_ids))
        )).scalars().all()} if pat_ids else {}

        items = []
        for r in rows:
            d, p = doctors.get(r.doctor_id), patients.get(r.patient_id)
            items.append({
                **r.to_dict(),
                "doctor_name": (d.user.full_name if d and d.user else None),
                "doctor_specialty": (d.specialty if d else None),
                "patient_name": (p.user.full_name if p and p.user else None),
            })
        return {"items": items}


async def pending_count(user: User) -> int:
    """Count of requests awaiting this doctor's action (for a nav badge)."""
    data = await list_for(user, status="requested")
    return len(data["items"])
