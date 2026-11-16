"""Admin module service (Phase 2): users, regions, approval workflow settings, sender settings.

Reuses the existing tables wherever they exist:
  users / roles / user_roles  -> Users screen
  approval_thresholds         -> discount ceilings and gross-margin floor (global rows, region NULL)
  audit_logs                  -> every admin change is recorded
"""

from datetime import date
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.admin import RolePermission, AdminSetting, ApprovalWorkflowStage, Region
from app.models.governance import ApprovalThreshold, AuditLog, Role, User, UserRole
from app.models.master_data import Country
from app.services.authentication import normalize_email
from app.services.notification_service import SENDER_FIELDS, SENDER_KEY
from app.services.permission_service import ADMIN_ROLE_CODES

GLOBAL_REGION = "Global"
NO_LOGIN_PASSWORD = "!ADMIN-CREATED-NO-LOGIN"  # not a bcrypt hash: can never be used to sign in

CEILING_STAGE = {"line_discount": "commercial_line", "overall_discount": "commercial_proposal",
                 "gm_floor": "commercial_proposal"}
OPTIONS_KEY = "approval_options"
SLA_KEY = "approval_sla"


class AdminError(Exception):
    """Validation error -> 400."""


class AdminConflict(Exception):
    """Conflict (duplicate / still referenced / last admin) -> 409."""


class AdminNotFound(Exception):
    """-> 404."""


def _audit(db: Session, actor: Optional[int], action: str, entity_type: str, entity_id: Any,
           before: Optional[dict] = None, after: Optional[dict] = None) -> None:
    db.add(AuditLog(actor_user_id=actor, action=action, entity_type=entity_type, entity_id=str(entity_id),
                    before=before, after=after))


# --------------------------------------------------------------------------------------------
# Regions
# --------------------------------------------------------------------------------------------
def list_regions(db: Session) -> list[dict]:
    regions = db.execute(select(Region).order_by(Region.name)).scalars().all()
    countries = db.execute(select(Country).where(Country.region_id.isnot(None))).scalars().all()
    by_region: dict[int, list[dict]] = {}
    for c in countries:
        by_region.setdefault(c.region_id, []).append({"id": c.id, "name": c.name, "iso_code": c.iso_code})
    return [
        {
            "id": r.id, "name": r.name, "sub_regions": r.sub_regions, "status": r.status,
            "business_head_user_id": r.business_head_user_id,
            "business_head_name": r.business_head.full_name if r.business_head else None,
            "countries": sorted(by_region.get(r.id, []), key=lambda x: x["name"]),
        }
        for r in regions
    ]


def _validate_business_head(db: Session, user_id: Optional[int]) -> None:
    if user_id is None:
        return
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AdminError("The selected Business Head is not an active user.")
    codes = {ur.role.code for ur in user.role_assignments}
    if "business_head" not in codes:
        raise AdminError(f"{user.full_name} does not have the Business Head role.")


def _set_region_countries(db: Session, region: Region, country_ids: Optional[list[int]]) -> None:
    if country_ids is None:
        return
    wanted = set(country_ids)
    for c in db.execute(select(Country).where(or_(Country.region_id == region.id, Country.id.in_(wanted)))).scalars():
        c.region_id = region.id if c.id in wanted else None
    missing = wanted - {c.id for c in db.execute(select(Country).where(Country.id.in_(wanted))).scalars()}
    if missing:
        raise AdminError(f"Unknown country id(s): {sorted(missing)}.")


