"""
Rate-limiter + cache tests.

The token-bucket math is unit-tested directly (pure, deterministic). The limiter
is then exercised end-to-end through ``/auth/login`` using the stateless client:
no Redis is initialized there, so the per-process fallback does the enforcing —
which is exactly the path we want covered for CI.
"""

import pytest

from app.core import cache, ratelimit
from app.core.ratelimit import token_bucket_step


# ──────────────────────────────────────
# Pure token-bucket math
# ──────────────────────────────────────
def test_allows_until_capacity_then_blocks():
    # capacity 3, refill 1 tok/s, no time passing → 3 allowed, 4th blocked.
    tokens, last = 3.0, 0
    for _ in range(3):
        allowed, tokens, last, retry = token_bucket_step(tokens, last, 0, 3, 1.0)
        assert allowed is True
    allowed, tokens, last, retry = token_bucket_step(tokens, last, 0, 3, 1.0)
    assert allowed is False
    assert retry == pytest.approx(1.0)  # 1 token / 1 tok-per-sec


def test_refill_over_time_restores_tokens():
    # Drain to empty at t=0, then 2s later 2 tokens should be back.
    allowed, tokens, last, _ = token_bucket_step(1.0, 0, 0, 5, 1.0)  # consume the 1
    assert allowed is True and tokens == pytest.approx(0.0)
    allowed, tokens, last, _ = token_bucket_step(tokens, last, 2000, 5, 1.0)  # +2s
    assert allowed is True
    assert tokens == pytest.approx(1.0)  # 2 refilled, 1 consumed


def test_refill_never_exceeds_capacity():
    # Huge elapsed time must cap at capacity, not overflow.
    allowed, tokens, last, _ = token_bucket_step(0.0, 0, 10_000_000, 5, 1.0)
    assert tokens <= 5.0


def test_retry_after_scales_with_deficit():
    # Empty bucket, cost 3, refill 0.5/s → need 3 tokens → 6s.
    allowed, tokens, last, retry = token_bucket_step(0.0, 0, 0, 10, 0.5, cost=3)
    assert allowed is False
    assert retry == pytest.approx(6.0)


# ──────────────────────────────────────
# Integration: limiter enforces via the local fallback (no Redis in tests)
# ──────────────────────────────────────
async def test_login_rate_limit_returns_429(client):
    ratelimit.reset()  # clear the per-process buckets/counters

    # login is capacity=10; the 11th rapid attempt from the same client blocks.
    statuses = []
    for _ in range(12):
        r = await client.post("/api/v1/auth/login",
                              data={"username": "x@example.com", "password": "nope"})
        statuses.append(r.status_code)

    assert 429 in statuses
    first_429 = statuses.index(429)
    assert first_429 >= 10  # first 10 bursts went through (to a 401, DB being off)

    # The 429 response carries a Retry-After header and the standard error shape.
    r = await client.post("/api/v1/auth/login",
                          data={"username": "x@example.com", "password": "nope"})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) >= 1
    assert r.json()["error"]["code"] == "rate_limited"


# ──────────────────────────────────────
# Cache: graceful no-op without Redis, and hit/miss accounting
# ──────────────────────────────────────
async def test_cache_is_miss_without_redis():
    cache.reset_stats()
    # No Redis initialized in tests → every get is a miss, set is a silent no-op.
    assert await cache.cache_get_json("cds:v1:nope") is None
    await cache.cache_set_json("cds:v1:nope", {"a": 1})
    assert await cache.cache_get_json("cds:v1:nope") is None

    s = cache.stats()
    assert s["misses"] == 2
    assert s["hits"] == 0
    assert s["hit_rate"] == 0.0


def test_make_key_is_versioned_and_namespaced():
    assert cache.make_key("dashboard", 42).startswith("cds:")
    assert ":dashboard:42" in cache.make_key("dashboard", 42)
