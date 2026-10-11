"""
DB-backed auth flow: register -> login -> /me. Uses the ``db_client`` fixture,
which is skipped unless TEST_DATABASE_URL is set.
"""

import uuid


async def test_register_login_me(db_client):
    email = f"patient-{uuid.uuid4().hex[:8]}@example.com"
    password = "s3cret-pw"

    # Register a patient.
    r = await db_client.post("/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "Test Patient",
        "role": "patient",
        "patient": {"gender": "other"},
    })
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "patient"

    # Log in (OAuth2 password form: username = email).
    r = await db_client.post("/api/v1/auth/login", data={
        "username": email, "password": password,
    })
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    assert token

    # Authenticated /me returns the same identity.
    r = await db_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == email


async def _register_and_login(db_client) -> dict:
    email = f"patient-{uuid.uuid4().hex[:8]}@example.com"
    await db_client.post("/api/v1/auth/register", json={
        "email": email, "password": "s3cret-pw", "full_name": "X", "role": "patient",
    })
    r = await db_client.post("/api/v1/auth/login", data={
        "username": email, "password": "s3cret-pw",
    })
    return r.json()


async def test_login_returns_refresh_token(db_client):
    tokens = await _register_and_login(db_client)
    assert tokens["access_token"]
    assert tokens["refresh_token"]


async def test_refresh_rotates_and_invalidates_old_token(db_client):
    tokens = await _register_and_login(db_client)
    old_refresh = tokens["refresh_token"]

    # Exchange the refresh token for a new pair.
    r = await db_client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200, r.text
    new_tokens = r.json()
    assert new_tokens["access_token"]
    assert new_tokens["refresh_token"] != old_refresh  # rotated

    # The old refresh token must no longer work (rotation revoked it).
    r = await db_client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


async def test_logout_revokes_refresh_token(db_client):
    tokens = await _register_and_login(db_client)
    refresh = tokens["refresh_token"]

    r = await db_client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
    assert r.status_code == 204

    r = await db_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 401


async def test_refresh_rejects_garbage_token(db_client):
    r = await db_client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert r.status_code == 401


async def test_login_rejects_bad_password(db_client):
    email = f"patient-{uuid.uuid4().hex[:8]}@example.com"
    await db_client.post("/api/v1/auth/register", json={
        "email": email, "password": "right-pw", "full_name": "X", "role": "patient",
    })
    r = await db_client.post("/api/v1/auth/login", data={
        "username": email, "password": "wrong-pw",
    })
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"
