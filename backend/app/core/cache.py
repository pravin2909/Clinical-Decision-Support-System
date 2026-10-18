"""
Cache-aside helpers backed by Redis.

Pattern (cache-aside / lazy loading):

    value = await cache_get_json(key)
    if value is None:            # miss
        value = await load_from_db()
        await cache_set_json(key, value, ttl)
    return value

On a write that changes the underlying data, the owning code calls
:func:`invalidate` for the affected key(s) — explicit invalidation, not blind
TTL expiry, so a reader never sees stale data right after their own write.

Keys are built with :func:`make_key`, which bakes in ``CACHE_VERSION`` and lets
callers include the role/identity so one user's cached data can never be served
to another (important for per-patient payloads).

Every lookup updates in-process hit/miss counters exposed via :func:`stats` and
surfaced on ``/metrics`` — so the "measure your cache hit rate" item from the
build plan is real, not aspirational.
"""

from __future__ import annotations

import json
import logging

from app.config import CACHE_DEFAULT_TTL, CACHE_VERSION
from app.core.redis import get_redis

log = logging.getLogger("dpt.cache")

# Process-local counters. Good enough for a single-node demo and for before/after
# load-test numbers; a multi-node setup would scrape these per-instance.
_hits = 0
_misses = 0


def make_key(*parts: object) -> str:
    """Build a namespaced, versioned cache key, e.g. ``cds:v1:dashboard:42``."""
    joined = ":".join(str(p) for p in parts)
    return f"cds:{CACHE_VERSION}:{joined}"


async def cache_get_json(key: str):
    """Return the decoded cached value, or None on a miss / when Redis is down."""
    global _hits, _misses
    client = get_redis()
    if client is None:
        _misses += 1
        return None
    try:
        raw = await client.get(key)
    except Exception:
        _misses += 1
        return None
    if raw is None:
        _misses += 1
        return None
    _hits += 1
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        # Corrupt entry — treat as a miss and let the caller repopulate.
        return None


async def cache_set_json(key: str, value, ttl: int | None = None) -> None:
    """Store ``value`` as JSON with a TTL. No-op when Redis is unavailable."""
    client = get_redis()
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value, default=str), ex=ttl or CACHE_DEFAULT_TTL)
    except Exception:
        pass  # caching is best-effort; never fail the request over it


async def invalidate(*keys: str) -> None:
    """Delete one or more cache keys (call on writes that change the data)."""
    client = get_redis()
    if client is None or not keys:
        return
    try:
        await client.delete(*keys)
    except Exception:
        pass


def stats() -> dict:
    """Current hit/miss counts and hit rate (for /metrics and tests)."""
    total = _hits + _misses
    return {
        "hits": _hits,
        "misses": _misses,
        "total": total,
        "hit_rate": (_hits / total) if total else 0.0,
    }


def reset_stats() -> None:
    """Reset counters (used by tests)."""
    global _hits, _misses
    _hits = 0
    _misses = 0
