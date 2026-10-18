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
from app.api.v1.appointments import router as appointments_router
from app.api.v1.auth import router as auth_router
from app.api.v1.care import router as care_router
from app.api.v1.chat import router as chat_router
from app.api.v1.consent import router as consent_router
from app.api.v1.doctor import router as doctor_router
from app.api.v1.documents import router as documents_router
from app.api.v1.health import router as health_router
from app.api.v1.history import router as history_router
from app.api.v1.messages import router as messages_router
from app.api.v1.prescriptions import router as prescriptions_router
from app.api.v1.tracker import router as tracker_router

# Order here controls order in the OpenAPI docs.
feature_routers = [
    auth_router, admin_router, care_router, consent_router,
    tracker_router, analysis_router, history_router,
    chat_router, documents_router, prescriptions_router, doctor_router,
    appointments_router, messages_router,
]

__all__ = ["feature_routers", "health_router"]
