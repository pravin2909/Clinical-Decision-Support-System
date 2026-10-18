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

from app.config import EMBED_DIM
from app.db import Base

# pgvector column type for KB embeddings. Fall back to a plain JSONB column if the
# binding is unavailable, so the ORM still imports in environments without RAG.
try:
    from pgvector.sqlalchemy import Vector as _VectorType  # type: ignore
    _VectorType = _VectorType(EMBED_DIM)
except Exception:  # pragma: no cover
    _VectorType = JSONB


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    admin = "admin"
    doctor = "doctor"
    patient = "patient"


class CareStatus(str, enum.Enum):
    """Lifecycle of a doctor↔patient care relationship."""

    pending = "pending"   # requested by one side, awaiting the other's accept
    active = "active"     # accepted; the link is live
    revoked = "revoked"   # ended by either side (kept for audit, not deleted)


class ConsentScope(str, enum.Enum):
    """What a patient's consent grant covers. One grant = one scope."""

    records = "records"   # observations, consultation history, prescriptions
    images = "images"     # uploaded image cases + predictions
    chat = "chat"         # chat/agent transcripts


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
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
# Care relationships & consent (the access-control spine)
# ──────────────────────────────────────
class CareRelationship(Base):
    """
    A doctor↔patient link with an explicit lifecycle (pending → active → revoked).

    This supersedes the bare ``DoctorPatient`` assignment: either party can
    *request* a relationship, the counterparty *accepts* it, and either side can
    *revoke* it. A relationship being ``active`` is necessary — but NOT
    sufficient — for a doctor to read patient data; the patient must also grant a
    scoped :class:`Consent`. Both checks live in ``app.policy``.
    """

    __tablename__ = "care_relationships"
    __table_args__ = (
        UniqueConstraint("patient_id", "doctor_id", name="uq_care_patient_doctor"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[CareStatus] = mapped_column(
        SAEnum(CareStatus, name="care_status"), default=CareStatus.pending, index=True
    )
    # Which role opened the request — determines who may accept it.
    initiated_by: Mapped[Role] = mapped_column(SAEnum(Role, name="care_initiator"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "status": self.status.value if isinstance(self.status, CareStatus) else self.status,
            "initiated_by": self.initiated_by.value if isinstance(self.initiated_by, Role) else self.initiated_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Consent(Base):
    """
    A patient's grant of access to a specific doctor for a specific scope.

    A grant is *active* while ``revoked_at`` is NULL. Revocation is a soft delete
    (we set ``revoked_at``) so the audit trail of who-could-see-what-when is never
    lost. One row per (patient, doctor, scope); re-granting a revoked scope
    reuses the row and clears ``revoked_at``.
    """

    __tablename__ = "consents"
    __table_args__ = (
        UniqueConstraint("patient_id", "doctor_id", "scope", name="uq_consent_triple"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), index=True
    )
    scope: Mapped[ConsentScope] = mapped_column(SAEnum(ConsentScope, name="consent_scope"))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def active(self) -> bool:
        return self.revoked_at is None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "scope": self.scope.value if isinstance(self.scope, ConsentScope) else self.scope,
            "active": self.active,
            "granted_at": self.granted_at.isoformat() if self.granted_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
        }


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
# Health tracker
# ──────────────────────────────────────
class Observation(Base):
    """
    A single health measurement for a patient (BMI, blood pressure, weight,
    glucose, …). The naming follows FHIR's ``Observation`` loosely.

    ``value`` is JSONB so one table holds both single-number metrics
    (``{"value": 72.5}``) and compound ones (``{"systolic": 120, "diastolic":
    80}``) without a column per metric.
    """

    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    # bp | weight | bmi | glucose | heart_rate | temperature | ...
    type: Mapped[str] = mapped_column(String(32), index=True)
    value: Mapped[dict] = mapped_column(JSONB)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)  # self | device | doctor
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "type": self.type,
            "value": self.value,
            "unit": self.unit,
            "source": self.source,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }


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


# ──────────────────────────────────────
# Agentic chat: conversations + messages (server-side memory)
# ──────────────────────────────────────
class Conversation(Base):
    """
    One chat thread. ``role_context`` records whether this ran as the patient or
    doctor agent. ``summary`` holds a rolling compression of older turns so long
    threads stay within the model's context window without losing the gist —
    this, together with :class:`Message`, is the server-side memory that fixes
    follow-up questions losing context.
    """

    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role_context: Mapped[str] = mapped_column(String(16), default="patient")  # patient | doctor
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan",
        order_by="Message.id",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "role_context": self.role_context,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Message(Base):
    """
    One turn in a conversation. ``tool_calls`` and ``citations`` are JSONB so the
    full agent trace (which tools ran, which sources were cited) is persisted and
    can be reloaded into the agent on a follow-up.
    """

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))  # user | assistant | tool | system
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_calls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    citations: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "tool_calls": self.tool_calls,
            "citations": self.citations,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ──────────────────────────────────────
