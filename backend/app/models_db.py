"""
ORM models for persisted data.

Identity & access:
  - User      : one login identity with a single Role (admin / doctor / patient).
  - Doctor    : profile extending a user of role 'doctor' (1:1).
  - Patient   : profile extending a user of role 'patient' (1:1).
  - DoctorPatient : explicit assignment linking a doctor to a patient (M:N). A
                    doctor may access a patient's data only through this link.

Clinical data:
  - Consultation : one analysis request, optionally owned by a patient and/or
                   attributed to the doctor who ran it.

JSONB columns keep flexible pipeline payloads without a rigid schema.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    String, Float, Boolean, Text, DateTime, Integer,
    ForeignKey, UniqueConstraint, Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    admin = "admin"
    doctor = "doctor"
    patient = "patient"


# ──────────────────────────────────────
# Identity
# ──────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    role: Mapped[Role] = mapped_column(SAEnum(Role, name="user_role"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    doctor: Mapped["Doctor | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    patient: Mapped["Patient | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role.value if isinstance(self.role, Role) else self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "doctor_id": self.doctor.id if self.doctor else None,
            "patient_id": self.patient.id if self.patient else None,
        }


class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    specialty: Mapped[str | None] = mapped_column(String(120), nullable=True)
    license_no: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user: Mapped["User"] = relationship(back_populates="doctor")
    patient_links: Mapped[list["DoctorPatient"]] = relationship(
        back_populates="doctor", cascade="all, delete-orphan"
    )


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    date_of_birth: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(32), nullable=True)
    mrn: Mapped[str | None] = mapped_column(String(64), nullable=True)  # medical record no.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user: Mapped["User"] = relationship(back_populates="patient")
    doctor_links: Mapped[list["DoctorPatient"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )


class DoctorPatient(Base):
    """Assignment: a doctor may access a patient only if this link exists."""

    __tablename__ = "doctor_patient"
    __table_args__ = (UniqueConstraint("doctor_id", "patient_id", name="uq_doctor_patient"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), index=True
    )
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    doctor: Mapped["Doctor"] = relationship(back_populates="patient_links")
    patient: Mapped["Patient"] = relationship(back_populates="doctor_links")


# ──────────────────────────────────────
# Sessions
# ──────────────────────────────────────
class RefreshToken(Base):
    """
    A server-side refresh-token record (one per active session).

    We store only a SHA-256 *hash* of the opaque token, never the token itself —
    so a database leak can't be used to impersonate users. On refresh the old
    row is marked revoked and a new one issued (rotation), so a stolen refresh
    token stops working the moment the legitimate user next refreshes. Logout
    simply revokes the row.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


# ──────────────────────────────────────
# Clinical data
# ──────────────────────────────────────
class Consultation(Base):
    __tablename__ = "consultations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )

    # Ownership: who the consultation belongs to, and who ran it.
    patient_id: Mapped[int | None] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    doctor_id: Mapped[int | None] = mapped_column(
        ForeignKey("doctors.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # image | text | audio | doctor
    input_type: Mapped[str] = mapped_column(String(16), index=True)

    # Image-pipeline fields (null for text/audio/doctor).
    domain: Mapped[str | None] = mapped_column(String(32), nullable=True)
    disease: Mapped[str | None] = mapped_column(String(128), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    uncertain: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Free-text input: symptoms, transcription, or the physician's question.
    input_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The generated report / grounded answer.
    report: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Flexible payloads for later use / full fidelity.
    routing: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    classification: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    sources: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    processing_time_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    def to_summary(self) -> dict:
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "input_type": self.input_type,
            "domain": self.domain,
            "disease": self.disease,
            "confidence": self.confidence,
            "uncertain": self.uncertain,
            "input_text": (self.input_text[:160] if self.input_text else None),
        }

    def to_detail(self) -> dict:
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "input_type": self.input_type,
            "domain": self.domain,
            "disease": self.disease,
            "confidence": self.confidence,
            "uncertain": self.uncertain,
            "input_text": self.input_text,
            "report": self.report,
            "routing": self.routing,
            "classification": self.classification,
            "sources": self.sources,
            "processing_time_seconds": self.processing_time_seconds,
        }
