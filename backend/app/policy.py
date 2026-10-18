"""
Access-control policy — the one place that answers "may this actor read this
patient's data, for this scope?".

Design
------
The decision has two layers, kept separate so the hard part is trivially testable:

1. :func:`decide_access` — a **pure function** of four booleans/role. No database,
   no I/O. Every rule lives here, so the full truth table can be unit-tested
   exhaustively (see ``tests/test_policy.py``). This is the "I took health-data
   authz seriously" artifact.

2. :func:`can_access` / :func:`require_access` — thin async wrappers that gather
   the facts from the database (is the caller this patient? is there an *active*
   care relationship? an *active* consent for this scope?) and hand them to
   :func:`decide_access`.

The rule in one sentence: **admins see everything; a patient sees only their own
data; a doctor sees a patient's data only when an active care relationship AND an
active consent for that scope both exist.** Consent is per-scope, so a doctor
granted ``records`` cannot read ``images``.

Every route that exposes patient data calls :func:`require_access`; nothing
reimplements these checks inline.
"""

from fastapi import HTTPException
from sqlalchemy import select

from app.db import session_scope
from app.models_db import (
    CareRelationship,
    CareStatus,
    Consent,
    ConsentScope,
    Role,
    User,
)


def decide_access(
    *,
    actor_role: Role,
    actor_is_self: bool,
    care_active: bool,
    consent_active: bool,
) -> bool:
    """
    Pure authorization decision. No I/O — all inputs are already resolved.

    - admin   → always allowed.
    - patient → allowed only for their own data (``actor_is_self``).
    - doctor  → allowed only with BOTH an active care relationship and an active
                consent covering the requested scope.
    - anyone else → denied.
    """
    if actor_role == Role.admin:
        return True
    if actor_role == Role.patient:
        return actor_is_self
    if actor_role == Role.doctor:
        return care_active and consent_active
    return False


# ──────────────────────────────────────
# Fact-gathering (DB) + composition
# ──────────────────────────────────────
async def _care_is_active(doctor_id: int, patient_id: int) -> bool:
    async with session_scope() as session:
        if session is None:
            return False
        row = (await session.execute(
            select(CareRelationship.status).where(
                CareRelationship.doctor_id == doctor_id,
                CareRelationship.patient_id == patient_id,
            )
        )).scalar_one_or_none()
        return row == CareStatus.active


async def _consent_row_exists(doctor_id: int, patient_id: int, scope: ConsentScope) -> bool:
    """True iff an un-revoked consent grant exists for this (doctor, patient, scope)."""
    async with session_scope() as session:
        if session is None:
            return False
        row = (await session.execute(
            select(Consent.id).where(
                Consent.doctor_id == doctor_id,
                Consent.patient_id == patient_id,
                Consent.scope == scope,
                Consent.revoked_at.is_(None),
            )
        )).scalar_one_or_none()
        return row is not None


async def can_access(actor: User, patient_id: int, scope: ConsentScope) -> bool:
    """Resolve the facts for ``actor`` and apply :func:`decide_access`."""
    role = actor.role if isinstance(actor.role, Role) else Role(actor.role)

    if role == Role.admin:
        return True

    if role == Role.patient:
        is_self = actor.patient is not None and actor.patient.id == patient_id
        return decide_access(
            actor_role=role, actor_is_self=is_self,
            care_active=False, consent_active=False,
        )

    if role == Role.doctor:
        if actor.doctor is None:
            return False
        care = await _care_is_active(actor.doctor.id, patient_id)
        # Only check consent if the relationship stands — saves a query on the
        # common "no relationship" path.
        consent = await _consent_row_exists(actor.doctor.id, patient_id, scope) if care else False
        return decide_access(
            actor_role=role, actor_is_self=False,
            care_active=care, consent_active=consent,
        )

    return False


async def require_access(actor: User, patient_id: int, scope: ConsentScope) -> None:
    """
    Raise 403 unless ``actor`` may read ``patient_id``'s data for ``scope``.

    Use this at the top of every patient-data endpoint. Denials are deliberately
    generic so a caller cannot distinguish "no such patient" from "not allowed"
    (patient IDs stay non-enumerable).
    """
    if not await can_access(actor, patient_id, scope):
        raise HTTPException(status_code=403, detail="You do not have access to this patient's data.")
