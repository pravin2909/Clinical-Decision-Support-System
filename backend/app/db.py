"""
Database layer (PostgreSQL via async SQLAlchemy).

Holds the engine, session factory, declarative base, and startup init. The app
degrades gracefully: if DB_ENABLED is false or the database is unreachable at
startup, the server still runs — history is simply not persisted.
"""

from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import DATABASE_URL, DB_ENABLED


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


# Created lazily in init_db() so import never fails when Postgres is absent.
engine = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None

# Set to True only after tables are confirmed/created, so request handlers can
# cheaply skip persistence when the DB is unavailable.
db_ready = False


async def init_db() -> bool:
    """
    Initialize the engine and create tables. Returns True if the DB is usable.
    Never raises — a failure just disables persistence for this run.
    """
    global engine, SessionLocal, db_ready

    if not DB_ENABLED:
        print("  ℹ️  DB_ENABLED=false — running stateless (no history persisted).")
        return False

    try:
        engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, echo=False)
        SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

        # Schema is managed by Alembic migrations, NOT auto-created here. On a
        # fresh database run `alembic upgrade head` (from backend/) first. We
        # only verify connectivity at startup and warn if the schema is missing.
        from sqlalchemy import text

        async with engine.begin() as conn:
            await conn.exec_driver_sql("SELECT 1")
            has_users = await conn.scalar(
                text("SELECT to_regclass('public.users') IS NOT NULL")
            )

        if not has_users:
            print("  ⚠️  Connected, but tables are missing. Run: alembic upgrade head")

        db_ready = True
        print("  ✓ Database connected — consultation history enabled.")
        return True
    except Exception as e:
        db_ready = False
        print(f"  ⚠️  Database unavailable ({e.__class__.__name__}: {e}).")
        print("     Running stateless — history will not be saved.")
        return False


async def dispose_db() -> None:
    if engine is not None:
        await engine.dispose()


@asynccontextmanager
async def session_scope():
    """Async context manager yielding a session, or None if the DB is down."""
    if not db_ready or SessionLocal is None:
        yield None
        return
    async with SessionLocal() as session:
        yield session
