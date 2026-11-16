"""Role / permission matrix and backend permission checks (Phase 2 Admin).

Permission codes are defined here (they are code concepts: each one is checked by a route).
Which role holds which permission is data, stored in role_permissions and edited on Admin ->
Roles & Permissions.

Acting user
-----------
1. Signed in: the `Authorization: Bearer <token>` header (POST /api/auth/login). The token is a
   signed JWT whose `sub` is the user id. An invalid or expired token is rejected (401).
2. Legacy / development: the `X-User-Id` header (the frontend sends VITE_DEALDESK_USER_ID when no
   one is signed in). It identifies a user but is NOT authentication. Set
   DEALDESK_ALLOW_USER_ID_HEADER=false in production so only signed-in users are accepted.
"""

import os
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.admin import RolePermission
from app.models.governance import Role, User, UserRole
from app.services.authentication import decode_access_token

# (code, category, label, description) in display order.
PERMISSIONS: list[tuple[str, str, str, str]] = [
    ("proposal.view", "Proposal", "View proposals & pricing", "All proposal screens (read)"),
    ("proposal.import_hubspot", "Proposal", "Import deal from HubSpot", "Fetch & confirm deal / contacts"),
    ("proposal.edit_configurator", "Proposal", "Edit configurator & pricing", "Countries, products, headcount, services"),
    ("proposal.edit_discounts", "Proposal", "Enter / change discounts", "Line-level & proposal-level discounts"),
    ("proposal.edit_content", "Proposal", "Edit proposal content", "Exec summary, SOW, customizations, T&C, fitment"),
    ("proposal.submit", "Proposal", "Submit for approval", "Sends proposal into the approval route"),
    ("approval.line_discount", "Approvals", "Approve line-level discount breach", "Commercial approval"),
    ("approval.proposal_discount", "Approvals", "Approve proposal-level discount breach", "Commercial approval"),
    ("approval.final_l1", "Approvals", "Final approval — Level 1", "Business Head (regional)"),
    ("approval.final_l2_legal", "Approvals", "Final approval — Level 2 (Legal)", "Legal (first)"),
    ("approval.final_l2_cfo", "Approvals", "Final approval — Level 2 (CFO)", "CFO (last)"),
    ("approval.view_history", "Approvals", "View approval history", "Approval route and activity"),
    ("admin.users", "Administration", "Manage users", "Add, edit, activate users; roles and regions"),
    ("admin.roles", "Administration", "Manage roles & permissions", "This matrix"),
    ("admin.workflow", "Administration", "Manage approval workflow", "Ceilings, approval matrix, SLA, regional BH"),
    ("admin.notifications", "Administration", "Manage email notifications", "Rules, templates, sender settings"),
    ("admin.masters", "Administration", "Manage masters & configuration", "Catalogue, packs, rate cards"),
]
PERMISSION_CODES = {p[0] for p in PERMISSIONS}

# Role codes the application logic knows, in display order (the roles table's check constraint
# allows the same codes). 'sales_lead' is the Sales role; 'pricing_desk' is a legacy role kept for
# existing data only. Role names and descriptions are read from the roles table, never from code.
ADMIN_ROLE_CODES: tuple[str, ...] = ("sales_lead", "presales", "business_head", "legal", "cfo", "ccxo", "admin")


def admin_roles(db: Session) -> list[dict]:
    """The Admin-module roles that exist in the database: code, name (label) and description."""
    rows = {r.code: r for r in db.execute(select(Role).where(Role.code.in_(ADMIN_ROLE_CODES))).scalars().all()}
    return [
        {"code": code, "label": rows[code].name, "description": rows[code].description, "role_id": rows[code].id}
        for code in ADMIN_ROLE_CODES
        if code in rows
    ]


def role_labels(db: Session) -> dict[str, str]:
    """Role code -> role name, from the roles table."""
    return {r.code: r.name for r in db.execute(select(Role)).scalars().all()}


# Role used as "Sales" in notification recipients ('sales' resolves to the proposal owner).
STAGE_PERMISSION = {
    "commercial_line": "approval.line_discount",
    "commercial_proposal": "approval.proposal_discount",
    "final_l1": "approval.final_l1",
    "final_l2_legal": "approval.final_l2_legal",
    "final_l2_cfo": "approval.final_l2_cfo",
}

# Permissions that can never be removed from the Admin role (prevents locking everyone out).
ADMIN_LOCKED = {"admin.roles", "admin.users"}


class PermissionDenied(Exception):
    pass


def user_role_codes(db: Session, user_id: int) -> list[str]:
    stmt = select(Role.code).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user_id)
    return list(db.execute(stmt).scalars().all())


def user_permissions(db: Session, user_id: int) -> set[str]:
    stmt = (
        select(RolePermission.permission_code)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(UserRole.user_id == user_id)
    )
    perms = set(db.execute(stmt).scalars().all())
    # Safety rule, not business configuration: the Admin role always keeps "Manage users" and
    # "Manage roles & permissions", so an empty or edited matrix can never lock every Admin out.
    if "admin" in user_role_codes(db, user_id):
        perms |= ADMIN_LOCKED
    return perms


