"""
Deterministic triage (red-flag) rules.

Safety-critical and therefore NOT left to the LLM: a fixed keyword/rule set maps
described symptoms to an urgency level. The agent calls this first and must honor
an ``emergency`` result over anything it would otherwise generate. Rules are
intentionally simple and conservative — err toward escalation.
"""

from __future__ import annotations

# (level, advice, trigger phrases). Order matters: emergency checked first.
_RULES: list[tuple[str, str, tuple[str, ...]]] = [
    (
        "emergency",
        "These symptoms can be life-threatening. Call your local emergency number "
        "or go to the nearest emergency department now.",
        (
            "chest pain", "pressure in chest", "can't breathe", "cannot breathe",
            "difficulty breathing", "shortness of breath", "struggling to breathe",
            "face drooping", "slurred speech", "weakness on one side",
            "sudden numbness", "worst headache", "unconscious", "fainted",
            "seizure", "coughing blood", "vomiting blood", "blood in stool",
            "suicidal", "kill myself", "end my life", "severe bleeding",
            "anaphylaxis", "throat closing", "blue lips",
        ),
    ),
    (
        "urgent",
        "You should see a doctor urgently (within 24 hours) or visit urgent care.",
        (
            "high fever", "fever for", "severe pain", "severe abdominal",
            "dehydrated", "persistent vomiting", "stiff neck", "confusion",
            "rapid heartbeat", "palpitations", "fainting", "dizzy and",
            "vision loss", "severe headache",
        ),
    ),
]


def assess(symptoms: str) -> dict:
    """
    Classify free-text symptoms into self-care / see a doctor / urgent / emergency.

    Returns ``{"level", "advice", "matched"}``. ``level`` is one of
    ``emergency | urgent | routine``. ``matched`` lists the phrases that fired,
    for transparency in the UI and logs.
    """
    text = (symptoms or "").lower()
    for level, advice, triggers in _RULES:
        hit = [t for t in triggers if t in text]
        if hit:
            return {"level": level, "advice": advice, "matched": hit}
    return {
        "level": "routine",
        "advice": (
            "No red-flag symptoms detected. Self-care may be appropriate, but see a "
            "doctor if things worsen or do not improve in a few days."
        ),
        "matched": [],
    }
