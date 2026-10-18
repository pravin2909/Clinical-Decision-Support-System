"""
Agent tool behaviour (DB-backed; skipped without TEST_DATABASE_URL).

Verifies the consent gate on doctor tools and self-scoping on patient tools,
exercised directly (no LLM) by setting the agent context and invoking the tools.
"""

import uuid

from app.agents import tools
from app.agents.context import reset_current_user, set_current_user
from app.auth import _load_user


async def _register(db_client, role):
    email = f"{role[0]}-{uuid.uuid4().hex[:8]}@example.com"
    r = await db_client.post("/api/v1/auth/register", json={
        "email": email, "password": "pw123456", "full_name": role, "role": role,
    })
    body = r.json()
    body["email"] = email
    body["user"] = await _load_user(body["id"])
    return body


async def _headers(db_client, email):
    r = await db_client.post("/api/v1/auth/login", data={"username": email, "password": "pw123456"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_patient_tool_reads_own_data(db_client):
    patient = await _register(db_client, "patient")
    h = await _headers(db_client, patient["email"])
    await db_client.post("/api/v1/observations", headers=h,
                         json={"type": "glucose", "value": {"value": 130}})

    token = set_current_user(patient["user"])
    try:
        obs = await tools.get_my_observations.ainvoke({"metric": "glucose"})
    finally:
        reset_current_user(token)
    assert "glucose" in obs


async def test_doctor_tool_denied_without_consent(db_client):
    patient = await _register(db_client, "patient")
    doctor = await _register(db_client, "doctor")

    token = set_current_user(doctor["user"])
    try:
        # No care relationship, no consent → access denied message, not patient data.
        res = await tools.get_patient_summary.ainvoke({"patient_id": patient["patient_id"]})
    finally:
        reset_current_user(token)
    assert "error" in res and "denied" in res["error"].lower()


async def test_doctor_tool_allowed_with_care_and_consent(db_client):
    patient = await _register(db_client, "patient")
    doctor = await _register(db_client, "doctor")
    ph = await _headers(db_client, patient["email"])
    dh = await _headers(db_client, doctor["email"])

    # Establish active care + records consent.
    r = await db_client.post("/api/v1/care/requests", headers=ph,
                             json={"target_id": doctor["doctor_id"]})
    await db_client.post(f"/api/v1/care/requests/{r.json()['id']}/accept", headers=dh)
    await db_client.post("/api/v1/consents", headers=ph,
                         json={"doctor_id": doctor["doctor_id"], "scope": "records"})

    token = set_current_user(doctor["user"])
    try:
        res = await tools.get_patient_summary.ainvoke({"patient_id": patient["patient_id"]})
    finally:
        reset_current_user(token)
    assert "error" not in res
    assert "profile" in res
