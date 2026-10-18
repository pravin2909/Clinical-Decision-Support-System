"""
Document service: store an uploaded prescription/report, OCR it (docTR), and turn
the text into a structured medication list via the LLM.

Processing runs in the background after upload (FastAPI BackgroundTask), so the
request returns immediately with ``status="queued"`` and the client polls
``GET /documents/{id}`` — the async pattern the plan calls for, without yet
needing Celery.
"""

from __future__ import annotations

import json
import logging
import re

from sqlalchemy import select

from app.db import session_scope
from app.llm.model import get_chat_model
from app.models_db import Document, Patient, Prescription

log = logging.getLogger("dpt.documents")

_PARSE_PROMPT = (
    "From this prescription text, extract STRICT JSON (an object, nothing else) with keys:\n"
    '  "medications": a list of objects {drug, dose, frequency, duration} (use null for any '
    "missing field; empty list if none found),\n"
    '  "prescriber": the prescribing doctor\'s or clinic\'s name if it is clearly present in the '
    "text, otherwise null.\n"
    "Return ONLY the JSON object.\n\nPRESCRIPTION TEXT:\n{text}"
)


async def create_document(patient_id: int, file_uri: str, doc_type: str = "prescription") -> dict:
    async with session_scope() as session:
        if session is None:
            return {"id": None, "error": "db unavailable"}
        doc = Document(patient_id=patient_id, type=doc_type, file_uri=file_uri, status="queued")
        session.add(doc)
        await session.commit()
        await session.refresh(doc)
        return doc.to_dict()


async def _set_status(document_id: int, status: str, **fields) -> None:
    async with session_scope() as session:
        if session is None:
            return
        doc = await session.get(Document, document_id)
        if doc is None:
            return
        doc.status = status
        for k, v in fields.items():
            setattr(doc, k, v)
        await session.commit()


_DOSE_RE = re.compile(r"(\d+\.?\d*)\s*(mg|mcg|ml|g|iu|units?|tabs?|tablets?|%)\b", re.I)
_FREQ_RE = re.compile(
    r"\b(once daily|twice daily|thrice daily|three times daily|at night|at bedtime|"
    r"before food|after food|every \d+ hours?|bid|tid|qid|od|bd|hs|prn|daily|weekly)\b",
    re.I,
)
_DUR_RE = re.compile(r"\b(\d+\s*(?:days?|weeks?|months?)|ongoing|continuous)\b", re.I)
_PRESCRIBER_RE = re.compile(r"\b(Dr\.?\s+[A-Z][A-Za-z.\-]+(?:\s+[A-Z][A-Za-z.\-]+){0,3})")


def _heuristic_parse(text: str) -> dict:
    """
    Extract medications + prescriber directly from OCR text, no LLM needed.
    A pragmatic fallback for when the LLM parser is unavailable — a line with a
    dosage (e.g. "Metformin 500 mg - twice daily - 30 days") is treated as a med.
    """
    meds: list[dict] = []
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        dose_m = _DOSE_RE.search(line)
        if not dose_m:
            continue
        # Drug = words before the dosage, with any leading list numbering removed.
        before = line[: dose_m.start()].strip(" .-)(")
        before = re.sub(r"^\d+\s*[.)]\s*", "", before).strip(" .-)(")
        if not before:
            continue
        freq_m = _FREQ_RE.search(line)
        dur_m = _DUR_RE.search(line)
        meds.append({
            "drug": before[:80],
            "dose": f"{dose_m.group(1)} {dose_m.group(2).lower()}",
            "frequency": freq_m.group(1).lower() if freq_m else None,
            "duration": dur_m.group(1).lower() if dur_m else None,
        })

    prescriber = None
    pm = _PRESCRIBER_RE.search(text or "")
    if pm:
        prescriber = pm.group(1).strip()

    return {"medications": meds, "prescriber": prescriber}


async def _parse_prescription(text: str) -> dict:
    """
    Ask the LLM to structure the OCR text into medications + prescriber name.
    Tolerates non-JSON output. Returns {"medications": [...], "prescriber": str|None}.
    """
    try:
        # .replace (not .format) because the prompt contains literal { } JSON braces.
        resp = await get_chat_model(streaming=False).ainvoke(_PARSE_PROMPT.replace("{text}", text[:4000]))
        raw = resp.content if hasattr(resp, "content") else str(resp)
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end != -1:
            data = json.loads(raw[start:end + 1])
            meds = data.get("medications") or []
            prescriber = data.get("prescriber")
            if isinstance(prescriber, str) and not prescriber.strip():
                prescriber = None
            return {"medications": meds, "prescriber": prescriber}
    except Exception as e:
        log.warning("prescription_parse_failed", extra={"err": str(e)})
    return {"medications": [], "prescriber": None}


async def process_document(document_id: int, file_path: str) -> None:
    """Background task: OCR + structure. Marks the document done/failed."""
    await _set_status(document_id, "processing")
    try:
        from app.ocr.extract import extract_text
        text = extract_text(file_path)
        parsed = await _parse_prescription(text)
        # Fall back to the local heuristic for anything the LLM missed (or if the
        # LLM was unavailable) so OCR stays useful without the model.
        if not parsed.get("medications") or not parsed.get("prescriber"):
            h = _heuristic_parse(text)
            parsed = {
                "medications": parsed.get("medications") or h["medications"],
                "prescriber": parsed.get("prescriber") or h["prescriber"],
            }
        await _set_status(
            document_id, "done",
            extracted_text=text, parsed=parsed,
        )
    except Exception as e:
        log.exception("ocr_failed")
        await _set_status(document_id, "failed", extracted_text=f"OCR error: {e}")


async def get_document(patient_id: int, document_id: int) -> dict | None:
    async with session_scope() as session:
        if session is None:
            return None
        doc = await session.get(Document, document_id)
        if doc is None or doc.patient_id != patient_id:
            return None
        return doc.to_dict()


async def list_prescriptions_for(patient_id: int | None, doctor_id: int | None) -> list[dict]:
    from sqlalchemy.orm import selectinload

    from app.models_db import Doctor

    async with session_scope() as session:
        if session is None:
            return []
        stmt = select(Prescription)
        if patient_id is not None:
            stmt = stmt.where(Prescription.patient_id == patient_id)
        elif doctor_id is not None:
            stmt = stmt.where(Prescription.doctor_id == doctor_id)
        rows = (await session.execute(stmt.order_by(Prescription.issued_at.desc()))).scalars().all()

        # Attach the prescribing doctor's name/specialty for display.
        doc_ids = {r.doctor_id for r in rows if r.doctor_id}
        doctors = {d.id: d for d in (await session.execute(
            select(Doctor).options(selectinload(Doctor.user)).where(Doctor.id.in_(doc_ids))
        )).scalars().all()} if doc_ids else {}

        out = []
        for r in rows:
            d = doctors.get(r.doctor_id)
            out.append({
                **r.to_dict(),
                "doctor_name": (d.user.full_name if d and d.user else None),
                "doctor_specialty": (d.specialty if d else None),
            })
        return out


async def patient_id_for_user(user) -> int | None:
    if user.patient is not None:
        return user.patient.id
    async with session_scope() as session:
        if session is None:
            return None
        return (await session.execute(
            select(Patient.id).where(Patient.user_id == user.id)
        )).scalar_one_or_none()
