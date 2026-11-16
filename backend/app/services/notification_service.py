"""Email notification service (Phase 2 Admin).

Turns a workflow event into emails using the Admin-configured notification rule:
  rule on/off -> recipient roles -> dynamic recipients -> merge fields -> email_logs row.

Delivery: there is no mail relay in this application, so every email is SIMULATED: it is written
to email_logs with status 'simulated' and never leaves the server. A real relay (Microsoft 365 /
SMTP) can later replace `_deliver` without changing callers.

Recipient resolution (role code in a rule -> people):
  sales          -> the proposal owner (deal owner, else the proposal creator)
  business_head  -> the Business Head mapped to the proposal's Region (ADR); else an active
                    Business Head whose user region matches
  presales       -> active Presales users of the proposal's region
  legal/cfo/ccxo/admin -> active users holding that role (global)
"""

import logging
import re
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.admin import AdminSetting, EmailLog, NotificationRule, Region
from app.models.governance import Role, User, UserRole
from app.models.proposals import Approval, Proposal, ProposalVersion

logger = logging.getLogger(__name__)

DELIVERY_MODE = "simulated"
SENDER_KEY = "email_sender"
SENDER_FIELDS = ("from_name", "from_email", "reply_to", "always_cc", "deal_desk_url")

MERGE_FIELDS = [
    "recipient", "proposal_id", "deal_name", "company", "region", "value", "eff_disc",
    "threshold_line", "threshold_prop", "breach_lines", "breach_prop", "stage", "actor",
    "decision", "comment", "link",
]
RECIPIENT_ROLES = ["sales", "presales", "business_head", "legal", "cfo", "ccxo"]
_FIELD_RE = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")



def render(template: str, context: dict[str, Any]) -> str:
    """Replace {{field}} with the context value. Unknown fields are left visible, not dropped."""
    def sub(match: re.Match) -> str:
        key = match.group(1)
        if key in context and context[key] is not None:
            return str(context[key])
        return match.group(0)
    return _FIELD_RE.sub(sub, template or "")


def recipient_labels(db: Session) -> dict[str, str]:
    """Display names of the recipient codes, from the roles table ('sales' = the proposal owner)."""
    names = {r.code: r.name for r in db.execute(select(Role)).scalars().all()}
    out = {}
    for code in RECIPIENT_ROLES:
        role_code = "sales_lead" if code == "sales" else code
        name = names.get(role_code, code)
        out[code] = f"{name} (proposal owner)" if code == "sales" else name
    return out


def get_sender_settings(db: Session) -> dict[str, Optional[str]]:
    row = db.get(AdminSetting, SENDER_KEY)
    value = row.value if row else {}
    return {f: (value or {}).get(f) for f in SENDER_FIELDS}


def proposal_region(proposal: Proposal) -> str:
    if proposal.countries:
        primary = next((c for c in proposal.countries if c.is_primary_deployment), proposal.countries[0])
        if primary is not None and primary.country is not None and primary.country.region:
            return primary.country.region
    return "Global"


def _users_with_role(db: Session, role_code: str) -> list[User]:
    stmt = (
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == role_code, User.is_active.is_(True))
        .order_by(User.id)
    )
    return list(db.execute(stmt).scalars().all())


def regional_business_head(db: Session, region: Optional[str]) -> Optional[User]:
    """Business Head for a region: the Admin mapping first, then a BH user of that region."""
    if region:
        mapped = db.execute(
            select(Region).where(func.lower(Region.name) == region.strip().lower(), Region.status == "active")
        ).scalars().first()
        if mapped is not None and mapped.business_head is not None and mapped.business_head.is_active:
            return mapped.business_head
        for u in _users_with_role(db, "business_head"):
            if u.region and u.region.strip().lower() == region.strip().lower():
                return u
    return None


def resolve_recipients(db: Session, role_code: str, proposal: Optional[Proposal]) -> list[User]:
    region = proposal_region(proposal) if proposal is not None else None
    if role_code == "sales":
        if proposal is None:
            return []
        owner = (proposal.deal.owner_user if proposal.deal is not None else None) or proposal.created_by_user
        return [owner] if owner is not None and owner.is_active else []
    if role_code == "business_head":
        bh = regional_business_head(db, region)
        return [bh] if bh is not None else []
    if role_code == "presales":
        users = _users_with_role(db, "presales")
        if region:
            users = [u for u in users if u.region and u.region.strip().lower() == region.strip().lower()]
        return users
    return _users_with_role(db, role_code)


