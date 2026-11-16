# backend/app/api/routes/proposals.py
"""Proposal Management API (Phase C) + Pricing Calculation Engine (Phase D).

Implements proposal endpoints:
- GET /api/proposals
- POST /api/proposals
- GET /api/proposals/{proposal_id}
- PATCH /api/proposals/{proposal_id}
- POST /api/proposals/{proposal_id}/countries
- POST /api/proposals/{proposal_id}/line-items
- PATCH /api/proposals/{proposal_id}/line-items/{line_item_id}
- DELETE /api/proposals/{proposal_id}/line-items/{line_item_id}
- POST /api/proposals/{proposal_id}/service-lines
- POST /api/proposals/{proposal_id}/calculate
- GET /api/proposals/{proposal_id}/calculations/latest
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Path, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.permission_service import get_acting_user_id
from app.schemas.proposals import (
    BasePricingRequest,
    CalculationRequest,
    ProposalCalculationResponse,
    ProposalCountryCreate,
    ProposalCountryResponse,
    ProposalCountryUpdate,
    ProposalCreate,
    ProposalDetailResponse,
    ProposalLineItemCreate,
    ProposalLineItemResponse,
    ProposalLineItemUpdate,
    ProposalResponse,
    ProposalServiceLineCreate,
    ProposalServiceLineResponse,
    ProposalServiceLineUpdate,
    ProposalUpdate,
)
from app.api.errors import DOMAIN_ERRORS, http_error
from app.services.proposal_service import (
    DealNotFoundError,
    LifecycleStateError,
    ProposalConflictError,
    ProposalNotFoundError,
    ProposalValidationError,
    ResourceNotFoundError,
    add_proposal_country,
    add_proposal_line_item,
    add_proposal_service_line,
    create_proposal,
    delete_proposal_country,
    delete_proposal_line_item,
    delete_proposal_service_line,
    get_proposal,
    list_proposals,
    update_proposal,
    update_proposal_country,
    update_proposal_line_item,
    update_proposal_service_line,
)
from app.services.pricing_engine import (
    AmbiguousRateCardMatchError,
    ContractTermConflictError,
    InvalidDiscountError,
    MissingCatalogueReferenceError,
    MissingConfigurationError,
    MissingFxRateError,
    MissingRateCardMatchError,
    MissingServiceRateError,
    PricingCalculationEngine,
    PricingCalculationError,
    ProposalNotFoundError as PricingProposalNotFoundError,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# 1. List proposals
# ---------------------------------------------------------------------------
@router.get(
    "/",
    response_model=List[ProposalResponse],
    summary="List proposals with pagination and filters",
)
def list_proposals_endpoint(
    *,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records to return"),
    search: Optional[str] = Query(
        None,
        description="Search by proposal code (case-insensitive partial match)",
    ),
    deal_id: Optional[int] = Query(None, description="Filter by deal ID"),
    customer_id: Optional[int] = Query(None, description="Filter by customer ID"),
    status: Optional[str] = Query(None, description="Filter by proposal status"),
    created_by_user_id: Optional[int] = Query(None, description="Filter by creator user ID"),
    currency_id: Optional[int] = Query(None, description="Filter by currency ID"),
):
    return list_proposals(
        db=db,
        skip=skip,
        limit=limit,
        search=search,
        deal_id=deal_id,
        customer_id=customer_id,
        status=status,
        created_by_user_id=created_by_user_id,
        currency_id=currency_id,
    )


# ---------------------------------------------------------------------------
# 2. Create proposal
# ---------------------------------------------------------------------------
@router.post(
    "/",
    response_model=ProposalDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new commercial proposal",
)
def create_proposal_endpoint(
    *,
    db: Session = Depends(get_db),
    payload: ProposalCreate,
):
    try:
        return create_proposal(db=db, data=payload)
    except DealNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ProposalConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ProposalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# 3. Retrieve proposal details
# ---------------------------------------------------------------------------
@router.get(
    "/{proposal_id}",
    response_model=ProposalDetailResponse,
    summary="Get proposal details by ID",
)
def get_proposal_endpoint(
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
):
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proposal with id {proposal_id} not found",
        )
    return proposal


# ---------------------------------------------------------------------------
# 4. Partially update proposal
# ---------------------------------------------------------------------------
@router.patch(
    "/{proposal_id}",
    response_model=ProposalResponse,
    summary="Partially update proposal fields",
)
def update_proposal_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
    payload: ProposalUpdate,
):
    proposal = get_proposal(db=db, proposal_id=proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proposal with id {proposal_id} not found",
        )
    try:
        return update_proposal(db=db, proposal=proposal, data=payload)
    except DealNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ProposalConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except LifecycleStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ProposalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# 5. Add country to proposal
# ---------------------------------------------------------------------------
@router.post(
    "/{proposal_id}/countries",
    response_model=ProposalCountryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a deployment country to proposal",
)
def add_proposal_country_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
    payload: ProposalCountryCreate,
):
    try:
        # Default payload proposal_id from path
        if payload.proposal_id is None:
            payload.proposal_id = proposal_id
        elif payload.proposal_id != proposal_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payload proposal_id {payload.proposal_id} does not match URL path {proposal_id}",
            )
        return add_proposal_country(db=db, proposal_id=proposal_id, data=payload)
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ProposalConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except LifecycleStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ProposalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except HTTPException:
        raise


# ---------------------------------------------------------------------------
# 6. Add line item to proposal
# ---------------------------------------------------------------------------
@router.post(
    "/{proposal_id}/line-items",
    response_model=ProposalLineItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a product, feature or pack line item to proposal",
)
def add_proposal_line_item_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
    payload: ProposalLineItemCreate,
):
    try:
        return add_proposal_line_item(db=db, proposal_id=proposal_id, data=payload)
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except LifecycleStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ProposalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except ProposalConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


# ---------------------------------------------------------------------------
# 7. Update proposal line item
# ---------------------------------------------------------------------------
@router.patch(
    "/{proposal_id}/line-items/{line_item_id}",
    response_model=ProposalLineItemResponse,
    summary="Update permitted proposal line item fields",
)
def update_proposal_line_item_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    line_item_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
    payload: ProposalLineItemUpdate,
):
    try:
        return update_proposal_line_item(
            db=db,
            proposal_id=proposal_id,
            line_item_id=line_item_id,
            data=payload,
        )
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except LifecycleStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ProposalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except ProposalConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


# ---------------------------------------------------------------------------
# 8. Delete proposal line item
# ---------------------------------------------------------------------------
@router.delete(
    "/{proposal_id}/line-items/{line_item_id}",
    summary="Remove a line item from proposal",
)
def delete_proposal_line_item_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    line_item_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
):
    try:
        delete_proposal_line_item(
            db=db,
            proposal_id=proposal_id,
            line_item_id=line_item_id,
        )
        return {
            "detail": "Line item deleted successfully",
            "proposal_id": proposal_id,
            "line_item_id": line_item_id,
        }
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except LifecycleStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ProposalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# 9. Add service line to proposal
# ---------------------------------------------------------------------------
@router.post(
    "/{proposal_id}/service-lines",
    response_model=ProposalServiceLineResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a professional service line to proposal",
)
def add_proposal_service_line_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
    payload: ProposalServiceLineCreate,
):
    try:
        return add_proposal_service_line(
            db=db,
            proposal_id=proposal_id,
            data=payload,
        )
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except LifecycleStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ProposalValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except ProposalConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


# ---------------------------------------------------------------------------
# 9b. Update / remove country blocks and service lines (draft only).
# Without these, edits made in the configurator after the first save could not
# be persisted and the calculation silently priced the old values.
# ---------------------------------------------------------------------------
@router.patch(
    "/{proposal_id}/countries/{proposal_country_id}",
    response_model=ProposalCountryResponse,
    summary="Update a proposal country block (draft only)",
)
def update_proposal_country_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    proposal_country_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
    payload: ProposalCountryUpdate,
):
    try:
        return update_proposal_country(
            db=db, proposal_id=proposal_id, proposal_country_id=proposal_country_id, data=payload
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete(
    "/{proposal_id}/countries/{proposal_country_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a proposal country block (draft only)",
)
def delete_proposal_country_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    proposal_country_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
):
    try:
        delete_proposal_country(db=db, proposal_id=proposal_id, proposal_country_id=proposal_country_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.patch(
    "/{proposal_id}/service-lines/{service_line_id}",
    response_model=ProposalServiceLineResponse,
    summary="Update a professional service line (draft only)",
)
def update_proposal_service_line_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    service_line_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
    payload: ProposalServiceLineUpdate,
):
    try:
        return update_proposal_service_line(
            db=db, proposal_id=proposal_id, service_line_id=service_line_id, data=payload
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete(
    "/{proposal_id}/service-lines/{service_line_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a professional service line (draft only)",
)
def delete_proposal_service_line_endpoint(
    *,
    proposal_id: int = Path(..., gt=0),
    service_line_id: int = Path(..., gt=0),
    db: Session = Depends(get_db),
):
    try:
        delete_proposal_service_line(db=db, proposal_id=proposal_id, service_line_id=service_line_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


def _run_pricing(call):
    """Run an engine call and map engine errors to HTTP errors (shared by both pricing endpoints)."""
    try:
        return call()
    except ContractTermConflictError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except (PricingProposalNotFoundError, ProposalNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except MissingCatalogueReferenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Catalogue reference error: {exc}",
        )
    except MissingRateCardMatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Rate card lookup failed: {exc}",
        )
    except AmbiguousRateCardMatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Ambiguous rate card match: {exc}",
        )
    except MissingServiceRateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Service rate lookup failed: {exc}",
        )
    except MissingFxRateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"FX rate not found: {exc}",
        )
    except InvalidDiscountError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except MissingConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Configuration error: {exc}",
        )
    except PricingCalculationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Calculation error: {exc}",
        )


# ---------------------------------------------------------------------------
# 10. Trigger pricing calculation (Phase D)
# ---------------------------------------------------------------------------
@router.post(
    "/{proposal_id}/calculate",
    response_model=ProposalCalculationResponse,
    status_code=status.HTTP_200_OK,
    summary="Calculate pricing for a proposal and persist audit snapshot",
    description=(
        "Executes a full deterministic commercial calculation using the PDF-specified "
        "formulas. Persists an immutable CalculationSnapshot (JSONB) and returns the "
        "complete itemised result including all product, subscription, service, and FX "
        "conversion breakdowns. Each call to this endpoint appends a new snapshot row "
        "— existing snapshots are never mutated."
    ),
)
def calculate_proposal_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
    payload: CalculationRequest,
):
    """POST /api/proposals/{proposal_id}/calculate"""
    engine = PricingCalculationEngine(db=db)
    return _run_pricing(lambda: engine.calculate_proposal(
        proposal_id=proposal_id,
        version_id=payload.version_id,
        product_discounts=payload.product_subscription_discounts or {},
        product_service_discounts=payload.product_service_discounts or {},
        default_hours_per_day=payload.default_hours_per_day,
        user_id=payload.calculated_by_user_id,
        contract_term_months=payload.contract_term_months,
    ))


@router.post(
    "/{proposal_id}/calculate/base",
    response_model=ProposalCalculationResponse,
    status_code=status.HTTP_200_OK,
    summary="Base (undiscounted) pricing for the Proposal Configurator; nothing is saved",
    description=(
        "Same formulas and rate cards as /calculate, without any line, country or request discount. "
        "No snapshot is written and cached line amounts are not touched. Discounts are configured and "
        "applied on Pricing & Discounts (POST /calculate)."
    ),
)
def calculate_base_pricing_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
    payload: BasePricingRequest,
):
    """POST /api/proposals/{proposal_id}/calculate/base"""
    engine = PricingCalculationEngine(db=db)
    return _run_pricing(lambda: engine.calculate_base_pricing(
        proposal_id=proposal_id,
        version_id=payload.version_id,
        default_hours_per_day=payload.default_hours_per_day,
        contract_term_months=payload.contract_term_months,
    ))


# ---------------------------------------------------------------------------
# 11. Retrieve latest calculation snapshot (Phase D)
# ---------------------------------------------------------------------------
@router.get(
    "/{proposal_id}/calculations/latest",
    response_model=ProposalCalculationResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve the latest pricing calculation snapshot",
    description=(
        "Returns the most recently persisted CalculationSnapshot for the proposal "
        "without triggering a new recalculation. Returns HTTP 404 if no calculation "
        "has been run yet."
    ),
)
def get_latest_calculation_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/calculations/latest"""
    engine = PricingCalculationEngine(db=db)
    try:
        result = engine.get_latest_calculation(proposal_id=proposal_id)
        return result
    except (PricingProposalNotFoundError, ProposalNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PricingCalculationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )


# ---------------------------------------------------------------------------
# 12. Export Proposal with Final Calculated Values
# ---------------------------------------------------------------------------
@router.get(
    "/{proposal_id}/export",
    status_code=status.HTTP_200_OK,
    summary="Export Proposal Document with Final Calculated Commercials",
    description=(
        "Exports the official proposal document (.docx) or PDF report (.pdf) populated "
        "with final calculated commercial values from the authoritative CalculationSnapshot. "
        "Rejects stale snapshots with HTTP 409 and uncalculated proposals with HTTP 404."
    ),
)
def export_proposal_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    format: str = Query("docx", description="Export format: 'docx' or 'pdf'"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/export?format=docx|pdf"""
    from app.services.proposal_export_service import (
        IncompleteCommercialError,
        NoCalculationSnapshotError,
        StaleCalculationSnapshotError,
        extract_proposal_export_data,
        generate_proposal_docx,
        generate_proposal_pdf,
    )

    fmt = (format or "docx").strip().lower()
    if fmt not in ("docx", "pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported export format '{format}'. Supported formats: docx, pdf",
        )

    try:
        # Validate data extraction first
        data = extract_proposal_export_data(proposal_id=proposal_id, db=db)
        code = data["proposal_code"].replace(" ", "_")

        if fmt == "pdf":
            stream = generate_proposal_pdf(proposal_id=proposal_id, db=db, _preloaded_data=data)
            media_type = "application/pdf"
            filename = f"Proposal_{code}.pdf"
        else:
            stream = generate_proposal_docx(proposal_id=proposal_id, db=db, _preloaded_data=data)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = f"Proposal_{code}.docx"

        return Response(
            content=stream.getvalue(),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except NoCalculationSnapshotError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except StaleCalculationSnapshotError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except IncompleteCommercialError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Proposal document generation failed: {exc}",
        )


@router.get(
    "/{proposal_id}/export/commercials",
    status_code=status.HTTP_200_OK,
    summary="Get Extracted Commercial Values for Proposal Export",
    description=(
        "Returns the structured commercial figures extracted from the latest snapshot "
        "matching the Proposal Summary screen and export document."
    ),
)
def get_proposal_commercials_for_export_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/export/commercials"""
    from app.services.proposal_export_service import (
        IncompleteCommercialError,
        NoCalculationSnapshotError,
        StaleCalculationSnapshotError,
        extract_proposal_export_data,
    )
    try:
        return extract_proposal_export_data(proposal_id=proposal_id, db=db)
    except ProposalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except NoCalculationSnapshotError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except StaleCalculationSnapshotError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except IncompleteCommercialError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


# =============================================================================
# Proposal Workflow, Narrative Content, Readiness & Governance Approvals
# =============================================================================

@router.get(
    "/{proposal_id}/content",
    summary="Get Proposal Narrative Content Sections",
)
def get_proposal_content_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/content"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        get_proposal_content_sections,
    )
    try:
        return get_proposal_content_sections(proposal_id=proposal_id, db=db)
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.put(
    "/{proposal_id}/content",
    summary="Update Proposal Narrative Content Sections",
)
def update_proposal_content_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    payload: dict,
    db: Session = Depends(get_db),
):
    """PUT /api/proposals/{proposal_id}/content"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        upsert_proposal_content_sections,
    )
    try:
        sections = payload.get("sections", payload)
        return upsert_proposal_content_sections(proposal_id=proposal_id, sections=sections, db=db)
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post(
    "/{proposal_id}/attachments",
    summary="Upload Fitment Document Attachment",
    status_code=status.HTTP_201_CREATED,
)
async def upload_proposal_attachment_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """POST /api/proposals/{proposal_id}/attachments"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        save_proposal_attachment,
    )
    try:
        content_bytes = await file.read()
        return save_proposal_attachment(
            proposal_id=proposal_id,
            filename=file.filename,
            content_bytes=content_bytes,
            mime_type=file.content_type,
            db=db,
        )
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get(
    "/{proposal_id}/attachments",
    summary="List Proposal Fitment Attachments",
)
def list_proposal_attachments_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/attachments"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        get_proposal_attachments,
    )
    try:
        return get_proposal_attachments(proposal_id=proposal_id, db=db)
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get(
    "/{proposal_id}/attachments/{document_id}",
    summary="Download Proposal Fitment Attachment",
)
def download_proposal_attachment_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    document_id: int = Path(..., gt=0, description="Attachment document ID"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/attachments/{document_id}"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        get_attachment_file,
    )
    import os
    try:
        doc = get_attachment_file(proposal_id=proposal_id, document_id=document_id, db=db)
        if not os.path.exists(doc.storage_path):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file not found on disk.")
        return FileResponse(
            path=doc.storage_path,
            filename=doc.file_name,
            media_type=doc.mime_type or "application/octet-stream",
        )
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.delete(
    "/{proposal_id}/attachments/{document_id}",
    summary="Delete Proposal Fitment Attachment",
)
def delete_proposal_attachment_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    document_id: int = Path(..., gt=0, description="Attachment document ID"),
    db: Session = Depends(get_db),
):
    """DELETE /api/proposals/{proposal_id}/attachments/{document_id}"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        delete_proposal_attachment,
    )
    try:
        return delete_proposal_attachment(proposal_id=proposal_id, document_id=document_id, db=db)
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get(
    "/{proposal_id}/readiness",
    summary="Check Proposal Readiness for Submission",
)
def get_proposal_readiness_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/readiness"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        evaluate_proposal_readiness,
    )
    try:
        return evaluate_proposal_readiness(proposal_id=proposal_id, db=db)
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get(
    "/{proposal_id}/approval-route",
    summary="Get Evaluated Governance Approval Route",
)
def get_proposal_approval_route_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/approval-route"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        evaluate_proposal_approval_route,
    )
    try:
        return evaluate_proposal_approval_route(proposal_id=proposal_id, db=db)
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post(
    "/{proposal_id}/submit",
    summary="Submit Proposal for Governance Approval",
)
def submit_proposal_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    payload: dict = {},
    header_user_id: Optional[int] = Depends(get_acting_user_id),
    db: Session = Depends(get_db),
):
    """POST /api/proposals/{proposal_id}/submit

    Phase 2: when the X-User-Id header is sent, that user is the actor and must hold
    'proposal.submit'. Without the header the previous behaviour (payload acting_user_id) is kept.
    """
    from app.services.permission_service import PermissionDenied
    from app.services.proposal_workflow_service import (
        ProposalNotReadyError,
        ProposalWorkflowError,
        assert_can_submit,
        submit_proposal_for_approval,
    )
    if header_user_id is not None:
        try:
            assert_can_submit(proposal_id, header_user_id, db)
        except PermissionDenied as exc:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    try:
        acting_user_id = header_user_id or payload.get("acting_user_id", 1)
        notes = payload.get("notes", "")
        return submit_proposal_for_approval(
            proposal_id=proposal_id,
            acting_user_id=acting_user_id,
            notes=notes,
            db=db,
        )
    except ProposalNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": str(exc), "missing_items": exc.missing_items},
        )
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get(
    "/{proposal_id}/activity",
    summary="Get Proposal Activity and Audit History",
)
def get_proposal_activity_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    db: Session = Depends(get_db),
):
    """GET /api/proposals/{proposal_id}/activity"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        get_proposal_activity,
    )
    try:
        return get_proposal_activity(proposal_id=proposal_id, db=db)
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post(
    "/{proposal_id}/approvals/{approval_id}/decision",
    summary="Record Governance Approval Decision (Approve / Reject)",
)
def record_approval_decision_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    approval_id: int = Path(..., gt=0, description="Approval primary key"),
    payload: dict = {},
    header_user_id: Optional[int] = Depends(get_acting_user_id),
    db: Session = Depends(get_db),
):
    """POST /api/proposals/{proposal_id}/approvals/{approval_id}/decision

    Phase 2: when the X-User-Id header is sent, that user must hold the stage's approval
    permission (and, for regional stages, belong to the proposal's region).
    """
    from app.services.permission_service import PermissionDenied
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        assert_can_decide,
        decide_proposal_approval,
    )
    if header_user_id is not None:
        try:
            assert_can_decide(proposal_id, approval_id, header_user_id, db)
        except PermissionDenied as exc:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    try:
        decision = payload.get("decision", "approved")
        notes = payload.get("notes", "")
        acting_user_id = header_user_id or payload.get("acting_user_id", 1)
        return decide_proposal_approval(
            proposal_id=proposal_id,
            approval_id=approval_id,
            decision=decision,
            notes=notes,
            acting_user_id=acting_user_id,
            db=db,
        )
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post(
    "/{proposal_id}/recall",
    summary="Recall Submitted Proposal Back to Draft",
)
def recall_proposal_endpoint(
    *,
    proposal_id: int = Path(..., gt=0, description="Proposal primary key"),
    payload: dict = {},
    db: Session = Depends(get_db),
):
    """POST /api/proposals/{proposal_id}/recall"""
    from app.services.proposal_workflow_service import (
        ProposalWorkflowError,
        recall_proposal_submission,
    )
    try:
        reason = payload.get("reason", "Recalled by author")
        acting_user_id = payload.get("acting_user_id", 1)
        return recall_proposal_submission(
            proposal_id=proposal_id,
            acting_user_id=acting_user_id,
            reason=reason,
            db=db,
        )
    except ProposalWorkflowError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

