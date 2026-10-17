# backend/app/api/routes/deals.py
"""Deal Management API (Phase B)."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.errors import DOMAIN_ERRORS, http_error
from app.db.session import get_db
from app.schemas.proposals import (
    DealCreate,
    DealResponse,
    DealUpdate,
)
from app.services.deal_service import (
    create_deal,
    get_deal,
    list_deals,
    update_deal,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# List deals
# ---------------------------------------------------------------------------
@router.get("/", response_model=List[DealResponse])
def list_deals_endpoint(
    *,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records to return"),
    search: Optional[str] = Query(
        None,
        description="Search by code or name (case-insensitive partial match)",
    ),
    customer_id: Optional[int] = Query(None, description="Filter by customer ID"),
    status: Optional[str] = Query(None, description="Filter by deal status"),
    owner_user_id: Optional[int] = Query(None, description="Filter by owner user ID"),
):
    return list_deals(
        db=db,
        skip=skip,
        limit=limit,
        search=search,
        customer_id=customer_id,
        status=status,
        owner_user_id=owner_user_id,
    )


# ---------------------------------------------------------------------------
# Create a new deal
# ---------------------------------------------------------------------------
@router.post("/", response_model=DealResponse, status_code=201)
def create_deal_endpoint(*, db: Session = Depends(get_db), payload: DealCreate):
    try:
        return create_deal(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# ---------------------------------------------------------------------------
# Retrieve a specific deal
# ---------------------------------------------------------------------------
@router.get("/{deal_id}", response_model=DealResponse)
def get_deal_endpoint(deal_id: int, db: Session = Depends(get_db)):
    deal = get_deal(db=db, deal_id=deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


# ---------------------------------------------------------------------------
# Partially update a deal (PATCH)
# ---------------------------------------------------------------------------
@router.patch("/{deal_id}", response_model=DealResponse)
def update_deal_endpoint(
    *,
    deal_id: int,
    db: Session = Depends(get_db),
    payload: DealUpdate,
):
    deal = get_deal(db=db, deal_id=deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    try:
        return update_deal(db=db, deal=deal, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc
