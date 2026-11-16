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

    currency_code = proposal.currency.code if proposal.currency else "USD"
    currency_symbol = proposal.currency.symbol if proposal.currency else "$"

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
    gross_margin = 0.0

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

        gross_margin = float(
            payload.get("effective_gross_margin_pct")
            or payload.get("gross_margin_pct")
            or 65.0
        )

    # Max line discount
    max_line_discount = 0.0
    for item in version.line_items:
        if item.discount_pct and float(item.discount_pct) > max_line_discount:
            max_line_discount = float(item.discount_pct)

    # 4. Read DB Configured Thresholds
    today = date.today()
    configured_thresholds = db.execute(
        select(ApprovalThreshold).where(
            ApprovalThreshold.status == "active",
            ApprovalThreshold.valid_from <= today,
            or_(ApprovalThreshold.valid_to.is_(None), ApprovalThreshold.valid_to >= today),
        )
    ).scalars().all()

    # Determine ceilings from DB or baseline fallback
    line_thresholds = [t for t in configured_thresholds if t.threshold_type == "line_discount"]
    overall_thresholds = [t for t in configured_thresholds if t.threshold_type == "overall_discount"]
    gm_thresholds = [t for t in configured_thresholds if t.threshold_type == "gm_floor"]

    line_ceiling = float(min(t.value_pct for t in line_thresholds)) if line_thresholds else 15.0
    overall_ceiling = float(min(t.value_pct for t in overall_thresholds)) if overall_thresholds else 10.0
    gm_floor = float(max(t.value_pct for t in gm_thresholds)) if gm_thresholds else 50.0

    line_approver_role = (
        line_thresholds[0].approver_role.name if line_thresholds and line_thresholds[0].approver_role else "Pricing Desk"
    )
    overall_approver_role = (
        overall_thresholds[0].approver_role.name if overall_thresholds and overall_thresholds[0].approver_role else "Pricing Desk"
    )
    gm_approver_role = (
        gm_thresholds[0].approver_role.name if gm_thresholds and gm_thresholds[0].approver_role else "Business Head"
    )

    breaches_list = []
    if max_line_discount > line_ceiling:
        breaches_list.append(
            f"Line item discount of {max_line_discount:.1f}% exceeds policy ceiling of {line_ceiling:.1f}% (Requires {line_approver_role} approval)"
        )
    if overall_discount > overall_ceiling:
        breaches_list.append(
            f"Overall proposal discount of {overall_discount:.1f}% exceeds policy ceiling of {overall_ceiling:.1f}% (Requires {overall_approver_role} approval)"
        )
    if snapshot_ready and net_total > 0 and gross_margin < gm_floor:
        breaches_list.append(
            f"Gross Margin of {gross_margin:.1f}% is below policy threshold floor of {gm_floor:.1f}% (Requires {gm_approver_role} approval)"
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
            "is_breached": max_line_discount > line_ceiling,
            "required_role": line_approver_role,
        },
        "proposal_level": {
            "policy_name": "Proposal-Level Discount Policy",
            "actual_pct": overall_discount,
            "ceiling_pct": overall_ceiling,
            "is_breached": overall_discount > overall_ceiling,
            "required_role": overall_approver_role,
        },
        "gm_floor": {
            "policy_name": "Gross Margin Floor Policy",
            "actual_pct": gross_margin,
            "floor_pct": gm_floor,
            "is_breached": gross_margin < gm_floor and (snapshot_ready and net_total > 0),
            "required_role": gm_approver_role,
        },
        "breaches_count": breaches_count,
        "breaches": breaches_list,
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

    # 1. Existing approval records
    existing_approvals = {
        app.assigned_role_id: app
        for app in db.execute(
            select(Approval).where(Approval.proposal_version_id == version.id)
        ).scalars().all()
    }

    # 2. Calculation Snapshot metrics
    latest_snapshot = db.execute(
        select(CalculationSnapshot)
        .where(CalculationSnapshot.proposal_version_id == version.id)
        .order_by(CalculationSnapshot.id.desc())
    ).scalars().first()

    payload = latest_snapshot.snapshot_payload if latest_snapshot else {}
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
    if gross_total > 0 and gross_total >= net_total:
        overall_discount = round(((gross_total - net_total) / gross_total) * 100, 2)
    else:
        overall_discount = float(payload.get("overall_discount_pct") or 0.0)

    gross_margin = float(
        payload.get("effective_gross_margin_pct")
        or payload.get("gross_margin_pct")
        or 65.0
    )

    max_line_discount = 0.0
    for item in version.line_items:
        if item.discount_pct and float(item.discount_pct) > max_line_discount:
            max_line_discount = float(item.discount_pct)

    # 3. Read DB roles & thresholds
    roles = {r.code: r for r in db.execute(select(Role)).scalars().all()}
    today = date.today()
    configured_thresholds = db.execute(
        select(ApprovalThreshold).where(
            ApprovalThreshold.status == "active",
            ApprovalThreshold.valid_from <= today,
            or_(ApprovalThreshold.valid_to.is_(None), ApprovalThreshold.valid_to >= today),
        )
    ).scalars().all()

    line_thresholds = [t for t in configured_thresholds if t.threshold_type == "line_discount"]
    overall_thresholds = [t for t in configured_thresholds if t.threshold_type == "overall_discount"]
    gm_thresholds = [t for t in configured_thresholds if t.threshold_type == "gm_floor"]

    line_ceiling = float(min(t.value_pct for t in line_thresholds)) if line_thresholds else 15.0
    overall_ceiling = float(min(t.value_pct for t in overall_thresholds)) if overall_thresholds else 10.0
    gm_floor = float(max(t.value_pct for t in gm_thresholds)) if gm_thresholds else 50.0

    # Primary region
    region = "Global"
    if proposal.countries:
        primary_c = next((c for c in proposal.countries if c.is_primary_deployment), proposal.countries[0])
        if primary_c and primary_c.country:
            region = primary_c.country.region or "Global"
    elif proposal.deal and getattr(proposal.deal, "region", None):
        region = proposal.deal.region

    stages = []

    # Level 1: Presales / Sales Lead
    lead_role = roles.get("sales_lead") or roles.get("presales") or roles.get("admin")
    if lead_role:
        existing = existing_approvals.get(lead_role.id)
        assigned_u = _find_assigned_user_for_role(lead_role.id, region, db)
        assigned_name = (
            assigned_u.full_name
            if assigned_u
            else (proposal.created_by_user.full_name if proposal.created_by_user else "Sales Lead")
        )
        stages.append({
            "stage_level": 1,
            "role_id": lead_role.id,
            "role_code": lead_role.code,
            "role_name": lead_role.name,
            "assigned_user_name": assigned_name,
            "region": region,
            "reason": "Standard Commercial & Technical Review Gate",
            "is_required": True,
            "status": existing.status if existing else ("pending" if version.status == "under_review" else "pending_submission"),
            "decision_notes": existing.decision_notes if existing else None,
            "decided_at": existing.decided_at.isoformat() if existing and existing.decided_at else None,
        })

    # Level 2: Pricing Desk
    pd_role = roles.get("pricing_desk")
    if pd_role:
        pd_required = overall_discount > overall_ceiling or max_line_discount > line_ceiling or len(configured_thresholds) > 0
        existing = existing_approvals.get(pd_role.id)
        assigned_u = _find_assigned_user_for_role(pd_role.id, None, db)
        stages.append({
            "stage_level": 2,
            "role_id": pd_role.id,
            "role_code": pd_role.code,
            "role_name": pd_role.name,
            "assigned_user_name": assigned_u.full_name if assigned_u else "Pricing Desk Analyst",
            "region": "Global",
            "reason": (
                f"Discount Review (Overall: {overall_discount:.1f}%, Max Line: {max_line_discount:.1f}%)"
                if pd_required
                else "Discounts within standard policy limits"
            ),
            "is_required": pd_required,
            "status": (
                existing.status
                if existing
                else (
                    "pending"
                    if pd_required and version.status == "under_review"
                    else "not_required"
                    if not pd_required
                    else "pending_submission"
                )
            ),
            "decision_notes": existing.decision_notes if existing else None,
            "decided_at": existing.decided_at.isoformat() if existing and existing.decided_at else None,
        })

    # Level 3: Business Head (Regional Governance)
    bh_role = roles.get("business_head")
    if bh_role:
        bh_required = overall_discount > 15.0 or gross_margin < gm_floor or True  # Standard regional oversight
        existing = existing_approvals.get(bh_role.id)
        assigned_u = _find_assigned_user_for_role(bh_role.id, region, db)
        stages.append({
            "stage_level": 3,
            "role_id": bh_role.id,
            "role_code": bh_role.code,
            "role_name": f"Business Head ({region})",
            "assigned_user_name": assigned_u.full_name if assigned_u else f"Regional Business Head ({region})",
            "region": region,
            "reason": f"Regional Business Head Signoff for {region} territory",
            "is_required": bh_required,
            "status": (
                existing.status
                if existing
                else ("pending" if version.status == "under_review" else "pending_submission")
            ),
            "decision_notes": existing.decision_notes if existing else None,
            "decided_at": existing.decided_at.isoformat() if existing and existing.decided_at else None,
        })

    # Level 4: Chief Financial Officer (CFO)
    cfo_role = roles.get("cfo")
    if cfo_role:
        cfo_required = overall_discount > 25.0 or gross_margin < 35.0
        existing = existing_approvals.get(cfo_role.id)
        assigned_u = _find_assigned_user_for_role(cfo_role.id, None, db)
        stages.append({
            "stage_level": 4,
            "role_id": cfo_role.id,
            "role_code": cfo_role.code,
            "role_name": cfo_role.name,
            "assigned_user_name": assigned_u.full_name if assigned_u else "Chief Financial Officer",
            "region": "Global",
            "reason": (
                f"Executive Margin & Discount Exception (Overall: {overall_discount:.1f}%, GM: {gross_margin:.1f}%)"
                if cfo_required
                else "Standard margins - CFO review not triggered"
            ),
            "is_required": cfo_required,
            "status": (
                existing.status
                if existing
                else (
                    "pending"
                    if cfo_required and version.status == "under_review"
                    else "not_required"
                    if not cfo_required
                    else "pending_submission"
                )
            ),
            "decision_notes": existing.decision_notes if existing else None,
            "decided_at": existing.decided_at.isoformat() if existing and existing.decided_at else None,
        })

    return {
        "proposal_id": proposal.id,
        "proposal_code": proposal.code,
        "proposal_version_id": version.id,
        "overall_discount_pct": overall_discount,
        "max_line_discount_pct": max_line_discount,
        "gross_margin_pct": gross_margin,
        "approval_stages": stages,
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

    # 2. Compute dynamic route
    route = evaluate_proposal_approval_route(proposal_id=proposal_id, db=db)

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

    for stage in route["approval_stages"]:
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
        if all(a.status == "approved" for a in all_approvals):
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