def save_region(db: Session, data: dict, actor: Optional[int], region_id: Optional[int] = None) -> Region:
    name = (data.get("name") or "").strip()
    if not name:
        raise AdminError("Region name is required.")
    if name.lower() == GLOBAL_REGION.lower():
        raise AdminError("'Global' is reserved for users who see every region.")
    clash = db.execute(select(Region).where(func.lower(Region.name) == name.lower())).scalars().first()
    if clash is not None and clash.id != region_id:
        raise AdminConflict(f"Region '{name}' already exists.")
    _validate_business_head(db, data.get("business_head_user_id"))
    if region_id is None:
        region = Region(name=name)
        db.add(region)
        before = None
    else:
        region = db.get(Region, region_id)
        if region is None:
            raise AdminNotFound("Region not found.")
        before = {"name": region.name, "business_head_user_id": region.business_head_user_id}
        if region.name != name:
            # Keep users that pointed at the old name.
            for u in db.execute(select(User).where(func.lower(User.region) == region.name.lower())).scalars():
                u.region = name
    region.name = name
    region.sub_regions = (data.get("sub_regions") or None)
    region.business_head_user_id = data.get("business_head_user_id")
    if data.get("status") in ("active", "inactive"):
        region.status = data["status"]
    db.flush()
    _set_region_countries(db, region, data.get("country_ids"))
    _audit(db, actor, "ADMIN_REGION_SAVED", "regions", region.id, before,
           {"name": region.name, "business_head_user_id": region.business_head_user_id})
    db.flush()
    return region


def delete_region(db: Session, region_id: int, actor: Optional[int]) -> None:
    region = db.get(Region, region_id)
    if region is None:
        raise AdminNotFound("Region not found.")
    in_use = db.execute(select(func.count(User.id)).where(func.lower(User.region) == region.name.lower())).scalar()
    if in_use:
        raise AdminConflict(f"{in_use} user(s) are assigned to '{region.name}'. Move them first or set it inactive.")
    for c in db.execute(select(Country).where(Country.region_id == region.id)).scalars():
        c.region_id = None
    _audit(db, actor, "ADMIN_REGION_DELETED", "regions", region.id, {"name": region.name}, None)
    db.delete(region)
    db.flush()


def valid_region_names(db: Session) -> set[str]:
    names = {r.name.lower() for r in db.execute(select(Region).where(Region.status == "active")).scalars()}
    names.add(GLOBAL_REGION.lower())
    return names


# --------------------------------------------------------------------------------------------
# Users
# --------------------------------------------------------------------------------------------
def _user_dict(user: User) -> dict:
    names = {ur.role.code: ur.role.name for ur in user.role_assignments}
    codes = list(names)
    primary = next((c for c in ADMIN_ROLE_CODES if c in names), codes[0] if codes else None)
    return {
        "id": user.id, "full_name": user.full_name, "email": user.email, "region": user.region,
        "is_active": user.is_active, "last_login_at": user.last_login_at,
        "role": primary, "role_label": names.get(primary) if primary else None,
        "roles": codes,
    }


def list_users(db: Session, search: Optional[str] = None) -> list[dict]:
    stmt = select(User).order_by(User.full_name)
    if search and search.strip():
        like = f"%{search.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(User.full_name).like(like), func.lower(User.email).like(like),
                              func.lower(func.coalesce(User.region, "")).like(like)))
    return [_user_dict(u) for u in db.execute(stmt).scalars().all()]


def _active_admin_ids(db: Session) -> set[int]:
    stmt = (select(User.id).join(UserRole, UserRole.user_id == User.id).join(Role, Role.id == UserRole.role_id)
            .where(Role.code == "admin", User.is_active.is_(True)))
    return set(db.execute(stmt).scalars().all())


def _role_by_code(db: Session, code: str) -> Role:
    if code not in ADMIN_ROLE_CODES:
        raise AdminError(f"Unknown role '{code}'.")
    role = db.execute(select(Role).where(Role.code == code)).scalars().first()
    if role is None:
        raise AdminError(f"Role '{code}' is not set up in the database (run the Admin migration).")
    return role


def _validate_region(db: Session, region: Optional[str]) -> Optional[str]:
    if region is None or str(region).strip() == "":
        return None
    region = str(region).strip()
    if region.lower() not in valid_region_names(db):
        raise AdminError(f"Region '{region}' is not an active region. Add it under Approval Workflow → Regions.")
    match = db.execute(select(Region).where(func.lower(Region.name) == region.lower())).scalars().first()
    return match.name if match else GLOBAL_REGION


def create_user(db: Session, data: dict, actor: Optional[int]) -> dict:
    name = (data.get("full_name") or "").strip()
    if not name:
        raise AdminError("User name is required.")
    try:
        email = normalize_email(data.get("email") or "")
    except ValueError as e:
        raise AdminError(str(e))
    if db.execute(select(User).where(func.lower(User.email) == email)).scalars().first():
        raise AdminConflict(f"A user with email {email} already exists.")
    role = _role_by_code(db, data.get("role") or "")
    user = User(full_name=name, email=email, password_hash=NO_LOGIN_PASSWORD,
                region=_validate_region(db, data.get("region")), is_active=bool(data.get("is_active", True)))
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id, granted_by=actor))
    _audit(db, actor, "ADMIN_USER_CREATED", "users", user.id, None,
           {"email": email, "role": role.code, "region": user.region, "is_active": user.is_active})
    db.flush()
    db.refresh(user)
    return _user_dict(user)


def update_user(db: Session, user_id: int, data: dict, actor: Optional[int]) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise AdminNotFound("User not found.")
    before = _user_dict(user)
    admins = _active_admin_ids(db)

    if "full_name" in data and data["full_name"] is not None:
        if not data["full_name"].strip():
            raise AdminError("User name is required.")
        user.full_name = data["full_name"].strip()
    if "email" in data and data["email"] is not None:
        try:
            email = normalize_email(data["email"])
        except ValueError as e:
            raise AdminError(str(e))
        clash = db.execute(select(User).where(func.lower(User.email) == email, User.id != user.id)).scalars().first()
        if clash:
            raise AdminConflict(f"A user with email {email} already exists.")
        user.email = email
    if "region" in data:
        user.region = _validate_region(db, data["region"])
    if "is_active" in data and data["is_active"] is not None:
        if not data["is_active"] and user.id in admins and len(admins) == 1:
            raise AdminConflict("This is the only active Admin. Assign another Admin before deactivating.")
        user.is_active = bool(data["is_active"])
    if data.get("role"):
        role = _role_by_code(db, data["role"])
        current = {ur.role.code: ur for ur in user.role_assignments}
        if role.code != "admin" and user.id in admins and len(admins) == 1:
            raise AdminConflict("This is the only active Admin. Assign another Admin before changing this role.")
        # One business role per user on this screen: replace the Admin-module roles, keep legacy ones.
        for code, ur in current.items():
            if code in ADMIN_ROLE_CODES and code != role.code:
                db.delete(ur)
        if role.code not in current:
            db.add(UserRole(user_id=user.id, role_id=role.id, granted_by=actor))
    db.flush()
    db.refresh(user)
    after = _user_dict(user)
    _audit(db, actor, "ADMIN_USER_UPDATED", "users", user.id,
           {k: before[k] for k in ("full_name", "email", "role", "region", "is_active")},
           {k: after[k] for k in ("full_name", "email", "role", "region", "is_active")})
    db.flush()
    return after


def delete_user(db: Session, user_id: int, actor: Optional[int]) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise AdminNotFound("User not found.")
    if actor is not None and user.id == actor:
        raise AdminConflict("You cannot delete your own user.")
    admins = _active_admin_ids(db)
    if user.id in admins and len(admins) == 1:
        raise AdminConflict("This is the only active Admin and cannot be deleted.")
    snapshot = _user_dict(user)
    try:
        with db.begin_nested():
            for ur in list(user.role_assignments):
                db.delete(ur)
            for region in db.execute(select(Region).where(Region.business_head_user_id == user.id)).scalars():
                region.business_head_user_id = None
            db.delete(user)
            db.flush()
    except IntegrityError:
        raise AdminConflict(
            "This user owns proposals, deals or approval history and cannot be deleted. Deactivate the user instead."
        )
    _audit(db, actor, "ADMIN_USER_DELETED", "users", user_id,
           {k: snapshot[k] for k in ("full_name", "email", "role", "region")}, None)
    db.flush()


