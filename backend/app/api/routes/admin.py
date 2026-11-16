"""Admin module API (Phase 2): users, roles & permissions, approval workflow, email notifications.

Every endpoint is protected by a backend permission check on the acting user (X-User-Id header).
While no active user holds the Admin role the module is open, so the first Admin can be assigned.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.admin import EmailLog, NotificationRule
from app.models.governance import User
from app.models.master_data import Country
from app.schemas.admin import (
    AdminUserCreate,
    AdminUserResponse,
    AdminUserUpdate,
    EmailLogResponse,
    NotificationRuleResponse,
    NotificationRuleUpdate,
    PermissionMatrixUpdate,
    RegionSave,
    SenderSettings,
    TemplatePreviewRequest,
    TestSendRequest,
    WorkflowUpdate,
)
from app.services import admin_service, admin_setup, notification_service, permission_service
from app.services.admin_service import AdminConflict, AdminError, AdminNotFound
from app.services.permission_service import get_acting_user_id, require_permission

router = APIRouter()

users_perm = require_permission("admin.users", allow_bootstrap=True)
roles_perm = require_permission("admin.roles", allow_bootstrap=True)
workflow_perm = require_permission("admin.workflow", allow_bootstrap=True)
notif_perm = require_permission("admin.notifications", allow_bootstrap=True)


def _run(db: Session, fn, *args, **kwargs):
    """Run a service call, commit, and map service errors to HTTP errors."""
    try:
        result = fn(*args, **kwargs)
        db.commit()
        return result
    except AdminNotFound as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AdminConflict as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except (AdminError, ValueError) as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ------------------------------------------------------------------------------ me / meta
@router.get("/me", summary="Acting user, roles and permissions (for showing / hiding admin controls)")
def admin_me(acting_user_id: Optional[int] = Depends(get_acting_user_id), db: Session = Depends(get_db)):
    bootstrap = not permission_service.any_admin_assigned(db)
    user = db.get(User, acting_user_id) if acting_user_id else None
    return {
        "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "region": user.region,
                 "is_active": user.is_active} if user else None,
        "roles": permission_service.user_role_codes(db, user.id) if user else [],
        "permissions": sorted(permission_service.user_permissions(db, user.id)) if user else [],
        "bootstrap_mode": bootstrap,
    }


@router.get("/meta", summary="Roles, recipient roles, merge fields and delivery mode")
def admin_meta(db: Session = Depends(get_db)):
    countries = db.execute(select(Country).order_by(Country.name)).scalars().all()
    return {
        "roles": permission_service.admin_roles(db),
        "recipient_roles": notification_service.RECIPIENT_ROLES,
        "recipient_labels": notification_service.recipient_labels(db),
        "merge_fields": notification_service.MERGE_FIELDS,
        "delivery_mode": notification_service.DELIVERY_MODE,
        "global_region": admin_service.GLOBAL_REGION,
        "countries": [{"id": c.id, "name": c.name, "iso_code": c.iso_code, "region_id": c.region_id}
                      for c in countries],
    }


# ------------------------------------------------------------------------------ users
@router.get("/users", response_model=List[AdminUserResponse], summary="List / search users")
def list_users(search: Optional[str] = Query(None), _: Optional[int] = Depends(users_perm),
               db: Session = Depends(get_db)):
    return admin_service.list_users(db, search)


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED, summary="Add user")
def create_user(payload: AdminUserCreate, actor: Optional[int] = Depends(users_perm), db: Session = Depends(get_db)):
    return _run(db, admin_service.create_user, db, payload.model_dump(), actor)


@router.patch("/users/{user_id}", response_model=AdminUserResponse, summary="Edit user, role, region, active")
def update_user(user_id: int, payload: AdminUserUpdate, actor: Optional[int] = Depends(users_perm),
                db: Session = Depends(get_db)):
    return _run(db, admin_service.update_user, db, user_id, payload.model_dump(exclude_unset=True), actor)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an unreferenced user")
def delete_user(user_id: int, actor: Optional[int] = Depends(users_perm), db: Session = Depends(get_db)):
    _run(db, admin_service.delete_user, db, user_id, actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------------------ regions
@router.get("/regions", summary="Region (ADR) master")
def list_regions(_: Optional[int] = Depends(users_perm), db: Session = Depends(get_db)):
    return admin_service.list_regions(db)


@router.post("/regions", status_code=status.HTTP_201_CREATED, summary="Add region")
def create_region(payload: RegionSave, actor: Optional[int] = Depends(workflow_perm), db: Session = Depends(get_db)):
    region = _run(db, admin_service.save_region, db, payload.model_dump(), actor)
    return {"id": region.id}


@router.patch("/regions/{region_id}", summary="Edit region, Business Head and countries")
def update_region(region_id: int, payload: RegionSave, actor: Optional[int] = Depends(workflow_perm),
                  db: Session = Depends(get_db)):
    region = _run(db, admin_service.save_region, db, payload.model_dump(exclude_unset=True), actor, region_id)
    return {"id": region.id}


@router.delete("/regions/{region_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete unused region")
def delete_region(region_id: int, actor: Optional[int] = Depends(workflow_perm), db: Session = Depends(get_db)):
    _run(db, admin_service.delete_region, db, region_id, actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------------------ roles & permissions
@router.get("/roles-permissions", summary="Role x permission matrix")
def get_matrix(_: Optional[int] = Depends(roles_perm), db: Session = Depends(get_db)):
    return permission_service.get_matrix(db)


@router.put("/roles-permissions", summary="Save the role x permission matrix")
def save_matrix(payload: PermissionMatrixUpdate, actor: Optional[int] = Depends(roles_perm),
                db: Session = Depends(get_db)):
    def apply():
        before = permission_service.set_matrix(db, payload.grants, actor)
        admin_service._audit(db, actor, "ADMIN_PERMISSIONS_UPDATED", "role_permissions", "matrix",
                             {"grants": before}, {"grants": payload.grants})
        return permission_service.get_matrix(db)
    return _run(db, apply)


@router.post("/roles-permissions/reset", summary="Reset the matrix to the approved initial setup (v3.1)")
def reset_matrix(actor: Optional[int] = Depends(roles_perm), db: Session = Depends(get_db)):
    def apply():
        before = permission_service.set_matrix(db, admin_setup.PERMISSIONS, actor)
        admin_service._audit(db, actor, "ADMIN_PERMISSIONS_RESET", "role_permissions", "matrix",
                             {"grants": before}, {"grants": admin_setup.PERMISSIONS})
        return permission_service.get_matrix(db)
    return _run(db, apply)


# ------------------------------------------------------------------------------ approval workflow
@router.get("/workflow", summary="Ceilings, approval matrix, SLA and regional Business Heads")
def get_workflow(_: Optional[int] = Depends(workflow_perm), db: Session = Depends(get_db)):
    return admin_service.get_workflow(db)


@router.put("/workflow", summary="Save ceilings, approval matrix and SLA")
def save_workflow(payload: WorkflowUpdate, actor: Optional[int] = Depends(workflow_perm),
                  db: Session = Depends(get_db)):
    data = payload.model_dump(exclude_unset=True)
    if payload.stages is not None:
        data["stages"] = [s.model_dump(exclude_unset=True) for s in payload.stages]
    return _run(db, admin_service.save_workflow, db, data, actor)


# ------------------------------------------------------------------------------ notifications
def _rule(db: Session, event_code: str) -> NotificationRule:
    rule = db.execute(select(NotificationRule).where(NotificationRule.event_code == event_code)).scalars().first()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown event '{event_code}'.")
    return rule


@router.get("/notifications/rules", response_model=List[NotificationRuleResponse], summary="Notification rules")
def list_rules(_: Optional[int] = Depends(notif_perm), db: Session = Depends(get_db)):
    return db.execute(select(NotificationRule).order_by(NotificationRule.sort_order)).scalars().all()


@router.put("/notifications/rules/{event_code}", response_model=NotificationRuleResponse,
            summary="Update a rule: on/off, recipients, subject, body")
def update_rule(event_code: str, payload: NotificationRuleUpdate, actor: Optional[int] = Depends(notif_perm),
                db: Session = Depends(get_db)):
    rule = _rule(db, event_code)

    def apply():
        before = {"is_enabled": rule.is_enabled, "recipient_roles": list(rule.recipient_roles or []),
                  "subject_template": rule.subject_template}
        data = payload.model_dump(exclude_unset=True)
        if "recipient_roles" in data:
            roles = data["recipient_roles"] or []
            bad = set(roles) - set(notification_service.RECIPIENT_ROLES)
            if bad:
                raise AdminError(f"Unknown recipient role(s): {', '.join(sorted(bad))}.")
            rule.recipient_roles = list(dict.fromkeys(roles))
        if "subject_template" in data:
            if not (data["subject_template"] or "").strip():
                raise AdminError("Subject cannot be empty.")
            rule.subject_template = data["subject_template"]
        if "body_template" in data:
            if not (data["body_template"] or "").strip():
                raise AdminError("Body cannot be empty.")
            rule.body_template = data["body_template"]
        if data.get("is_enabled") is not None:
            rule.is_enabled = bool(data["is_enabled"])
        admin_service._audit(db, actor, "ADMIN_NOTIFICATION_RULE_UPDATED", "notification_rules", event_code, before,
                             {"is_enabled": rule.is_enabled, "recipient_roles": rule.recipient_roles,
                              "subject_template": rule.subject_template})
        db.flush()
        db.refresh(rule)
        return rule
    return _run(db, apply)


@router.post("/notifications/rules/{event_code}/preview",
             summary="Render a template with a real proposal (the one given, else the latest)")
def preview_rule(event_code: str, payload: TemplatePreviewRequest, _: Optional[int] = Depends(notif_perm),
                 db: Session = Depends(get_db)):
    rule = _rule(db, event_code)
    return notification_service.preview(db, rule, payload.subject_template, payload.body_template, payload.proposal_id)


@router.post("/notifications/rules/{event_code}/reset", response_model=NotificationRuleResponse,
             summary="Reset the subject and body to the approved initial setup (v3.1)")
def reset_rule_template(event_code: str, actor: Optional[int] = Depends(notif_perm), db: Session = Depends(get_db)):
    rule = _rule(db, event_code)
    approved = admin_setup.approved_rule(event_code)
    if approved is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"The approved setup has no template for '{event_code}'.")

    def apply():
        before = {"subject_template": rule.subject_template}
        rule.subject_template, rule.body_template = approved[6], approved[7]
        admin_service._audit(db, actor, "ADMIN_NOTIFICATION_TEMPLATE_RESET", "notification_rules", event_code,
                             before, {"subject_template": rule.subject_template})
        db.flush()
        db.refresh(rule)
        return rule
    return _run(db, apply)


@router.post("/notifications/rules/{event_code}/test-send", response_model=EmailLogResponse,
             summary="Send a test email (simulated) to a user")
def test_send(event_code: str, payload: TestSendRequest, _: Optional[int] = Depends(notif_perm),
              db: Session = Depends(get_db)):
    rule = _rule(db, event_code)
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return _run(db, notification_service.test_send, db, rule, user, payload.proposal_id)


@router.get("/notifications/log", response_model=List[EmailLogResponse], summary="Email log (newest first)")
def email_log(
    event_code: Optional[str] = Query(None),
    proposal_id: Optional[int] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    _: Optional[int] = Depends(notif_perm),
    db: Session = Depends(get_db),
):
    stmt = select(EmailLog).order_by(EmailLog.id.desc()).limit(limit)
    if event_code:
        stmt = stmt.where(EmailLog.event_code == event_code)
    if proposal_id:
        stmt = stmt.where(EmailLog.proposal_id == proposal_id)
    return db.execute(stmt).scalars().all()


@router.get("/notifications/sender", summary="Sender settings and delivery mode")
def get_sender(_: Optional[int] = Depends(notif_perm), db: Session = Depends(get_db)):
    return {**notification_service.get_sender_settings(db), "delivery_mode": notification_service.DELIVERY_MODE}


@router.put("/notifications/sender", summary="Save sender settings")
def save_sender(payload: SenderSettings, actor: Optional[int] = Depends(notif_perm), db: Session = Depends(get_db)):
    result = _run(db, admin_service.save_sender, db, payload.model_dump(), actor)
    return {**result, "delivery_mode": notification_service.DELIVERY_MODE}
