"""
Appointment endpoints.

Patient: request a visit, list, cancel.
Doctor: list (incl. pending requests), approve / decline / complete, cancel.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app import appointments
from app.auth import get_current_user
from app.core.ratelimit import rate_limit
from app.models_db import User

router = APIRouter(prefix="/appointments", tags=["appointments"])


class AppointmentCreate(BaseModel):
    doctor_id: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=1000)
    preferred_time: str | None = Field(default=None, max_length=120)


class DoctorAction(BaseModel):
    scheduled_for: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


@router.get("")
async def list_appointments(
    status: str | None = Query(default=None),
    user: User = Depends(get_current_user),
):
    """List the caller's appointments (optionally filtered by status)."""
    return await appointments.list_for(user, status)


@router.get("/pending-count")
async def pending_count(user: User = Depends(get_current_user)):
    """Number of requests awaiting the doctor's action (for the nav badge)."""
    return {"count": await appointments.pending_count(user)}


@router.post(
    "",
    status_code=201,
    dependencies=[Depends(rate_limit("appointment", capacity=15, refill_rate=0.3))],
)
async def request_appointment(body: AppointmentCreate, user: User = Depends(get_current_user)):
    """Patient requests a visit with a doctor."""
    try:
        return await appointments.request(user, body.doctor_id, body.reason, body.preferred_time)
    except appointments.AppointmentError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{appointment_id}/approve")
async def approve(appointment_id: int, body: DoctorAction, user: User = Depends(get_current_user)):
    try:
        return await appointments.approve(user, appointment_id, body.scheduled_for, body.notes)
    except appointments.AppointmentError as e:
        raise HTTPException(status_code=_status_for(str(e)), detail=str(e))


@router.post("/{appointment_id}/decline")
async def decline(appointment_id: int, body: DoctorAction, user: User = Depends(get_current_user)):
    try:
        return await appointments.decline(user, appointment_id, body.notes)
    except appointments.AppointmentError as e:
        raise HTTPException(status_code=_status_for(str(e)), detail=str(e))


@router.post("/{appointment_id}/complete")
async def complete(appointment_id: int, body: DoctorAction, user: User = Depends(get_current_user)):
    try:
        return await appointments.complete(user, appointment_id, body.notes)
    except appointments.AppointmentError as e:
        raise HTTPException(status_code=_status_for(str(e)), detail=str(e))


@router.post("/{appointment_id}/cancel")
async def cancel(appointment_id: int, user: User = Depends(get_current_user)):
    try:
        return await appointments.cancel(user, appointment_id)
    except appointments.AppointmentError as e:
        raise HTTPException(status_code=_status_for(str(e)), detail=str(e))


def _status_for(msg: str) -> int:
    return 404 if "not found" in msg.lower() else 409
