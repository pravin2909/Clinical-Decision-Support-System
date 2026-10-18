"""
Health-tracker persistence: record and read a patient's observations, and build
the dashboard summary (latest value per type + recent trend points).

All functions operate on a single patient's own data. Doctor access to a
patient's observations goes through the (consent-gated) doctor endpoints added
later, not here.
"""

from datetime import datetime, timezone

from sqlalchemy import select

from app.core.cache import cache_get_json, cache_set_json, invalidate, make_key
from app.db import session_scope
from app.models_db import Observation


def _dashboard_key(patient_id: int) -> str:
    """Per-patient cache key for the dashboard summary (never shared across users)."""
    return make_key("dashboard", patient_id)


async def create_observation(
    *, patient_id: int, type: str, value: dict, unit: str | None,
    source: str | None, recorded_at: datetime | None,
) -> dict | None:
    """Insert one observation; returns it, or None if the DB is unavailable."""
    async with session_scope() as session:
        if session is None:
            return None
        obs = Observation(
            patient_id=patient_id,
            type=type,
            value=value,
            unit=unit,
            source=source or "self",
            recorded_at=recorded_at or datetime.now(timezone.utc),
        )
        session.add(obs)
        await session.commit()
        await session.refresh(obs)
        # This write changes the dashboard aggregate — drop the stale entry so the
        # next read repopulates it (explicit cache-aside invalidation).
        await invalidate(_dashboard_key(patient_id))
        return obs.to_dict()


async def list_observations(
    *, patient_id: int, type: str | None = None,
    frm: datetime | None = None, to: datetime | None = None,
    limit: int = 100, offset: int = 0,
) -> dict:
    """List a patient's observations, newest first, with optional filters."""
    async with session_scope() as session:
        if session is None:
            return {"total": 0, "limit": limit, "offset": offset, "items": []}

        stmt = select(Observation).where(Observation.patient_id == patient_id)
        if type:
            stmt = stmt.where(Observation.type == type)
        if frm:
            stmt = stmt.where(Observation.recorded_at >= frm)
        if to:
            stmt = stmt.where(Observation.recorded_at <= to)

        rows = (await session.execute(
            stmt.order_by(Observation.recorded_at.desc()).limit(limit).offset(offset)
        )).scalars().all()
        return {
            "limit": limit,
            "offset": offset,
            "items": [o.to_dict() for o in rows],
        }


async def dashboard_summary(*, patient_id: int, trend_points: int = 30) -> dict:
    """
    One row per observation type: the latest reading plus up to ``trend_points``
    recent readings (oldest→newest) for charting.

    Cache-aside: the computed summary is cached per patient (short TTL). A read
    checks the cache first; a miss recomputes from Postgres and backfills. Writes
    (``create_observation``) invalidate the key, so a patient never sees a stale
    dashboard right after recording a value.
    """
    key = _dashboard_key(patient_id)
    cached = await cache_get_json(key)
    if cached is not None:
        return cached

    async with session_scope() as session:
        if session is None:
            return {"types": {}}

        rows = (await session.execute(
            select(Observation)
            .where(Observation.patient_id == patient_id)
            .order_by(Observation.recorded_at.desc())
        )).scalars().all()

        by_type: dict[str, dict] = {}
        for o in rows:
            bucket = by_type.setdefault(o.type, {"latest": None, "unit": o.unit, "trend": []})
            if bucket["latest"] is None:
                bucket["latest"] = o.to_dict()
            if len(bucket["trend"]) < trend_points:
                bucket["trend"].append({
                    "recorded_at": o.recorded_at.isoformat() if o.recorded_at else None,
                    "value": o.value,
                })

        # Present each type's trend oldest→newest (we collected newest-first).
        for bucket in by_type.values():
            bucket["trend"].reverse()

        result = {"types": by_type}
        await cache_set_json(key, result)
        return result
