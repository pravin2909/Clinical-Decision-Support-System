"""
User / doctor / patient persistence and access-control helpers.
"""

from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.db import session_scope
from app.auth import hash_password, verify_password
from app.models_db import (
    User, Doctor, Patient, DoctorPatient, Consultation, Role,
)


class UserError(Exception):
    """Raised for expected, user-facing failures (duplicate email, etc.)."""


# ──────────────────────────────────────
# Creation / lookup
# ──────────────────────────────────────
async def create_user(
    *, email: str, password: str, full_name: str | None, role: Role,
    profile: dict | None = None,
) -> dict:
    """Create a user and its role-specific profile row (doctor/patient)."""
    profile = profile or {}
    async with session_scope() as session:
        if session is None:
            raise UserError("Database is unavailable.")

        exists = await session.execute(select(User.id).where(User.email == email))
        if exists.scalar_one_or_none() is not None:
            raise UserError("An account with this email already exists.")

        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role=role,
        )
        session.add(user)
        await session.flush()  # assign user.id

        if role == Role.doctor:
            session.add(Doctor(
                user_id=user.id,
                specialty=profile.get("specialty"),
                license_no=profile.get("license_no"),
            ))
        elif role == Role.patient:
            session.add(Patient(
                user_id=user.id,
                date_of_birth=profile.get("date_of_birth"),
                gender=profile.get("gender"),
                mrn=profile.get("mrn"),
            ))

        await session.commit()

        # Reload with relationships for a complete public view.
        result = await session.execute(
            select(User)
            .options(selectinload(User.doctor), selectinload(User.patient))
            .where(User.id == user.id)
        )
        return result.scalar_one().to_public()


async def authenticate(email: str, password: str) -> User | None:
    async with session_scope() as session:
        if session is None:
            return None
        result = await session.execute(
            select(User)
            .options(selectinload(User.doctor), selectinload(User.patient))
            .where(User.email == email)
        )
        user = result.scalar_one_or_none()
        if user and user.is_active and verify_password(password, user.password_hash):
            return user
        return None


async def admin_exists() -> bool:
    async with session_scope() as session:
        if session is None:
            return False
        result = await session.execute(select(User.id).where(User.role == Role.admin).limit(1))
        return result.scalar_one_or_none() is not None


async def list_users() -> list[dict]:
    async with session_scope() as session:
        if session is None:
            return []
        result = await session.execute(
            select(User)
            .options(selectinload(User.doctor), selectinload(User.patient))
            .order_by(User.created_at.desc())
        )
        return [u.to_public() for u in result.scalars().all()]


# ──────────────────────────────────────
# Doctor ↔ patient assignments
# ──────────────────────────────────────
async def assign_doctor_patient(doctor_id: int, patient_id: int) -> dict:
    async with session_scope() as session:
        if session is None:
            raise UserError("Database is unavailable.")
        if await session.get(Doctor, doctor_id) is None:
            raise UserError(f"Doctor {doctor_id} not found.")
        if await session.get(Patient, patient_id) is None:
            raise UserError(f"Patient {patient_id} not found.")

        existing = await session.execute(
            select(DoctorPatient).where(
                DoctorPatient.doctor_id == doctor_id,
                DoctorPatient.patient_id == patient_id,
            )
        )
        link = existing.scalar_one_or_none()
        if link is None:
            link = DoctorPatient(doctor_id=doctor_id, patient_id=patient_id)
            session.add(link)
            await session.commit()
            await session.refresh(link)
        return {"id": link.id, "doctor_id": doctor_id, "patient_id": patient_id}


async def list_doctors() -> list[dict]:
    """Directory of doctors (id, name, specialty) for patients to connect with."""
    async with session_scope() as session:
        if session is None:
            return []
        rows = (await session.execute(
            select(Doctor).options(selectinload(Doctor.user))
        )).scalars().all()
        return [{
            "doctor_id": d.id,
            "name": d.user.full_name if d.user else None,
            "specialty": d.specialty,
            "bio": d.bio,
            "years_experience": d.years_experience,
        } for d in rows]


async def assigned_patient_ids(doctor_id: int) -> list[int]:
    async with session_scope() as session:
        if session is None:
            return []
        result = await session.execute(
            select(DoctorPatient.patient_id).where(DoctorPatient.doctor_id == doctor_id)
        )
        return [row[0] for row in result.all()]


# ──────────────────────────────────────
# Access-controlled consultation history
# ──────────────────────────────────────
async def list_history_for(user: User, limit: int = 50, offset: int = 0) -> dict:
    async with session_scope() as session:
        if session is None:
            return {"total": 0, "limit": limit, "offset": offset, "items": []}

        stmt = select(Consultation)
        count_stmt = select(func.count(Consultation.id))
        cond = None

        if user.role == Role.admin:
            cond = None
        elif user.role == Role.patient and user.patient:
            cond = Consultation.patient_id == user.patient.id
        elif user.role == Role.doctor and user.doctor:
            pids = await assigned_patient_ids(user.doctor.id)
            clauses = [Consultation.doctor_id == user.doctor.id]
            if pids:
                clauses.append(Consultation.patient_id.in_(pids))
            cond = or_(*clauses)
        else:
            cond = Consultation.id == -1  # matches nothing

        if cond is not None:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

        total = int((await session.execute(count_stmt)).scalar_one())
        result = await session.execute(
            stmt.order_by(Consultation.created_at.desc()).limit(limit).offset(offset)
        )
        items = [c.to_summary() for c in result.scalars().all()]
        return {"total": total, "limit": limit, "offset": offset, "items": items}


async def get_consultation_for(user: User, consultation_id: int) -> dict | None:
    """Return a consultation only if `user` is allowed to see it."""
    async with session_scope() as session:
        if session is None:
            return None
        row = await session.get(Consultation, consultation_id)
        if row is None:
            return None

        if user.role == Role.admin:
            return row.to_detail()
        if user.role == Role.patient and user.patient:
            return row.to_detail() if row.patient_id == user.patient.id else None
        if user.role == Role.doctor and user.doctor:
            if row.doctor_id == user.doctor.id:
                return row.to_detail()
            pids = await assigned_patient_ids(user.doctor.id)
            return row.to_detail() if row.patient_id in pids else None
        return None
