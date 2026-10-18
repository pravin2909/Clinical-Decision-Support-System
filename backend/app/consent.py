"""
Consent persistence: a patient grants or revokes a specific doctor's access to a
specific scope (records / images / chat).

Grants are soft-revoked (``revoked_at`` is set, the row is kept) so the audit
trail of who-could-see-what-when survives. Re-granting a revoked scope reuses the
row and clears ``revoked_at``. Only patients manage their own consents here;
doctors can only *read* the consents granted to them.
"""

from datetime import datetime, timezone

from sqlalchemy import select

from app.db import session_scope
from app.models_db import Consent, ConsentScope, Doctor, Role, User


class ConsentError(Exception):
    """Expected, user-facing failures (not a patient, unknown doctor, …)."""


def _require_patient_id(user: User) -> int:
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    if role != Role.patient or user.patient is None:
        raise ConsentError("Only patients can manage consent grants.")
    return user.patient.id


async def grant(user: User, doctor_id: int, scope: ConsentScope) -> dict:
    """Grant (or re-activate) consent for a doctor + scope. Idempotent."""
    patient_id = _require_patient_id(user)
    async with session_scope() as session:
        if session is None:
            raise ConsentError("Database is unavailable.")
        if await session.get(Doctor, doctor_id) is None:
            raise ConsentError(f"Doctor {doctor_id} not found.")

        row = (await session.execute(
            select(Consent).where(
                Consent.patient_id == patient_id,
                Consent.doctor_id == doctor_id,
                Consent.scope == scope,
            )
        )).scalar_one_or_none()

        if row is None:
            row = Consent(patient_id=patient_id, doctor_id=doctor_id, scope=scope)
            session.add(row)
        elif row.revoked_at is not None:
            # Re-grant: clear the revocation and refresh the grant time.
            row.revoked_at = None
            row.granted_at = datetime.now(timezone.utc)

        await session.commit()
        await session.refresh(row)
        return row.to_dict()


async def revoke(user: User, scope: ConsentScope, doctor_id: int) -> dict:
    """Revoke a patient's consent for a doctor + scope. Idempotent."""
    patient_id = _require_patient_id(user)
    async with session_scope() as session:
        if session is None:
            raise ConsentError("Database is unavailable.")

        row = (await session.execute(
            select(Consent).where(
                Consent.patient_id == patient_id,
                Consent.doctor_id == doctor_id,
                Consent.scope == scope,
            )
        )).scalar_one_or_none()
        if row is None:
            raise ConsentError("No such consent grant.")

        if row.revoked_at is None:
            row.revoked_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(row)
        return row.to_dict()


async def list_consents(user: User) -> dict:
    """
    List consent grants relevant to the caller:
    - patient → grants they have made (all scopes, active and revoked);
    - doctor  → active grants made *to* them;
    - admin   → everything.
    """
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    async with session_scope() as session:
        if session is None:
            return {"items": []}

        stmt = select(Consent)
        if role == Role.patient and user.patient:
            stmt = stmt.where(Consent.patient_id == user.patient.id)
        elif role == Role.doctor and user.doctor:
            stmt = stmt.where(
                Consent.doctor_id == user.doctor.id,
                Consent.revoked_at.is_(None),
            )
        elif role == Role.admin:
            pass
        else:
            return {"items": []}

        rows = (await session.execute(
            stmt.order_by(Consent.granted_at.desc())
        )).scalars().all()
        return {"items": [c.to_dict() for c in rows]}
