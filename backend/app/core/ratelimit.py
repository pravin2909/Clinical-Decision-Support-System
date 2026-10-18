"""
Token-bucket rate limiting.

Three layers, same algorithm everywhere:

1. :func:`token_bucket_step` — the **pure** bucket math (no I/O, no clock). Given
   the stored state and "now", it returns the new state and whether the request
   is allowed. Unit-tested exhaustively in ``tests/test_ratelimit.py``.

2. Redis path — a Lua script runs :func:`token_bucket_step`'s logic *atomically*
   on the server, so concurrent requests across processes/nodes can't race past
   the limit. This is the production path.

3. Per-process fallback — when Redis is unavailable, the same pure function runs
   against an in-memory dict. A single node still enforces limits (it just isn't
   shared across replicas), so the app never fails open completely.

Why token bucket (vs fixed window): it allows short bursts up to ``capacity``
while holding the long-run rate to ``refill_rate`` tokens/sec, and it yields a
precise ``Retry-After`` (when the next token arrives) instead of making the
client guess.

Usage — attach as a dependency, stricter on expensive endpoints:

    @router.post("/login", dependencies=[Depends(rate_limit("login", 5, 0.2))])
    ...                                              # 5 burst, 1 token / 5s
"""

from __future__ import annotations

import logging
import math
import time

from fastapi import Depends, HTTPException, Request

from app.auth import oauth2_scheme
from app.config import JWT_ALGORITHM, JWT_SECRET
from app.core.redis import get_redis

log = logging.getLogger("dpt.ratelimit")

# Allowed/blocked tallies for /metrics.
_allowed = 0
_blocked = 0

# Per-process fallback store: key -> (tokens, last_ms).
_local_buckets: dict[str, tuple[float, int]] = {}


def token_bucket_step(
    tokens: float,
    last_ms: int,
    now_ms: int,
    capacity: float,
    refill_rate: float,
    cost: float = 1.0,
) -> tuple[bool, float, int, float]:
    """
    Advance one token-bucket step.

    Returns ``(allowed, new_tokens, new_last_ms, retry_after_s)``:
    - refill by the time elapsed since ``last_ms`` (capped at ``capacity``);
    - if at least ``cost`` tokens are available, consume them → allowed;
    - otherwise deny and compute how long until ``cost`` tokens exist.
    """
    elapsed_s = max(0.0, (now_ms - last_ms) / 1000.0)
    tokens = min(capacity, tokens + elapsed_s * refill_rate)

    if tokens >= cost:
        return True, tokens - cost, now_ms, 0.0

    deficit = cost - tokens
    retry_after = deficit / refill_rate if refill_rate > 0 else float("inf")
    return False, tokens, now_ms, retry_after


# Lua mirrors token_bucket_step exactly, executed atomically on Redis.
# KEYS[1] = bucket key
# ARGV = capacity, refill_rate, now_ms, cost, ttl_s
# returns { allowed(0/1), retry_after_ms }
_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity end
if ts == nil then ts = now end

local elapsed = math.max(0, (now - ts) / 1000.0)
tokens = math.min(capacity, tokens + elapsed * refill)

local allowed = 0
local retry_after = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  local deficit = cost - tokens
  retry_after = math.ceil((deficit / refill) * 1000)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, ttl)
return { allowed, retry_after }
"""


async def _check(key: str, capacity: float, refill_rate: float, cost: float):
    """Run one limiter step via Redis if available, else the local fallback."""
    now_ms = int(time.time() * 1000)
    client = get_redis()

    if client is not None:
        try:
            ttl = int(math.ceil(capacity / refill_rate)) + 1 if refill_rate > 0 else 60
            allowed, retry_ms = await client.eval(
                _LUA, 1, key, capacity, refill_rate, now_ms, cost, ttl
            )
            return bool(allowed), (float(retry_ms) / 1000.0)
        except Exception:
            # Redis blipped mid-request — fall through to local enforcement.
            pass

    tokens, last_ms = _local_buckets.get(key, (capacity, now_ms))
    allowed, new_tokens, new_last, retry_after = token_bucket_step(
        tokens, last_ms, now_ms, capacity, refill_rate, cost
    )
    _local_buckets[key] = (new_tokens, new_last)
    return allowed, retry_after


def _client_id(request: Request, token: str | None) -> str:
    """
    Identify the caller: by user id when a token is present (per-user limiting),
    otherwise by client IP (per-IP limiting for anonymous/login traffic).
    """
    if token:
        try:
            import jwt
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return f"user:{payload['sub']}"
        except Exception:
            pass
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


def rate_limit(name: str, capacity: float, refill_rate: float, cost: float = 1.0):
    """
    Dependency factory. ``capacity`` = burst size, ``refill_rate`` = sustained
    tokens/second, ``cost`` = tokens this call consumes. Raises 429 with a
    ``Retry-After`` header when the bucket is empty.
    """

    async def _dep(request: Request, token: str | None = Depends(oauth2_scheme)):
        global _allowed, _blocked
        key = f"rl:{name}:{_client_id(request, token)}"
        allowed, retry_after = await _check(key, capacity, refill_rate, cost)
        if not allowed:
            _blocked += 1
            retry_s = max(1, int(math.ceil(retry_after)))
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please retry later.",
                headers={"Retry-After": str(retry_s)},
            )
        _allowed += 1

    return _dep


def stats() -> dict:
    total = _allowed + _blocked
    return {
        "allowed": _allowed,
        "blocked": _blocked,
        "total": total,
        "block_rate": (_blocked / total) if total else 0.0,
    }


def reset() -> None:
    """Reset counters and the local bucket store (used by tests)."""
    global _allowed, _blocked
    _allowed = 0
    _blocked = 0
    _local_buckets.clear()
