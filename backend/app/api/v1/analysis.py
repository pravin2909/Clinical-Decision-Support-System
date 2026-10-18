"""
Analysis endpoints: image / text / audio → clinical report, plus the doctor
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
    """Upload a medical image → routing + classification + clinical report."""
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
    """Same as /analyze/image but streams the clinical report in real time (SSE)."""
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading.")

    image_bytes = await file.read()
    from app.model_loader import load_image_from_bytes
    from app.reasoning import generate_report_stream

    image = load_image_from_bytes(image_bytes)
    routing = pipeline.classify_image_domain(image)
    classification = pipeline.classify_disease(image, routing["domain"])
    prompt = pipeline.build_image_prompt(routing, classification)

    async def event_stream():
        meta = {"type": "classification", "routing": routing, "classification": classification}
        yield f"data: {json.dumps(meta)}\n\n"

        report = ""
        async for token in generate_report_stream(prompt):
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
    """Submit symptom text → clinical report."""
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
    history: str = Form(default="[]"),
    current_user: User | None = Depends(optional_current_user),
):
    """Stream the clinical report token-by-token for text symptoms (SSE).
    Accepts optional JSON-encoded conversation history for follow-up questions.
    """
    if not symptoms.strip():
        raise HTTPException(status_code=400, detail="Symptoms text cannot be empty.")

    import json as _json
    from app.config import PATIENT_CHAT_SYSTEM_PROMPT, TEXT_PROMPT_TEMPLATE
    from app.reasoning import generate_report_stream_with_history

    try:
        history_msgs = _json.loads(history) if history else []
    except Exception:
        history_msgs = []

    # First message in a thread uses the structured template; follow-ups pass raw text.
    if history_msgs:
        user_message = symptoms.strip()
    else:
        user_message = TEXT_PROMPT_TEMPLATE.format(symptoms=symptoms.strip())

    async def event_stream():
        yield f"data: {json.dumps({'type': 'text_start', 'symptoms': symptoms.strip()})}\n\n"

        report = ""
        async for token in generate_report_stream_with_history(
            user_message, history_msgs, system_prompt=PATIENT_CHAT_SYSTEM_PROMPT
        ):
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
@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Transcribe spoken audio to text only (for voice input into the chat)."""
    from app import speech

    audio_bytes = await file.read()
    result = speech.transcribe_audio(audio_bytes, file.filename or "audio.wav")
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error") or "Could not transcribe audio.")
    return {"text": result.get("text", "")}


@router.post("/audio")
async def analyze_audio(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    """Upload spoken symptoms → transcription → clinical report."""
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
    """Transcribe audio, then stream the clinical report (SSE)."""
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading.")

    audio_bytes = await file.read()
    from app.config import TEXT_PROMPT_TEMPLATE
    from app.reasoning import generate_report_stream
    from app.speech import transcribe_audio

    transcription = transcribe_audio(audio_bytes, file.filename or "audio.wav")

    async def event_stream():
        if not transcription["success"]:
            yield f"data: {json.dumps({'type': 'error', 'message': transcription['error']})}\n\n"
            return

        symptoms = transcription["text"]
        prompt = TEXT_PROMPT_TEMPLATE.format(symptoms=symptoms)

        yield f"data: {json.dumps({'type': 'audio_start', 'transcription': symptoms})}\n\n"

        report = ""
        async for token in generate_report_stream(prompt):
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
    history: str = Form(default="[]"),
    current_user: User | None = Depends(optional_current_user),
):
    """Retrieve literature (Europe PMC + Semantic Scholar), then stream a cited answer.
    Accepts optional JSON-encoded conversation history for multi-turn sessions.
    """
    if not question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    import json as _json
    from app.research import generate_grounded_stream_with_history, search_literature

    try:
        history_msgs = _json.loads(history) if history else []
    except Exception:
        history_msgs = []

    q = question.strip()
    sources = await search_literature(q, limit=6)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
        answer = ""
        async for token in generate_grounded_stream_with_history(q, sources, history_msgs):
            answer += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        await history_store.save_consultation(
            input_type="doctor", input_text=q, report=answer, sources=sources,
            **_owner_kwargs(current_user),
        )
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
