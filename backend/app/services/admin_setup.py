"""Approved initial Admin setup (v3.1 specification).

APPROVAL: the business owner approved these values as the initial setup on 2026-11-17
("Keep v3.1 defaults as approved setup"). Source: "Pricing & proposal studio V3.1" and the v3.1
prototype (Proposal_Pricing_Calculator_v3.1).

These values are NOT read by the application at run time. The database is the only source of
Admin configuration. They are written to the database only when someone deliberately:
  - runs `python -m scripts.setup_admin_defaults` (fills what is missing, never overwrites edits), or
  - presses "Reset to defaults" (Roles & Permissions) or "Reset template" (Email Notifications).

Business values the specification leaves to the Admin are deliberately NOT here: discount ceilings,
gross margin floor, SLA / reminder / escalation hours, regions and their Business Heads, users,
sender name / addresses / Deal Desk URL.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admin import ApprovalWorkflowStage, NotificationRule, RolePermission
from app.models.governance import Role

# Role descriptions (shown on Admin -> Users).
ROLE_DESCRIPTIONS: dict[str, str] = {
    "sales_lead": "Owns the deal; builds, prices & submits proposals",
    "presales": "Solutioning, scope, customizations & fitment",
    "business_head": "Regional — commercial approvals & final L1",
    "legal": "Reviews / edits T&C — final L2 (first)",
    "cfo": "Final L2 (last) financial sign-off",
    "ccxo": "Executive oversight — view only",
    "admin": "Masters, users, workflow & notifications",
}

# Role -> permissions ("Roles & permissions (defaults, configurable in a matrix)").
PERMISSIONS: dict[str, list[str]] = {
    "sales_lead": ["proposal.view", "proposal.import_hubspot", "proposal.edit_configurator",
                   "proposal.edit_discounts", "proposal.edit_content", "proposal.submit", "approval.view_history"],
    "presales": ["proposal.view", "proposal.import_hubspot", "proposal.edit_configurator",
                 "proposal.edit_discounts", "proposal.edit_content", "proposal.submit", "approval.view_history"],
    "business_head": ["proposal.view", "approval.line_discount", "approval.proposal_discount",
                      "approval.final_l1", "approval.view_history"],
    "legal": ["proposal.view", "proposal.edit_configurator", "proposal.edit_discounts", "proposal.edit_content",
              "approval.final_l2_legal", "approval.view_history"],
    "cfo": ["proposal.view", "approval.final_l2_cfo", "approval.view_history"],
    "ccxo": ["proposal.view", "approval.view_history"],
    "admin": ["proposal.view", "approval.view_history", "admin.users", "admin.roles", "admin.workflow",
              "admin.notifications", "admin.masters"],
}

# Approval stages: (stage_code, label, sub_label, condition_text, approver role, routing, order).
# The stage codes are the ones the workflow engine implements.
STAGES: list[tuple[str, str, Optional[str], str, str, str, int]] = [
    ("commercial_line", "Commercial", "Line-level", "Any line above the line-level ceiling", "business_head", "regional", 1),
    ("commercial_proposal", "Commercial", "Proposal-level", "Overall discount above the proposal-level ceiling",
     "business_head", "regional", 2),
    ("final_l1", "Final · Level 1", None, "After Sales submits and commercial is cleared", "business_head", "regional", 3),
    ("final_l2_legal", "Final · Level 2", "first", "After L1", "legal", "global", 4),
    ("final_l2_cfo", "Final · Level 2", "last", "After Legal", "cfo", "global", 5),
]

_SIGN = "\n\n{{link}}\n\n— Adrenalin Deal Desk"
# Notification rules: (event_code, label, description, enabled, recipients, approve links, subject, body).
# The event codes are the ones the workflow engine dispatches.
RULES: list[tuple[str, str, str, bool, list[str], bool, str, str]] = [
    ("line_discount_breach", "Line-level discount breach", "Proposal submitted with a line discount above the line ceiling",
     True, ["sales", "business_head"], False,
     "[Discount breach] Line-level discount on {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\nProposal {{proposal_id}} — {{deal_name}} ({{company}}, {{region}}) contains line-item discounts above the {{threshold_line}}% ceiling:\n\n{{breach_lines}}\n\nCommercial approval is required from the Business Head." + _SIGN),
    ("proposal_discount_breach", "Proposal-level discount breach", "Overall / effective proposal discount above the proposal ceiling",
     True, ["sales", "business_head"], False,
     "[Discount breach] Proposal-level discount on {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\nProposal {{proposal_id}} — {{deal_name}} ({{company}}, {{region}}) has an overall discount of {{eff_disc}}%, above the {{threshold_prop}}% ceiling.\n\n{{breach_prop}}" + _SIGN),
    ("commercial_submitted", "Commercial approval — submitted", "Proposal with breaches is submitted for commercial approval",
     True, ["sales", "business_head", "cfo"], True,
     "[Approval needed] Commercial approval for {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\nProposal {{proposal_id}} — {{deal_name}} ({{company}}, {{region}}, value {{value}}) was submitted by {{actor}} and needs commercial approval at stage {{stage}}." + _SIGN),
    ("commercial_decision", "Commercial approval — decision", "Business Head approves / rejects line or proposal discounts",
     True, ["sales", "business_head", "cfo"], False,
     "[{{decision}}] Commercial approval for {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\n{{actor}} {{decision}} the commercial approval ({{stage}}) for proposal {{proposal_id}} — {{deal_name}}.\n\nComment: {{comment}}" + _SIGN),
    ("final_l1_submitted", "Final approval — submitted (L1 · Business Head)", "Sales submits / commercial approval cleared — awaiting BH",
     True, ["sales", "business_head", "legal", "cfo"], True,
     "[Approval needed] Final approval L1 for {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\nProposal {{proposal_id}} — {{deal_name}} ({{company}}, {{region}}, value {{value}}) is awaiting final approval at {{stage}}." + _SIGN),
    ("final_l2", "Final approval — Level 2 (Legal → CFO)", "L1 approved; moves to Legal, then CFO",
     True, ["sales", "legal", "cfo"], True,
     "[Approval needed] Final approval L2 for {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\nProposal {{proposal_id}} — {{deal_name}} is now at {{stage}}." + _SIGN),
    ("final_completed", "Final approval — completed", "CFO approves — proposal fully approved",
     True, ["sales", "business_head", "legal", "cfo"], False,
     "[Approved] Proposal {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\nProposal {{proposal_id}} — {{deal_name}} ({{company}}, value {{value}}) is fully approved and ready to issue." + _SIGN),
    ("proposal_returned", "Proposal returned / rejected", "Any approver rejects or sends back for rework",
     True, ["sales", "presales"], False,
     "[Returned] Proposal {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\n{{actor}} returned proposal {{proposal_id}} — {{deal_name}} at stage {{stage}}.\n\nComment: {{comment}}" + _SIGN),
    ("sla_reminder", "Pending approval reminder (SLA)", "Approval pending longer than the reminder window",
     False, ["business_head", "legal", "cfo"], True,
     "[Reminder] Approval pending for {{proposal_id}} · {{deal_name}}",
     "Hi {{recipient}},\n\nProposal {{proposal_id}} — {{deal_name}} has been waiting at {{stage}} longer than the reminder window." + _SIGN),
]


def _roles(db: Session) -> dict[str, Role]:
    return {r.code: r for r in db.execute(select(Role)).scalars().all()}


def approved_rule(event_code: str) -> Optional[tuple]:
    return next((r for r in RULES if r[0] == event_code), None)


def apply(db: Session, *, overwrite: bool = False) -> dict[str, int]:
    """Write the approved setup. overwrite=False only fills what is missing (admin edits are kept).

    Returns counts of rows created / updated. The caller commits.
    """
    roles = _roles(db)
    counts = {"role_descriptions": 0, "permissions": 0, "stages": 0, "rules": 0}

    for code, text in ROLE_DESCRIPTIONS.items():
        role = roles.get(code)
        if role is not None and (overwrite or not role.description):
            if role.description != text:
                role.description = text
                counts["role_descriptions"] += 1

    granted = {(rp.role_id, rp.permission_code) for rp in db.execute(select(RolePermission)).scalars().all()}
    roles_with_grants = {role_id for role_id, _ in granted}
    for code, perms in PERMISSIONS.items():
        role = roles.get(code)
        if role is None:
            continue
        # Without overwrite a role that already has grants (edited by an Admin) is left as it is.
        if not overwrite and role.id in roles_with_grants:
            continue
        for perm in perms:
            if (role.id, perm) not in granted:
                db.add(RolePermission(role_id=role.id, permission_code=perm))
                counts["permissions"] += 1

    stages = {s.stage_code: s for s in db.execute(select(ApprovalWorkflowStage)).scalars().all()}
    for code, label, sub, cond, role_code, routing, order in STAGES:
        role = roles.get(role_code)
        if role is None:
            continue
        stage = stages.get(code)
        if stage is None:
            db.add(ApprovalWorkflowStage(stage_code=code, label=label, sub_label=sub, condition_text=cond,
                                         approver_role_id=role.id, routing=routing, sort_order=order, is_active=True))
            counts["stages"] += 1
        elif overwrite:
            stage.label, stage.sub_label, stage.condition_text = label, sub, cond
            stage.approver_role_id, stage.routing, stage.sort_order = role.id, routing, order
            counts["stages"] += 1

    rules = {r.event_code: r for r in db.execute(select(NotificationRule)).scalars().all()}
    for order, (code, label, desc, enabled, recipients, links, subject, body) in enumerate(RULES, start=1):
        rule = rules.get(code)
        if rule is None:
            db.add(NotificationRule(event_code=code, label=label, description=desc, is_enabled=enabled,
                                    recipient_roles=list(recipients), include_approve_links=links,
                                    subject_template=subject, body_template=body, sort_order=order))
            counts["rules"] += 1
        elif overwrite:
            rule.label, rule.description, rule.is_enabled = label, desc, enabled
            rule.recipient_roles, rule.include_approve_links = list(recipients), links
            rule.subject_template, rule.body_template, rule.sort_order = subject, body, order
            counts["rules"] += 1
    db.flush()
    return counts
