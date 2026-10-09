"""
Consultation-history persistence helpers.

All writes are best-effort: a database hiccup must never break an analysis
response, so failures are logged and swallowed. Reads raise normally so the
API can return a proper error.
"""

from sqlalchemy import select, func

from app.db import session_scope
from app.models_db import Consultation


async def save_consultation(**fields) -> int | None:
    """Persist one consultation. Returns its id, or None if not saved."""
    async with session_scope() as session:
        if session is None:
            return None
        try:
            row = Consultation(**fields)
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row.id
        except Exception as e:
            await session.rollback()
            print(f"  ⚠️  Failed to save consultation: {e.__class__.__name__}: {e}")
            return None


async def list_consultations(limit: int = 50, offset: int = 0) -> list[dict]:
    """Most-recent-first summaries for the history list."""
    async with session_scope() as session:
        if session is None:
            return []
        result = await session.execute(
            select(Consultation)
            .order_by(Consultation.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [row.to_summary() for row in result.scalars().all()]


async def count_consultations() -> int:
    async with session_scope() as session:
        if session is None:
            return 0
        result = await session.execute(select(func.count(Consultation.id)))
        return int(result.scalar_one())


async def get_consultation(consultation_id: int) -> dict | None:
    """Full detail for one consultation, or None if not found/DB down."""
    async with session_scope() as session:
        if session is None:
            return None
        row = await session.get(Consultation, consultation_id)
        return row.to_detail() if row else None
