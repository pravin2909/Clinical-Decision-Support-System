"""Deterministic triage rules (pure, no DB/LLM)."""

from app.triage import assess


def test_emergency_symptoms_escalate():
    r = assess("I have severe chest pain and can't breathe")
    assert r["level"] == "emergency"
    assert r["matched"]


def test_self_harm_is_emergency():
    assert assess("I feel suicidal")["level"] == "emergency"


def test_urgent_symptoms():
    assert assess("I've had a high fever for three days")["level"] == "urgent"


def test_routine_when_no_red_flags():
    r = assess("mild runny nose and a light cough")
    assert r["level"] == "routine"
    assert r["matched"] == []


def test_empty_is_routine():
    assert assess("")["level"] == "routine"
