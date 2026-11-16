"""Sign-in endpoints (Phase 2 login page).

Uses the existing helpers in app.services.authentication (bcrypt password check, HS256 JWT).
The token identifies the acting user to every other endpoint through the existing
permission_service.get_acting_user_id dependency (Authorization: Bearer <token>).

Not implemented here (no provider or service exists yet, nothing is simulated):
  - Microsoft Entra ID SSO      -> /auth/config reports microsoft_sso_enabled = false
  - password reset by email     -> /auth/config reports password_reset_enabled = false
Demo sign-in (one click per role) exists only when DEALDESK_DEMO_LOGIN is set; it is off by default
and must stay off in production.
"""

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.governance import Role, User, UserRole
from app.schemas.auth import AuthConfigResponse, AuthUser, DemoLoginRequest, DemoRole, LoginRequest, TokenResponse
from app.services import permission_service
from app.services.authentication import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    normalize_email,
    verify_password,
)

router = APIRouter()

INVALID_CREDENTIALS = "Incorrect email or password."


def demo_login_enabled() -> bool:
    """Demo role sign-in is a development aid: on only when DEALDESK_DEMO_LOGIN is truthy."""
    return os.getenv("DEALDESK_DEMO_LOGIN", "").strip().lower() in ("1", "true", "yes", "on")


def _auth_user(db: Session, user: User) -> AuthUser:
    roles = permission_service.user_role_codes(db, user.id)
    labels = permission_service.role_labels(db)
    return AuthUser(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        region=user.region,
        roles=roles,
        role_labels=[labels.get(r, r) for r in roles],
        permissions=sorted(permission_service.user_permissions(db, user.id)),
    )


def _issue(db: Session, user: User, remember_me: bool, method: str) -> TokenResponse:
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    token = create_access_token({"sub": str(user.id), "email": user.email, "method": method, "remember": remember_me})
    return TokenResponse(access_token=token, expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60, user=_auth_user(db, user))


@router.get("/config", response_model=AuthConfigResponse, summary="Sign-in options available on this server")
def auth_config(db: Session = Depends(get_db)):
    enabled = demo_login_enabled()
    return AuthConfigResponse(
        demo_login_enabled=enabled,
        demo_roles=[DemoRole(code=r["code"], label=r["label"]) for r in permission_service.admin_roles(db)] if enabled else [],
        microsoft_sso_enabled=False,
        password_reset_enabled=False,
    )


@router.post("/login", response_model=TokenResponse, summary="Sign in with work email and password")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    user = db.execute(select(User).where(func.lower(User.email) == email)).scalars().first()
    # One message for every failure (unknown email, inactive user, no password set, wrong password),
    # so the response never reveals which accounts exist.
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _issue(db, user, payload.remember_me, "password")


@router.post("/demo-login", response_model=TokenResponse, summary="DEVELOPMENT ONLY: sign in as a role")
def demo_login(payload: DemoLoginRequest, db: Session = Depends(get_db)):
    if not demo_login_enabled():
        # Same answer as an unknown route: the bypass does not exist unless explicitly enabled.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    label = permission_service.role_labels(db).get(payload.role_code)
    if payload.role_code not in permission_service.ADMIN_ROLE_CODES or label is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown role.")
    user = db.execute(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == payload.role_code, User.is_active.is_(True))
        .order_by(User.id)
    ).scalars().first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active user has the {label} role. Assign one on Admin → Users first.",
        )
    return _issue(db, user, False, "demo")


@router.get("/me", response_model=AuthUser, summary="The signed-in user, roles and permissions")
def me(acting_user_id=Depends(permission_service.get_acting_user_id), db: Session = Depends(get_db)):
    if acting_user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.",
                            headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, acting_user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.",
                            headers={"WWW-Authenticate": "Bearer"})
    return _auth_user(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Sign out")
def logout():
    """Tokens are stateless JWTs: the client discards its token. Nothing is stored server-side."""
    return Response(status_code=status.HTTP_204_NO_CONTENT)
