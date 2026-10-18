"""
Shared test fixtures.

Two client fixtures:
- ``client``     — stateless (DB disabled, models not loaded). The HTTP app is
  driven in-process via httpx's ASGITransport, which does NOT run the lifespan,
  so the heavy model load and DB connect never happen. Fast; good for contract
  and error-handling tests.
- ``db_client``  — connects to a throwaway test database. Skipped automatically
  unless ``TEST_DATABASE_URL`` is set (CI sets it; locally, point it at a
  ``cds_test`` DB with migrations applied).
"""

import os

# Contract tests run without a database; set this before app modules import.
os.environ.setdefault("DB_ENABLED", "false")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.application import create_app


@pytest.fixture(autouse=True)
def _reset_limiter_and_cache():
    """
    Rate-limiter buckets and cache counters are process-global (the per-process
    fallback path). All in-process test clients share one client IP, so without a
    reset one test's bursty traffic would 429 the next test's login. Reset before
    each test for isolation.
    """
    from app.core import cache, ratelimit

    ratelimit.reset()
    cache.reset_stats()
    yield


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def db_client(monkeypatch):
    import pytest

    test_url = os.environ.get("TEST_DATABASE_URL")
    if not test_url:
        pytest.skip("TEST_DATABASE_URL not set — skipping DB-backed tests")

    import app.config as config
    import app.db as db

    # Repoint the DB layer at the test database and enable persistence.
    monkeypatch.setattr(config, "DATABASE_URL", test_url, raising=False)
    monkeypatch.setattr(db, "DATABASE_URL", test_url, raising=False)
    monkeypatch.setattr(config, "DB_ENABLED", True, raising=False)
    monkeypatch.setattr(db, "DB_ENABLED", True, raising=False)

    await db.init_db()
    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await db.dispose_db()
