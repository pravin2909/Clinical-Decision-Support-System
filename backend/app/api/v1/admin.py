"""
Admin-only endpoints: list/create users, link doctors to patients.

Guarded by ``require_role(Role.admin)`` — role enforcement lives in the
dependency, so every route here is protected uniformly.
"""

from fastapi import APIRouter, Depends, HTTPException

from app import users
from app.auth import require_role
from app.models_db import Role, User
from app.rag import store as rag_store
from app.schemas import AssignmentRequest, KbIngestRequest, RegisterRequest

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def admin_list_users(_: User = Depends(require_role(Role.admin))):
    return {"users": await users.list_users()}


@router.post("/users")
async def admin_create_user(
    req: RegisterRequest, _: User = Depends(require_role(Role.admin))
):
    """Admin-created account (any role, including another admin)."""
    profile = None
    if req.role == Role.doctor and req.doctor:
        profile = req.doctor.model_dump()
    elif req.role == Role.patient and req.patient:
        profile = req.patient.model_dump()
    try:
        return await users.create_user(
            email=req.email, password=req.password, full_name=req.full_name,
            role=req.role, profile=profile,
        )
    except users.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/assignments")
async def admin_assign(
    req: AssignmentRequest, _: User = Depends(require_role(Role.admin))
):
    """Link a doctor to a patient so the doctor may access their consultations."""
    try:
        return await users.assign_doctor_patient(req.doctor_id, req.patient_id)
    except users.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/kb/ingest")
async def admin_kb_ingest(
    req: KbIngestRequest, _: User = Depends(require_role(Role.admin))
):
    """Chunk, embed, and upsert a knowledge-base document (patient or doctor KB)."""
    return await rag_store.ingest_document(
        audience=req.audience, title=req.title, body=req.body,
        source_url=req.source_url, license=req.license,
    )
