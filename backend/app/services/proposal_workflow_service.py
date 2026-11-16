"""Proposal Workflow Service.

Manages:
- Proposal Content sections (Executive Summary, Scope of Work, Customization & Integration, Terms & Conditions, Fitment Document)
- Proposal Readiness Evaluation (8-point completeness checklist)
- Dynamic Governance Approval Route Resolution (Thresholds, Discount breaches, Regional Business Head, CFO)
- Submission for Approval (State transitions: proposal -> submitted, version -> under_review, Approval records, AuditLog)
"""

import json
import logging
import os
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, or_, select
from sqlalchemy.orm import Session

from app.models.governance import ApprovalThreshold, AuditLog, Role, User, UserRole
from app.models.integrations import Document
from app.models.proposals import (
    Approval,
    CalculationSnapshot,
    Proposal,
    ProposalContact,
    ProposalContent,
    ProposalCountry,
    ProposalLineItem,
    ProposalServiceLine,
    ProposalVersion,
)
from app.services.proposal_service import get_proposal

logger = logging.getLogger(__name__)

STANDARD_CONTENT_SECTIONS = [
    "executive_summary",
    "customer_challenges",
    "proposed_solution",
    "product_features",
    "implementation_methodology",
    "implementation_plan",
    "scope_of_work",
    "customization_integration",
    "terms_conditions",
    "fitment_document",
]

MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_ATTACHMENT_EXTENSIONS = {".docx", ".xlsx", ".pdf"}
UPLOAD_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "proposals"))


class ProposalWorkflowError(Exception):
    """Base error for proposal workflow operations."""
    pass


class ProposalNotReadyError(ProposalWorkflowError):
    """Raised when attempting to submit a proposal that fails readiness checks."""
    def __init__(self, message: str, missing_items: List[str]):
        super().__init__(message)
        self.missing_items = missing_items


def get_latest_version(proposal: Proposal) -> ProposalVersion:
    """Retrieve the active or latest version of a proposal."""
    if not proposal.versions:
        raise ProposalWorkflowError(f"Proposal {proposal.id} has no versions.")
    # Prefer draft version if exists, else highest version_no
    draft_versions = [v for v in proposal.versions if v.status == "draft"]
    if draft_versions:
        return max(draft_versions, key=lambda v: v.version_no)
    return max(proposal.versions, key=lambda v: v.version_no)


def _parse_section_content(raw_text: Optional[str]) -> Any:
    """Parse JSON string into structured dict/list or return raw string if not JSON."""
    if not raw_text:
        return ""
    stripped = raw_text.strip()
    if (stripped.startswith("{") and stripped.endswith("}")) or (
        stripped.startswith("[") and stripped.endswith("]")
    ):
        try:
            return json.loads(stripped)
        except Exception:
            return raw_text
    return raw_text


def get_proposal_content_sections(proposal_id: int, db: Session) -> Dict[str, Any]:
    """Retrieve all content sections and attachment metadata for the active proposal version."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)
    records = db.execute(
        select(ProposalContent).where(ProposalContent.proposal_version_id == version.id)
    ).scalars().all()

    content_map = {sec: "" for sec in STANDARD_CONTENT_SECTIONS}
    raw_content_map = {sec: "" for sec in STANDARD_CONTENT_SECTIONS}
    for r in records:
        raw_content_map[r.section_key] = r.content_text
        content_map[r.section_key] = _parse_section_content(r.content_text)

    # Attachments
    docs = db.execute(
        select(Document).where(
            Document.proposal_version_id == version.id,
            Document.status != "archived",
        ).order_by(Document.id.asc())
    ).scalars().all()

    attachments = [
        {
            "id": d.id,
            "proposal_id": proposal.id,
            "proposal_version_id": version.id,
            "file_name": d.file_name,
            "file_size_bytes": d.file_size_bytes,
            "mime_type": d.mime_type,
            "status": d.status,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "download_url": f"/api/proposals/{proposal.id}/attachments/{d.id}",
        }
        for d in docs
    ]

    return {
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "proposal_version_id": version.id,
        "version_no": version.version_no,
        "status": version.status,
        "currency": proposal.currency.code if proposal.currency else None,
        "currency_symbol": proposal.currency.symbol if proposal.currency else None,
        "sections": content_map,
        "raw_sections": raw_content_map,
        "attachments": attachments,
        "updated_at": version.updated_at.isoformat() if version.updated_at else datetime.now().isoformat(),
    }


def upsert_proposal_content_sections(
    proposal_id: int,
    sections: Dict[str, Any],
    db: Session,
) -> Dict[str, Any]:
    """Upsert narrative sections (structured or plain text) for the active proposal version."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)
    if version.status not in ("draft", "under_review"):
        raise ProposalWorkflowError(f"Cannot edit content for version in status '{version.status}'.")

    for key, text_val in sections.items():
        if text_val is None:
            continue
        if isinstance(text_val, (dict, list, bool, int, float)):
            stored_val = json.dumps(text_val)
        elif not isinstance(text_val, str):
            stored_val = str(text_val)
        else:
            stored_val = text_val

        record = db.execute(
            select(ProposalContent).where(
                ProposalContent.proposal_version_id == version.id,
                ProposalContent.section_key == key,
            )
        ).scalars().first()

        if record:
            record.content_text = stored_val
        else:
            new_record = ProposalContent(
                proposal_version_id=version.id,
                section_key=key,
                content_text=stored_val,
            )
            db.add(new_record)

    version.updated_at = datetime.now()
    proposal.updated_at = datetime.now()

    # Record genuine AuditLog for content update
    db.add(
        AuditLog(
            actor_user_id=None,
            action="PROPOSAL_CONTENT_UPDATED",
            entity_type="proposals",
            entity_id=str(proposal.id),
            before=None,
            after={"updated_sections": list(sections.keys())},
        )
    )
    db.commit()

    return get_proposal_content_sections(proposal_id, db)


def save_proposal_attachment(
    proposal_id: int,
    filename: str,
    content_bytes: bytes,
    mime_type: str,
    db: Session,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Save an uploaded fitment document and register in Document model."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)
    if version.status not in ("draft", "under_review"):
        raise ProposalWorkflowError(f"Cannot add attachments to version in status '{version.status}'.")

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise ProposalWorkflowError(
            f"Unsupported file extension '{ext}'. Allowed: {', '.join(sorted(ALLOWED_ATTACHMENT_EXTENSIONS))}"
        )

    file_size = len(content_bytes)
    if file_size > MAX_ATTACHMENT_SIZE_BYTES:
        raise ProposalWorkflowError(f"File size {file_size / (1024 * 1024):.1f}MB exceeds 20MB limit.")

    prop_upload_dir = os.path.join(UPLOAD_BASE_DIR, str(proposal_id))
    os.makedirs(prop_upload_dir, exist_ok=True)

    safe_name = os.path.basename(filename).replace(" ", "_")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stored_filename = f"{timestamp}_{safe_name}"
    storage_path = os.path.join(prop_upload_dir, stored_filename)

    with open(storage_path, "wb") as f:
        f.write(content_bytes)

    doc = Document(
        proposal_version_id=version.id,
        doc_type="custom",
        file_name=safe_name,
        storage_path=storage_path,
        mime_type=mime_type or "application/octet-stream",
        file_size_bytes=file_size,
        status="uploaded",
        created_by_user_id=user_id,
        created_at=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return {
        "id": doc.id,
        "proposal_id": proposal.id,
        "proposal_version_id": version.id,
        "file_name": doc.file_name,
        "file_size_bytes": doc.file_size_bytes,
        "mime_type": doc.mime_type,
        "status": doc.status,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "download_url": f"/api/proposals/{proposal.id}/attachments/{doc.id}",
    }


def get_proposal_attachments(proposal_id: int, db: Session) -> List[Dict[str, Any]]:
    """List attachments for the proposal's active version."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)
    docs = db.execute(
        select(Document).where(
            Document.proposal_version_id == version.id,
            Document.status != "archived",
        ).order_by(Document.id.asc())
    ).scalars().all()

    return [
        {
            "id": d.id,
            "proposal_id": proposal.id,
            "proposal_version_id": version.id,
            "file_name": d.file_name,
            "file_size_bytes": d.file_size_bytes,
            "mime_type": d.mime_type,
            "status": d.status,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "download_url": f"/api/proposals/{proposal.id}/attachments/{d.id}",
        }
        for d in docs
    ]


def get_attachment_file(proposal_id: int, document_id: int, db: Session) -> Document:
    """Get single document metadata and verify association."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)
    doc = db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.proposal_version_id == version.id,
        )
    ).scalars().first()
    if not doc:
        raise ProposalWorkflowError(f"Attachment {document_id} not found for proposal {proposal_id}.")

    return doc


def delete_proposal_attachment(proposal_id: int, document_id: int, db: Session) -> Dict[str, Any]:
    """Delete an attachment file and mark document record archived."""
    doc = get_attachment_file(proposal_id=proposal_id, document_id=document_id, db=db)
    if os.path.exists(doc.storage_path):
        try:
            os.remove(doc.storage_path)
        except Exception as e:
            logger.warning(f"Could not remove physical file {doc.storage_path}: {e}")

    doc.status = "archived"
    db.delete(doc)
    db.commit()

    return {"detail": "Attachment deleted successfully", "document_id": document_id}


def evaluate_proposal_readiness(proposal_id: int, db: Session) -> Dict[str, Any]:
    """Evaluate 8-point readiness checklist, commercial metrics, and discount governance for a proposal."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)

    # 1. Proposal overview metadata
    customer_name = proposal.customer.name if proposal.customer else "—"
    customer_code = proposal.customer.code if proposal.customer else "—"
    deal_name = proposal.deal.name if proposal.deal else "—"
    deal_code = (
        getattr(proposal.deal, "code", None)
        or getattr(proposal.deal, "crm_deal_id", None)
        or (f"DEAL-{proposal.deal.id}" if proposal.deal else "—")
    )

    primary_country = "—"
    region = "Global"
    if proposal.countries:
        primary_c = next((c for c in proposal.countries if c.is_primary_deployment), proposal.countries[0])
        if primary_c and primary_c.country:
            primary_country = primary_c.country.name
            region = primary_c.country.region or "Global"
    elif proposal.deal and getattr(proposal.deal, "region", None):
        region = proposal.deal.region

    currency_code = proposal.currency.code if proposal.currency else None
    currency_symbol = proposal.currency.symbol if proposal.currency else None

    # 2. Checklist checks
    # Item 1: Deal Associated
    has_deal = bool(proposal.deal_id is not None)

    # Item 2: Countries & Products Configured
    has_country = bool(len(proposal.countries) > 0)
    has_products = bool(len(version.line_items) > 0)
    config_ready = has_country and has_products

    # Items 3-7: Content Sections & Attachments
    content_map = {}
    for r in db.execute(
        select(ProposalContent).where(ProposalContent.proposal_version_id == version.id)
    ).scalars().all():
        content_map[r.section_key] = _parse_section_content(r.content_text)

    # Attachments
    has_attachments = bool(
        db.execute(
            select(Document).where(
                Document.proposal_version_id == version.id,
                Document.status != "archived",
            )
        ).scalars().first()
    )

    # Item 3: Executive Summary
    exec_c = content_map.get("executive_summary")
    if isinstance(exec_c, dict):
        exec_summary_ready = any(bool(str(v or "").strip()) for v in exec_c.values())
    else:
        exec_summary_ready = bool(str(exec_c or "").strip())

    # Item 4: Scope of Work
    sow_c = content_map.get("scope_of_work")
    if isinstance(sow_c, dict):
        sow_ready = any(bool(str(v or "").strip()) for v in sow_c.values())
    else:
        sow_ready = bool(str(sow_c or "").strip())

    # Item 5: Customization & Integration
    cust_c = content_map.get("customization_integration")
    if isinstance(cust_c, dict):
        cust_ready = bool(cust_c.get("none_required")) or bool(
            cust_c.get("items") and len(cust_c["items"]) > 0
        )
    else:
        cust_ready = bool(str(cust_c or "").strip())

    # Item 6: Terms & Conditions & Item 8: Payment Milestones
    terms_c = content_map.get("terms_conditions")
    terms_ready = False
    milestones_ready = False
    milestones_details = "No payment milestones configured."

    if isinstance(terms_c, dict):
        has_terms_body = bool(
            str(terms_c.get("commercial_tc") or "").strip()
            or str(terms_c.get("terms_of_proposal") or "").strip()
            or str(terms_c.get("payment_terms_text") or "").strip()
        )
        terms_ready = has_terms_body

        milestones = terms_c.get("payment_milestones") or []
        if milestones:
            m_sum = sum(float(m.get("percentage") or 0) for m in milestones)
            if abs(m_sum - 100.0) < 0.01:
                milestones_ready = True
                milestones_details = f"{len(milestones)} milestones configured (100% total)"
            else:
                milestones_ready = False
                milestones_details = f"Current total {m_sum:.1f}% (must equal exactly 100%)"
        else:
            milestones_ready = False
            milestones_details = "No payment milestones configured."
    else:
        terms_ready = bool(str(terms_c or "").strip())
        milestones_ready = False

    # Item 7: Fitment Document
    fit_c = content_map.get("fitment_document")
    if isinstance(fit_c, dict):
        fit_text_ready = any(
            bool(str(v or "").strip()) for k, v in fit_c.items() if k != "attachments"
        )
    else:
        fit_text_ready = bool(str(fit_c or "").strip())
    fitment_ready = fit_text_ready or has_attachments

    # 3. Commercial Calculations from Snapshot
    latest_snapshot = db.execute(
        select(CalculationSnapshot)
        .where(CalculationSnapshot.proposal_version_id == version.id)
        .order_by(CalculationSnapshot.id.desc())
    ).scalars().first()

    snapshot_ready = False
    net_total = 0.0
    gross_total = 0.0
    annual_total = 0.0
    overall_discount = 0.0
    gross_margin: Optional[float] = None  # only a margin the engine calculated is ever used

    if latest_snapshot and latest_snapshot.snapshot_payload:
        snapshot_ready = True
        payload = latest_snapshot.snapshot_payload
        currency_code = payload.get("reporting_currency_code") or currency_code
        net_total = float(
            payload.get("total_proposal_contract_reporting_currency")
            or payload.get("total_proposal_reporting_currency")
            or 0.0
        )
        gross_total = float(
            payload.get("total_proposal_base_contract_reporting_currency")
            or payload.get("total_base_contract_reporting")
            or net_total
        )
        annual_total = float(payload.get("total_proposal_annual_reporting_currency") or 0.0)

        if gross_total > 0 and gross_total >= net_total:
            overall_discount = round(((gross_total - net_total) / gross_total) * 100, 2)
        else:
            overall_discount = float(payload.get("overall_discount_pct") or 0.0)

        margin = payload.get("effective_gross_margin_pct")
        if margin is None:
            margin = payload.get("gross_margin_pct")
        gross_margin = float(margin) if margin is not None else None

    # Max line discount
    max_line_discount = 0.0
    for item in version.line_items:
        if item.discount_pct and float(item.discount_pct) > max_line_discount:
            max_line_discount = float(item.discount_pct)

    # 4. Ceilings from Admin -> Approval Workflow (approval_thresholds). Nothing is assumed when a
    #    ceiling is missing: it is reported as not configured and submission is blocked.
    ceilings = _discount_policy_values(db)
    line_ceiling = ceilings["line"]
    overall_ceiling = ceilings["proposal"]
    gm_floor = ceilings["gm_floor"]
    stage_roles = _stage_role_names(db)
    line_approver_role = stage_roles.get("commercial_line")
    overall_approver_role = stage_roles.get("commercial_proposal")
    gm_approver_role = ceilings["gm_floor_role"]

    not_configured = []
    if line_ceiling is None:
        not_configured.append("Line-level discount ceiling")
    if overall_ceiling is None:
        not_configured.append("Proposal-level discount ceiling")

    line_breached = line_ceiling is not None and max_line_discount > line_ceiling
    overall_breached = overall_ceiling is not None and overall_discount > overall_ceiling
    gm_breached = (
        gm_floor is not None and gross_margin is not None and snapshot_ready and net_total > 0 and gross_margin < gm_floor
    )

    def _needs(role: Optional[str]) -> str:
        return f" (Requires {role} approval)" if role else ""

    breaches_list = []
    if line_breached:
        breaches_list.append(
            f"Line item discount of {max_line_discount:.1f}% exceeds policy ceiling of {line_ceiling:.1f}%{_needs(line_approver_role)}"
        )
    if overall_breached:
        breaches_list.append(
            f"Overall proposal discount of {overall_discount:.1f}% exceeds policy ceiling of {overall_ceiling:.1f}%{_needs(overall_approver_role)}"
        )
    if gm_breached:
        breaches_list.append(
            f"Gross Margin of {gross_margin:.1f}% is below policy threshold floor of {gm_floor:.1f}%{_needs(gm_approver_role)}"
        )

    breaches_count = len(breaches_list)

    commercials_summary = {
        "snapshot_id": latest_snapshot.id if latest_snapshot else None,
        "calculated_at": latest_snapshot.calculated_at.isoformat() if latest_snapshot else None,
        "currency": currency_code,
        "currency_symbol": currency_symbol,
        "net_total": net_total,
        "gross_total": gross_total,
        "annual_total": annual_total,
        "effective_discount_pct": overall_discount,
        "overall_discount_pct": overall_discount,
        "gross_margin_pct": gross_margin,
        "discount_breaches_count": breaches_count,
    }

    discount_policy = {
        "line_level": {
            "policy_name": "Line-Level Discount Policy",
            "actual_pct": max_line_discount,
            "ceiling_pct": line_ceiling,
            "configured": line_ceiling is not None,
            "is_breached": line_breached,
            "required_role": line_approver_role,
        },
        "proposal_level": {
            "policy_name": "Proposal-Level Discount Policy",
            "actual_pct": overall_discount,
            "ceiling_pct": overall_ceiling,
            "configured": overall_ceiling is not None,
            "is_breached": overall_breached,
            "required_role": overall_approver_role,
        },
        "gm_floor": {
            "policy_name": "Gross Margin Floor Policy",
            "actual_pct": gross_margin,
            "floor_pct": gm_floor,
            "configured": gm_floor is not None,
            "is_breached": gm_breached,
            "required_role": gm_approver_role,
        },
        "breaches_count": breaches_count,
        "breaches": breaches_list,
        "not_configured": not_configured,
    }

    # 5. Build dynamic 8-point checklist
    checklist = [
        {
            "id": "deal_imported",
            "label": "HubSpot Deal / CRM Association",
            "is_complete": has_deal,
            "percentage": 100 if has_deal else 0,
            "details": f"Deal ID: {proposal.deal_id}" if has_deal else "No CRM deal associated.",
            "step_route": "/proposals/import",
        },
        {
            "id": "configurator",
            "label": "Countries & Products Configured",
            "is_complete": config_ready,
            "percentage": 100 if config_ready else 0,
            "details": f"{len(proposal.countries)} countries, {len(version.line_items)} product lines configured." if config_ready else "Country deployment or product lines missing.",
            "step_route": "/calculator",
        },
        {
            "id": "executive_summary",
            "label": "Executive Summary Narrative",
            "is_complete": exec_summary_ready,
            "percentage": 100 if exec_summary_ready else 0,
            "details": "Present" if exec_summary_ready else "Section is empty.",
            "step_route": "/proposals/content?section=executive_summary",
        },
        {
            "id": "scope_of_work",
            "label": "Scope of Work Narrative",
            "is_complete": sow_ready,
            "percentage": 100 if sow_ready else 0,
            "details": "Present" if sow_ready else "Section is empty.",
            "step_route": "/proposals/content?section=scope_of_work",
        },
        {
            "id": "customization_integration",
            "label": "Customization & Integrations Scope",
            "is_complete": cust_ready,
            "percentage": 100 if cust_ready else 0,
            "details": "Present" if cust_ready else "Section is empty.",
            "step_route": "/proposals/content?section=customization_integration",
        },
        {
            "id": "terms_conditions",
            "label": "Commercial Terms & Conditions",
            "is_complete": terms_ready,
            "percentage": 100 if terms_ready else 0,
            "details": "Present" if terms_ready else "Commercial terms narrative is empty.",
            "step_route": "/proposals/content?section=terms_conditions",
        },
        {
            "id": "fitment_document",
            "label": "Fitment Analysis Document",
            "is_complete": fitment_ready,
            "percentage": 100 if fitment_ready else 0,
            "details": "Fitment confirmed" if fitment_ready else "Section or attachment missing.",
            "step_route": "/proposals/content?section=fitment_document",
        },
        {
            "id": "payment_milestones",
            "label": "Payment Milestones Breakdown",
            "is_complete": milestones_ready,
            "percentage": 100 if milestones_ready else 0,
            "details": milestones_details,
            "step_route": "/proposals/content?section=terms_conditions",
        },
    ]

    completed_count = sum(1 for c in checklist if c["is_complete"])
    total_count = len(checklist)
    readiness_percentage = round((completed_count / total_count) * 100) if total_count > 0 else 0
    missing_items = [item["label"] for item in checklist if not item["is_complete"]]
    is_ready = len(missing_items) == 0

    return {
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "proposal_version_id": version.id,
        "version_no": version.version_no,
        "status": version.status,
        "customer_name": customer_name,
        "customer_code": customer_code,
        "deal_name": deal_name,
        "deal_code": deal_code,
        "region": region,
        "primary_country": primary_country,
        "currency": currency_code,
        "currency_symbol": currency_symbol,
        "is_ready": is_ready,
        "completed_count": completed_count,
        "total_count": total_count,
        "readiness_percentage": readiness_percentage,
        "checklist": checklist,
        "missing_items": missing_items,
        "commercials": commercials_summary,
        "discount_policy": discount_policy,
    }


def _find_assigned_user_for_role(role_id: int, region: Optional[str], db: Session) -> Optional[User]:
    """Resolve active assigned user for a governance role with optional regional scoping."""
    stmt = (
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .where(UserRole.role_id == role_id, User.is_active == True)
    )
    users = db.execute(stmt).scalars().all()
    if not users:
        return None
    if region:
        for u in users:
            if u.region and u.region.strip().lower() == region.strip().lower():
                return u
    return users[0]


def evaluate_proposal_approval_route(proposal_id: int, db: Session) -> Dict[str, Any]:
    """Calculate dynamic multi-level approval stages for a proposal based on DB configuration."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)

    # Phase 2: when the Admin approval matrix is configured, it drives the route.
    configured_stages = _active_workflow_stages(db)
    if configured_stages:
        return _configured_approval_route(proposal, version, configured_stages, db)

    # No approval stages configured: there is no route to follow. Nothing is invented; the
    # Admin configures the stages (Admin -> Approval Workflow) and submission stays blocked.
    metrics = _route_metrics(proposal, version, db)
    return {
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "proposal_version_id": version.id,
        "overall_discount_pct": metrics["effective_discount"],
        "max_line_discount_pct": metrics["max_line_discount"],
        "gross_margin_pct": None,
        "route_source": "not_configured",
        "net_total": metrics["net_total"],
        "currency": metrics["currency"],
        "region": None,
        "ceilings": {"line_pct": metrics["ceilings"]["line"], "proposal_pct": metrics["ceilings"]["proposal"],
                     "gm_floor_pct": metrics["ceilings"]["gm_floor"],
                     "test_effective_discount": metrics["test_effective_discount"]},
        "line_breaches": metrics["line_breaches"],
        "proposal_breaches": metrics["proposal_breaches"],
        "configuration_issues": ["No approval stages are configured (Admin → Approval Workflow)."]
        + metrics["configuration_issues"],
        "approval_stages": [],
    }


