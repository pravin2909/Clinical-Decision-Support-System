"""Pydantic request/response schemas for the auth, admin & tracker API."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models_db import ConsentScope, Role


class DoctorProfile(BaseModel):
    specialty: str | None = None
    license_no: str | None = None


class PatientProfile(BaseModel):
    date_of_birth: str | None = None
    gender: str | None = None
    mrn: str | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str | None = None
    role: Role = Role.patient
    doctor: DoctorProfile | None = None
    patient: PatientProfile | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Present on login/refresh. The current frontend ignores it until it wires
    # auto-refresh; adding it is backward-compatible.
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class AssignmentRequest(BaseModel):
    doctor_id: int
    patient_id: int


# ──────────────────────────────────────
# Care relationships & consent
# ──────────────────────────────────────
class CareRequestCreate(BaseModel):
    # The *other party's* profile id: a doctor_id when a patient asks, a
    # patient_id when a doctor asks. The server knows which from the caller role.
    target_id: int = Field(gt=0)


class ConsentCreate(BaseModel):
    doctor_id: int = Field(gt=0)
    scope: ConsentScope


# ──────────────────────────────────────
# Agentic chat / prescriptions
# ──────────────────────────────────────
class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    # Omit to start a new conversation; include to continue one (server-side memory).
    conversation_id: int | None = None


class PrescriptionItem(BaseModel):
    drug: str
    dose: str | None = None
    frequency: str | None = None
    duration: str | None = None


class PrescriptionCreate(BaseModel):
    # Doctor sets patient_id; patients omit it (their own).
    patient_id: int | None = None
    items: list[PrescriptionItem]
    notes: str | None = None
    # A patient may attribute an uploaded prescription to a connected doctor
    # (doctor_id, verified against their active care relationship) OR type a free
    # prescriber name for an external doctor.
    doctor_id: int | None = None
    prescriber_name: str | None = Field(default=None, max_length=160)


class KbIngestRequest(BaseModel):
    audience: str = Field(pattern="^(patient|doctor)$")
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    source_url: str | None = None
    license: str | None = None


# ──────────────────────────────────────
# Health tracker
# ──────────────────────────────────────
class ObservationCreate(BaseModel):
    # e.g. "bp", "weight", "bmi", "glucose"
    type: str = Field(min_length=1, max_length=32)
    # Flexible: {"value": 72.5} or {"systolic": 120, "diastolic": 80}.
    value: dict[str, float]
    unit: str | None = Field(default=None, max_length=32)
    source: str | None = Field(default=None, max_length=32)
    # Optional; defaults to "now" server-side when omitted.
    recorded_at: datetime | None = None


class ObservationOut(BaseModel):
    id: int
    patient_id: int
    type: str
    value: dict[str, float]
    unit: str | None = None
    source: str | None = None
    recorded_at: datetime
