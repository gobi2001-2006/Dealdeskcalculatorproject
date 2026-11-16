"""HubSpot Integration API Routes.

Exposes endpoints for:
- GET /api/integrations/hubspot/status
- GET /api/integrations/hubspot/deals (search/list deals)
- GET /api/integrations/hubspot/deals/{deal_id} (fetch deal details with company & contacts)
- POST /api/integrations/hubspot/import (populate proposal from deal)
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.hubspot_service import (
    HubSpotAuthenticationError,
    HubSpotIntegrationError,
    fetch_hubspot_deal,
    get_hubspot_provider,
    get_proposal_hubspot_sync_status,
    import_deal_to_proposal,
    is_hubspot_configured,
    search_hubspot_deals,
)

router = APIRouter()


class HubSpotStatusResponse(BaseModel):
    configured: bool
    is_mock: bool = False
    mode: str = "mock"
    message: str


class HubSpotDealImportRequest(BaseModel):
    hubspot_deal_id: str = Field(..., description="HubSpot Deal ID")
    proposal_id: Optional[int] = None
    deal_name: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = "INR"
    close_date: Optional[str] = None
    country: Optional[str] = "India"
    region: Optional[str] = "APAC"
    sub_region: Optional[str] = None
    products: Optional[List[str]] = Field(default_factory=list)
    product_family_ids: Optional[List[int]] = Field(default_factory=list)
    company: Optional[Dict[str, Any]] = Field(default_factory=dict)
    contacts: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    acting_user_id: Optional[int] = 1


@router.get(
    "/status",
    response_model=HubSpotStatusResponse,
    summary="Check HubSpot CRM configuration status",
)
def get_hubspot_status():
    """Returns whether HubSpot credentials (HUBSPOT_ACCESS_TOKEN) are configured or running in development mock mode."""
    configured = is_hubspot_configured()
    if configured:
        msg = "HubSpot CRM integration is active with live CRM credentials."
        mode = "real"
        is_mock = False
    else:
        msg = "Running in Development Mock CRM mode with sample data (e.g., Amazon, Standard Chartered). Set HUBSPOT_ACCESS_TOKEN in backend environment to activate live HubSpot CRM v3 API."
        mode = "mock"
        is_mock = True
    return HubSpotStatusResponse(configured=configured, is_mock=is_mock, mode=mode, message=msg)


@router.get(
    "/deals",
    summary="Search or list eligible deals from HubSpot CRM",
)
def list_deals(
    query: Optional[str] = Query(default="", description="Search query by deal name or ID"),
    demo: Optional[bool] = Query(default=None, description="Force demo mode"),
):
    """Search deals in HubSpot (or Development Mock CRM when unconfigured or in demo mode)."""
    configured = is_hubspot_configured() and not demo
    try:
        if configured:
            deals = search_hubspot_deals(query or "")
        else:
            from app.services.hubspot_service import MockHubSpotProvider
            provider = MockHubSpotProvider()
            deals = provider.search_deals(query or "")
        return {
            "configured": configured,
            "is_mock": not configured,
            "mode": "real" if configured else "mock",
            "deals": deals,
            "count": len(deals),
        }
    except HubSpotAuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except HubSpotIntegrationError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to search deals: {exc}")


@router.get(
    "/deals/{deal_id}",
    summary="Fetch complete HubSpot deal details including company and contacts",
)
def get_deal_details(
    deal_id: str,
    demo: Optional[bool] = Query(default=None, description="Force demo mode"),
):
    """Retrieve deal, associated company, and associated contacts from HubSpot CRM (or Development Mock CRM)."""
    configured = is_hubspot_configured() and not demo
    try:
        if configured:
            deal = fetch_hubspot_deal(deal_id)
        else:
            from app.services.hubspot_service import MockHubSpotProvider
            provider = MockHubSpotProvider()
            deal = provider.fetch_deal(deal_id)
        return deal
    except HubSpotAuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except HubSpotIntegrationError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to fetch deal {deal_id}: {exc}")


@router.get(
    "/proposals/{proposal_id}",
    summary="Get imported HubSpot deal status for proposal",
)
def get_proposal_hubspot(
    proposal_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve imported HubSpot deal details and contacts linked to an existing proposal."""
    try:
        return get_proposal_hubspot_sync_status(db=db, proposal_id=proposal_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to check proposal sync status: {exc}")


@router.post(
    "/import",
    summary="Confirm & Populate Proposal from HubSpot Deal",
)
def import_deal(
    payload: HubSpotDealImportRequest,
    db: Session = Depends(get_db),
):
    """Idempotently import deal into Customer, Deal, Proposal, ProposalCountry, and ProposalContacts."""
    try:
        deal_dict = payload.model_dump()
        result = import_deal_to_proposal(
            db=db,
            deal_payload=deal_dict,
            acting_user_id=payload.acting_user_id or 1,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Import failed: {exc}")
