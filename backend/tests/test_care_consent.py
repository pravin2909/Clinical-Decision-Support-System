"""Care-relationship + consent API flow (DB-backed; skipped without TEST_DATABASE_URL)."""

import uuid


async def _register(db_client, role: str) -> dict:
    email = f"{role[0]}-{uuid.uuid4().hex[:8]}@example.com"
    r = await db_client.post("/api/v1/auth/register", json={
        "email": email, "password": "pw123456", "full_name": role.title(), "role": role,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    body["email"] = email
    return body


async def _headers(db_client, email: str) -> dict:
    r = await db_client.post("/api/v1/auth/login", data={"username": email, "password": "pw123456"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_care_request_accept_revoke_flow(db_client):
    patient = await _register(db_client, "patient")
    doctor = await _register(db_client, "doctor")
    ph = await _headers(db_client, patient["email"])
    dh = await _headers(db_client, doctor["email"])

    # Patient opens a request to the doctor.
    r = await db_client.post("/api/v1/care/requests", headers=ph,
                             json={"target_id": doctor["doctor_id"]})
    assert r.status_code == 201, r.text
    rel = r.json()
    assert rel["status"] == "pending"
    assert rel["initiated_by"] == "patient"

    # The initiator cannot accept their own request.
    r = await db_client.post(f"/api/v1/care/requests/{rel['id']}/accept", headers=ph)
    assert r.status_code == 409

    # The doctor (counterparty) accepts → active.
    r = await db_client.post(f"/api/v1/care/requests/{rel['id']}/accept", headers=dh)
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    # Both can see it listed.
    r = await db_client.get("/api/v1/care", headers=dh)
    assert any(x["id"] == rel["id"] for x in r.json()["items"])

    # Either party revokes; revoke is idempotent.
    r = await db_client.delete(f"/api/v1/care/{rel['id']}", headers=ph)
    assert r.status_code == 200
    assert r.json()["status"] == "revoked"
    r = await db_client.delete(f"/api/v1/care/{rel['id']}", headers=ph)
    assert r.status_code == 200  # idempotent


async def test_care_request_is_idempotent(db_client):
    patient = await _register(db_client, "patient")
    doctor = await _register(db_client, "doctor")
    ph = await _headers(db_client, patient["email"])

    r1 = await db_client.post("/api/v1/care/requests", headers=ph,
                              json={"target_id": doctor["doctor_id"]})
    r2 = await db_client.post("/api/v1/care/requests", headers=ph,
                              json={"target_id": doctor["doctor_id"]})
    assert r1.json()["id"] == r2.json()["id"]  # same row reused


async def test_outsider_cannot_accept_or_probe(db_client):
    patient = await _register(db_client, "patient")
    doctor = await _register(db_client, "doctor")
    outsider = await _register(db_client, "doctor")
    ph = await _headers(db_client, patient["email"])
    oh = await _headers(db_client, outsider["email"])

    r = await db_client.post("/api/v1/care/requests", headers=ph,
                             json={"target_id": doctor["doctor_id"]})
    rel_id = r.json()["id"]

    # A doctor who is not a party gets 404 (existence hidden).
    r = await db_client.post(f"/api/v1/care/requests/{rel_id}/accept", headers=oh)
    assert r.status_code == 404


async def test_consent_grant_list_revoke(db_client):
    patient = await _register(db_client, "patient")
    doctor = await _register(db_client, "doctor")
    ph = await _headers(db_client, patient["email"])
    dh = await _headers(db_client, doctor["email"])

    # Grant two scopes.
    for scope in ("records", "images"):
        r = await db_client.post("/api/v1/consents", headers=ph,
                                 json={"doctor_id": doctor["doctor_id"], "scope": scope})
        assert r.status_code == 201, r.text
        assert r.json()["active"] is True

    # Patient sees both grants.
    r = await db_client.get("/api/v1/consents", headers=ph)
    scopes = {c["scope"] for c in r.json()["items"]}
    assert {"records", "images"} <= scopes

    # Doctor sees the active grants made to them.
    r = await db_client.get("/api/v1/consents", headers=dh)
    assert len(r.json()["items"]) == 2

    # Revoke records; re-grant re-activates the same row.
    r = await db_client.delete(
        "/api/v1/consents?doctor_id=%d&scope=records" % doctor["doctor_id"], headers=ph)
    assert r.status_code == 200
    assert r.json()["active"] is False

    r = await db_client.post("/api/v1/consents", headers=ph,
                             json={"doctor_id": doctor["doctor_id"], "scope": "records"})
    assert r.status_code == 201
    assert r.json()["active"] is True


async def test_doctor_cannot_grant_consent(db_client):
    doctor = await _register(db_client, "doctor")
    other = await _register(db_client, "doctor")
    dh = await _headers(db_client, doctor["email"])

    r = await db_client.post("/api/v1/consents", headers=dh,
                             json={"doctor_id": other["doctor_id"], "scope": "records"})
    assert r.status_code == 400  # only patients manage consent


async def test_care_and_consent_require_auth(db_client):
    assert (await db_client.get("/api/v1/care")).status_code == 401
    assert (await db_client.get("/api/v1/consents")).status_code == 401