# Documents (prescriptions / lab reports) + structured prescriptions
# ──────────────────────────────────────
class Document(Base):
    """
    An uploaded prescription or report. OCR runs after upload; ``status`` tracks
    the async lifecycle and ``extracted_text`` / ``parsed`` hold the OCR output
    and the structured result (e.g. medication list).
    """

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(24), default="prescription")  # prescription | lab | report
    file_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)  # queued|processing|done|failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "type": self.type,
            "status": self.status,
            "extracted_text": self.extracted_text,
            "parsed": self.parsed,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Prescription(Base):
    """A prescription issued by a doctor to a patient; ``items`` is a JSONB med list."""

    __tablename__ = "prescriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    doctor_id: Mapped[int | None] = mapped_column(
        ForeignKey("doctors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Free-text prescriber for patient-uploaded / external prescriptions (when the
    # prescribing doctor isn't a registered user). In-app prescriptions use doctor_id.
    prescriber_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    items: Mapped[list] = mapped_column(JSONB)  # [{drug, dose, frequency, duration}]
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | stopped
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "prescriber_name": self.prescriber_name,
            "items": self.items,
            "notes": self.notes,
            "status": self.status,
            "issued_at": self.issued_at.isoformat() if self.issued_at else None,
        }


# ──────────────────────────────────────
# Knowledge base (RAG) — patient-friendly vs clinical, pgvector-backed
# ──────────────────────────────────────
class KbDocument(Base):
    __tablename__ = "kb_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audience: Mapped[str] = mapped_column(String(16), index=True)  # patient | doctor
    title: Mapped[str] = mapped_column(String(300))
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    license: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    chunks: Mapped[list["KbChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class ThreadMessage(Base):
    """
    A direct message in the thread between a patient and a doctor. Both parties
    can send; ``sender_role`` records who wrote it. A thread is identified by the
    (patient_id, doctor_id) pair, and sending requires an active care
    relationship between them (enforced in ``app.messaging``).
    """

    __tablename__ = "thread_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), index=True
    )
    sender_role: Mapped[str] = mapped_column(String(16))  # patient | doctor
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, index=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "sender_role": self.sender_role,
            "body": self.body,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Appointment(Base):
    """
    A visit request from a patient to a doctor.

    Flow: patient creates one (``requested``) → the doctor sees it as a pending
    request and ``approved`` (optionally setting ``scheduled_for``) or
    ``declined`` it → after the visit it becomes ``completed``. Either side can
    ``cancelled`` it. This is the scheduling layer; data access to the patient's
    records is still governed separately by consent (``app.policy``).
    """

    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("doctors.id", ondelete="CASCADE"), index=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_time: Mapped[str | None] = mapped_column(String(120), nullable=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # requested | approved | declined | cancelled | completed
    status: Mapped[str] = mapped_column(String(16), default="requested", index=True)
    doctor_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "reason": self.reason,
            "preferred_time": self.preferred_time,
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "status": self.status,
            "doctor_notes": self.doctor_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class KbChunk(Base):
    """
    A chunk of a KB document with its embedding. The ``embedding`` column uses
    pgvector; dimensionality must match ``config.EMBED_DIM`` (768 for
    nomic-embed-text). Imported lazily so the module still loads if pgvector's
    Python binding is absent (the column is only needed when RAG is used).
    """

    __tablename__ = "kb_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("kb_documents.id", ondelete="CASCADE"), index=True
    )
    audience: Mapped[str] = mapped_column(String(16), index=True)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(_VectorType, nullable=True)
    doc_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    document: Mapped["KbDocument"] = relationship(back_populates="chunks")
