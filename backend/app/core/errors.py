"""
One consistent error response shape for the whole API.

Every error — whether a raised ``HTTPException``, a request-validation failure,
or an unexpected crash — comes back to the client in the same envelope:

    {
      "error":   { "code": "not_found", "message": "...", "details": ... },
      "request_id": "ab12..."
    }

Why: clients (and your future self debugging) get a predictable structure, and
the ``request_id`` ties the failure to the exact server-side log line produced by
``RequestContextMiddleware``. Without this, FastAPI returns ``{"detail": ...}``
for some errors and a bare 500 for others.
"""

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import log, request_id_ctx

# Map common status codes to short, stable, machine-readable error codes.
_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_error",
    429: "rate_limited",
    503: "service_unavailable",
}


def _envelope(status_code: int, code: str, message, details=None) -> JSONResponse:
    error: dict = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    body = {"error": error, "request_id": request_id_ctx.get()}
    return JSONResponse(status_code=status_code, content=jsonable_encoder(body))


async def _http_exception_handler(request: Request, exc: StarletteHTTPException):
    code = _CODES.get(exc.status_code, "error")
    resp = _envelope(exc.status_code, code, exc.detail)
    # Preserve auth challenge / Retry-After style headers set on the exception.
    if exc.headers:
        resp.headers.update(exc.headers)
    return resp


async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    return _envelope(422, "validation_error", "Request validation failed", exc.errors())


async def _unhandled_exception_handler(request: Request, exc: Exception):
    # Full traceback goes to the logs (with the request_id); the client gets a
    # generic message so internals never leak.
    log.exception("unhandled_exception")
    return _envelope(500, "internal_error", "An unexpected error occurred.")


def install_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)
