"""Approval Inbox (Phase 3): the proposals a signed-in user can see, grouped for the Approvals page.

Nothing here decides who approves what. The figures and breaches come from `_route_metrics`, the
open stage from `open_stage_by_version`, the assignee from `_assignee_resolver` and "awaiting me"
from `decide_problem`: the same functions the approval route and the decision endpoint use.

Performance: the list is built from a fixed number of queries (proposals with their relations,
latest snapshots, approvals, ceilings, stages, users, regions, the acting user's permissions),
however many proposals exist. The full route of one proposal is only built for the detail view
(GET /api/proposals/{id}/approval-route).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.catalogue import PackVersion
from app.models.governance import AuditLog, User
from app.models.proposals import CalculationSnapshot, Proposal, ProposalCountry, ProposalLineItem, ProposalVersion
from app.services.notification_service import proposal_region
from app.services.permission_service import user_permissions
from app.services.proposal_workflow_service import (
    ProposalWorkflowError,
    _active_workflow_stages,
    _assignee_display,
    _assignee_resolver,
    _discount_policy_values,
    _route_metrics,
    _stage_label,
    _stage_role_display,
    decide_problem,
    get_latest_version,
    open_stage_by_version,
)

BUCKETS = ("awaiting_me", "in_progress", "completed", "all")
IN_PROGRESS_STATUSES = ("submitted",)
COMPLETED_STATUSES = ("approved", "rejected")
NO_STAGES_ISSUE = "No approval stages are configured (Admin → Approval Workflow)."


def _submitted_at(db: Session, proposal_ids: List[int]) -> Dict[int, str]:
    if not proposal_ids:
        return {}
    rows = db.execute(
        select(AuditLog.entity_id, AuditLog.occurred_at)
        .where(
            AuditLog.entity_type == "proposals",
            AuditLog.action == "PROPOSAL_SUBMITTED_FOR_APPROVAL",
            AuditLog.entity_id.in_([str(i) for i in proposal_ids]),
        )
        .order_by(AuditLog.occurred_at)
    ).all()
    latest: Dict[int, str] = {}
    for entity_id, occurred_at in rows:  # ordered, so the last one wins
        if occurred_at is not None:
            latest[int(entity_id)] = occurred_at.isoformat()
    return latest


def _latest_snapshots(db: Session, version_ids: List[int]) -> Dict[int, CalculationSnapshot]:
    if not version_ids:
        return {}
    rows = db.execute(
        select(CalculationSnapshot)
        .where(CalculationSnapshot.proposal_version_id.in_(version_ids))
        .order_by(CalculationSnapshot.id)
    ).scalars().all()
    return {s.proposal_version_id: s for s in rows}  # ordered by id, so the latest wins


class _Viewer:
    """The acting user's data, loaded once for the whole list."""

    def __init__(self, db: Session, user_id: Optional[int]):
        self.user = db.get(User, user_id) if user_id is not None else None
        self.permissions = user_permissions(db, user_id) if self.user is not None else set()

    def can_decide(self, approval, stage, region: Optional[str]) -> bool:
        if self.user is None or approval is None:
            return False
        return decide_problem(approval=approval, stage=stage, region=region, user=self.user,
                              permissions=self.permissions, role_codes=[]) is None


def list_inbox(db: Session, user_id: Optional[int]) -> Dict[str, Any]:
    proposals = db.execute(
        select(Proposal)
        .options(
            selectinload(Proposal.deal),
            selectinload(Proposal.customer),
            selectinload(Proposal.currency),
            selectinload(Proposal.created_by_user),
            selectinload(Proposal.countries).selectinload(ProposalCountry.country),
            selectinload(Proposal.versions).selectinload(ProposalVersion.line_items)
            .selectinload(ProposalLineItem.pack_version).selectinload(PackVersion.pack),
            selectinload(Proposal.versions).selectinload(ProposalVersion.line_items)
            .selectinload(ProposalLineItem.feature),
        )
        .order_by(Proposal.updated_at.desc(), Proposal.id.desc())
    ).scalars().all()

    versions: Dict[int, ProposalVersion] = {}
    for proposal in proposals:
        try:
            versions[proposal.id] = get_latest_version(proposal)
        except ProposalWorkflowError:
            continue  # a proposal without a version has no route to show

    version_ids = [v.id for v in versions.values()]
    snapshots = _latest_snapshots(db, version_ids)
    submitted = _submitted_at(db, list(versions))
    stages = _active_workflow_stages(db)
    open_stages = open_stage_by_version(
        db, [versions[p.id].id for p in proposals if p.id in versions and p.status in IN_PROGRESS_STATUSES], stages
    )
    ceilings = _discount_policy_values(db)
    from app.services.admin_service import approval_options

    test_effective = bool(approval_options(db).get("test_effective_discount", False))
    resolve_assignee = _assignee_resolver(db) if open_stages else None
    viewer = _Viewer(db, user_id)

    items = []
    for proposal in proposals:
        version = versions.get(proposal.id)
        if version is None:
            continue
        metrics = _route_metrics(proposal, version, db, snapshot=snapshots.get(version.id),
                                 ceilings=ceilings, test_effective=test_effective)
        region = proposal_region(proposal)
        approval, stage = open_stages.get(version.id, (None, None))
        owner = proposal.created_by_user
        items.append({
            "proposal_id": proposal.id,
            "proposal_code": proposal.code,
            "deal_name": proposal.deal.name if proposal.deal else None,
            "company": proposal.customer.name if proposal.customer else None,
            "owner_name": owner.full_name if owner else None,
            "region": region,
            "status": proposal.status,
            "currency": metrics["currency"],
            "net_total": metrics["net_total"],
            "list_total": metrics["list_total"],
            "effective_discount_pct": metrics["effective_discount"],
            "breach_count": len(metrics["line_breaches"]) + len(metrics["proposal_breaches"]),
            "current_stage": (
                {
                    "stage_code": stage.stage_code,
                    "stage_label": _stage_label(stage),
                    "role_name": _stage_role_display(stage, region),
                    "assigned_user_name": _assignee_display(resolve_assignee(stage, region), stage, region),
                    "approval_id": approval.id,
                }
                if stage is not None
                else None
            ),
            "awaiting_me": stage is not None and viewer.can_decide(approval, stage, region),
            "created_at": proposal.created_at.isoformat() if proposal.created_at else None,
            "submitted_at": submitted.get(proposal.id),
            "configuration_issues": ([] if stages else [NO_STAGES_ISSUE]) + metrics["configuration_issues"],
        })

    counts = {
        "awaiting_me": sum(1 for i in items if i["awaiting_me"]),
        "in_progress": sum(1 for i in items if i["status"] in IN_PROGRESS_STATUSES),
        "completed": sum(1 for i in items if i["status"] in COMPLETED_STATUSES),
        "all": len(items),
    }
    return {"items": items, "counts": counts}


def can_decide_stage(db: Session, proposal_id: int, user_id: Optional[int]) -> Dict[str, Any]:
    """For the detail view: the open stage and whether this user may decide it (server truth).
    Does not build the full route (that is GET /approval-route)."""
    proposal = db.get(Proposal, proposal_id)
    if proposal is None:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")
    if proposal.status not in IN_PROGRESS_STATUSES:
        return {"approval_id": None, "stage_label": None, "can_decide": False}
    version = get_latest_version(proposal)
    approval, stage = open_stage_by_version(db, [version.id], _active_workflow_stages(db)).get(version.id, (None, None))
    if stage is None:
        return {"approval_id": None, "stage_label": None, "can_decide": False}
    region = proposal_region(proposal) if stage.routing == "regional" else None
    return {
        "approval_id": approval.id,
        "stage_label": _stage_label(stage),
        "can_decide": _Viewer(db, user_id).can_decide(approval, stage, region),
    }
