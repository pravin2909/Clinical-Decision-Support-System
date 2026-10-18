"""
Entrypoint for the Clinical Decision Support Engine API.

The application itself is assembled in ``app.application.create_app()``; this
file only exposes the ASGI ``app`` object (so ``uvicorn main:app`` keeps working)
and the local ``python main.py`` dev runner.

API surface (v1 — see /docs for the full OpenAPI schema):
    POST /api/v1/auth/register | login ; GET /api/v1/auth/me
    POST /api/v1/analyze/{image,text,audio}[/stream] ; /analyze/doctor/stream
    GET  /api/v1/history[/{id}]
    GET  /api/v1/admin/users ; POST /api/v1/admin/users | assignments
    GET  /healthz | /readyz | /metrics | /health | /models/status

The previous unprefixed paths (e.g. /analyze/image) still work as a temporary
bridge for the current frontend and are hidden from the docs.
"""

import os

from app.application import create_app

app = create_app()


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
