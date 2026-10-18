"""
Per-request agent context.

Tools must act as the authenticated caller — a patient tool reads *this* patient's
data, never an id the model invented. Rather than passing the user id as a tool
argument (which the model could spoof), the chat endpoint stashes the
authenticated user in a ``ContextVar`` before running the graph, and tools read
it here. The var is set and reset around each run so concurrent requests never
see each other's user.
"""

from __future__ import annotations

from contextvars import ContextVar

from app.models_db import User

_current_user: ContextVar[User | None] = ContextVar("agent_current_user", default=None)


def set_current_user(user: User):
    """Set the acting user for the current agent run; returns the reset token."""
    return _current_user.set(user)


def reset_current_user(token) -> None:
    _current_user.reset(token)


def current_user() -> User:
    """The user the agent is acting as. Raises if called outside a run."""
    user = _current_user.get()
    if user is None:
        raise RuntimeError("Agent tool called with no current user in context.")
    return user
