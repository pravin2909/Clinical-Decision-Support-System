"""
Care-relationship persistence: request / accept / revoke the doctor↔patient link
and list a user's relationships.

State machine (enforced here, not in the routes):

    (no row) --request--> pending --accept--> active
    pending/active --revoke--> revoked --request(again)--> pending

The same row is reused across re-requests. Only the *counterparty* of a pending
request may accept it, and either party may revoke at any point. These rules are
the business logic; the HTTP layer just maps outcomes to status codes.
"""

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import session_scope
from app.models_db import (
    CareRelationship,
    CareStatus,
    Consent,
    Doctor,
    Patient,
    Role,
    User,
)


class CareError(Exception):
    """Expected, user-facing failures (bad target, illegal transition, …)."""


def _resolve_pair(user: User, other_id: int) -> tuple[int, int, Role]:
    """
    From the caller + the other party's *profile id*, return
    ``(patient_id, doctor_id, initiator_role)``. ``other_id`` is a doctor_id when
    the caller is a patient, and a patient_id when the caller is a doctor.
    """
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    if role == Role.patient:
        if user.patient is None:
            raise CareError("Caller has no patient profile.")
        return user.patient.id, other_id, Role.patient
    if role == Role.doctor:
        if user.doctor is None:
            raise CareError("Caller has no doctor profile.")
        return other_id, user.doctor.id, Role.doctor
    raise CareError("Only patients and doctors can hold care relationships.")


async def request_relationship(user: User, other_id: int) -> dict:
    """
    Open (or re-open) a care request. Idempotent-ish: if an active relationship
    already exists it is returned unchanged; a revoked one is moved back to
    pending; a pending one is returned as-is.
    """
    patient_id, doctor_id, initiator = _resolve_pair(user, other_id)
    async with session_scope() as session:
        if session is None:
            raise CareError("Database is unavailable.")

        # Validate both endpoints exist.
        if await session.get(Patient, patient_id) is None:
            raise CareError(f"Patient {patient_id} not found.")
        if await session.get(Doctor, doctor_id) is None:
            raise CareError(f"Doctor {doctor_id} not found.")

        row = (await session.execute(
            select(CareRelationship).where(
                CareRelationship.patient_id == patient_id,
                CareRelationship.doctor_id == doctor_id,
            )
        )).scalar_one_or_none()

        if row is None:
            row = CareRelationship(
                patient_id=patient_id, doctor_id=doctor_id,
                status=CareStatus.pending, initiated_by=initiator,
            )
            session.add(row)
        elif row.status == CareStatus.revoked:
            row.status = CareStatus.pending
            row.initiated_by = initiator
        # pending/active → return as-is (no-op).

        await session.commit()
        await session.refresh(row)
        return row.to_dict()


async def accept_relationship(user: User, relationship_id: int) -> dict:
    """
    Accept a pending request. Only the party that did NOT initiate it may accept,
    and only while it is pending.
    """
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    async with session_scope() as session:
        if session is None:
            raise CareError("Database is unavailable.")

        row = await session.get(CareRelationship, relationship_id)
        if row is None or not _is_party(user, row, role):
            # Hide existence from non-parties.
            raise CareError("Care request not found.")
        if row.status != CareStatus.pending:
            raise CareError(f"Cannot accept a relationship that is '{row.status.value}'.")
        if row.initiated_by == role:
            raise CareError("You cannot accept a request you initiated; the other party must.")

        row.status = CareStatus.active
        await session.commit()
        await session.refresh(row)
        return row.to_dict()


async def revoke_relationship(user: User, relationship_id: int) -> dict:
    """Revoke a relationship. Either party may do this, from any live state."""
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    async with session_scope() as session:
        if session is None:
            raise CareError("Database is unavailable.")

        row = await session.get(CareRelationship, relationship_id)
        if row is None or not _is_party(user, row, role):
            raise CareError("Care relationship not found.")
        if row.status == CareStatus.revoked:
            return row.to_dict()  # already revoked → idempotent

        row.status = CareStatus.revoked
        await session.commit()
        await session.refresh(row)
        return row.to_dict()


async def list_relationships(user: User) -> dict:
    """
    List the caller's care relationships (as patient or as doctor), enriched with
    the other party's name/specialty and (for the patient view) the scopes they
    have consented to for that doctor.
    """
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    async with session_scope() as session:
        if session is None:
            return {"items": []}

        stmt = select(CareRelationship)
        if role == Role.patient and user.patient:
            stmt = stmt.where(CareRelationship.patient_id == user.patient.id)
        elif role == Role.doctor and user.doctor:
            stmt = stmt.where(CareRelationship.doctor_id == user.doctor.id)
        elif role == Role.admin:
            pass  # admin sees all
        else:
            return {"items": []}

        rows = (await session.execute(
            stmt.order_by(CareRelationship.updated_at.desc())
        )).scalars().all()

        # Enrich with doctor + patient display info in one pass.
        doctor_ids = {r.doctor_id for r in rows}
        patient_ids = {r.patient_id for r in rows}
        doctors = {d.id: d for d in (await session.execute(
            select(Doctor).options(selectinload(Doctor.user)).where(Doctor.id.in_(doctor_ids))
        )).scalars().all()} if doctor_ids else {}
        patients = {p.id: p for p in (await session.execute(
            select(Patient).options(selectinload(Patient.user)).where(Patient.id.in_(patient_ids))
        )).scalars().all()} if patient_ids else {}

        # Active consents for the patient→doctor pairs (patient view mostly).
        consents: dict[tuple[int, int], list[str]] = {}
        if rows:
            crows = (await session.execute(
                select(Consent.patient_id, Consent.doctor_id, Consent.scope)
                .where(Consent.revoked_at.is_(None))
            )).all()
            for p_id, d_id, scope in crows:
                consents.setdefault((p_id, d_id), []).append(
                    scope.value if hasattr(scope, "value") else scope
                )

        items = []
        for r in rows:
            d = doctors.get(r.doctor_id)
            p = patients.get(r.patient_id)
            items.append({
                **r.to_dict(),
                "doctor_name": (d.user.full_name if d and d.user else None),
                "doctor_specialty": (d.specialty if d else None),
                "patient_name": (p.user.full_name if p and p.user else None),
                "consented_scopes": consents.get((r.patient_id, r.doctor_id), []),
            })
        return {"items": items}


def _is_party(user: User, row: CareRelationship, role: Role) -> bool:
    """Is ``user`` one of the two parties to this relationship (admins count)?"""
    if role == Role.admin:
        return True
    if role == Role.patient and user.patient:
        return row.patient_id == user.patient.id
    if role == Role.doctor and user.doctor:
        return row.doctor_id == user.doctor.id
    return False
