"""
Health, readiness, and metrics endpoints.

Three distinct concerns, often conflated:
- ``/healthz``  — **liveness**: is the process alive? No dependency checks, so a
  slow DB never makes an orchestrator kill a healthy process.
- ``/readyz``   — **readiness**: can we actually serve traffic right now? Returns
  503 until the ML models are loaded, so a load balancer won't route to us early.
- ``/metrics``  — a minimal Prometheus-style text exposition. Intentionally tiny
  for now; replaced with real instrumentation (prometheus_client) in Phase 5.

``/health`` and ``/models/status`` are kept as-is for the current frontend.
"""

import time

from fastapi import APIRouter, Response

from app import db as db_module
from app.config import LLM_BASE_URL, LLM_MODEL
from app.pipeline import pipeline
from app.reasoning import check_llm_status

router = APIRouter(tags=["health"])

_STARTED = time.time()


@router.get("/healthz")
async def healthz():
    """Liveness probe: cheap, dependency-free."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(response: Response):
    """Readiness probe: 200 only once models are loaded, else 503."""
    ready = pipeline.is_loaded()
    if not ready:
        response.status_code = 503
    return {
        "status": "ready" if ready else "not_ready",
        "models_loaded": pipeline.is_loaded(),
        "db": db_module.db_ready,
    }


@router.get("/health")
async def health_check():
    """Detailed health snapshot (used by the current frontend)."""
    llm_ok = await check_llm_status()
    return {
        "status": "healthy" if pipeline.is_loaded() and llm_ok else "degraded",
        "models_loaded": pipeline.is_loaded(),
        "llm_available": llm_ok,
        "llm_model": LLM_MODEL,
        "llm_base_url": LLM_BASE_URL,
        "device": str(pipeline.device),
    }


@router.get("/models/status")
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


@router.get("/metrics")
async def metrics():
    """Minimal Prometheus text exposition (placeholder until Phase 5)."""
    loaded = 1 if pipeline.is_loaded() else 0
    uptime = time.time() - _STARTED
    lines = [
        "# HELP dpt_up Process is responding (always 1 when scraped).",
        "# TYPE dpt_up gauge",
        "dpt_up 1",
        "# HELP dpt_models_loaded Whether the ML models are loaded.",
        "# TYPE dpt_models_loaded gauge",
        f"dpt_models_loaded {loaded}",
        "# HELP dpt_uptime_seconds Seconds since process start.",
        "# TYPE dpt_uptime_seconds gauge",
        f"dpt_uptime_seconds {uptime:.0f}",
    ]
    return Response("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")
