"""
API v1 routers.

``feature_routers`` are mounted twice by the app factory: once under
``/api/v1`` (the real, documented surface) and once unprefixed and hidden from
the schema, as a temporary bridge so the existing frontend keeps working while
it migrates to the versioned paths. ``health_router`` is mounted only at the
root, since liveness/readiness/metrics are conventionally unversioned.
"""

from app.api.v1.admin import router as admin_router
from app.api.v1.analysis import router as analysis_router
from app.api.v1.auth import router as auth_router
from app.api.v1.health import router as health_router
from app.api.v1.history import router as history_router

# Order here controls order in the OpenAPI docs.
feature_routers = [auth_router, admin_router, analysis_router, history_router]

__all__ = ["feature_routers", "health_router"]
