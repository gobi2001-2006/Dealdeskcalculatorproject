# backend/app/services/deal_service.py
"""Service layer for Deal CRUD operations (Phase B).

Validates the customer and owner references and keeps the deal -> customer link
consistent with the proposals that already hang off the deal.
"""

from typing import List, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.governance import User
from app.models.proposals import Customer, Deal, Proposal
from app.schemas.proposals import DealCreate, DealUpdate
from app.services.customer_service import like_pattern
from app.services.proposal_service import (
    ProposalConflictError,
    ProposalValidationError,
    ResourceNotFoundError,
    conflict_from_integrity_error,
)


# ---------------------------------------------------------------------------
# List deals with pagination, optional search, and filters
# ---------------------------------------------------------------------------
def list_deals(
    *,
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    owner_user_id: Optional[int] = None,
) -> List[Deal]:
    stmt = select(Deal)
    if search:
        pattern = like_pattern(search)
        stmt = stmt.where(
            or_(
                func.lower(Deal.code).like(func.lower(pattern), escape="\\"),
                func.lower(Deal.name).like(func.lower(pattern), escape="\\"),
            )
        )
    if customer_id is not None:
        stmt = stmt.where(Deal.customer_id == customer_id)
    if status is not None:
        stmt = stmt.where(Deal.status == status)
    if owner_user_id is not None:
        stmt = stmt.where(Deal.owner_user_id == owner_user_id)
    stmt = stmt.order_by(Deal.id).offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


def _validate_references(
    db: Session,
    *,
    customer_id: Optional[int],
    owner_user_id: Optional[int],
) -> None:
    if customer_id is not None and db.get(Customer, customer_id) is None:
        raise ResourceNotFoundError(f"Customer with id {customer_id} not found")
    if owner_user_id is not None and db.get(User, owner_user_id) is None:
        raise ResourceNotFoundError(f"User with id {owner_user_id} not found")


def _assert_code_available(db: Session, code: str, *, exclude_id: Optional[int] = None) -> None:
    stmt = select(Deal.id).where(Deal.code == code)
    if exclude_id is not None:
        stmt = stmt.where(Deal.id != exclude_id)
    if db.execute(stmt).first():
        raise ProposalConflictError(f"Deal with code '{code}' already exists")


# ---------------------------------------------------------------------------
# Create a new deal
# ---------------------------------------------------------------------------
def create_deal(*, db: Session, data: DealCreate) -> Deal:
    try:
        _validate_references(db, customer_id=data.customer_id, owner_user_id=data.owner_user_id)
        _assert_code_available(db, data.code)
        new_deal = Deal(
            code=data.code,
            name=data.name,
            customer_id=data.customer_id,
            owner_user_id=data.owner_user_id,
            status=data.status,
            target_close_date=data.target_close_date,
        )
        db.add(new_deal)
        db.commit()
        db.refresh(new_deal)
        return new_deal
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


# ---------------------------------------------------------------------------
# Retrieve a deal by ID
# ---------------------------------------------------------------------------
def get_deal(*, db: Session, deal_id: int) -> Optional[Deal]:
    return db.get(Deal, deal_id)


# ---------------------------------------------------------------------------
# Partial update of a deal (PATCH semantics)
# ---------------------------------------------------------------------------
def update_deal(*, db: Session, deal: Deal, data: DealUpdate) -> Deal:
    try:
        update_data = data.model_dump(exclude_unset=True)
        _validate_references(
            db,
            customer_id=update_data.get("customer_id"),
            owner_user_id=update_data.get("owner_user_id"),
        )
        if "code" in update_data and update_data["code"] != deal.code:
            _assert_code_available(db, update_data["code"], exclude_id=deal.id)
        if "customer_id" in update_data and update_data["customer_id"] != deal.customer_id:
            has_proposals = db.execute(select(Proposal.id).where(Proposal.deal_id == deal.id).limit(1)).first()
            if has_proposals:
                raise ProposalValidationError(
                    "The customer of a deal cannot be changed once proposals exist for it"
                )
        for field, value in update_data.items():
            setattr(deal, field, value)
        db.add(deal)
        db.commit()
        db.refresh(deal)
        return deal
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise
