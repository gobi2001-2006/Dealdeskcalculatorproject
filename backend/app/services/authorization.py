"""Role-Based Access Control & Authorization Policy Service.

Implements the fixed six-role governance matrix without requiring a permissions table:
- admin
- pricing_desk
- presales
- sales_lead
- business_head (region-scoped)
- cfo

Provides:
- Policy mapping of allowed actions per role.
- Regional scoping checks for Business Head users.
- FastAPI dependency helpers for security enforcement.
"""

from enum import Enum
from typing import Optional, Set


class RoleCode(str, Enum):
    ADMIN = "admin"
    PRICING_DESK = "pricing_desk"
    PRESALES = "presales"
    SALES_LEAD = "sales_lead"
    BUSINESS_HEAD = "business_head"
    CFO = "cfo"


# Canonical permission sets for each role
ROLE_PERMISSIONS: dict[RoleCode, Set[str]] = {
    RoleCode.ADMIN: {
        "users:create",
        "users:read",
        "users:update",
        "roles:assign",
        "thresholds:create",
        "thresholds:read",
        "thresholds:update",
        "thresholds:delete",
        "audit:read",
        "rate_cards:read",
        "rate_cards:write",
        "rate_cards:publish",
        "catalogue:write",
        "proposals:read",
    },
    RoleCode.PRICING_DESK: {
        "rate_cards:read",
        "rate_cards:write",
        "rate_cards:publish",
        "catalogue:read",
        "thresholds:read",
        "proposals:read",
        "proposals:pricing_review",
        "audit:read",
    },
    RoleCode.PRESALES: {
        "catalogue:read",
        "rate_cards:read",
        "proposals:create",
        "proposals:read",
        "proposals:update_draft",
    },
    RoleCode.SALES_LEAD: {
        "catalogue:read",
        "rate_cards:read",
        "proposals:create",
        "proposals:read",
        "proposals:submit_approval",
    },
    RoleCode.BUSINESS_HEAD: {
        "catalogue:read",
        "rate_cards:read",
        "proposals:read",
        "proposals:approve_regional",
        "thresholds:read",
    },
    RoleCode.CFO: {
        "catalogue:read",
        "rate_cards:read",
        "proposals:read",
        "proposals:approve_cfo",
        "thresholds:read",
        "audit:read",
    },
}


def check_permission(user_roles: list[str], permission: str) -> bool:
    """Evaluate whether any of the user's roles grants the requested permission."""
    for role_str in user_roles:
        try:
            role = RoleCode(role_str)
            if permission in ROLE_PERMISSIONS.get(role, set()):
                return True
        except ValueError:
            continue
    return False


def check_regional_access(
    user_roles: list[str],
    user_region: Optional[str],
    deal_region: Optional[str],
) -> bool:
    """Enforce Business Head regional access scoping.

    - Admin, Pricing Desk, and CFO have global cross-regional access.
    - Business Head without Admin/CFO role is strictly restricted to their designated region.
    """
    global_roles = {RoleCode.ADMIN.value, RoleCode.CFO.value, RoleCode.PRICING_DESK.value}
    if any(r in global_roles for r in user_roles):
        return True

    if RoleCode.BUSINESS_HEAD.value in user_roles:
        if not user_region or not deal_region:
            return False
        return user_region.strip().lower() == deal_region.strip().lower()

    # Sales Lead & Presales scope to owned deals in their workflow
    return True
