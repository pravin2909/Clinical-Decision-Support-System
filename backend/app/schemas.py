"""Pydantic request/response schemas for the auth & admin API."""

from pydantic import BaseModel, EmailStr, Field

from app.models_db import Role


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
