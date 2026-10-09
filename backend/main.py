"""
═══════════════════════════════════════════════════════════════
  DPT Clinical Decision Support Engine — FastAPI Server
  
  Endpoints:
    POST /analyze/image   → Upload medical image → DPT report
    POST /analyze/text    → Submit symptoms text → DPT report
    POST /analyze/audio   → Upload audio/speech  → DPT report
    GET  /health          → System health check
    GET  /models/status   → Model loading status
═══════════════════════════════════════════════════════════════
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, HTMLResponse, FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import json
import time
import os

# Built React frontend (run `npm run build` in frontend/).
# main.py lives in backend/, so the repo root is one level up.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIST = os.path.join(REPO_ROOT, "frontend", "dist")

from app.pipeline import pipeline
from app.reasoning import check_llm_status
from app.config import LLM_MODEL, LLM_BASE_URL
from app.db import init_db, dispose_db
from app import history, users
from app.auth import (
    create_access_token, get_current_user, optional_current_user, require_role,
)
from app.models_db import Role, User
from app.schemas import RegisterRequest, TokenResponse, AssignmentRequest


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
# Lifespan: Load models + DB on startup
# ──────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all models and connect the database when the server starts."""
    pipeline.load_models()
    await init_db()
    yield
    await dispose_db()
    print("🛑 DPT Engine shutting down.")


# ──────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────
app = FastAPI(
    title="DPT Clinical Decision Support Engine",
    description=(
        "AI-powered Diagnostic, Prognostic & Therapeutic clinical report generator. "
        "Accepts medical images, symptom text, or audio input."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — configurable via CORS_ORIGINS (comma-separated). Defaults to "*".
# Note: the wildcard origin and allow_credentials=True are mutually exclusive per
# the CORS spec (browsers reject it), and this API uses no cookies/credentials,
# so credentials are only enabled when explicit origins are configured.
_cors_env = os.getenv("CORS_ORIGINS", "*").strip()
_cors_origins = ["*"] if _cors_env in ("", "*") else [o.strip() for o in _cors_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────
# Frontend (React build) Serving — OPT-IN
# ──────────────────────────────────────
# The frontend is a separate service on its own port by default (SERVE_FRONTEND
# unset/false). Set SERVE_FRONTEND=true to also serve the built SPA from this
# backend (single-port deployment). API routes always take precedence.
SERVE_FRONTEND = os.getenv("SERVE_FRONTEND", "false").lower() in ("1", "true", "yes", "on")

if SERVE_FRONTEND:
    _assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/")
    async def serve_ui():
        """Serve the built React single-page app."""
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return HTMLResponse(
            content=(
                "<h1>Frontend not built.</h1>"
                "<p>Run <code>npm install &amp;&amp; npm run build</code> in the "
                "<code>frontend/</code> directory.</p>"
            ),
            status_code=503,
        )
else:
    @app.get("/")
    async def api_root():
        """API-only root. The frontend runs as a separate service."""
        return {
            "service": "DPT Clinical Decision Support Engine API",
            "version": "1.0.0",
            "docs": "/docs",
            "health": "/health",
        }


# ──────────────────────────────────────
# Health & Status Endpoints
# ──────────────────────────────────────
@app.get("/health")
async def health_check():
    """System health check."""
    llm_ok = await check_llm_status()
    return {
        "status": "healthy" if pipeline.is_loaded() and llm_ok else "degraded",
        "models_loaded": pipeline.is_loaded(),
        "llm_available": llm_ok,
        "llm_model": LLM_MODEL,
        "llm_base_url": LLM_BASE_URL,
        "device": str(pipeline.device),
    }


@app.get("/models/status")
async def models_status():
    """Detailed model loading status."""
    return {
        "router": {
            "loaded": pipeline.router is not None,
            "classes": list(pipeline.router_idx_to_class.values()) if pipeline.router_idx_to_class else [],
        },
        "vit_models": {
            domain: {
                "loaded": domain in pipeline.vit_models,
                "classes": info.get("classes", []),
            }
            for domain, info in pipeline.vit_classes.items()
        } if pipeline.vit_classes else {},
    }


# ──────────────────────────────────────
# Auth Endpoints
# ──────────────────────────────────────
@app.post("/auth/register")
async def register(req: RegisterRequest):
    """
    Register a new account.
    - patient / doctor: open self-registration.
    - admin: allowed only to bootstrap the first admin, or by an existing admin
      (use POST /admin/users for admin-created accounts once one exists).
    """
    if req.role == Role.admin and await users.admin_exists():
        raise HTTPException(
            status_code=403,
            detail="An admin already exists. Admins must be created by an admin.",
        )

    profile = None
    if req.role == Role.doctor and req.doctor:
        profile = req.doctor.model_dump()
    elif req.role == Role.patient and req.patient:
        profile = req.patient.model_dump()

    try:
        user = await users.create_user(
            email=req.email, password=req.password, full_name=req.full_name,
            role=req.role, profile=profile,
        )
    except users.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return user


@app.post("/auth/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    """Log in with email (as `username`) + password; returns a JWT."""
    user = await users.authenticate(form.username, form.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return TokenResponse(access_token=create_access_token(user))


@app.get("/auth/me")
async def me(user: User = Depends(get_current_user)):
    return user.to_public()


# ──────────────────────────────────────
# Admin Endpoints
# ──────────────────────────────────────
@app.get("/admin/users")
async def admin_list_users(_: User = Depends(require_role(Role.admin))):
    return {"users": await users.list_users()}


@app.post("/admin/users")
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


@app.post("/admin/assignments")
async def admin_assign(
    req: AssignmentRequest, _: User = Depends(require_role(Role.admin))
):
    """Link a doctor to a patient so the doctor may access their consultations."""
    try:
        return await users.assign_doctor_patient(req.doctor_id, req.patient_id)
    except users.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ──────────────────────────────────────
# Image Analysis Endpoint
# ──────────────────────────────────────
@app.post("/analyze/image")
async def analyze_image(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    """
    Upload a medical image (retinal scan, dental photo, or skin image).
    Returns:
      - Routing result (eye/dental/skin)
      - Disease classification
      - DPT clinical report
    """
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading. Please wait.")

    # Validate file type
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
        result["consultation_id"] = await history.save_consultation(
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


# ──────────────────────────────────────
# Text Analysis Endpoint
# ──────────────────────────────────────
@app.post("/analyze/text")
async def analyze_text(
    symptoms: str = Form(...),
    current_user: User | None = Depends(optional_current_user),
):
    """
    Submit symptom description text.
    Returns a DPT clinical report based on the described symptoms.
    """
    if not symptoms.strip():
        raise HTTPException(status_code=400, detail="Symptoms text cannot be empty.")

    start = time.time()
    result = await pipeline.process_text(symptoms.strip())
    result["processing_time_seconds"] = round(time.time() - start, 2)

    if "error" not in result:
        result["consultation_id"] = await history.save_consultation(
            input_type="text",
            input_text=result.get("symptoms"),
            report=result.get("report"),
            processing_time_seconds=result["processing_time_seconds"],
            **_owner_kwargs(current_user),
        )

    return JSONResponse(content=result)


@app.post("/analyze/text/stream")
async def analyze_text_stream(
    symptoms: str = Form(...),
    current_user: User | None = Depends(optional_current_user),
):
    """
    Stream DPT report token-by-token for text symptoms.
    """
    if not symptoms.strip():
        raise HTTPException(status_code=400, detail="Symptoms text cannot be empty.")

    from app.reasoning import generate_dpt_report_stream
    from app.config import DPT_TEXT_PROMPT_TEMPLATE

    prompt = DPT_TEXT_PROMPT_TEMPLATE.format(symptoms=symptoms.strip())

    async def event_stream():
        meta = {
            "type": "text_start",
            "symptoms": symptoms.strip()
        }
        yield f"data: {json.dumps(meta)}\n\n"

        report = ""
        async for token in generate_dpt_report_stream(prompt):
            report += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        await history.save_consultation(
            input_type="text", input_text=symptoms.strip(), report=report,
            **_owner_kwargs(current_user),
        )
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ──────────────────────────────────────
# Audio Analysis Endpoint
# ──────────────────────────────────────
@app.post("/analyze/audio")
async def analyze_audio(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    """
    Upload an audio file (WAV, MP3, FLAC) with spoken symptoms.
    The audio is converted to text, then analyzed for a DPT report.
    """
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
        result["consultation_id"] = await history.save_consultation(
            input_type="audio",
            input_text=result.get("transcription"),
            report=result.get("report"),
            processing_time_seconds=result["processing_time_seconds"],
            **_owner_kwargs(current_user),
        )

    return JSONResponse(content=result)

@app.post("/analyze/audio/stream")
async def analyze_audio_stream(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading.")
    
    audio_bytes = await file.read()
    from app.speech import transcribe_audio
    from app.reasoning import generate_dpt_report_stream
    from app.config import DPT_TEXT_PROMPT_TEMPLATE

    transcription = transcribe_audio(audio_bytes, file.filename or "audio.wav")
    
    async def event_stream():
        if not transcription["success"]:
            yield f"data: {json.dumps({'type': 'error', 'message': transcription['error']})}\n\n"
            return
            
        symptoms = transcription["text"]
        prompt = DPT_TEXT_PROMPT_TEMPLATE.format(symptoms=symptoms)
        
        meta = {
            "type": "audio_start",
            "transcription": symptoms
        }
        yield f"data: {json.dumps(meta)}\n\n"

        report = ""
        async for token in generate_dpt_report_stream(prompt):
            report += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        await history.save_consultation(
            input_type="audio", input_text=symptoms, report=report,
            **_owner_kwargs(current_user),
        )
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

# ──────────────────────────────────────
# Streaming Report Endpoint (optional)
# ──────────────────────────────────────
@app.post("/analyze/image/stream")
async def analyze_image_stream(
    file: UploadFile = File(...),
    current_user: User | None = Depends(optional_current_user),
):
    """
    Same as /analyze/image but streams the DPT report in real-time.
    Useful for showing generation progress in the UI.
    """
    if not pipeline.is_loaded():
        raise HTTPException(status_code=503, detail="Models are still loading.")

    image_bytes = await file.read()
    from app.model_loader import load_image_from_bytes
    from app.reasoning import generate_dpt_report_stream

    image = load_image_from_bytes(image_bytes)

    # Route & classify
    routing = pipeline.classify_image_domain(image)
    classification = pipeline.classify_disease(image, routing["domain"])

    prompt = pipeline.build_image_prompt(routing, classification)

    # Stream the metadata first, then the report
    async def event_stream():
        # Send classification info first
        meta = {
            "type": "classification",
            "routing": routing,
            "classification": classification,
        }
        yield f"data: {json.dumps(meta)}\n\n"

        # Stream report tokens
        report = ""
        async for token in generate_dpt_report_stream(prompt):
            report += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        await history.save_consultation(
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
# Doctor Mode — evidence-grounded answer with real citations
# ──────────────────────────────────────
@app.post("/analyze/doctor/stream")
async def analyze_doctor_stream(
    question: str = Form(...),
    current_user: User | None = Depends(optional_current_user),
):
    """
    Retrieve medical literature (Europe PMC) for the question, then stream an
    evidence-grounded answer that cites those sources inline as [n].
    """
    if not question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    from app.research import search_literature, generate_grounded_stream

    q = question.strip()
    sources = await search_literature(q, limit=5)

    async def event_stream():
        # Send the retrieved sources first so the UI can render citations.
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
        answer = ""
        async for token in generate_grounded_stream(q, sources):
            answer += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        await history.save_consultation(
            input_type="doctor", input_text=q, report=answer, sources=sources,
            **_owner_kwargs(current_user),
        )
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ──────────────────────────────────────
# Consultation History
# ──────────────────────────────────────
@app.get("/history")
async def get_history(
    limit: int = 50, offset: int = 0,
    current_user: User = Depends(get_current_user),
):
    """
    List past consultations the current user may see:
      - admin   → all
      - doctor  → assigned patients' consultations + ones they ran
      - patient → their own
    """
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    return await users.list_history_for(current_user, limit=limit, offset=offset)


@app.get("/history/{consultation_id}")
async def get_history_item(
    consultation_id: int, current_user: User = Depends(get_current_user)
):
    """Fetch a single past consultation in full (if the user may see it)."""
    item = await users.get_consultation_for(current_user, consultation_id)
    if item is None:
        # 404 whether missing or forbidden, so IDs aren't enumerable.
        raise HTTPException(status_code=404, detail="Consultation not found.")
    return item


# ──────────────────────────────────────
# SPA fallback — only when serving the frontend from this backend. For client-
# side routing (/app, /app/diagnosis) on direct load/refresh. Defined LAST so it
# never shadows the API or /assets routes above. In API-only mode it is omitted,
# so unknown paths return a normal 404.
# ──────────────────────────────────────
if SERVE_FRONTEND:
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return HTMLResponse(
            content="<h1>Frontend not built.</h1><p>Run <code>npm run build</code> in frontend/.</p>",
            status_code=503,
        )


# ──────────────────────────────────────
# Run with: python main.py   (HOST / PORT configurable via env)
# ──────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