def submit_proposal_for_approval(
    proposal_id: int,
    acting_user_id: int,
    notes: Optional[str],
    db: Session,
) -> Dict[str, Any]:
    """Execute proposal submission workflow."""
    # 1. Evaluate readiness
    readiness = evaluate_proposal_readiness(proposal_id=proposal_id, db=db)
    if not readiness["is_ready"]:
        raise ProposalNotReadyError(
            f"Proposal {proposal_id} cannot be submitted. Missing required steps: {', '.join(readiness['missing_items'])}",
            missing_items=readiness["missing_items"],
        )

    proposal = get_proposal(db=db, proposal_id=proposal_id)
    version = get_latest_version(proposal)

    # 2. Compute dynamic route (it must be fully configured: stages and discount ceilings)
    route = evaluate_proposal_approval_route(proposal_id=proposal_id, db=db)
    if route.get("configuration_issues"):
        raise ProposalWorkflowError(
            "The approval workflow is not fully configured: " + " ".join(route["configuration_issues"])
        )

    # 3. Transition statuses
    proposal.status = "submitted"
    version.status = "under_review"
    version.notes = f"Submitted for approval: {notes}" if notes else "Submitted for governance approval."

    # 4. Create Approval records for each required stage
    existing_role_ids = {
        app.assigned_role_id
        for app in db.execute(
            select(Approval).where(Approval.proposal_version_id == version.id)
        ).scalars().all()
    }

    # Configured route: a (re)submission restarts the route, so earlier stage decisions of this
    # version are cancelled (kept for history) and every required stage is approved again.
    if any(s.get("stage_code") for s in route["approval_stages"]):
        for old in db.execute(
            select(Approval).where(
                Approval.proposal_version_id == version.id,
                Approval.stage_code.isnot(None),
                Approval.status != "cancelled",
            )
        ).scalars().all():
            old.status = "cancelled"
        db.flush()
    existing_stage_codes: set = set()

    for stage in route["approval_stages"]:
        stage_code = stage.get("stage_code")
        if stage_code:
            # Phase 2 configured route: one approval per stage (several stages may share a role).
            if stage["is_required"] and stage_code not in existing_stage_codes:
                db.add(Approval(
                    proposal_version_id=version.id,
                    assigned_role_id=stage["role_id"],
                    stage_code=stage_code,
                    status="pending",
                    decision_notes=f"Triggered by rule: {stage['reason']}",
                ))
            continue
        if stage["is_required"] and stage["role_id"] not in existing_role_ids:
            approval_rec = Approval(
                proposal_version_id=version.id,
                assigned_role_id=stage["role_id"],
                status="pending",
                decision_notes=f"Triggered by rule: {stage['reason']}",
            )
            db.add(approval_rec)

    # 5. Record immutable AuditLog
    audit = AuditLog(
        actor_user_id=acting_user_id,
        action="PROPOSAL_SUBMITTED_FOR_APPROVAL",
        entity_type="proposals",
        entity_id=str(proposal.id),
        before={"proposal_status": "draft", "version_status": "draft"},
        after={
            "proposal_status": "submitted",
            "version_status": "under_review",
            "notes": notes,
            "stages_count": len([s for s in route['approval_stages'] if s['is_required']]),
        },
    )
    db.add(audit)
    db.flush()
    _notify_submitted(db, proposal, route, acting_user_id)
    db.commit()

    return {
        "success": True,
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "proposal_status": proposal.status,
        "version_status": version.status,
        "approval_stages": route["approval_stages"],
        "message": f"Proposal {proposal.code} has been successfully submitted for approval.",
    }


