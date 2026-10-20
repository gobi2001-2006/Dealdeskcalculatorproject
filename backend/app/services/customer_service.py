# backend/app/services/customer_service.py
"""Service layer for Customer CRUD operations (Phase B).

Validates every foreign key and uniqueness rule up front so the API can return a
precise 404/409 instead of leaking a database error, and rolls back on any failure.
"""

from typing import List, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.master_data import Country, CustomerTier
from app.models.proposals import Customer
from app.schemas.proposals import CustomerCreate, CustomerUpdate
from app.services.proposal_service import (
    ProposalConflictError,
    ResourceNotFoundError,
    conflict_from_integrity_error,
)


def like_pattern(search: str) -> str:
    """Build a case-insensitive contains pattern with user-supplied wildcards escaped."""
    escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


# ---------------------------------------------------------------------------
# List customers with optional pagination and search
# ---------------------------------------------------------------------------
def list_customers(
    *,
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
) -> List[Customer]:
    stmt = select(Customer)
    if search:
        pattern = like_pattern(search)
        stmt = stmt.where(
            or_(
                func.lower(Customer.code).like(func.lower(pattern), escape="\\"),
                func.lower(Customer.name).like(func.lower(pattern), escape="\\"),
            )
        )
    stmt = stmt.order_by(Customer.id).offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


def _validate_references(
    db: Session,
    *,
    country_id: Optional[int],
    customer_tier_id: Optional[int],
) -> None:
    if country_id is not None and db.get(Country, country_id) is None:
        raise ResourceNotFoundError(f"Country with id {country_id} not found")
    if customer_tier_id is not None and db.get(CustomerTier, customer_tier_id) is None:
        raise ResourceNotFoundError(f"Customer tier with id {customer_tier_id} not found")


def _assert_code_available(db: Session, code: str, *, exclude_id: Optional[int] = None) -> None:
    stmt = select(Customer.id).where(Customer.code == code)
    if exclude_id is not None:
        stmt = stmt.where(Customer.id != exclude_id)
    if db.execute(stmt).first():
        raise ProposalConflictError(f"Customer with code '{code}' already exists")


# ---------------------------------------------------------------------------
# Create a new customer
# ---------------------------------------------------------------------------
def create_customer(*, db: Session, data: CustomerCreate) -> Customer:
    try:
        _validate_references(db, country_id=data.country_id, customer_tier_id=data.customer_tier_id)
        _assert_code_available(db, data.code)
        new_customer = Customer(
            code=data.code,
            name=data.name,
            country_id=data.country_id,
            customer_tier_id=data.customer_tier_id,
            industry=data.industry,
            status=data.status,
        )
        db.add(new_customer)
        db.commit()
        db.refresh(new_customer)
        return new_customer
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


# ---------------------------------------------------------------------------
# Retrieve a customer by ID
# ---------------------------------------------------------------------------
def get_customer(*, db: Session, customer_id: int) -> Optional[Customer]:
    return db.get(Customer, customer_id)


# ---------------------------------------------------------------------------
# Partial update of a customer (PATCH semantics)
# ---------------------------------------------------------------------------
def update_customer(*, db: Session, customer: Customer, data: CustomerUpdate) -> Customer:
    try:
        update_data = data.model_dump(exclude_unset=True)
        _validate_references(
            db,
            country_id=update_data.get("country_id"),
            customer_tier_id=update_data.get("customer_tier_id"),
        )
        if "code" in update_data and update_data["code"] != customer.code:
            _assert_code_available(db, update_data["code"], exclude_id=customer.id)
        for field, value in update_data.items():
            setattr(customer, field, value)
        db.add(customer)
        db.commit()
        db.refresh(customer)
        return customer
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise
