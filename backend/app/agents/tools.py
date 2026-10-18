"""
Agent tools (LangChain ``@tool``) for the patient and doctor agents.

Security model:
- **Patient tools** act only on the authenticated patient (read from the request
  context var). The model never passes a patient id, so it cannot reach another
  patient's data.
- **Doctor tools** take an explicit ``patient_id`` but are gated by
  ``app.policy.can_access`` — an active care relationship AND an active consent
  for the scope. Denials return a short message the agent relays, never an
  exception that would 500 the stream.

These wrappers do context + consent; the actual DB work is in ``toolcore``.
"""

from __future__ import annotations

from langchain_core.tools import tool

from app import drugs, research, triage
from app.agents import toolcore
from app.agents.context import current_user
from app.models_db import ConsentScope, Role
from app.policy import can_access
from app.rag import store as rag_store


def _patient_id_or_none() -> int | None:
    u = current_user()
    role = u.role if isinstance(u.role, Role) else Role(u.role)
    if role != Role.patient or u.patient is None:
        return None
    return u.patient.id


# ──────────────────────────────────────
# Patient tools
# ──────────────────────────────────────
@tool
async def get_my_profile() -> dict:
    """Get the patient's own profile (age/sex). Use to tailor advice to the person."""
    pid = _patient_id_or_none()
    if pid is None:
        return {"error": "No patient profile for the current user."}
    return await toolcore.profile(pid)


@tool
async def get_my_observations(metric: str | None = None) -> dict:
    """
    Get the patient's own recent health measurements and trends. Pass a metric
    like 'glucose', 'bp', 'weight', 'bmi' to focus, or omit for all metrics.
    """
    pid = _patient_id_or_none()
    if pid is None:
        return {"error": "No patient profile for the current user."}
    return await toolcore.recent_observations(pid, metric)


@tool
async def get_my_prescriptions() -> list:
    """Get the patient's own current prescriptions and medication schedule."""
    pid = _patient_id_or_none()
    if pid is None:
        return [{"error": "No patient profile for the current user."}]
    return await toolcore.prescriptions(pid)


@tool
async def get_my_image_cases() -> list:
    """Get the patient's own past image analyses (skin/eye/dental) with confidence."""
    pid = _patient_id_or_none()
    if pid is None:
        return [{"error": "No patient profile for the current user."}]
    return await toolcore.image_cases(pid)


@tool
async def triage_check(symptoms: str) -> dict:
    """
    Run deterministic red-flag triage on described symptoms. ALWAYS call this when
    the patient describes symptoms, and honor an 'emergency' or 'urgent' result
    above any other advice.
    """
    return triage.assess(symptoms)


@tool
async def recommend_lifestyle(goal: str) -> dict:
    """
    Gather the patient's own data (observations + profile) to ground a lifestyle /
    diet / activity recommendation for the given goal (e.g. 'lower my blood sugar').
    Returns the data to tailor advice to — base your recommendation on it.
    """
    pid = _patient_id_or_none()
    if pid is None:
        return {"error": "No patient profile for the current user."}
    return {
        "goal": goal,
        "profile": await toolcore.profile(pid),
        "observations": await toolcore.recent_observations(pid),
        "note": "Tailor food/activity advice to these readings; flag values that are out of range.",
    }


@tool
async def parse_my_prescription(document_id: int) -> dict:
    """Get the OCR text + parsed medications for one of the patient's uploaded prescriptions."""
    pid = _patient_id_or_none()
    if pid is None:
        return {"error": "No patient profile for the current user."}
    doc = await toolcore.document(pid, document_id)
    if doc is None:
        return {"error": "Document not found."}
    if doc.get("status") != "done":
        return {"status": doc.get("status"), "note": "OCR still processing; try again shortly."}
    return {"status": "done", "extracted_text": doc.get("extracted_text"), "parsed": doc.get("parsed")}


@tool
async def search_patient_kb(query: str) -> list:
    """Search the patient-friendly knowledge base for plain-language health information."""
    return await rag_store.search(query, audience="patient", k=5)


@tool
async def message_my_doctor(note: str) -> dict:
    """
    Send a short note/question to the patient's connected doctor. Requires an
    active care relationship. Use when the patient wants the doctor to see something.
    """
    pid = _patient_id_or_none()
    if pid is None:
        return {"error": "No patient profile for the current user."}
    doctor_id = await toolcore.active_care_doctor_id(pid)
    if doctor_id is None:
        return {"error": "You are not connected to a doctor yet. Connect with one first."}
    from app import messaging
    result = await messaging.send_from_patient(pid, doctor_id, note)
    return {"ok": result.get("ok", False), "note": "Message sent to your doctor."}


# ──────────────────────────────────────
# Doctor tools (consent-gated)
# ──────────────────────────────────────
async def _doctor_allowed(patient_id: int, scope: ConsentScope) -> bool:
    return await can_access(current_user(), patient_id, scope)


@tool
async def list_my_patients() -> list:
    """
    List the doctor's connected patients (patient_id, name, email, consented
    scopes). Call this FIRST when the physician refers to a patient by name or
    email, to resolve them to a patient_id before using the other patient tools.
    """
    u = current_user()
    if u.doctor is None:
        return [{"error": "No doctor profile for the current user."}]
    return await toolcore.doctor_patients(u.doctor.id)


@tool
async def get_patient_summary(patient_id: int) -> dict:
    """Get an aggregated summary (profile, observations, prescriptions, images) for a patient."""
    if not await _doctor_allowed(patient_id, ConsentScope.records):
        return {"error": "Access denied: no active care relationship and records consent for this patient."}
    return await toolcore.patient_summary(patient_id)


@tool
async def get_patient_observations(patient_id: int, metric: str | None = None) -> dict:
    """Get a patient's recent observations/trends. Requires care + records consent."""
    if not await _doctor_allowed(patient_id, ConsentScope.records):
        return {"error": "Access denied for this patient's observations."}
    return await toolcore.recent_observations(patient_id, metric)


@tool
async def search_clinical_literature(query: str) -> list:
    """Search real medical literature (Europe PMC + Semantic Scholar) for cited evidence."""
    return await research.search_literature(query, limit=6)


@tool
async def search_doctor_kb(query: str) -> list:
    """Search the clinical knowledge base (guidelines/papers) for evidence."""
    return await rag_store.search(query, audience="doctor", k=5)


@tool
async def check_drug_interactions(drug_names: list[str]) -> dict:
    """Check a list of drugs for interactions using openFDA drug labels."""
    return await drugs.check_interactions(drug_names)


@tool
async def summarize_case(patient_id: int) -> dict:
    """Build a case brief (prior data + images) for a patient. Requires care + records consent."""
    if not await _doctor_allowed(patient_id, ConsentScope.records):
        return {"error": "Access denied for this patient's case."}
    return await toolcore.patient_summary(patient_id)


@tool
async def draft_prescription(patient_id: int, items: list[dict], notes: str | None = None) -> dict:
    """
    Draft a prescription (does NOT save it). Returns a draft for the doctor to
    review and confirm in the UI before it is issued. Items: [{drug, dose,
    frequency, duration}]. Requires care + records consent.
    """
    if not await _doctor_allowed(patient_id, ConsentScope.records):
        return {"error": "Access denied for this patient."}
    return {
        "requires_confirmation": True,
        "patient_id": patient_id,
        "items": items,
        "notes": notes,
        "note": "Draft only — confirm in the app to issue this prescription.",
    }


PATIENT_TOOLS = [
    get_my_profile, get_my_observations, get_my_prescriptions, get_my_image_cases,
    triage_check, recommend_lifestyle, parse_my_prescription, search_patient_kb,
    message_my_doctor,
]

DOCTOR_TOOLS = [
    list_my_patients, search_clinical_literature, search_doctor_kb, get_patient_summary,
    get_patient_observations, check_drug_interactions, summarize_case,
    draft_prescription,
]