def decide_proposal_approval(
    proposal_id: int,
    approval_id: int,
    decision: str,  # 'approved' or 'rejected'
    notes: Optional[str],
    acting_user_id: int,
    db: Session,
) -> Dict[str, Any]:
    """Record an approver decision on a proposal approval stage."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)

    approval = db.execute(
        select(Approval).where(
            Approval.id == approval_id,
            Approval.proposal_version_id == version.id,
        )
    ).scalars().first()
    if not approval:
        raise ProposalWorkflowError(f"Approval record {approval_id} not found for proposal {proposal_id}.")

    if decision not in ("approved", "rejected"):
        raise ProposalWorkflowError(f"Invalid decision '{decision}'. Must be 'approved' or 'rejected'.")

    if approval.stage_code:
        # Phase 2 configured route: stages are decided in order, once.
        if approval.status != "pending":
            raise ProposalWorkflowError(f"This approval is already '{approval.status}'.")
        blocking = _earlier_open_stage(db, version.id, approval)
        if blocking is not None:
            raise ProposalWorkflowError(
                f"Stage '{blocking.stage_code}' must be decided before '{approval.stage_code}'."
            )
        if decision == "rejected" and not (notes or "").strip():
            raise ProposalWorkflowError("A comment is required when returning a proposal.")

    approval.status = decision
    approval.decision_notes = notes
    approval.decided_at = datetime.now(timezone.utc)
    approval.decided_by_user_id = acting_user_id

    # Record AuditLog for the approval decision
    audit = AuditLog(
        actor_user_id=acting_user_id,
        action=f"APPROVAL_{decision.upper()}",
        entity_type="proposals",
        entity_id=str(proposal.id),
        before={"approval_id": approval.id, "status": "pending"},
        after={"approval_id": approval.id, "status": decision, "notes": notes},
    )
    db.add(audit)

    # Check overall proposal status transition
    if decision == "rejected":
        proposal.status = "rejected"
        version.status = "rejected"
        db.add(
            AuditLog(
                actor_user_id=acting_user_id,
                action="PROPOSAL_REJECTED",
                entity_type="proposals",
                entity_id=str(proposal.id),
                before={"proposal_status": "submitted", "version_status": "under_review"},
                after={"proposal_status": "rejected", "version_status": "rejected", "rejection_notes": notes},
            )
        )
    else:
        # Check if all required approvals are now approved
        all_approvals = db.execute(
            select(Approval).where(Approval.proposal_version_id == version.id)
        ).scalars().all()
        open_or_decided = [a for a in all_approvals if a.status != "cancelled"]
        if open_or_decided and all(a.status == "approved" for a in open_or_decided):
            proposal.status = "approved"
            version.status = "approved"
            db.add(
                AuditLog(
                    actor_user_id=acting_user_id,
                    action="PROPOSAL_APPROVED",
                    entity_type="proposals",
                    entity_id=str(proposal.id),
                    before={"proposal_status": "submitted", "version_status": "under_review"},
                    after={"proposal_status": "approved", "version_status": "approved"},
                )
            )

    db.flush()
    _notify_decided(db, proposal, version, approval, decision, notes, acting_user_id)
    db.commit()

    return {
        "success": True,
        "proposal_id": proposal.id,
        "proposal_status": proposal.status,
        "version_status": version.status,
        "approval_id": approval.id,
        "decision": decision,
    }


def recall_proposal_submission(
    proposal_id: int,
    acting_user_id: int,
    reason: Optional[str],
    db: Session,
) -> Dict[str, Any]:
    """Recall a submitted proposal back to draft status."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    version = get_latest_version(proposal)
    if proposal.status != "submitted" and version.status != "under_review":
        raise ProposalWorkflowError(f"Cannot recall proposal in status '{proposal.status}'. Must be 'submitted'.")

    proposal.status = "draft"
    version.status = "draft"

    # Cancel pending approvals
    approvals = db.execute(
        select(Approval).where(Approval.proposal_version_id == version.id, Approval.status == "pending")
    ).scalars().all()
    for app in approvals:
        app.status = "cancelled"

    # Record AuditLog
    db.add(
        AuditLog(
            actor_user_id=acting_user_id,
            action="PROPOSAL_RECALLED",
            entity_type="proposals",
            entity_id=str(proposal.id),
            before={"proposal_status": "submitted", "version_status": "under_review"},
            after={"proposal_status": "draft", "version_status": "draft", "reason": reason},
        )
    )
    db.commit()

    return {
        "success": True,
        "proposal_id": proposal.id,
        "proposal_status": proposal.status,
        "version_status": version.status,
        "message": f"Proposal {proposal.code} recalled to draft.",
    }


def get_proposal_activity(proposal_id: int, db: Session) -> List[Dict[str, Any]]:
    """Retrieve genuine chronological activity history from immutable AuditLog."""
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise ProposalWorkflowError(f"Proposal {proposal_id} not found.")

    stmt = (
        select(AuditLog)
        .where(AuditLog.entity_type == "proposals", AuditLog.entity_id == str(proposal.id))
        .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
    )
    logs = db.execute(stmt).scalars().all()

    # If no logs exist yet, bootstrap initial creation event from proposal record
    if not logs:
        created_log = AuditLog(
            actor_user_id=proposal.created_by_user_id,
            action="PROPOSAL_CREATED",
            entity_type="proposals",
            entity_id=str(proposal.id),
            occurred_at=proposal.created_at,
            before=None,
            after={
                "proposal_code": proposal.code,
                "deal_id": proposal.deal_id,
                "customer_id": proposal.customer_id,
                "status": "draft",
            },
        )
        db.add(created_log)
        db.commit()
        logs = [created_log]

    action_titles = {
        "PROPOSAL_CREATED": "Proposal Created",
        "DEAL_IMPORTED_FROM_HUBSPOT": "Deal Imported from HubSpot",
        "PROPOSAL_CONTENT_UPDATED": "Proposal Content Updated",
        "DISCOUNTS_UPDATED": "Pricing & Discounts Recalculated",
        "PROPOSAL_SUBMITTED_FOR_APPROVAL": "Submitted for Governance Approval",
        "APPROVAL_APPROVED": "Governance Approval Granted",
        "APPROVAL_REJECTED": "Governance Approval Rejected",
        "PROPOSAL_APPROVED": "Proposal Fully Approved",
        "PROPOSAL_REJECTED": "Proposal Rejected",
        "PROPOSAL_RECALLED": "Proposal Recalled to Draft",
    }

    results = []
    for log in logs:
        actor_name = log.actor.full_name if log.actor else (log.actor.email if log.actor else "System")
        actor_email = log.actor.email if log.actor else ""
        title = action_titles.get(log.action, log.action.replace("_", " ").title())
        results.append({
            "id": log.id,
            "action": log.action,
            "title": title,
            "actor_name": actor_name,
            "actor_email": actor_email,
            "occurred_at": log.occurred_at.isoformat() if log.occurred_at else None,
            "before": log.before,
            "after": log.after,
        })
    return results



# =============================================================================================
# Phase 2 — Admin-configured approval route, permission checks and notifications
# =============================================================================================
_FINAL_STAGES = ("final_l1", "final_l2_legal", "final_l2_cfo")
_COMMERCIAL_STAGES = ("commercial_line", "commercial_proposal")


def _active_workflow_stages(db: Session) -> list:
    from app.models.admin import ApprovalWorkflowStage

    return list(
        db.execute(
            select(ApprovalWorkflowStage)
            .where(ApprovalWorkflowStage.is_active.is_(True))
            .order_by(ApprovalWorkflowStage.sort_order, ApprovalWorkflowStage.id)
        ).scalars().all()
    )


def _line_label(item: ProposalLineItem) -> str:
    if item.pack_version is not None and getattr(item.pack_version, "pack", None) is not None:
        return item.pack_version.pack.name
    if item.feature is not None:
        return item.feature.name
    return f"Line {item.id}"


def _discount_policy_values(db: Session) -> Dict[str, Any]:
    """Ceilings in effect today, from approval_thresholds. None when the Admin has not configured one."""
    today = date.today()
    rows = db.execute(
        select(ApprovalThreshold).where(
            ApprovalThreshold.status == "active",
            ApprovalThreshold.valid_from <= today,
            or_(ApprovalThreshold.valid_to.is_(None), ApprovalThreshold.valid_to >= today),
        )
    ).scalars().all()

    def pick(kind: str, fn) -> Optional[float]:
        values = [float(t.value_pct) for t in rows if t.threshold_type == kind]
        return float(fn(values)) if values else None

    gm_rows = [t for t in rows if t.threshold_type == "gm_floor" and t.approver_role is not None]
    return {
        "line": pick("line_discount", min),
        "proposal": pick("overall_discount", min),
        "gm_floor": pick("gm_floor", max),
        "gm_floor_role": gm_rows[0].approver_role.name if gm_rows else None,
    }


def _stage_role_names(db: Session) -> Dict[str, str]:
    """Approver role name of each active configured stage (stage_code -> role name)."""
    return {s.stage_code: s.approver_role.name for s in _active_workflow_stages(db) if s.approver_role is not None}


def _route_metrics(proposal: Proposal, version: ProposalVersion, db: Session) -> Dict[str, Any]:
    from app.services.admin_service import approval_options

    latest_snapshot = db.execute(
        select(CalculationSnapshot)
        .where(CalculationSnapshot.proposal_version_id == version.id)
        .order_by(CalculationSnapshot.id.desc())
    ).scalars().first()
    payload = latest_snapshot.snapshot_payload if latest_snapshot else {}
    net_total = float(payload.get("total_proposal_contract_reporting_currency") or 0.0)
    gross_total = float(payload.get("total_proposal_base_contract_reporting_currency") or net_total)
    effective = round(((gross_total - net_total) / gross_total) * 100, 2) if gross_total > 0 and gross_total >= net_total else 0.0

    ceilings = _discount_policy_values(db)
    test_effective = bool(approval_options(db).get("test_effective_discount", False))
    issues = []
    if ceilings["line"] is None:
        issues.append("The line-level discount ceiling is not configured (Admin → Approval Workflow).")
    if ceilings["proposal"] is None:
        issues.append("The proposal-level discount ceiling is not configured (Admin → Approval Workflow).")

    line_breaches = []
    max_line = 0.0
    for item in version.line_items:
        pct = float(item.discount_pct or 0)
        max_line = max(max_line, pct)
        if ceilings["line"] is not None and pct > ceilings["line"]:
            line_breaches.append({"line_item_id": item.id, "label": _line_label(item), "discount_pct": pct})

    prop_breaches = []
    if ceilings["proposal"] is not None:
        for pc in proposal.countries or []:
            name = pc.country.name if pc.country is not None else f"Country block {pc.id}"
            for field, label in (("subscription_discount_pct", "subscription"), ("service_discount_pct", "services")):
                value = getattr(pc, field, None)
                if value is not None and float(value) > ceilings["proposal"]:
                    prop_breaches.append({"country": name, "kind": label, "discount_pct": float(value)})
        if test_effective and effective > ceilings["proposal"]:
            prop_breaches.append({"country": "Whole proposal", "kind": "effective", "discount_pct": effective})

    return {
        "ceilings": ceilings,
        "effective_discount": effective,
        "max_line_discount": max_line,
        "line_breaches": line_breaches,
        "proposal_breaches": prop_breaches,
        "net_total": net_total,
        "currency": payload.get("reporting_currency_code") or (proposal.currency.code if proposal.currency else None),
        "test_effective_discount": test_effective,
        "configuration_issues": issues,
    }


def _stage_assignee(stage, region: str, db: Session) -> Optional[User]:
    from app.services.notification_service import regional_business_head

    role = stage.approver_role
    if stage.routing == "regional" and role.code == "business_head":
        bh = regional_business_head(db, region)
        if bh is not None:
            return bh
    users = db.execute(
        select(User).join(UserRole, UserRole.user_id == User.id)
        .where(UserRole.role_id == role.id, User.is_active.is_(True)).order_by(User.id)
    ).scalars().all()
    if stage.routing == "regional" and region:
        for u in users:
            if u.region and u.region.strip().lower() == region.strip().lower():
                return u
        return None
    return users[0] if users else None


def _configured_approval_route(proposal: Proposal, version: ProposalVersion, stages: list, db: Session) -> Dict[str, Any]:
    from app.services.notification_service import proposal_region

    region = proposal_region(proposal)
    metrics = _route_metrics(proposal, version, db)
    ceilings = metrics["ceilings"]

    approvals = db.execute(
        select(Approval).where(Approval.proposal_version_id == version.id).order_by(Approval.id)
    ).scalars().all()
    by_stage: Dict[str, Approval] = {}
    for a in approvals:
        if a.stage_code and a.status != "cancelled":
            by_stage[a.stage_code] = a

    result_stages = []
    for level, stage in enumerate(stages, start=1):
        code = stage.stage_code
        if code == "commercial_line" and ceilings["line"] is None:
            required, reason = True, "Line-level ceiling not configured"
        elif code == "commercial_line":
            required = bool(metrics["line_breaches"])
            reason = (
                f"{len(metrics['line_breaches'])} line(s) above the {ceilings['line']:g}% line ceiling"
                if required else f"No line above the {ceilings['line']:g}% line ceiling"
            )
        elif code == "commercial_proposal" and ceilings["proposal"] is None:
            required, reason = True, "Proposal-level ceiling not configured"
        elif code == "commercial_proposal":
            required = bool(metrics["proposal_breaches"])
            reason = (
                f"Overall discount above the {ceilings['proposal']:g}% proposal ceiling"
                if required else f"Overall discounts within the {ceilings['proposal']:g}% proposal ceiling"
            )
        else:
            required = True
            reason = stage.condition_text or stage.label

        existing = by_stage.get(code)
        assignee = _stage_assignee(stage, region, db)
        role_label = stage.approver_role.name
        if existing is not None:
            stage_status = existing.status
        elif not required:
            stage_status = "not_required"
        elif version.status == "under_review":
            stage_status = "pending"
        else:
            stage_status = "pending_submission"
        result_stages.append({
            "stage_level": level,
            "stage_code": code,
            "stage_label": f"{stage.label}{' · ' + stage.sub_label if stage.sub_label else ''}",
            "approval_id": existing.id if existing is not None else None,
            "role_id": stage.approver_role_id,
            "role_code": stage.approver_role.code,
            "role_name": f"{role_label} ({region})" if stage.routing == "regional" else role_label,
            "assigned_user_name": assignee.full_name if assignee else f"Unassigned {role_label}"
                                  + (f" ({region})" if stage.routing == "regional" else ""),
            "assigned_user_id": assignee.id if assignee else None,
            "region": region if stage.routing == "regional" else "Global",
            "routing": stage.routing,
            "reason": reason,
            "is_required": required,
            "status": stage_status,
            "decision_notes": existing.decision_notes if existing else None,
            "decided_at": existing.decided_at.isoformat() if existing and existing.decided_at else None,
        })

    return {
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "proposal_version_id": version.id,
        "overall_discount_pct": metrics["effective_discount"],
        "max_line_discount_pct": metrics["max_line_discount"],
        "gross_margin_pct": None,
        "route_source": "admin_configuration",
        "net_total": metrics["net_total"],
        "currency": metrics["currency"],
        "region": region,
        "ceilings": {"line_pct": ceilings["line"], "proposal_pct": ceilings["proposal"],
                     "gm_floor_pct": ceilings["gm_floor"],
                     "test_effective_discount": metrics["test_effective_discount"]},
        "line_breaches": metrics["line_breaches"],
        "proposal_breaches": metrics["proposal_breaches"],
        "configuration_issues": metrics["configuration_issues"],
        "approval_stages": result_stages,
    }


def _stage_order(db: Session) -> Dict[str, int]:
    return {s.stage_code: i for i, s in enumerate(_active_workflow_stages(db))}


def _earlier_open_stage(db: Session, version_id: int, approval: Approval) -> Optional[Approval]:
    order = _stage_order(db)
    mine = order.get(approval.stage_code, 0)
    rows = db.execute(
        select(Approval).where(
            Approval.proposal_version_id == version_id,
            Approval.stage_code.isnot(None),
            Approval.status == "pending",
            Approval.id != approval.id,
        )
    ).scalars().all()
    earlier = [a for a in rows if order.get(a.stage_code, 0) < mine]
    return min(earlier, key=lambda a: order.get(a.stage_code, 0)) if earlier else None


def assert_can_submit(proposal_id: int, user_id: int, db: Session) -> None:
    from app.services.permission_service import assert_user_permission

    assert_user_permission(db, user_id, "proposal.submit")


def assert_can_decide(proposal_id: int, approval_id: int, user_id: int, db: Session) -> None:
    """The acting user needs the stage's approval permission and, for regional stages, the proposal's region."""
    from app.models.admin import ApprovalWorkflowStage
    from app.services.notification_service import proposal_region
    from app.services.permission_service import (
        STAGE_PERMISSION,
        PermissionDenied,
        assert_user_permission,
        user_role_codes,
    )

    approval = db.get(Approval, approval_id)
    if approval is None:
        return  # the decision call reports "not found"
    if approval.stage_code:
        assert_user_permission(db, user_id, STAGE_PERMISSION.get(approval.stage_code, "approval.final_l1"))
        stage = db.execute(
            select(ApprovalWorkflowStage).where(ApprovalWorkflowStage.stage_code == approval.stage_code)
        ).scalars().first()
        if stage is not None and stage.routing == "regional":
            user = db.get(User, user_id)
            proposal = get_proposal(db=db, proposal_id=proposal_id)
            region = proposal_region(proposal) if proposal else None
            user_region = (user.region or "").strip().lower() if user else ""
            if user_region not in ("", "global") and region and user_region != region.strip().lower():
                raise PermissionDenied(f"This approval belongs to region {region}; your region is {user.region}.")
    else:
        # Approvals created before Phase 2: the user must hold the assigned role.
        role = db.get(Role, approval.assigned_role_id)
        if role is not None and role.code not in user_role_codes(db, user_id):
            raise PermissionDenied(f"Only a user with the {role.name} role can decide this approval.")


def _fmt_money(value: float, currency: Optional[str]) -> str:
    return f"{currency} {value:,.2f}" if currency else f"{value:,.2f}"


def route_merge_fields(route: Dict[str, Any], actor_name: str) -> Dict[str, str]:
    """Email merge fields taken from an approval route (also used by the Admin template preview)."""
    ceilings = route.get("ceilings") or {}

    def pct(value: Any) -> str:
        return f"{float(value):g}" if value is not None else ""

    return {
        "actor": actor_name,
        "value": _fmt_money(float(route.get("net_total") or 0), route.get("currency")) if route.get("net_total") else "",
        "eff_disc": pct(route.get("overall_discount_pct") or 0),
        "threshold_line": pct(ceilings.get("line_pct")),
        "threshold_prop": pct(ceilings.get("proposal_pct")),
        "breach_lines": "\n".join(
            f"• {b['label']} — {b['discount_pct']:g}%" for b in route.get("line_breaches", [])
        ) or "(none)",
        "breach_prop": "\n".join(
            f"• {b['country']} {b['kind']} — {b['discount_pct']:g}%" for b in route.get("proposal_breaches", [])
        ) or "(none)",
    }


def _notify_submitted(db: Session, proposal: Proposal, route: Dict[str, Any], acting_user_id: Optional[int]) -> None:
    from app.services.notification_service import dispatch

    actor = db.get(User, acting_user_id) if acting_user_id else None
    stages = [s for s in route.get("approval_stages", []) if s.get("is_required")]
    base = route_merge_fields(route, actor.full_name if actor else "")
    if not any(s.get("stage_code") for s in stages):
        return  # legacy route: no Phase 2 notifications
    if route.get("line_breaches"):
        dispatch(db, "line_discount_breach", proposal, base)
    if route.get("proposal_breaches"):
        dispatch(db, "proposal_discount_breach", proposal, base)
    commercial = [s for s in stages if s.get("stage_code") in _COMMERCIAL_STAGES]
    if commercial:
        dispatch(db, "commercial_submitted", proposal, {**base, "stage": commercial[0]["stage_label"]})
    else:
        first_final = next((s for s in stages if s.get("stage_code") == "final_l1"), None)
        if first_final:
            dispatch(db, "final_l1_submitted", proposal, {**base, "stage": first_final["stage_label"]})


def _notify_decided(db: Session, proposal: Proposal, version: ProposalVersion, approval: Approval,
                    decision: str, notes: Optional[str], acting_user_id: Optional[int]) -> None:
    from app.services.notification_service import dispatch

    actor = db.get(User, acting_user_id) if acting_user_id else None
    labels = {s.stage_code: f"{s.label}{' · ' + s.sub_label if s.sub_label else ''}" for s in _active_workflow_stages(db)}
    base = {"actor": actor.full_name if actor else "", "decision": decision, "comment": notes or "",
            "stage": labels.get(approval.stage_code or "", "")}

    if decision == "rejected":
        dispatch(db, "proposal_returned", proposal, base)
        return
    if not approval.stage_code:
        if proposal.status == "approved":
            dispatch(db, "final_completed", proposal, base)
        return

    open_rows = db.execute(
        select(Approval).where(Approval.proposal_version_id == version.id, Approval.status == "pending",
                               Approval.stage_code.isnot(None))
    ).scalars().all()
    order = _stage_order(db)
    next_row = min(open_rows, key=lambda a: order.get(a.stage_code, 99)) if open_rows else None

    if approval.stage_code in _COMMERCIAL_STAGES:
        dispatch(db, "commercial_decision", proposal, base)
        if next_row is not None and next_row.stage_code == "final_l1":
            dispatch(db, "final_l1_submitted", proposal, {**base, "stage": labels.get("final_l1", "")})
    elif next_row is not None and next_row.stage_code in ("final_l2_legal", "final_l2_cfo"):
        dispatch(db, "final_l2", proposal, {**base, "stage": labels.get(next_row.stage_code, "")})
    if proposal.status == "approved":
        dispatch(db, "final_completed", proposal, base)
