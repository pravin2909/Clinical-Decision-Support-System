"""Health-tracker endpoints (DB-backed; skipped without TEST_DATABASE_URL)."""

import uuid


async def _patient_headers(db_client) -> dict:
    email = f"p-{uuid.uuid4().hex[:8]}@example.com"
    await db_client.post("/api/v1/auth/register", json={
        "email": email, "password": "pw123456", "full_name": "P", "role": "patient",
    })
    r = await db_client.post("/api/v1/auth/login", data={
        "username": email, "password": "pw123456",
    })
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_record_and_list_observations(db_client):
    h = await _patient_headers(db_client)

    r = await db_client.post("/api/v1/observations", headers=h, json={
        "type": "weight", "value": {"value": 72.5}, "unit": "kg",
    })
    assert r.status_code == 201, r.text
    assert r.json()["type"] == "weight"
    assert r.json()["value"]["value"] == 72.5

    r = await db_client.post("/api/v1/observations", headers=h, json={
        "type": "bp", "value": {"systolic": 120, "diastolic": 80}, "unit": "mmHg",
    })
    assert r.status_code == 201

    r = await db_client.get("/api/v1/observations", headers=h)
    assert r.status_code == 200
    assert len(r.json()["items"]) >= 2

    # Filter by type.
    r = await db_client.get("/api/v1/observations?type=weight", headers=h)
    assert all(i["type"] == "weight" for i in r.json()["items"])


async def test_dashboard_summary_groups_by_type(db_client):
    h = await _patient_headers(db_client)
    await db_client.post("/api/v1/observations", headers=h, json={"type": "glucose", "value": {"value": 95}})
    await db_client.post("/api/v1/observations", headers=h, json={"type": "glucose", "value": {"value": 110}})

    r = await db_client.get("/api/v1/dashboard/summary", headers=h)
    assert r.status_code == 200
    types = r.json()["types"]
    assert "glucose" in types
    assert types["glucose"]["latest"] is not None
    assert len(types["glucose"]["trend"]) == 2  # oldest→newest


async def test_observations_require_auth(db_client):
    r = await db_client.get("/api/v1/observations")
    assert r.status_code == 401


async def test_doctor_cannot_use_tracker(db_client):
    email = f"d-{uuid.uuid4().hex[:8]}@example.com"
    await db_client.post("/api/v1/auth/register", json={
        "email": email, "password": "pw123456", "full_name": "D", "role": "doctor",
    })
    r = await db_client.post("/api/v1/auth/login", data={
        "username": email, "password": "pw123456",
    })
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await db_client.get("/api/v1/dashboard/summary", headers=h)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"
