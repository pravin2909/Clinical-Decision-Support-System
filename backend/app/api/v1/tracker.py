"""
Health-tracker endpoints (patient-facing).

A patient records and views their own observations (BMI, blood pressure, weight,
glucose, …) and gets a dashboard summary with recent trends. All routes resolve
the caller's own ``patient_id`` from their token — a patient can only ever read
or write their own data here.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app import tracker
from app.auth import get_current_user
from app.models_db import Role, User
from app.schemas import ObservationCreate, ObservationOut

router = APIRouter(tags=["tracker"])


def _require_patient(user: User) -> int:
    """Return the caller's patient_id, or 403 if they aren't a patient."""
    if user.role != Role.patient or user.patient is None:
        raise HTTPException(status_code=403, detail="Only patients can use the health tracker.")
    return user.patient.id


@router.post("/observations", response_model=ObservationOut, status_code=201)
async def record_observation(
    body: ObservationCreate, user: User = Depends(get_current_user),
):
    """Record a single health observation for the current patient."""
    patient_id = _require_patient(user)
    created = await tracker.create_observation(
        patient_id=patient_id,
        type=body.type,
        value=body.value,
        unit=body.unit,
        source=body.source,
        recorded_at=body.recorded_at,
    )
    if created is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")
    return created


@router.get("/observations")
async def get_observations(
    user: User = Depends(get_current_user),
    type: str | None = Query(default=None, max_length=32),
    frm: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """List the current patient's observations, newest first, with filters."""
    patient_id = _require_patient(user)
    return await tracker.list_observations(
        patient_id=patient_id, type=type, frm=frm, to=to, limit=limit, offset=offset,
    )


@router.get("/dashboard/summary")
async def dashboard_summary(user: User = Depends(get_current_user)):
    """Latest value + recent trend per observation type, for the dashboard."""
    patient_id = _require_patient(user)
    return await tracker.dashboard_summary(patient_id=patient_id)