# --------------------------------------------------------------------------------------------
# Approval workflow
# --------------------------------------------------------------------------------------------
def _setting(db: Session, key: str) -> dict:
    row = db.get(AdminSetting, key)
    return dict(row.value) if row and row.value else {}


def _put_setting(db: Session, key: str, value: dict, actor: Optional[int]) -> None:
    row = db.get(AdminSetting, key)
    before = dict(row.value) if row else None
    if row is None:
        db.add(AdminSetting(key=key, value=value, updated_by=actor))
    else:
        row.value = value
        row.updated_by = actor
    _audit(db, actor, "ADMIN_SETTING_UPDATED", "admin_settings", key, before, value)


def _active_global_thresholds(db: Session) -> dict[str, ApprovalThreshold]:
    today = date.today()
    rows = db.execute(
        select(ApprovalThreshold).where(
            ApprovalThreshold.status == "active", ApprovalThreshold.region.is_(None),
            ApprovalThreshold.valid_from <= today,
            or_(ApprovalThreshold.valid_to.is_(None), ApprovalThreshold.valid_to >= today),
        ).order_by(ApprovalThreshold.id.desc())
    ).scalars().all()
    out: dict[str, ApprovalThreshold] = {}
    for r in rows:
        out.setdefault(r.threshold_type, r)
    return out


def get_ceilings(db: Session) -> dict:
    rows = _active_global_thresholds(db)
    return {
        key: {
            "value_pct": float(rows[key].value_pct) if key in rows else None,
            "configured": key in rows,
        }
        for key in ("line_discount", "overall_discount", "gm_floor")
    }


def list_stages(db: Session) -> list[dict]:
    stages = db.execute(select(ApprovalWorkflowStage).order_by(ApprovalWorkflowStage.sort_order)).scalars().all()
    return [
        {
            "id": s.id, "stage_code": s.stage_code, "label": s.label, "sub_label": s.sub_label,
            "condition_text": s.condition_text, "approver_role": s.approver_role.code,
            "approver_role_label": s.approver_role.name,
            "routing": s.routing, "sort_order": s.sort_order, "is_active": s.is_active,
        }
        for s in stages
    ]


def get_workflow(db: Session) -> dict:
    options = _setting(db, OPTIONS_KEY)
    sla = _setting(db, SLA_KEY)
    return {
        "ceilings": get_ceilings(db),
        "test_effective_discount": bool(options.get("test_effective_discount", False)),
        "sla": {
            "sla_hours": sla.get("sla_hours"), "reminder_hours": sla.get("reminder_hours"),
            "escalate_hours": sla.get("escalate_hours"), "escalation_role": sla.get("escalation_role"),
        },
        "stages": list_stages(db),
        "regions": list_regions(db),
        "submitter_roles": submitter_roles(db),
    }


def submitter_roles(db: Session) -> list[dict]:
    """Roles holding 'proposal.submit' (Roles & Permissions), for the route preview."""
    rows = db.execute(
        select(Role.code, Role.name)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .where(RolePermission.permission_code == "proposal.submit")
        .order_by(Role.id)
    ).all()
    return [{"code": code, "label": name} for code, name in rows]


def _pct(value: Any, label: str) -> Decimal:
    try:
        d = Decimal(str(value))
    except Exception:
        raise AdminError(f"{label} must be a number.")
    if d < 0 or d > 100:
        raise AdminError(f"{label} must be between 0 and 100.")
    return d