def build_context(proposal: Optional[Proposal], db: Session, extra: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    ctx: dict[str, Any] = {}
    if proposal is not None:
        ctx["proposal_id"] = proposal.code
        ctx["deal_name"] = proposal.deal.name if proposal.deal is not None else ""
        ctx["company"] = proposal.customer.name if proposal.customer is not None else ""
        ctx["region"] = proposal_region(proposal)
        url = (get_sender_settings(db).get("deal_desk_url") or "").rstrip("/")
        ctx["link"] = f"{url}/proposals?proposalId={proposal.id}" if url else f"/proposals?proposalId={proposal.id}"
    for key, value in (extra or {}).items():
        ctx[key] = value
    return ctx


def _deliver(log: EmailLog) -> None:
    """Simulated delivery: nothing is sent; the row stays in the log as 'simulated'."""
    log.status = DELIVERY_MODE


def dispatch(
    db: Session,
    event_code: str,
    proposal: Optional[Proposal],
    extra: Optional[dict[str, Any]] = None,
) -> list[EmailLog]:
    """Create the emails of one event. Never raises: notification problems must not break the workflow."""
    try:
        rule = db.execute(select(NotificationRule).where(NotificationRule.event_code == event_code)).scalars().first()
        if rule is None or not rule.is_enabled:
            return []
        sender = get_sender_settings(db)
        ctx = build_context(proposal, db, extra)
        logs: list[EmailLog] = []
        seen: set[int] = set()
        for role_code in rule.recipient_roles or []:
            users = resolve_recipients(db, role_code, proposal)
            if not users:
                logs.append(EmailLog(
                    event_code=event_code, proposal_id=proposal.id if proposal else None,
                    recipient_role=role_code, subject=render(rule.subject_template, ctx), body="",
                    status="skipped", error=f"No active recipient resolved for role '{role_code}'.",
                ))
                continue
            for user in users:
                if user.id in seen:
                    continue
                seen.add(user.id)
                personal = {**ctx, "recipient": user.full_name}
                log = EmailLog(
                    event_code=event_code, proposal_id=proposal.id if proposal else None,
                    recipient_role=role_code, recipient_name=user.full_name, recipient_email=user.email,
                    cc_email=sender.get("always_cc"),
                    subject=render(rule.subject_template, personal), body=render(rule.body_template, personal),
                    status="skipped",
                )
                _deliver(log)
                logs.append(log)
        for log in logs:
            db.add(log)
        db.flush()
        return logs
    except Exception:  # pragma: no cover - defensive: the workflow must continue
        logger.exception("Notification dispatch failed for event %s", event_code)
        return []


def preview_context(db: Session, rule: NotificationRule, proposal_id: Optional[int] = None) -> dict[str, Any]:
    """Merge fields for a preview / test email, taken from a REAL proposal.

    The proposal is the one asked for, else the most recent one. Values come from that proposal and its
    approval route (configured ceilings, breaches, stage). With no proposal in the database the fields
    stay visible as {{field}}: nothing is invented.
    """
    from app.services.proposal_workflow_service import evaluate_proposal_approval_route, route_merge_fields

    proposal = db.get(Proposal, proposal_id) if proposal_id else (
        db.execute(select(Proposal).order_by(Proposal.id.desc())).scalars().first()
    )
    if proposal is None:
        return {"context": {}, "proposal": None, "recipients": []}

    owner = (proposal.deal.owner_user if proposal.deal is not None else None) or proposal.created_by_user
    route = evaluate_proposal_approval_route(proposal_id=proposal.id, db=db)
    extra = route_merge_fields(route, owner.full_name if owner else "")
    required = [st for st in route.get("approval_stages", []) if st.get("is_required")]
    if required:
        extra["stage"] = required[0].get("stage_label", "")
    decided = db.execute(
        select(Approval)
        .join(ProposalVersion, ProposalVersion.id == Approval.proposal_version_id)
        .where(ProposalVersion.proposal_id == proposal.id, Approval.decided_at.isnot(None))
        .order_by(Approval.decided_at.desc())
    ).scalars().first()
    if decided is not None:
        extra["decision"] = decided.status
        if decided.decision_notes:
            extra["comment"] = decided.decision_notes

    recipients = []
    for role_code in rule.recipient_roles or []:
        for user in resolve_recipients(db, role_code, proposal):
            recipients.append({"name": user.full_name, "email": user.email, "role": role_code})
    ctx = build_context(proposal, db, extra)
    if recipients:
        ctx["recipient"] = recipients[0]["name"].split()[0]
    return {"context": ctx, "proposal": proposal, "recipients": recipients}


def preview(db: Session, rule: NotificationRule, subject: Optional[str], body: Optional[str],
            proposal_id: Optional[int] = None) -> dict[str, Any]:
    data = preview_context(db, rule, proposal_id)
    ctx = data["context"]
    sender = get_sender_settings(db)
    return {
        "subject": render(subject if subject is not None else rule.subject_template, ctx),
        "body": render(body if body is not None else rule.body_template, ctx),
        "proposal_id": data["proposal"].id if data["proposal"] is not None else None,
        "proposal_code": data["proposal"].code if data["proposal"] is not None else None,
        "recipients": data["recipients"],
        "from_name": sender.get("from_name"),
        "from_email": sender.get("from_email"),
    }


def test_send(db: Session, rule: NotificationRule, to_user: User, proposal_id: Optional[int] = None) -> EmailLog:
    sender = get_sender_settings(db)
    data = preview_context(db, rule, proposal_id)
    ctx = {**data["context"], "recipient": to_user.full_name}
    log = EmailLog(
        event_code=rule.event_code,
        proposal_id=data["proposal"].id if data["proposal"] is not None else None,
        recipient_role="test",
        recipient_name=to_user.full_name, recipient_email=to_user.email, cc_email=None,
        subject="[TEST] " + render(rule.subject_template, ctx), body=render(rule.body_template, ctx),
        status="skipped", is_test=True,
    )
    if not sender.get("from_email"):
        log.error = "Sender 'From' address is not configured (Sender settings)."
    _deliver(log)
    db.add(log)
    db.flush()
    return log
