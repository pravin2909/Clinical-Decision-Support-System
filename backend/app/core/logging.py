"""
Structured logging + per-request correlation IDs (Phase 0 observability base).

Why this exists
---------------
- **Correlation ID:** every HTTP request is tagged with an ID (an inbound
  ``X-Request-ID`` is honored, otherwise one is generated). The ID is stored in
  a ``ContextVar`` so *any* log line written while handling that request carries
  it automatically, and it is echoed back in the ``X-Request-ID`` response
  header. This is how you follow one request through the logs — and, later,
  across process boundaries (API → Celery worker → ML service) by forwarding the
  same header.
- **JSON logs:** each log record is emitted as a single JSON line so a log
  collector (Loki / CloudWatch / ELK) can index fields instead of regexing free
  text.

The request middleware is written as a **pure ASGI middleware** (not Starlette's
``BaseHTTPMiddleware``) on purpose: BaseHTTPMiddleware wraps the response body and
can interfere with Server-Sent Events / streaming responses, which this app uses
heavily for token-by-token chat. A pure ASGI middleware only inspects the
response *start* message, so streaming is left completely untouched.
"""

import json
import logging
import time
import uuid
from contextvars import ContextVar

# Current request's correlation ID. Defaults to "-" outside a request (e.g.
# startup logs), so every log line always has the field.
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")

# LogRecord attributes that are part of the logging machinery itself; anything
# else attached via ``logger.info(..., extra={...})`` is treated as a structured
# field and merged into the JSON output.
_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "taskName", "message",
}


class JsonFormatter(logging.Formatter):
    """Render each log record as one line of JSON."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        # Merge structured extras passed as logger.info("...", extra={...}).
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload.setdefault(key, value)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Install the JSON formatter on the root logger. Call once at startup."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    # Uvicorn's own access log would duplicate our per-request line below, so
    # silence it and let the middleware be the single source of request logs.
    logging.getLogger("uvicorn.access").disabled = True
    # httpx logs an INFO line per outbound call (LLM, Europe PMC); keep those at
    # WARNING so request logs stay readable. Errors still surface.
    logging.getLogger("httpx").setLevel(logging.WARNING)


log = logging.getLogger("dpt.request")


class RequestContextMiddleware:
    """
    Pure ASGI middleware: assign/propagate a request ID, attach it to the
    response headers, and emit exactly one structured log line per request.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            # Pass through lifespan/websocket scopes untouched.
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        inbound = headers.get(b"x-request-id", b"").decode() or None
        rid = inbound or uuid.uuid4().hex
        token = request_id_ctx.set(rid)
        start = time.perf_counter()
        status_holder = {"status": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                # Echo the correlation ID back so clients/proxies can log it too.
                message.setdefault("headers", [])
                message["headers"].append((b"x-request-id", rid.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.info(
                "request",
                extra={
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": status_holder["status"],
                    "duration_ms": duration_ms,
                },
            )
            request_id_ctx.reset(token)
