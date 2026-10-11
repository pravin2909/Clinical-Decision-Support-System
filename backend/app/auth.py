"""
Authentication & authorization utilities.

- Password hashing with bcrypt.
- JWT access tokens (HS256).
- FastAPI dependencies: get_current_user (required), optional_current_user,
  and require_role(...) for role-gated endpoints.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.db import session_scope
from app.models_db import RefreshToken, Role, User

# auto_error=False so endpoints can accept an optional token (anonymous allowed).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ──────────────────────────────────────
# Passwords
# ──────────────────────────────────────
def hash_password(password: str) -> str:
    # bcrypt has a 72-byte limit; encode and truncate defensively.
    pw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))
    except Exception:
        return False


# ──────────────────────────────────────
# Tokens
# ──────────────────────────────────────
def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role.value if isinstance(user.role, Role) else user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ──────────────────────────────────────
# Refresh tokens (opaque, stored hashed, rotated on use)
# ──────────────────────────────────────
class AuthError(Exception):
    """Raised for refresh/logout failures that map to a 401."""


def _hash_token(raw: str) -> str:
    """Store/compare only this hash — never the raw token."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def issue_refresh_token(user_id: int) -> str:
    """Create a new refresh-token row and return the raw token (shown once)."""
    raw = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    async with session_scope() as session:
        if session is None:
            raise AuthError("Database is unavailable.")
        session.add(RefreshToken(
            user_id=user_id, token_hash=_hash_token(raw), expires_at=expires,
        ))
        await session.commit()
    return raw


async def rotate_refresh_token(raw: str) -> tuple[User, str]:
    """
    Validate a refresh token, revoke it, and issue a fresh one (rotation).
    Returns (user, new_raw_refresh_token). Raises AuthError on any problem.
    """
    token_hash = _hash_token(raw)
    async with session_scope() as session:
        if session is None:
            raise AuthError("Database is unavailable.")

        row = (await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )).scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if row is None or row.revoked or row.expires_at <= now:
            raise AuthError("Invalid or expired refresh token.")

        user = (await session.execute(
            select(User)
            .options(selectinload(User.doctor), selectinload(User.patient))
            .where(User.id == row.user_id)
        )).scalar_one_or_none()
        if user is None or not user.is_active:
            raise AuthError("User not found or inactive.")

        # Rotate: revoke the presented token, mint a replacement in one tx.
        row.revoked = True
        new_raw = secrets.token_urlsafe(32)
        new_expires = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        session.add(RefreshToken(
            user_id=user.id, token_hash=_hash_token(new_raw), expires_at=new_expires,
        ))
        await session.commit()
        return user, new_raw


async def revoke_refresh_token(raw: str) -> None:
    """Revoke a refresh token (logout). Silent if it doesn't exist."""
    token_hash = _hash_token(raw)
    async with session_scope() as session:
        if session is None:
            return
        row = (await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )).scalar_one_or_none()
        if row is not None and not row.revoked:
            row.revoked = True
            await session.commit()


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")


async def _load_user(user_id: int) -> User | None:
    async with session_scope() as session:
        if session is None:
            return None
        result = await session.execute(
            select(User)
            .options(selectinload(User.doctor), selectinload(User.patient))
            .where(User.id == user_id)
        )
        return result.scalar_one_or_none()


# ──────────────────────────────────────
# Dependencies
# ──────────────────────────────────────
async def get_current_user(token: str | None = Depends(oauth2_scheme)) -> User:
    """Require a valid token and return the active user, or 401."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _decode_token(token)
    user = await _load_user(int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive.")
    return user


async def optional_current_user(token: str | None = Depends(oauth2_scheme)) -> User | None:
    """Return the user if a valid token is present, else None (no error)."""
    if not token:
        return None
    try:
        payload = _decode_token(token)
    except HTTPException:
        return None
    user = await _load_user(int(payload["sub"]))
    return user if (user and user.is_active) else None


def require_role(*roles: Role):
    """Dependency factory: allow only the given roles."""
    allowed = {r.value for r in roles}

    async def _checker(user: User = Depends(get_current_user)) -> User:
        role = user.role.value if isinstance(user.role, Role) else user.role
        if role not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient permissions.")
        return user

    return _checker
