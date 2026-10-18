"""
Document upload + OCR status (patient-facing).

Upload a prescription/report → stored, OCR + structuring run in the background →
poll for the parsed result. Only patients upload/read their own documents.
"""

import os
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile

from app import documents
from app.auth import get_current_user
from app.config import UPLOAD_DIR
from app.core.ratelimit import rate_limit
from app.models_db import Role, User

router = APIRouter(prefix="/documents", tags=["documents"])

_ALLOWED = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}
_MAX_BYTES = 15 * 1024 * 1024


def _require_patient_id(user: User) -> int:
    role = user.role if isinstance(user.role, Role) else Role(user.role)
    if role != Role.patient or user.patient is None:
        raise HTTPException(status_code=403, detail="Only patients can upload documents.")
    return user.patient.id


@router.post(
    "",
    status_code=201,
    dependencies=[Depends(rate_limit("upload", capacity=10, refill_rate=0.2))],
)
async def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Upload a prescription/report image or PDF; OCR runs in the background."""
    patient_id = _require_patient_id(user)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'.")

    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB).")

    fname = f"doc_{patient_id}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    with open(path, "wb") as f:
        f.write(data)

    doc = await documents.create_document(patient_id, file_uri=path)
    if doc.get("id") is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    background.add_task(documents.process_document, doc["id"], path)
    return doc


@router.get("/{document_id}")
async def get_document(document_id: int, user: User = Depends(get_current_user)):
    """Fetch a document's OCR status and parsed medications."""
    patient_id = _require_patient_id(user)
    doc = await documents.get_document(patient_id, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc
