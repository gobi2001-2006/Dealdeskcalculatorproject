# Customer Management API (Phase B)
# backend/app/api/routes/customers.py
"""Customer Management API (Phase B)."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.errors import DOMAIN_ERRORS, http_error
from app.db.session import get_db
from app.schemas.proposals import (
    CustomerCreate,
    CustomerResponse,
    CustomerUpdate,
)
from app.services.customer_service import (
    create_customer,
    get_customer,
    list_customers,
    update_customer,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# List customers
# ---------------------------------------------------------------------------
@router.get("/", response_model=List[CustomerResponse])
def list_customers_endpoint(
    *,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records to return"),
    search: Optional[str] = Query(
        None,
        description="Search by code or name (case-insensitive partial match)",
    ),
):
    return list_customers(db=db, skip=skip, limit=limit, search=search)


# ---------------------------------------------------------------------------
# Create a new customer
# ---------------------------------------------------------------------------
@router.post("/", response_model=CustomerResponse, status_code=201)
def create_customer_endpoint(*, db: Session = Depends(get_db), payload: CustomerCreate):
    try:
        return create_customer(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# ---------------------------------------------------------------------------
# Retrieve a specific customer
# ---------------------------------------------------------------------------
@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer_endpoint(customer_id: int, db: Session = Depends(get_db)):
    customer = get_customer(db=db, customer_id=customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


# ---------------------------------------------------------------------------
# Partially update a customer (PATCH)
# ---------------------------------------------------------------------------
@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer_endpoint(
    *,
    customer_id: int,
    db: Session = Depends(get_db),
    payload: CustomerUpdate,
):
    customer = get_customer(db=db, customer_id=customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    try:
        return update_customer(db=db, customer=customer, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc
