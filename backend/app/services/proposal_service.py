# backend/app/services/proposal_service.py
"""Service layer for Proposal Management (Phase C).

Handles proposal lifecycle, versions, countries, line items, and service lines.
Manages transactional integrity, foreign-key validation, constraint checks,
and lifecycle enforcement.
"""

import logging
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.catalogue import Feature, PackItem, PackVersion
from app.models.governance import User
from app.models.master_data import (
    Country,
    Currency,
    DeploymentModel,
    DeploymentPricingOption,
    PricingModel,
    UnitOfMeasure,
)
from app.models.proposals import (
    Customer,
    Deal,
    Proposal,
    ProposalCountry,
    ProposalLineItem,
    ProposalServiceLine,
    ProposalVersion,
)
from app.models.rate_card import RateCardVersion, ServiceRate
from app.schemas.proposals import (
    ProposalCountryCreate,
    ProposalCreate,
    ProposalLineItemCreate,
    ProposalLineItemUpdate,
    ProposalServiceLineCreate,
    ProposalUpdate,
)


logger = logging.getLogger(__name__)


# =============================================================================
# Custom Domain Exceptions
# =============================================================================

class ProposalNotFoundError(Exception):
    """Raised when a requested proposal does not exist."""
    pass


class DealNotFoundError(Exception):
    """Raised when a referenced deal does not exist."""
    pass


class ResourceNotFoundError(Exception):
    """Raised when a referenced foreign-key resource (currency, user, etc.) does not exist."""
    pass


class ProposalConflictError(Exception):
    """Raised on uniqueness violations or duplicate associations."""
    pass


class ProposalValidationError(Exception):
    """Raised when business validation rules fail."""
    pass


class LifecycleStateError(Exception):
    """Raised when an operation is prohibited by the current lifecycle status."""
    pass


def conflict_from_integrity_error(exc: IntegrityError) -> "ProposalConflictError":
    """Translate a DB IntegrityError into a safe conflict error.

    The driver message (constraint names, SQL, column values) is logged for operators
    but never returned to API clients.
    """
    logger.warning("Database integrity error: %s", exc.orig)
    return ProposalConflictError("The request conflicts with existing data (constraint violation)")


def resolve_active_rate_card_version(db: Session, rate_card_version_id: Optional[int] = None) -> RateCardVersion:
    """Return the rate-card version a new proposal version must be priced with.

    Pricing against a draft or retired rate card is not allowed (FSD section 6), so only
    an 'active' version is accepted, whether it is requested explicitly or defaulted.
    """
    if rate_card_version_id is not None:
        rc = db.get(RateCardVersion, rate_card_version_id)
        if not rc:
            raise ResourceNotFoundError(f"Rate card version with id {rate_card_version_id} not found")
        if rc.status != "active":
            raise ProposalValidationError(
                f"Rate card version {rate_card_version_id} is '{rc.status}'; only an active rate card can price a proposal"
            )
        return rc
    rc = db.execute(
        select(RateCardVersion)
        .where(RateCardVersion.status == "active")
        .order_by(RateCardVersion.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not rc:
        raise ProposalValidationError("No active rate card version exists; activate a rate card before creating proposals")
    return rc


def _pack_feature_ids(db: Session, pack_version_id: int) -> set[int]:
    return set(
        db.execute(select(PackItem.feature_id).where(PackItem.pack_version_id == pack_version_id)).scalars().all()
    )


def assert_no_double_charging(
    db: Session,
    *,
    version_id: int,
    pack_version_id: Optional[int],
    feature_id: Optional[int],
    exclude_line_item_id: Optional[int] = None,
) -> None:
    """Reject a line that would charge the same feature twice within one proposal version.

    Rules: a pack or feature may appear once; a standalone feature may not also be contained
    in a pack line; two packs may not share a feature.
    """
    stmt = select(ProposalLineItem).where(ProposalLineItem.proposal_version_id == version_id)
    if exclude_line_item_id is not None:
        stmt = stmt.where(ProposalLineItem.id != exclude_line_item_id)
    existing = list(db.execute(stmt).scalars().all())

    existing_packs = {li.pack_version_id for li in existing if li.pack_version_id is not None}
    existing_features = {li.feature_id for li in existing if li.feature_id is not None}
    covered_by_packs: dict[int, int] = {}
    for pv_id in existing_packs:
        for f_id in _pack_feature_ids(db, pv_id):
            covered_by_packs[f_id] = pv_id

    if pack_version_id is not None:
        if pack_version_id in existing_packs:
            raise ProposalConflictError(f"Pack version {pack_version_id} is already on this proposal version")
        new_features = _pack_feature_ids(db, pack_version_id)
        clash_standalone = new_features & existing_features
        if clash_standalone:
            raise ProposalConflictError(
                f"Pack version {pack_version_id} contains feature(s) {sorted(clash_standalone)} already added "
                "as standalone lines; remove them first (pack contents cannot be charged twice)"
            )
        clash_pack = new_features & set(covered_by_packs)
        if clash_pack:
            raise ProposalConflictError(
                f"Pack version {pack_version_id} shares feature(s) {sorted(clash_pack)} with another pack "
                "on this proposal version"
            )
    if feature_id is not None:
        if feature_id in existing_features:
            raise ProposalConflictError(f"Feature {feature_id} is already on this proposal version")
        if feature_id in covered_by_packs:
            raise ProposalConflictError(
                f"Feature {feature_id} is already included in pack version {covered_by_packs[feature_id]} "
                "and cannot be added as a standalone line"
            )


# =============================================================================
# Proposal Queries & Retrieval
# =============================================================================

def list_proposals(
    *,
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    deal_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    created_by_user_id: Optional[int] = None,
    currency_id: Optional[int] = None,
) -> List[Proposal]:
    """List proposals with pagination, optional search, and filtering."""
    stmt = select(Proposal)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(func.lower(Proposal.code).like(func.lower(pattern)))
    if deal_id is not None:
        stmt = stmt.where(Proposal.deal_id == deal_id)
    if customer_id is not None:
        stmt = stmt.where(Proposal.customer_id == customer_id)
    if status is not None:
        stmt = stmt.where(Proposal.status == status)
    if created_by_user_id is not None:
        stmt = stmt.where(Proposal.created_by_user_id == created_by_user_id)
    if currency_id is not None:
        stmt = stmt.where(Proposal.currency_id == currency_id)

    stmt = stmt.order_by(Proposal.id).offset(skip).limit(limit)
    return list(db.execute(stmt).scalars().all())


def get_proposal(*, db: Session, proposal_id: int) -> Optional[Proposal]:
    """Retrieve a proposal by ID with related records eagerly loaded."""
    stmt = (
        select(Proposal)
        .where(Proposal.id == proposal_id)
        .options(
            selectinload(Proposal.deal),
            selectinload(Proposal.customer),
            selectinload(Proposal.currency),
            selectinload(Proposal.created_by_user),
            selectinload(Proposal.contacts),
            selectinload(Proposal.countries).selectinload(ProposalCountry.country),
            selectinload(Proposal.versions).selectinload(ProposalVersion.rate_card_version),
            selectinload(Proposal.versions).selectinload(ProposalVersion.created_by_user),
            selectinload(Proposal.versions)
            .selectinload(ProposalVersion.line_items)
            .selectinload(ProposalLineItem.pack_version),
            selectinload(Proposal.versions)
            .selectinload(ProposalVersion.line_items)
            .selectinload(ProposalLineItem.feature),
            selectinload(Proposal.versions)
            .selectinload(ProposalVersion.line_items)
            .selectinload(ProposalLineItem.uom),
            selectinload(Proposal.versions)
            .selectinload(ProposalVersion.line_items)
            .selectinload(ProposalLineItem.currency),
            selectinload(Proposal.versions)
            .selectinload(ProposalVersion.service_lines)
            .selectinload(ProposalServiceLine.service_rate),
            selectinload(Proposal.versions)
            .selectinload(ProposalVersion.service_lines)
            .selectinload(ProposalServiceLine.currency),
            selectinload(Proposal.versions).selectinload(ProposalVersion.content),
            selectinload(Proposal.versions).selectinload(ProposalVersion.approvals),
        )
    )
    return db.execute(stmt).scalar_one_or_none()


# =============================================================================
# Proposal Creation & Update
# =============================================================================

def create_proposal(*, db: Session, data: ProposalCreate) -> Proposal:
    """Create a proposal associated with an existing deal and its required initial version.

    Validates foreign keys: deal_id, customer_id, currency_id, created_by_user_id.
    Ensures proposal code is unique.
    Creates initial proposal_versions (version 1) in draft status using the provided
    or active rate card version.
    """
    try:
        # 1. Validate deal exists
        deal = db.get(Deal, data.deal_id)
        if not deal:
            raise DealNotFoundError(f"Deal with id {data.deal_id} not found")

        # 2. Resolve customer_id
        customer_id = data.customer_id if data.customer_id is not None else deal.customer_id
        if deal.customer_id and customer_id != deal.customer_id:
            # Customer must match the deal's customer if deal has customer attached
            raise ProposalValidationError(
                f"Customer ID {customer_id} does not match deal customer ID {deal.customer_id}"
            )
        cust = db.get(Customer, customer_id)
        if not cust:
            raise ResourceNotFoundError(f"Customer with id {customer_id} not found")

        # 3. Validate currency exists
        currency = db.get(Currency, data.currency_id)
        if not currency:
            raise ResourceNotFoundError(f"Currency with id {data.currency_id} not found")

        # 4. Validate user exists
        user = db.get(User, data.created_by_user_id)
        if not user:
            raise ResourceNotFoundError(f"User with id {data.created_by_user_id} not found")

        # 5. Check uniqueness of proposal code
        existing_code = db.execute(
            select(Proposal.id).where(Proposal.code == data.code)
        ).scalar_one_or_none()
        if existing_code:
            raise ProposalConflictError(f"Proposal with code '{data.code}' already exists")

        # 6. Instantiate and add proposal
        new_proposal = Proposal(
            code=data.code,
            deal_id=data.deal_id,
            customer_id=customer_id,
            currency_id=data.currency_id,
            status=data.status or "draft",
            created_by_user_id=data.created_by_user_id,
        )
        db.add(new_proposal)
        db.flush()

        # 7. Create initial proposal version (version 1), pinned to an ACTIVE rate card version
        rc = resolve_active_rate_card_version(db, data.rate_card_version_id)
        initial_version = ProposalVersion(
            proposal_id=new_proposal.id,
            version_no=1,
            rate_card_version_id=rc.id,
            status="draft",
            created_by_user_id=data.created_by_user_id,
            notes="Initial proposal version",
        )
        db.add(initial_version)
        db.flush()

        db.commit()
        # Reload with relationships
        proposal_loaded = get_proposal(db=db, proposal_id=new_proposal.id)
        return proposal_loaded or new_proposal

    except (DealNotFoundError, ResourceNotFoundError, ProposalConflictError, ProposalValidationError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


def update_proposal(
    *,
    db: Session,
    proposal: Proposal,
    data: ProposalUpdate,
) -> Proposal:
    """Partially update permitted proposal fields."""
    try:
        # Check if proposal status allows updates
        if proposal.status in ("superseded", "rejected"):
            raise LifecycleStateError(
                f"Cannot update a proposal in '{proposal.status}' status"
            )

        update_dict = data.model_dump(exclude_unset=True)

        if "deal_id" in update_dict:
            deal = db.get(Deal, update_dict["deal_id"])
            if not deal:
                raise DealNotFoundError(f"Deal with id {update_dict['deal_id']} not found")

        if "customer_id" in update_dict:
            customer = db.get(Customer, update_dict["customer_id"])
            if not customer:
                raise ResourceNotFoundError(
                    f"Customer with id {update_dict['customer_id']} not found"
                )

        if "currency_id" in update_dict:
            currency = db.get(Currency, update_dict["currency_id"])
            if not currency:
                raise ResourceNotFoundError(
                    f"Currency with id {update_dict['currency_id']} not found"
                )

        if "created_by_user_id" in update_dict:
            user = db.get(User, update_dict["created_by_user_id"])
            if not user:
                raise ResourceNotFoundError(
                    f"User with id {update_dict['created_by_user_id']} not found"
                )

        if "code" in update_dict and update_dict["code"] != proposal.code:
            existing = db.execute(
                select(Proposal.id).where(Proposal.code == update_dict["code"])
            ).scalar_one_or_none()
            if existing:
                raise ProposalConflictError(
                    f"Proposal with code '{update_dict['code']}' already exists"
                )

        # The proposal's customer must always be the customer of its deal.
        final_deal_id = update_dict.get("deal_id", proposal.deal_id)
        final_customer_id = update_dict.get("customer_id", proposal.customer_id)
        final_deal = db.get(Deal, final_deal_id)
        if final_deal is not None and final_deal.customer_id != final_customer_id:
            raise ProposalValidationError(
                f"Customer {final_customer_id} does not match deal {final_deal_id} customer {final_deal.customer_id}"
            )

        for field, value in update_dict.items():
            setattr(proposal, field, value)

        db.add(proposal)
        db.commit()
        db.refresh(proposal)
        return proposal

    except (DealNotFoundError, ResourceNotFoundError, ProposalConflictError, ProposalValidationError, LifecycleStateError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


# =============================================================================
# Proposal Countries
# =============================================================================

def add_proposal_country(
    *,
    db: Session,
    proposal_id: int,
    data: ProposalCountryCreate,
) -> ProposalCountry:
    """Add a deployment country to the proposal."""
    try:
        proposal = db.get(Proposal, proposal_id)
        if not proposal:
            raise ProposalNotFoundError(f"Proposal with id {proposal_id} not found")

        if proposal.status != "draft":
            raise LifecycleStateError(
                f"Cannot add country to proposal in '{proposal.status}' status; must be draft"
            )

        country = db.get(Country, data.country_id)
        if not country:
            raise ResourceNotFoundError(f"Country with id {data.country_id} not found")

        # Check unique constraint on (proposal_id, country_id)
        existing_pc = db.execute(
            select(ProposalCountry.id).where(
                ProposalCountry.proposal_id == proposal_id,
                ProposalCountry.country_id == data.country_id,
            )
        ).scalar_one_or_none()
        if existing_pc:
            raise ProposalConflictError(
                f"Country {data.country_id} is already added to proposal {proposal_id}"
            )

        if data.user_headcount is not None and data.user_headcount < 0:
            raise ProposalValidationError("Headcount cannot be negative")

        if data.deployment_model_id is not None:
            if not db.get(DeploymentModel, data.deployment_model_id):
                raise ResourceNotFoundError(f"Deployment model with id {data.deployment_model_id} not found")
            if not db.get(PricingModel, data.pricing_model_id):
                raise ResourceNotFoundError(f"Pricing model with id {data.pricing_model_id} not found")
            option = db.get(DeploymentPricingOption, (data.deployment_model_id, data.pricing_model_id))
            if option is None:
                raise ProposalValidationError(
                    f"Pricing model {data.pricing_model_id} is not available for deployment model "
                    f"{data.deployment_model_id}"
                )

        # Exactly one primary deployment country per proposal.
        if data.is_primary_deployment:
            has_primary = db.execute(
                select(ProposalCountry.id).where(
                    ProposalCountry.proposal_id == proposal_id,
                    ProposalCountry.is_primary_deployment.is_(True),
                )
            ).first()
            if has_primary:
                raise ProposalConflictError(f"Proposal {proposal_id} already has a primary deployment country")

        new_pc = ProposalCountry(
            proposal_id=proposal_id,
            country_id=data.country_id,
            deployment_model_id=data.deployment_model_id,
            pricing_model_id=data.pricing_model_id,
            user_headcount=data.user_headcount,
            is_primary_deployment=data.is_primary_deployment,
        )
        db.add(new_pc)
        db.commit()
        db.refresh(new_pc)
        return new_pc

    except (ProposalNotFoundError, ResourceNotFoundError, ProposalConflictError, ProposalValidationError, LifecycleStateError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


# =============================================================================
# Proposal Line Items
# =============================================================================

def _get_target_draft_version(
    *,
    db: Session,
    proposal: Proposal,
    version_id: Optional[int],
) -> ProposalVersion:
    """Retrieve or create the targeted draft version for proposal line items."""
    if version_id is not None:
        version = db.get(ProposalVersion, version_id)
        if not version:
            raise ResourceNotFoundError(f"Proposal version with id {version_id} not found")
        if version.proposal_id != proposal.id:
            raise ProposalValidationError(
                f"Proposal version {version_id} does not belong to proposal {proposal.id}"
            )
        if version.status != "draft":
            raise LifecycleStateError(
                f"Proposal version {version_id} is '{version.status}', cannot modify line items"
            )
        return version

    # Look for existing draft version
    stmt = (
        select(ProposalVersion)
        .where(
            ProposalVersion.proposal_id == proposal.id,
            ProposalVersion.status == "draft",
        )
        .order_by(ProposalVersion.version_no.desc())
        .limit(1)
    )
    draft_version = db.execute(stmt).scalar_one_or_none()
    if draft_version:
        return draft_version

    # No draft version yet: create the next one, pinned to the active rate card version.
    rc = resolve_active_rate_card_version(db)

    # Next version sequence
    max_ver = db.execute(
        select(func.max(ProposalVersion.version_no)).where(
            ProposalVersion.proposal_id == proposal.id
        )
    ).scalar_one() or 0

    new_version = ProposalVersion(
        proposal_id=proposal.id,
        version_no=max_ver + 1,
        rate_card_version_id=rc.id,
        status="draft",
        created_by_user_id=proposal.created_by_user_id,
        notes="Auto-created draft version",
    )
    db.add(new_version)
    db.flush()
    return new_version


def add_proposal_line_item(
    *,
    db: Session,
    proposal_id: int,
    data: ProposalLineItemCreate,
) -> ProposalLineItem:
    """Add a product, feature or pack line item to the proposal's active draft version.

    Validates pack_version XOR feature exclusivity.
    Checks existence of referenced catalogue, UOM, and currency items.
    Enforces draft lifecycle checks on proposal and version.
    """
    try:
        proposal = db.get(Proposal, proposal_id)
        if not proposal:
            raise ProposalNotFoundError(f"Proposal with id {proposal_id} not found")

        if proposal.status != "draft":
            raise LifecycleStateError(
                f"Cannot add line item to proposal in '{proposal.status}' status; must be draft"
            )

        version = _get_target_draft_version(
            db=db,
            proposal=proposal,
            version_id=data.proposal_version_id,
        )

        # Validate target exclusivity
        has_pack = data.pack_version_id is not None
        has_feature = data.feature_id is not None
        if has_pack == has_feature:
            raise ProposalValidationError(
                "Exactly one target (pack_version_id XOR feature_id) must be provided"
            )

        if has_pack:
            pack_version = db.get(PackVersion, data.pack_version_id)
            if not pack_version:
                raise ResourceNotFoundError(
                    f"Pack version with id {data.pack_version_id} not found"
                )
            if pack_version.status == "superseded":
                raise ProposalValidationError(
                    f"Pack version {data.pack_version_id} is superseded and cannot be added"
                )

        if has_feature:
            feature = db.get(Feature, data.feature_id)
            if not feature:
                raise ResourceNotFoundError(
                    f"Feature with id {data.feature_id} not found"
                )
            if feature.status == "retired":
                raise ProposalValidationError(
                    f"Feature {data.feature_id} is retired and cannot be added"
                )

        # Validate UOM
        uom = db.get(UnitOfMeasure, data.uom_id)
        if not uom:
            raise ResourceNotFoundError(f"Unit of measure with id {data.uom_id} not found")

        # Validate Currency
        currency_id = data.currency_id if data.currency_id is not None else proposal.currency_id
        currency = db.get(Currency, currency_id)
        if not currency:
            raise ResourceNotFoundError(f"Currency with id {currency_id} not found")

        # Validate numeric bounds
        if data.quantity < 0:
            raise ProposalValidationError("Quantity cannot be negative")
        if data.list_unit_price < 0:
            raise ProposalValidationError("List unit price cannot be negative")
        if data.net_unit_price < 0:
            raise ProposalValidationError("Net unit price cannot be negative")
        if data.extended_amount < 0:
            raise ProposalValidationError("Extended amount cannot be negative")
        if data.discount_pct is not None and not (Decimal("0") <= data.discount_pct <= Decimal("100")):
            raise ProposalValidationError("Discount percentage must be between 0 and 100")

        assert_no_double_charging(
            db,
            version_id=version.id,
            pack_version_id=data.pack_version_id,
            feature_id=data.feature_id,
        )

        # Line number assignment
        if data.line_number is not None and data.line_number > 0:
            taken = db.execute(
                select(ProposalLineItem.id).where(
                    ProposalLineItem.proposal_version_id == version.id,
                    ProposalLineItem.line_number == data.line_number,
                )
            ).first()
            if taken:
                raise ProposalConflictError(f"Line number {data.line_number} is already used on this proposal version")
            line_num = data.line_number
        else:
            max_line = db.execute(
                select(func.max(ProposalLineItem.line_number)).where(
                    ProposalLineItem.proposal_version_id == version.id
                )
            ).scalar_one() or 0
            line_num = max_line + 1

        new_item = ProposalLineItem(
            proposal_version_id=version.id,
            line_number=line_num,
            pack_version_id=data.pack_version_id,
            feature_id=data.feature_id,
            uom_id=data.uom_id,
            quantity=data.quantity,
            list_unit_price=data.list_unit_price,
            discount_pct=data.discount_pct,
            net_unit_price=data.net_unit_price,
            extended_amount=data.extended_amount,
            currency_id=currency_id,
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return new_item

    except (ProposalNotFoundError, ResourceNotFoundError, ProposalValidationError, ProposalConflictError, LifecycleStateError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


def update_proposal_line_item(
    *,
    db: Session,
    proposal_id: int,
    line_item_id: int,
    data: ProposalLineItemUpdate,
) -> ProposalLineItem:
    """Update permitted line item fields on a draft proposal version."""
    try:
        proposal = db.get(Proposal, proposal_id)
        if not proposal:
            raise ProposalNotFoundError(f"Proposal with id {proposal_id} not found")

        if proposal.status != "draft":
            raise LifecycleStateError(
                f"Cannot update line items on a proposal in '{proposal.status}' status"
            )

        item = db.get(ProposalLineItem, line_item_id)
        if not item:
            raise ResourceNotFoundError(f"Line item with id {line_item_id} not found")

        version = db.get(ProposalVersion, item.proposal_version_id)
        if not version or version.proposal_id != proposal_id:
            raise ProposalValidationError(
                f"Line item {line_item_id} does not belong to proposal {proposal_id}"
            )

        if version.status != "draft":
            raise LifecycleStateError(
                f"Cannot modify line item on proposal version in '{version.status}' status"
            )

        update_dict = data.model_dump(exclude_unset=True)

        # Check target exclusivity if pack or feature target changed
        target_fields_set = {"pack_version_id", "feature_id"}.intersection(update_dict.keys())
        if target_fields_set:
            new_pack = update_dict.get("pack_version_id", item.pack_version_id)
            new_feat = update_dict.get("feature_id", item.feature_id)
            if bool(new_pack) == bool(new_feat):
                raise ProposalValidationError(
                    "Exactly one target (pack_version_id XOR feature_id) must be set"
                )

        if "pack_version_id" in update_dict and update_dict["pack_version_id"] is not None:
            pv = db.get(PackVersion, update_dict["pack_version_id"])
            if not pv:
                raise ResourceNotFoundError(
                    f"Pack version with id {update_dict['pack_version_id']} not found"
                )
            if pv.status == "superseded":
                raise ProposalValidationError("Cannot reference superseded pack version")

        if "feature_id" in update_dict and update_dict["feature_id"] is not None:
            feat = db.get(Feature, update_dict["feature_id"])
            if not feat:
                raise ResourceNotFoundError(
                    f"Feature with id {update_dict['feature_id']} not found"
                )
            if feat.status == "retired":
                raise ProposalValidationError("Cannot reference retired feature")

        if "uom_id" in update_dict:
            uom = db.get(UnitOfMeasure, update_dict["uom_id"])
            if not uom:
                raise ResourceNotFoundError(
                    f"Unit of measure with id {update_dict['uom_id']} not found"
                )

        if "currency_id" in update_dict:
            curr = db.get(Currency, update_dict["currency_id"])
            if not curr:
                raise ResourceNotFoundError(
                    f"Currency with id {update_dict['currency_id']} not found"
                )

        if "quantity" in update_dict and update_dict["quantity"] < 0:
            raise ProposalValidationError("Quantity cannot be negative")
        if "list_unit_price" in update_dict and update_dict["list_unit_price"] < 0:
            raise ProposalValidationError("List unit price cannot be negative")
        if "net_unit_price" in update_dict and update_dict["net_unit_price"] < 0:
            raise ProposalValidationError("Net unit price cannot be negative")
        if "extended_amount" in update_dict and update_dict["extended_amount"] < 0:
            raise ProposalValidationError("Extended amount cannot be negative")
        if "discount_pct" in update_dict and update_dict["discount_pct"] is not None:
            if not (Decimal("0") <= update_dict["discount_pct"] <= Decimal("100")):
                raise ProposalValidationError("Discount percentage must be between 0 and 100")

        if target_fields_set:
            assert_no_double_charging(
                db,
                version_id=version.id,
                pack_version_id=update_dict.get("pack_version_id", item.pack_version_id),
                feature_id=update_dict.get("feature_id", item.feature_id),
                exclude_line_item_id=item.id,
            )

        for field, value in update_dict.items():
            setattr(item, field, value)

        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    except (ProposalNotFoundError, ResourceNotFoundError, ProposalValidationError, ProposalConflictError, LifecycleStateError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise


def delete_proposal_line_item(
    *,
    db: Session,
    proposal_id: int,
    line_item_id: int,
) -> bool:
    """Remove a line item only when permitted by proposal and version lifecycle."""
    try:
        proposal = db.get(Proposal, proposal_id)
        if not proposal:
            raise ProposalNotFoundError(f"Proposal with id {proposal_id} not found")

        if proposal.status != "draft":
            raise LifecycleStateError(
                f"Cannot delete line items from proposal in '{proposal.status}' status"
            )

        item = db.get(ProposalLineItem, line_item_id)
        if not item:
            raise ResourceNotFoundError(f"Line item with id {line_item_id} not found")

        version = db.get(ProposalVersion, item.proposal_version_id)
        if not version or version.proposal_id != proposal_id:
            raise ProposalValidationError(
                f"Line item {line_item_id} does not belong to proposal {proposal_id}"
            )

        if version.status != "draft":
            raise LifecycleStateError(
                f"Cannot delete line items from a proposal version in '{version.status}' status"
            )

        db.delete(item)
        db.commit()
        return True

    except (ProposalNotFoundError, ResourceNotFoundError, ProposalValidationError, LifecycleStateError):
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


# =============================================================================
# Proposal Service Lines
# =============================================================================

def add_proposal_service_line(
    *,
    db: Session,
    proposal_id: int,
    data: ProposalServiceLineCreate,
) -> ProposalServiceLine:
    """Add a professional service line item to the proposal's active draft version."""
    try:
        proposal = db.get(Proposal, proposal_id)
        if not proposal:
            raise ProposalNotFoundError(f"Proposal with id {proposal_id} not found")

        if proposal.status != "draft":
            raise LifecycleStateError(
                f"Cannot add service line to proposal in '{proposal.status}' status"
            )

        version = _get_target_draft_version(
            db=db,
            proposal=proposal,
            version_id=data.proposal_version_id,
        )

        if data.service_rate_id is not None:
            sr = db.get(ServiceRate, data.service_rate_id)
            if not sr:
                raise ResourceNotFoundError(
                    f"Service rate with id {data.service_rate_id} not found"
                )

        currency_id = data.currency_id if data.currency_id is not None else proposal.currency_id
        currency = db.get(Currency, currency_id)
        if not currency:
            raise ResourceNotFoundError(f"Currency with id {currency_id} not found")

        if data.days_or_hours < 0:
            raise ProposalValidationError("Days or hours cannot be negative")
        if data.rate_applied < 0:
            raise ProposalValidationError("Rate applied cannot be negative")
        if data.extended_amount < 0:
            raise ProposalValidationError("Extended amount cannot be negative")
        if data.discount_pct is not None and not (Decimal("0") <= data.discount_pct <= Decimal("100")):
            raise ProposalValidationError("Discount percentage must be between 0 and 100")
        if data.discount_pct:
            raise ProposalValidationError(
                "Individual service-line discounts are not permitted; apply one overall "
                "service discount per product when calculating"
            )

        new_sl = ProposalServiceLine(
            proposal_version_id=version.id,
            service_rate_id=data.service_rate_id,
            role_name=data.role_name,
            days_or_hours=data.days_or_hours,
            rate_applied=data.rate_applied,
            discount_pct=data.discount_pct,
            extended_amount=data.extended_amount,
            currency_id=currency_id,
        )
        db.add(new_sl)
        db.commit()
        db.refresh(new_sl)
        return new_sl

    except (ProposalNotFoundError, ResourceNotFoundError, ProposalValidationError, LifecycleStateError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise conflict_from_integrity_error(exc) from exc
    except Exception:
        db.rollback()
        raise
