"""
Analysis endpoints: image / text / audio → DPT report, plus the doctor
evidence-grounded answer. Streaming variants use Server-Sent Events.

These handlers are relocated verbatim from the original ``main.py``; behavior is
unchanged. They remain synchronous-on-request-path for now — moving inference to
a Celery worker is Phase 2, and this module is where that swap will happen.
"""

import json
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from app import history as history_store
from app.auth import optional_current_user
from app.models_db import Role, User
from app.pipeline import pipeline

router = APIRouter(prefix="/analyze", tags=["analysis"])


def _owner_kwargs(user: User | None) -> dict:
    """Map the authenticated user to consultation ownership columns."""
    if user is None:
        return {}
    if user.role == Role.patient and user.patient:
        return {"patient_id": user.patient.id}
    if user.role == Role.doctor and user.doctor:
        return {"doctor_id": user.doctor.id}
    return {}


# ──────────────────────────────────────
# Image
# ──────────────────────────────────────
@router.post("/image")
async def analyze_image(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    """Upload a medical image → routing + classification + DPT report."""
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading. Please wait.")

    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Accepted: JPG, PNG, WebP, BMP",
        )

    start = time.time()
    image_bytes = await file.read()

    result = await pipeline.process_image(image_bytes)
    result["processing_time_seconds"] = round(time.time() - start, 2)

    if "error" not in result:
        cls = result.get("classification", {})
        result["consultation_id"] = await history_store.save_consultation(
            input_type="image",
            domain=result.get("routing", {}).get("domain"),
            disease=cls.get("disease"),
            confidence=cls.get("confidence"),
            uncertain=cls.get("uncertain"),
            report=result.get("report"),
            routing=result.get("routing"),
            classification=cls,
            processing_time_seconds=result["processing_time_seconds"],
            **_owner_kwargs(current_user),
        )

    return JSONResponse(content=result)


@router.post("/image/stream")
async def analyze_image_stream(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    """Same as /analyze/image but streams the DPT report in real time (SSE)."""
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading.")

    image_bytes = await file.read()
    from app.model_loader import load_image_from_bytes
    from app.reasoning import generate_dpt_report_stream

    image = load_image_from_bytes(image_bytes)
    routing = pipeline.classify_image_domain(image)
    classification = pipeline.classify_disease(image, routing["domain"])
    prompt = pipeline.build_image_prompt(routing, classification)

    async def event_stream():
        meta = {"type": "classification", "routing": routing, "classification": classification}
        yield f"data: {json.dumps(meta)}\n\n"

        report = ""
        async for token in generate_dpt_report_stream(prompt):
            report += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        await history_store.save_consultation(
            input_type="image",
            domain=routing.get("domain"),
            disease=classification.get("disease"),
            confidence=classification.get("confidence"),
            uncertain=classification.get("uncertain"),
            report=report,
            routing=routing,
            classification=classification,
            **_owner_kwargs(current_user),
        )
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ──────────────────────────────────────
# Text
# ──────────────────────────────────────
@router.post("/text")
async def analyze_text(
    symptoms: str = Form(...),
    current_user: User | None = Depends(optional_current_user),
):
    """Submit symptom text → DPT clinical report."""
    if not symptoms.strip():
        raise HTTPException(status_code=400, detail="Symptoms text cannot be empty.")

    start = time.time()
    result = await pipeline.process_text(symptoms.strip())
    result["processing_time_seconds"] = round(time.time() - start, 2)

    if "error" not in result:
        result["consultation_id"] = await history_store.save_consultation(
            input_type="text",
            input_text=result.get("symptoms"),
            report=result.get("report"),
            processing_time_seconds=result["processing_time_seconds"],
            **_owner_kwargs(current_user),
        )

    return JSONResponse(content=result)


@router.post("/text/stream")
async def analyze_text_stream(
    symptoms: str = Form(...),
    current_user: User | None = Depends(optional_current_user),
):
    """Stream the DPT report token-by-token for text symptoms (SSE)."""
    if not symptoms.strip():
        raise HTTPException(status_code=400, detail="Symptoms text cannot be empty.")

    from app.config import DPT_TEXT_PROMPT_TEMPLATE
    from app.reasoning import generate_dpt_report_stream

    prompt = DPT_TEXT_PROMPT_TEMPLATE.format(symptoms=symptoms.strip())

    async def event_stream():
        yield f"data: {json.dumps({'type': 'text_start', 'symptoms': symptoms.strip()})}\n\n"

        report = ""
        async for token in generate_dpt_report_stream(prompt):
            report += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        await history_store.save_consultation(
            input_type="text", input_text=symptoms.strip(), report=report,
            **_owner_kwargs(current_user),
        )
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ──────────────────────────────────────
# Audio
# ──────────────────────────────────────
@router.post("/audio")
async def analyze_audio(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    """Upload spoken symptoms → transcription → DPT report."""
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading. Please wait.")

    allowed_types = {
        "audio/wav", "audio/x-wav", "audio/wave",
        "audio/mpeg", "audio/mp3",
        "audio/flac", "audio/x-flac",
        "audio/ogg", "audio/webm",
    }
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid audio type: {file.content_type}. Accepted: WAV, MP3, FLAC, OGG",
        )

    start = time.time()
    audio_bytes = await file.read()

    result = await pipeline.process_audio(audio_bytes, file.filename or "audio.wav")
    result["processing_time_seconds"] = round(time.time() - start, 2)

    if "error" not in result:
        result["consultation_id"] = await history_store.save_consultation(
            input_type="audio",
            input_text=result.get("transcription"),
            report=result.get("report"),
            processing_time_seconds=result["processing_time_seconds"],
            **_owner_kwargs(current_user),
        )

    return JSONResponse(content=result)


@router.post("/audio/stream")
async def analyze_audio_stream(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    """Transcribe audio, then stream the DPT report (SSE)."""
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading.")

    audio_bytes = await file.read()
    from app.config import DPT_TEXT_PROMPT_TEMPLATE
    from app.reasoning import generate_dpt_report_stream
    from app.speech import transcribe_audio

    transcription = transcribe_audio(audio_bytes, file.filename or "audio.wav")

    async def event_stream():
        if not transcription["success"]:
            yield f"data: {json.dumps({'type': 'error', 'message': transcription['error']})}\n\n"
            return

        symptoms = transcription["text"]
        prompt = DPT_TEXT_PROMPT_TEMPLATE.format(symptoms=symptoms)

        yield f"data: {json.dumps({'type': 'audio_start', 'transcription': symptoms})}\n\n"

        report = ""
        async for token in generate_dpt_report_stream(prompt):
            report += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        await history_store.save_consultation(
            input_type="audio", input_text=symptoms, report=report,
            **_owner_kwargs(current_user),
        )
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ──────────────────────────────────────
# Doctor evidence-grounded answer (cited)
# ──────────────────────────────────────
@router.post("/doctor/stream")
async def analyze_doctor_stream(
    question: str = Form(...),
    current_user: User | None = Depends(optional_current_user),
):
    """Retrieve literature (Europe PMC), then stream an answer citing it as [n]."""
    if not question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    from app.research import generate_grounded_stream, search_literature

    q = question.strip()
    sources = await search_literature(q, limit=5)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
        answer = ""
        async for token in generate_grounded_stream(q, sources):
            answer += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        await history_store.save_consultation(
            input_type="doctor", input_text=q, report=answer, sources=sources,
            **_owner_kwargs(current_user),
        )
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
