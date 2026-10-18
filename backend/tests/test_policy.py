"""
Access-policy tests.

Two halves:
- Pure truth-table tests of ``decide_access`` — exhaustive, no DB, instant. This
  is where the authz rules are actually pinned down.
- DB-backed integration (``db_client`` / ``TEST_DATABASE_URL``) that drives real
  care + consent rows through ``policy.can_access`` for a doctor, proving the two
  conditions (active relationship AND active consent-for-scope) are both required.
"""

import itertools
import uuid

from app.models_db import ConsentScope, Role
from app.policy import decide_access


# ──────────────────────────────────────
# Pure decision: full truth table
# ──────────────────────────────────────
def test_admin_always_allowed():
    for is_self, care, consent in itertools.product([True, False], repeat=3):
        assert decide_access(
            actor_role=Role.admin, actor_is_self=is_self,
            care_active=care, consent_active=consent,
        ) is True


def test_patient_only_their_own_data():
    # A patient is allowed iff the record is their own; care/consent irrelevant.
    for care, consent in itertools.product([True, False], repeat=2):
        assert decide_access(
            actor_role=Role.patient, actor_is_self=True,
            care_active=care, consent_active=consent,
        ) is True
        assert decide_access(
            actor_role=Role.patient, actor_is_self=False,
            care_active=care, consent_active=consent,
        ) is False


def test_doctor_requires_both_care_and_consent():
    assert decide_access(actor_role=Role.doctor, actor_is_self=False,
                         care_active=True, consent_active=True) is True
    # Missing either half → denied.
    assert decide_access(actor_role=Role.doctor, actor_is_self=False,
                         care_active=True, consent_active=False) is False
    assert decide_access(actor_role=Role.doctor, actor_is_self=False,
                         care_active=False, consent_active=True) is False
    assert decide_access(actor_role=Role.doctor, actor_is_self=False,
                         care_active=False, consent_active=False) is False


def test_doctor_is_self_flag_is_ignored():
    # actor_is_self should never let a doctor in on its own.
    assert decide_access(actor_role=Role.doctor, actor_is_self=True,
                         care_active=False, consent_active=False) is False


# ──────────────────────────────────────
# DB-backed: real care + consent through can_access
# ──────────────────────────────────────
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


async def test_doctor_access_requires_active_care_and_consent(db_client):
    from app.auth import _load_user

    patient = await _register(db_client, "patient")
    doctor = await _register(db_client, "doctor")
    ph = await _headers(db_client, patient["email"])
    dh = await _headers(db_client, doctor["email"])

    doctor_user = await _load_user(doctor["id"])
    patient_pid = patient["patient_id"]

    from app.policy import can_access

    # 0) No relationship, no consent → denied.
    assert await can_access(doctor_user, patient_pid, ConsentScope.records) is False

    # 1) Patient requests care; doctor accepts → active relationship, still no consent.
    r = await db_client.post("/api/v1/care/requests", headers=ph,
                             json={"target_id": doctor["doctor_id"]})
    assert r.status_code == 201, r.text
    rel_id = r.json()["id"]
    r = await db_client.post(f"/api/v1/care/requests/{rel_id}/accept", headers=dh)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active"

    assert await can_access(doctor_user, patient_pid, ConsentScope.records) is False  # consent missing

    # 2) Patient grants consent for records → doctor may read records, not images.
    r = await db_client.post("/api/v1/consents", headers=ph,
                             json={"doctor_id": doctor["doctor_id"], "scope": "records"})
    assert r.status_code == 201, r.text
    assert await can_access(doctor_user, patient_pid, ConsentScope.records) is True
    assert await can_access(doctor_user, patient_pid, ConsentScope.images) is False

    # 3) Patient revokes records consent → doctor loses records access again.
    r = await db_client.delete("/api/v1/consents?doctor_id=%d&scope=records" % doctor["doctor_id"],
                               headers=ph)
    assert r.status_code == 200, r.text
    assert await can_access(doctor_user, patient_pid, ConsentScope.records) is False


async def test_patient_can_access_only_self(db_client):
    from app.auth import _load_user
    from app.policy import can_access

    p1 = await _register(db_client, "patient")
    p2 = await _register(db_client, "patient")
    p1_user = await _load_user(p1["id"])

    assert await can_access(p1_user, p1["patient_id"], ConsentScope.records) is True
    assert await can_access(p1_user, p2["patient_id"], ConsentScope.records) is False
