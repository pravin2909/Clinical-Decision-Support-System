"""
Application factory.

``create_app()`` wires the whole service together: logging, middleware, error
handlers, routers, lifespan, and (optionally) serving the built frontend. Keeping
this in a factory — rather than as module-level code in ``main.py`` — means tests
can build a fresh app instance, and the composition is readable top to bottom.

Routing strategy during the migration
-------------------------------------
Feature routers are mounted twice:
- under ``/api/v1`` — the real, versioned, documented API;
- unprefixed and hidden from the schema — a temporary bridge so the current
  frontend (which still calls ``/auth/login``, ``/analyze/image``, ...) keeps
  working until it is switched over to ``/api/v1``.
Health/readiness/metrics are mounted once, at the root, unversioned by convention.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1 import feature_routers, health_router
from app.config import LLM_BASE_URL, LLM_MODEL  # noqa: F401 (handy for debugging)
from app.core.errors import install_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.redis import close_redis, init_redis
from app.db import dispose_db, init_db
from app.pipeline import pipeline

# Repo root is two levels up from this file (backend/app/application.py).
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIST = os.path.join(REPO_ROOT, "frontend", "dist")

API_V1_PREFIX = "/api/v1"

# Serve the built SPA from this backend only when SERVE_FRONTEND is truthy.
SERVE_FRONTEND = os.getenv("SERVE_FRONTEND", "false").lower() in ("1", "true", "yes", "on")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models and connect the DB on startup; dispose on shutdown."""
    pipeline.load_models()
    await init_db()
    await init_redis()
    yield
    await close_redis()
    await dispose_db()


def _configure_cors(app: FastAPI) -> None:
    # CORS_ORIGINS is comma-separated; defaults to "*". The wildcard origin and
    # allow_credentials=True are mutually exclusive per the CORS spec, and this
    # API is token-based (no cookies), so credentials are enabled only when
    # explicit origins are configured.
    cors_env = os.getenv("CORS_ORIGINS", "*").strip()
    origins = ["*"] if cors_env in ("", "*") else [o.strip() for o in cors_env.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=origins != ["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )


def _mount_routers(app: FastAPI) -> None:
    # Unversioned health/metrics at the root.
    app.include_router(health_router)
    # Versioned API + hidden legacy bridge.
    for router in feature_routers:
        app.include_router(router, prefix=API_V1_PREFIX)
        app.include_router(router, include_in_schema=False)


def _configure_frontend(app: FastAPI) -> None:
    """Root route + (optional) SPA serving. Registered after API routers."""
    if SERVE_FRONTEND:
        assets_dir = os.path.join(FRONTEND_DIST, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/")
        async def serve_ui():
            index_path = os.path.join(FRONTEND_DIST, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
            return HTMLResponse(
                "<h1>Frontend not built.</h1><p>Run <code>npm install &amp;&amp; "
                "npm run build</code> in <code>frontend/</code>.</p>",
                status_code=503,
            )

        # SPA fallback for client-side routes on direct load/refresh. Declared
        # last so it never shadows the API or /assets routes above.
        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str):
            index_path = os.path.join(FRONTEND_DIST, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
            return HTMLResponse(
                "<h1>Frontend not built.</h1><p>Run <code>npm run build</code> in frontend/.</p>",
                status_code=503,
            )
    else:
        @app.get("/")
        async def api_root():
            return {
                "service": "Clinical Decision Support Engine API",
                "version": "1.0.0",
                "docs": "/docs",
                "api": API_V1_PREFIX,
                "health": "/healthz",
            }


def create_app() -> FastAPI:
    configure_logging(os.getenv("LOG_LEVEL", "INFO"))

    app = FastAPI(
        title="Clinical Decision Support Engine",
        description=(
            "AI-powered Diagnostic, Prognostic & Therapeutic clinical report generator. "
            "Accepts medical images, symptom text, or audio input."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    # Request-ID + structured request logging (pure ASGI, SSE-safe).
    app.add_middleware(RequestContextMiddleware)
    _configure_cors(app)
    install_exception_handlers(app)
    _mount_routers(app)
    _configure_frontend(app)
    return app
