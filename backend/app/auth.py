"""
Authentication & authorization utilities.

- Password hashing with bcrypt.
- JWT access tokens (HS256).
- FastAPI dependencies: get_current_user (required), optional_current_user,
  and require_role(...) for role-gated endpoints.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.config import JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from app.db import session_scope
from app.models_db import User, Role

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
