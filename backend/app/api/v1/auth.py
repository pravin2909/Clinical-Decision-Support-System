"""
Authentication endpoints: register, login, current user.

Logic for persistence/verification lives in ``app.users`` and ``app.auth``;
this module is just the HTTP surface.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app import users
from app.auth import (
    AuthError,
    create_access_token,
    get_current_user,
    issue_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
)
from app.models_db import Role, User
from app.schemas import (
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(req: RegisterRequest):
    """
    Register a new account.
    - patient / doctor: open self-registration.
    - admin: allowed only to bootstrap the first admin; afterwards admins are
      created via POST /admin/users by an existing admin.
    """
    if req.role == Role.admin and await users.admin_exists():
        raise HTTPException(
            status_code=403,
            detail="An admin already exists. Admins must be created by an admin.",
        )

    profile = None
    if req.role == Role.doctor and req.doctor:
        profile = req.doctor.model_dump()
    elif req.role == Role.patient and req.patient:
        profile = req.patient.model_dump()

    try:
        return await users.create_user(
            email=req.email, password=req.password, full_name=req.full_name,
            role=req.role, profile=profile,
        )
    except users.UserError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    """Log in with email (as `username`) + password; returns access + refresh tokens."""
    user = await users.authenticate(form.username, form.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    refresh = await issue_refresh_token(user.id)
    return TokenResponse(access_token=create_access_token(user), refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest):
    """Exchange a valid refresh token for a new access token + rotated refresh token."""
    try:
        user, new_refresh = await rotate_refresh_token(req.refresh_token)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return TokenResponse(access_token=create_access_token(user), refresh_token=new_refresh)


@router.post("/logout", status_code=204)
async def logout(req: LogoutRequest):
    """Revoke a refresh token (server-side logout). Idempotent."""
    await revoke_refresh_token(req.refresh_token)
    return None


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return user.to_public()