def any_admin_assigned(db: Session) -> bool:
    stmt = (
        select(User.id)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == "admin", User.is_active.is_(True))
        .limit(1)
    )
    return db.execute(stmt).first() is not None


def user_id_header_allowed() -> bool:
    """The unauthenticated X-User-Id header is accepted unless DEALDESK_ALLOW_USER_ID_HEADER is false."""
    return os.getenv("DEALDESK_ALLOW_USER_ID_HEADER", "true").strip().lower() not in ("0", "false", "no", "off")


def get_acting_user_id(
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    authorization: Optional[str] = Header(default=None),
) -> Optional[int]:
    # 1. A signed-in user (Bearer token) always wins over the legacy header.
    if authorization and authorization.strip().lower().startswith("bearer "):
        token = authorization.strip()[7:].strip()
        try:
            payload = decode_access_token(token)
            return int(payload["sub"])
        except (ValueError, KeyError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has expired or is not valid. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    # 2. Legacy / development identification (not authentication).
    if not user_id_header_allowed():
        return None
    if x_user_id is None or str(x_user_id).strip() == "":
        return None
    try:
        value = int(str(x_user_id).strip())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-User-Id must be a user id.")
    return value if value > 0 else None


def _active_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The acting user is unknown or inactive.")
    return user


def require_permission(permission: str, allow_bootstrap: bool = False):
    """FastAPI dependency: the acting user (X-User-Id) must hold `permission`.

    allow_bootstrap: while no active user holds the Admin role, admin screens stay open so the
    first administrator can be assigned. Once an admin exists, the normal check applies.
    """
    if permission not in PERMISSION_CODES:
        raise ValueError(f"Unknown permission {permission}")

    def dependency(
        acting_user_id: Optional[int] = Depends(get_acting_user_id),
        db: Session = Depends(get_db),
    ) -> Optional[int]:
        if allow_bootstrap and not any_admin_assigned(db):
            return acting_user_id
        if acting_user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No acting user. Send the X-User-Id header (frontend: VITE_DEALDESK_USER_ID).",
            )
        _active_user(db, acting_user_id)
        if permission not in user_permissions(db, acting_user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have the '{permission}' permission.",
            )
        return acting_user_id

    return dependency


def assert_user_permission(db: Session, user_id: Optional[int], permission: str) -> None:
    """Service-level check used inside workflow endpoints (raises PermissionDenied)."""
    if user_id is None:
        raise PermissionDenied("No acting user.")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise PermissionDenied("The acting user is unknown or inactive.")
    if permission not in user_permissions(db, user_id):
        raise PermissionDenied(f"You do not have the '{permission}' permission.")


def get_matrix(db: Session) -> dict:
    roles = {r.code: r for r in db.execute(select(Role)).scalars().all()}
    granted = db.execute(select(RolePermission.role_id, RolePermission.permission_code)).all()
    by_role: dict[int, set[str]] = {}
    for role_id, code in granted:
        by_role.setdefault(role_id, set()).add(code)
    return {
        "roles": admin_roles(db),
        "permissions": [
            {"code": c, "category": cat, "label": label, "description": desc}
            for c, cat, label, desc in PERMISSIONS
        ],
        "grants": {
            code: sorted(by_role.get(roles[code].id, set()) | (ADMIN_LOCKED if code == "admin" else set()))
            for code in ADMIN_ROLE_CODES
            if code in roles
        },
        "locked": {"admin": sorted(ADMIN_LOCKED)},
    }


def set_matrix(db: Session, grants: dict[str, list[str]], acting_user_id: Optional[int]) -> dict:
    """Replace the grants of the roles present in `grants`. Unknown roles/permissions are rejected."""
    roles = {r.code: r for r in db.execute(select(Role)).scalars().all()}
    for role_code, perms in grants.items():
        if role_code not in ADMIN_ROLE_CODES or role_code not in roles:
            raise ValueError(f"Unknown role '{role_code}'.")
        unknown = set(perms) - PERMISSION_CODES
        if unknown:
            raise ValueError(f"Unknown permission(s): {', '.join(sorted(unknown))}.")
        if role_code == "admin" and not ADMIN_LOCKED.issubset(set(perms)):
            raise ValueError("The Admin role must keep 'Manage users' and 'Manage roles & permissions'.")

    before = get_matrix(db)["grants"]
    for role_code, perms in grants.items():
        role = roles[role_code]
        existing = {
            rp.permission_code: rp
            for rp in db.execute(select(RolePermission).where(RolePermission.role_id == role.id)).scalars().all()
        }
        wanted = set(perms)
        for code, rp in existing.items():
            if code not in wanted:
                db.delete(rp)
        for code in wanted - set(existing):
            db.add(RolePermission(role_id=role.id, permission_code=code, granted_by=acting_user_id))
    db.flush()
    return before
