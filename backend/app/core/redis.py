"""
Redis connection lifecycle.

A single lazily-created async client is shared process-wide. Everything here is
defensive: if ``REDIS_ENABLED`` is false, or Redis can't be reached at startup,
:func:`get_redis` returns ``None`` and callers (cache, rate limiter) fall back to
safe behaviour rather than erroring. This mirrors how ``app.db`` degrades when
Postgres is absent, so the app always boots.
"""

from __future__ import annotations

import logging

from app.config import REDIS_ENABLED, REDIS_URL

log = logging.getLogger("dpt.redis")

# redis-py is an optional dependency at import time so the app still starts in
# environments where it isn't installed (e.g. a minimal CI job).
try:
    from redis import asyncio as aioredis  # type: ignore
except Exception:  # pragma: no cover - exercised only without the dependency
    aioredis = None  # type: ignore

_client = None
_ready = False


async def init_redis() -> bool:
    """Connect and PING. Returns True if Redis is usable; never raises."""
    global _client, _ready

    if not REDIS_ENABLED:
        log.info("redis_disabled")
        print("  ℹ️  REDIS_ENABLED=false — cache off, rate limiting is per-process.")
        return False
    if aioredis is None:
        print("  ⚠️  redis package not installed — cache off, rate limiting per-process.")
        return False

    try:
        _client = aioredis.from_url(
            REDIS_URL, encoding="utf-8", decode_responses=True,
            socket_connect_timeout=2, socket_timeout=2,
        )
        await _client.ping()
        _ready = True
        print("  ✓ Redis connected — caching and distributed rate limiting enabled.")
        return True
    except Exception as e:
        _ready = False
        _client = None
        print(f"  ⚠️  Redis unavailable ({e.__class__.__name__}): cache off, rate limiting per-process.")
        return False


async def close_redis() -> None:
    global _client, _ready
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
    _client = None
    _ready = False


def get_redis():
    """Return the shared client, or None when Redis is unavailable."""
    return _client if _ready else None


def is_ready() -> bool:
    return _ready