def save_workflow(db: Session, data: dict, actor: Optional[int]) -> dict:
    stages = {s.stage_code: s for s in db.execute(select(ApprovalWorkflowStage)).scalars().all()}

    # Approval matrix first (ceilings take their approver role from it).
    for item in data.get("stages") or []:
        stage = stages.get(item.get("stage_code"))
        if stage is None:
            raise AdminError(f"Unknown stage '{item.get('stage_code')}'.")
        if item.get("approver_role"):
            role = _role_by_code(db, item["approver_role"])
            if role.id != stage.approver_role_id:
                _audit(db, actor, "ADMIN_STAGE_UPDATED", "approval_workflow_stages", stage.stage_code,
                       {"approver_role": stage.approver_role.code}, {"approver_role": role.code})
                stage.approver_role_id = role.id
        if item.get("routing") in ("regional", "global"):
            stage.routing = item["routing"]
        if item.get("is_active") is not None:
            stage.is_active = bool(item["is_active"])
    db.flush()

    labels = {"line_discount": "Line-level discount ceiling", "overall_discount": "Proposal-level discount ceiling",
              "gm_floor": "Gross margin floor"}
    ceilings = data.get("ceilings") or {}
    current = _active_global_thresholds(db)
    for key, label in labels.items():
        if key not in ceilings or ceilings[key] is None or ceilings[key] == "":
            continue
        value = _pct(ceilings[key], label)
        stage = stages.get(CEILING_STAGE[key])
        approver_role_id = stage.approver_role_id if stage else _role_by_code(db, "business_head").id
        row = current.get(key)
        if row is None:
            row = ApprovalThreshold(threshold_type=key, value_pct=value, approver_role_id=approver_role_id,
                                    region=None, valid_from=date.today(), status="active")
            db.add(row)
            _audit(db, actor, "THRESHOLD_CREATED", "approval_thresholds", key, None, {"value_pct": str(value)})
        elif Decimal(row.value_pct) != value or row.approver_role_id != approver_role_id:
            _audit(db, actor, "THRESHOLD_UPDATE", "approval_thresholds", row.id,
                   {"value_pct": str(row.value_pct)}, {"value_pct": str(value)})
            row.value_pct = value
            row.approver_role_id = approver_role_id

    if "test_effective_discount" in data and data["test_effective_discount"] is not None:
        _put_setting(db, OPTIONS_KEY, {"test_effective_discount": bool(data["test_effective_discount"])}, actor)

    if data.get("sla") is not None:
        sla = data["sla"]
        clean: dict[str, Any] = {}
        for key in ("sla_hours", "reminder_hours", "escalate_hours"):
            v = sla.get(key)
            if v in (None, ""):
                clean[key] = None
                continue
            try:
                n = int(v)
            except (TypeError, ValueError):
                raise AdminError(f"{key.replace('_', ' ')} must be a whole number of hours.")
            if n <= 0:
                raise AdminError(f"{key.replace('_', ' ')} must be greater than 0.")
            clean[key] = n
        if clean.get("reminder_hours") and clean.get("sla_hours") and clean["reminder_hours"] > clean["sla_hours"]:
            raise AdminError("Send reminder after must not be later than the approval SLA.")
        if clean.get("escalate_hours") and clean.get("sla_hours") and clean["escalate_hours"] < clean["sla_hours"]:
            raise AdminError("Escalate after must not be earlier than the approval SLA.")
        esc = sla.get("escalation_role") or None
        if esc is not None:
            _role_by_code(db, esc)
        clean["escalation_role"] = esc
        _put_setting(db, SLA_KEY, clean, actor)

    db.flush()
    return get_workflow(db)


def approval_options(db: Session) -> dict:
    return _setting(db, OPTIONS_KEY)


# --------------------------------------------------------------------------------------------
# Sender settings
# --------------------------------------------------------------------------------------------
def save_sender(db: Session, data: dict, actor: Optional[int]) -> dict:
    clean: dict[str, Optional[str]] = {}
    for f in SENDER_FIELDS:
        v = data.get(f)
        v = v.strip() if isinstance(v, str) else v
        clean[f] = v or None
    for f in ("from_email", "reply_to", "always_cc"):
        if clean[f] and ("@" not in clean[f] or " " in clean[f] or clean[f].startswith("@") or clean[f].endswith("@")):
            raise AdminError(f"{f.replace('_', ' ')} is not a valid email address.")
    if clean["deal_desk_url"] and not clean["deal_desk_url"].lower().startswith(("http://", "https://")):
        raise AdminError("Deal Desk URL must start with http:// or https://.")
    _put_setting(db, SENDER_KEY, clean, actor)
    db.flush()
    return clean
