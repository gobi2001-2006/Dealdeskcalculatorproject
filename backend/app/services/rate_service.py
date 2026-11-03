"""Rate Service Layer.

Provides business logic and transaction management for:
- RateCardVersion
- RateCard (commercial rates across 6 dimensions)
- ServiceRate (professional service rates by role & country)
"""

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import select, func, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.rate_card import RateCardVersion, RateCard, ServiceRate
from app.models.master_data import (
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    DeploymentPricingOption,
    PricingModel,
    UnitOfMeasure,
)
from app.models.catalogue import PackVersion, Feature
from app.schemas.rate_card import (
    RateCardVersionCreate,
    RateCardVersionUpdate,
    RateCardCreate,
    RateCardUpdate,
    ServiceRateCreate,
    ServiceRateUpdate,
)
from app.services.proposal_service import (
    ResourceNotFoundError,
    ProposalConflictError,
    ProposalValidationError,
)
from app.services.master_service import validate_uom_for_pricing_model

logger = logging.getLogger(__name__)


# =============================================================================
# 1. RateCardVersion Operations
# =============================================================================

def list_rate_card_versions(db: Session, status: Optional[str] = None) -> List[RateCardVersion]:
    stmt = select(RateCardVersion).order_by(RateCardVersion.id.desc())
    if status:
        stmt = stmt.where(RateCardVersion.status == status)
    return list(db.execute(stmt).scalars().all())


def get_rate_card_version(db: Session, version_id: int) -> Optional[RateCardVersion]:
    return db.get(RateCardVersion, version_id)


def get_active_rate_card_version(db: Session) -> Optional[RateCardVersion]:
    stmt = (
        select(RateCardVersion)
        .where(RateCardVersion.status == "active")
        .order_by(RateCardVersion.id.desc())
        .limit(1)
    )
    return db.execute(stmt).scalars().first()


def create_rate_card_version(db: Session, data: RateCardVersionCreate) -> RateCardVersion:
    version_no = data.version_no.strip()
    dup = db.execute(
        select(RateCardVersion).where(RateCardVersion.version_no == version_no)
    ).scalars().first()
    if dup:
        raise ProposalConflictError(f"Rate card version '{version_no}' already exists")

    rcv = RateCardVersion(
        version_no=version_no,
        name=data.name.strip(),
        status=data.status,
        valid_from=data.valid_from or date.today(),
        valid_to=data.valid_to,
        created_by=data.created_by,
        activated_by=data.activated_by,
        activated_at=data.activated_at,
    )
    db.add(rcv)
    try:
        db.commit()
        db.refresh(rcv)
        return rcv
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation creating rate card version: {exc.orig}") from exc


def activate_rate_card_version(db: Session, version_id: int, activated_by: Optional[str] = None) -> RateCardVersion:
    rcv = db.get(RateCardVersion, version_id)
    if not rcv:
        raise ResourceNotFoundError(f"Rate card version with id {version_id} not found")

    if rcv.status == "active":
        return rcv

    # Retire current active versions
    currently_active = db.execute(
        select(RateCardVersion).where(RateCardVersion.status == "active", RateCardVersion.id != version_id)
    ).scalars().all()
    for active_ver in currently_active:
        active_ver.status = "retired"

    rcv.status = "active"
    rcv.activated_at = datetime.now(timezone.utc)
    if activated_by:
        rcv.activated_by = activated_by

    try:
        db.commit()
        db.refresh(rcv)
        return rcv
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Error activating rate card version: {exc.orig}") from exc


# =============================================================================
# 2. RateCard Operations
# =============================================================================

def list_rate_cards(
    db: Session,
    rate_card_version_id: Optional[int] = None,
    country_id: Optional[int] = None,
    deployment_model_id: Optional[int] = None,
    pricing_model_id: Optional[int] = None,
    tier_id: Optional[int] = None,
    pack_version_id: Optional[int] = None,
    feature_id: Optional[int] = None,
) -> List[RateCard]:
    stmt = (
        select(RateCard)
        .options(
            joinedload(RateCard.country),
            joinedload(RateCard.deployment_model),
            joinedload(RateCard.pricing_model),
            joinedload(RateCard.tier),
            joinedload(RateCard.uom),
            joinedload(RateCard.currency),
            joinedload(RateCard.pack_version),
            joinedload(RateCard.feature),
        )
        .order_by(RateCard.id)
    )
    if rate_card_version_id is not None:
        stmt = stmt.where(RateCard.rate_card_version_id == rate_card_version_id)
    if country_id is not None:
        stmt = stmt.where(RateCard.country_id == country_id)
    if deployment_model_id is not None:
        stmt = stmt.where(RateCard.deployment_model_id == deployment_model_id)
    if pricing_model_id is not None:
        stmt = stmt.where(RateCard.pricing_model_id == pricing_model_id)
    if tier_id is not None:
        stmt = stmt.where(RateCard.tier_id == tier_id)
    if pack_version_id is not None:
        stmt = stmt.where(RateCard.pack_version_id == pack_version_id)
    if feature_id is not None:
        stmt = stmt.where(RateCard.feature_id == feature_id)

    return list(db.execute(stmt).scalars().all())


def get_rate_card(db: Session, rate_card_id: int) -> Optional[RateCard]:
    stmt = (
        select(RateCard)
        .options(
            joinedload(RateCard.country),
            joinedload(RateCard.deployment_model),
            joinedload(RateCard.pricing_model),
            joinedload(RateCard.tier),
            joinedload(RateCard.uom),
            joinedload(RateCard.currency),
            joinedload(RateCard.pack_version),
            joinedload(RateCard.feature),
        )
        .where(RateCard.id == rate_card_id)
    )
    return db.execute(stmt).scalars().first()


def upsert_rate_card(
    db: Session,
    rate_card_version_id: int,
    country_id: int,
    deployment_model_id: int,
    pricing_model_id: int,
    tier_id: int,
    uom_id: int,
    currency_id: int,
    unit_rate: Optional[Decimal] = None,
    fixed_fee: Optional[Decimal] = None,
    floor_price: Optional[Decimal] = None,
    cost_fixed: Optional[Decimal] = None,
    cost_unit: Optional[Decimal] = None,
    amc_percentage: Optional[Decimal] = None,
    pack_version_id: Optional[int] = None,
    feature_id: Optional[int] = None,
) -> RateCard:
    # Target validation: exactly one of pack_version_id or feature_id
    if (pack_version_id is None) == (feature_id is None):
        raise ProposalValidationError("Exactly one of pack_version_id or feature_id must be provided")

    # Fee component validation
    if unit_rate is None and fixed_fee is None:
        raise ProposalValidationError("At least one fee component (fixed_fee or unit_rate) must be provided")

    # Version check
    rcv = db.get(RateCardVersion, rate_card_version_id)
    if not rcv:
        raise ResourceNotFoundError(f"Rate card version with id {rate_card_version_id} not found")
    if rcv.status == "retired":
        raise ProposalConflictError(f"Rate card version '{rcv.version_no}' is retired and locked against modifications")

    # Foreign key validations
    dep = db.get(DeploymentModel, deployment_model_id)
    if not dep:
        raise ResourceNotFoundError(f"Deployment model with id {deployment_model_id} not found")
    pm = db.get(PricingModel, pricing_model_id)
    if not pm:
        raise ResourceNotFoundError(f"Pricing model with id {pricing_model_id} not found")
    tier = db.get(CustomerTier, tier_id)
    if not tier:
        raise ResourceNotFoundError(f"Customer tier with id {tier_id} not found")
    uom = db.get(UnitOfMeasure, uom_id)
    if not uom:
        raise ResourceNotFoundError(f"Unit of measure with id {uom_id} not found")
    if not db.get(Currency, currency_id):
        raise ResourceNotFoundError(f"Currency with id {currency_id} not found")

    # Enforce valid deployment + pricing model combination
    dpo = db.get(DeploymentPricingOption, (deployment_model_id, pricing_model_id))
    if not dpo:
        raise ProposalValidationError(
            f"Invalid combination: deployment model '{dep.name}' (id={deployment_model_id}) does not permit "
            f"pricing model '{pm.name}' (id={pricing_model_id})."
        )

    # The UOM must be allowed by the pricing model (locked UOM, e.g. PEPM -> Active Employees (with ESS),
    # or the pricing_model_uoms mapping). The rule lives in master data, not in code.
    validate_uom_for_pricing_model(db, pm, uom)

    if pack_version_id is not None and not db.get(PackVersion, pack_version_id):
        raise ResourceNotFoundError(f"Pack version with id {pack_version_id} not found")
    if feature_id is not None and not db.get(Feature, feature_id):
        raise ResourceNotFoundError(f"Feature with id {feature_id} not found")

    # Check existing matching row
    stmt = select(RateCard).where(
        RateCard.rate_card_version_id == rate_card_version_id,
        RateCard.country_id == country_id,
        RateCard.deployment_model_id == deployment_model_id,
        RateCard.pricing_model_id == pricing_model_id,
        RateCard.tier_id == tier_id,
        RateCard.uom_id == uom_id,
    )
    if pack_version_id is not None:
        stmt = stmt.where(RateCard.pack_version_id == pack_version_id)
    else:
        stmt = stmt.where(RateCard.feature_id == feature_id)

    existing = db.execute(stmt).scalars().first()
    if existing:
        existing.currency_id = currency_id
        existing.unit_rate = unit_rate
        if fixed_fee is not None:
            existing.fixed_fee = fixed_fee
        if floor_price is not None:
            existing.floor_price = floor_price
        if cost_fixed is not None:
            existing.cost_fixed = cost_fixed
        if cost_unit is not None:
            existing.cost_unit = cost_unit
        if amc_percentage is not None:
            existing.amc_percentage = amc_percentage
        rate_card = existing
    else:
        rate_card = RateCard(
            rate_card_version_id=rate_card_version_id,
            country_id=country_id,
            deployment_model_id=deployment_model_id,
            pricing_model_id=pricing_model_id,
            tier_id=tier_id,
            uom_id=uom_id,
            pack_version_id=pack_version_id,
            feature_id=feature_id,
            currency_id=currency_id,
            unit_rate=unit_rate,
            fixed_fee=fixed_fee,
            floor_price=floor_price,
            cost_fixed=cost_fixed,
            cost_unit=cost_unit,
            amc_percentage=amc_percentage,
        )
        db.add(rate_card)

    try:
        db.commit()
        db.refresh(rate_card)
        return get_rate_card(db, rate_card.id)
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation updating rate card: {exc.orig}") from exc


def create_rate_card(db: Session, data: RateCardCreate) -> RateCard:
    return upsert_rate_card(
        db,
        rate_card_version_id=data.rate_card_version_id,
        country_id=data.country_id,
        deployment_model_id=data.deployment_model_id,
        pricing_model_id=data.pricing_model_id,
        tier_id=data.tier_id,
        uom_id=data.uom_id,
        currency_id=data.currency_id,
        unit_rate=data.unit_rate,
        fixed_fee=data.fixed_fee,
        floor_price=data.floor_price,
        cost_fixed=data.cost_fixed,
        cost_unit=data.cost_unit,
        amc_percentage=data.amc_percentage,
        pack_version_id=data.pack_version_id,
        feature_id=data.feature_id,
    )


def update_rate_card(db: Session, rate_card_id: int, data: RateCardUpdate) -> RateCard:
    rc = db.get(RateCard, rate_card_id)
    if not rc:
        raise ResourceNotFoundError(f"Rate card with id {rate_card_id} not found")
    if rc.rate_card_version and rc.rate_card_version.status == "retired":
        raise ProposalConflictError(
            f"Cannot modify rate card entry in retired rate card version '{rc.rate_card_version.version_no}'"
        )

    update_dict = data.model_dump(exclude_unset=True)
    for field, val in update_dict.items():
        if val is not None:
            setattr(rc, field, val)

    try:
        db.commit()
        db.refresh(rc)
        return get_rate_card(db, rc.id)
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation updating rate card: {exc.orig}") from exc


def delete_rate_card(db: Session, rate_card_id: int) -> None:
    rc = db.get(RateCard, rate_card_id)
    if not rc:
        raise ResourceNotFoundError(f"Rate card with id {rate_card_id} not found")
    if rc.rate_card_version and rc.rate_card_version.status == "retired":
        raise ProposalConflictError(
            f"Cannot delete rate card entry in retired rate card version '{rc.rate_card_version.version_no}'"
        )
    try:
        db.delete(rc)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot delete rate card: {exc.orig}") from exc


def delete_rate_cards_for_target(
    db: Session,
    rate_card_version_id: int,
    country_id: int,
    deployment_model_id: int,
    pricing_model_id: int,
    pack_version_id: Optional[int] = None,
    feature_id: Optional[int] = None,
    uom_id: Optional[int] = None,
) -> int:
    rcv = db.get(RateCardVersion, rate_card_version_id)
    if not rcv:
        raise ResourceNotFoundError(f"Rate card version with id {rate_card_version_id} not found")
    if rcv.status == "retired":
        raise ProposalConflictError(f"Cannot delete rate cards for retired rate card version '{rcv.version_no}'")

    stmt = select(RateCard).where(
        RateCard.rate_card_version_id == rate_card_version_id,
        RateCard.country_id == country_id,
        RateCard.deployment_model_id == deployment_model_id,
        RateCard.pricing_model_id == pricing_model_id,
    )
    if pack_version_id is not None:
        stmt = stmt.where(RateCard.pack_version_id == pack_version_id)
    elif feature_id is not None:
        stmt = stmt.where(RateCard.feature_id == feature_id)
    else:
        raise ProposalValidationError("Either pack_version_id or feature_id must be specified")
    if uom_id is not None:
        stmt = stmt.where(RateCard.uom_id == uom_id)

    items = list(db.execute(stmt).scalars().all())
    count = len(items)
    for item in items:
        db.delete(item)

    try:
        db.commit()
        return count
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot delete rate cards: {exc.orig}") from exc


def save_rate_card_target(
    db: Session,
    rate_card_version_id: int,
    country_id: int,
    deployment_model_id: int,
    pricing_model_id: int,
    uom_id: int,
    tiers: List[dict],
    unit_rate: Optional[Decimal] = None,
    pack_version_id: Optional[int] = None,
    feature_id: Optional[int] = None,
    current_uom_id: Optional[int] = None,
) -> List[RateCard]:
    """Save every tier row of one pack/feature rate schedule (one UOM) in one transaction.

    `tiers` is a list of {tier_id, fixed_fee?, unit_rate?, amc_percentage?}. A tier's unit rate falls
    back to the shared `unit_rate` (one subscription rate for all tiers) when the tier gives none.
    A tier is priced when it has its fixed fee (pricing models with a fixed component) or its unit
    rate (models without one); an unpriced tier's row is removed. The schedule is identified by
    `current_uom_id` (default `uom_id`); a different `uom_id` moves the schedule to that UOM.
    Other UOM schedules of the same pack/feature are never touched.
    """
    if (pack_version_id is None) == (feature_id is None):
        raise ProposalValidationError("Exactly one of pack_version_id or feature_id must be provided")
    tier_ids = [t["tier_id"] for t in tiers]
    if len(tier_ids) != len(set(tier_ids)):
        raise ProposalValidationError("Each customer tier may appear only once")
    for t in tiers:
        for key in ("fixed_fee", "unit_rate", "amc_percentage"):
            if t.get(key) is not None and t[key] < 0:
                raise ProposalValidationError(f"{key} for tier id {t['tier_id']} must be non-negative")
        if t.get("amc_percentage") is not None and t["amc_percentage"] > 100:
            raise ProposalValidationError(f"AMC % for tier id {t['tier_id']} must be between 0 and 100")
    if unit_rate is not None and unit_rate < 0:
        raise ProposalValidationError("Unit rate must be non-negative")

    rcv = db.get(RateCardVersion, rate_card_version_id)
    if not rcv:
        raise ResourceNotFoundError(f"Rate card version with id {rate_card_version_id} not found")
    if rcv.status == "retired":
        raise ProposalConflictError(f"Rate card version '{rcv.version_no}' is retired and locked against modifications")

    country = db.get(Country, country_id)
    if not country:
        raise ResourceNotFoundError(f"Country with id {country_id} not found")
    dep = db.get(DeploymentModel, deployment_model_id)
    if not dep:
        raise ResourceNotFoundError(f"Deployment model with id {deployment_model_id} not found")
    pm = db.get(PricingModel, pricing_model_id)
    if not pm:
        raise ResourceNotFoundError(f"Pricing model with id {pricing_model_id} not found")
    if not (pm.has_fixed_component or pm.has_unit_component):
        raise ProposalValidationError(f"Pricing model '{pm.name}' has no fee component configured")
    if not pm.has_fixed_component and any(t.get("fixed_fee") is not None for t in tiers):
        raise ProposalValidationError(f"Pricing model '{pm.name}' has no fixed fee; remove the platform/fixed fee values")
    if pm.unit_rate_basis != "one_time" and any(t.get("amc_percentage") is not None for t in tiers):
        raise ProposalValidationError(
            f"AMC % applies only to pricing models with a one-time unit rate; '{pm.name}' bills it {pm.unit_rate_basis}"
        )
    if not db.get(DeploymentPricingOption, (deployment_model_id, pricing_model_id)):
        raise ProposalValidationError(
            f"Invalid combination: deployment model '{dep.name}' does not permit pricing model '{pm.name}'."
        )
    uom = db.get(UnitOfMeasure, uom_id)
    if not uom:
        raise ResourceNotFoundError(f"Unit of measure with id {uom_id} not found")
    validate_uom_for_pricing_model(db, pm, uom)
    for t_id in tier_ids:
        if not db.get(CustomerTier, t_id):
            raise ResourceNotFoundError(f"Customer tier with id {t_id} not found")
    if pack_version_id is not None and not db.get(PackVersion, pack_version_id):
        raise ResourceNotFoundError(f"Pack version with id {pack_version_id} not found")
    if feature_id is not None and not db.get(Feature, feature_id):
        raise ResourceNotFoundError(f"Feature with id {feature_id} not found")
    currency_id = country.currency_id
    if not currency_id or not db.get(Currency, currency_id):
        raise ProposalValidationError(f"Country '{country.name}' has no default currency")

    def unit_for(t: dict) -> Optional[Decimal]:
        return t.get("unit_rate") if t.get("unit_rate") is not None else unit_rate

    def priced(t: dict) -> bool:
        if pm.has_fixed_component:
            return t.get("fixed_fee") is not None
        return unit_for(t) is not None

    if not any(priced(t) for t in tiers):
        what = "platform (fixed) fee" if pm.has_fixed_component else "rate"
        raise ProposalValidationError(f"Enter the {what} for at least one customer tier")

    def schedule_query(for_uom: int):
        stmt = select(RateCard).where(
            RateCard.rate_card_version_id == rate_card_version_id,
            RateCard.country_id == country_id,
            RateCard.deployment_model_id == deployment_model_id,
            RateCard.pricing_model_id == pricing_model_id,
            RateCard.uom_id == for_uom,
        )
        if pack_version_id is not None:
            return stmt.where(RateCard.pack_version_id == pack_version_id)
        return stmt.where(RateCard.feature_id == feature_id)

    source_uom = current_uom_id or uom_id
    existing_by_tier = {r.tier_id: r for r in db.execute(schedule_query(source_uom)).scalars().all()}
    if source_uom != uom_id and db.execute(schedule_query(uom_id)).scalars().first() is not None:
        raise ProposalConflictError(
            f"This item already has a rate schedule for unit of measure '{uom.name}'. "
            "Edit that row instead, or remove it first."
        )

    by_tier = {t["tier_id"]: t for t in tiers}
    for t_id, row in existing_by_tier.items():
        t = by_tier.get(t_id)
        if t is not None and not priced(t):
            db.delete(row)
            continue
        if t is not None:
            row.fixed_fee = t.get("fixed_fee")
            row.unit_rate = unit_for(t)
            row.amc_percentage = t.get("amc_percentage")
        elif unit_rate is not None:
            row.unit_rate = unit_rate
        row.uom_id = uom_id
        row.currency_id = currency_id

    for t in tiers:
        if t["tier_id"] in existing_by_tier or not priced(t):
            continue
        db.add(RateCard(
            rate_card_version_id=rate_card_version_id,
            country_id=country_id,
            deployment_model_id=deployment_model_id,
            pricing_model_id=pricing_model_id,
            tier_id=t["tier_id"],
            uom_id=uom_id,
            pack_version_id=pack_version_id,
            feature_id=feature_id,
            currency_id=currency_id,
            fixed_fee=t.get("fixed_fee"),
            unit_rate=unit_for(t),
            amc_percentage=t.get("amc_percentage"),
        ))

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation saving rate card: {exc.orig}") from exc

    saved = db.execute(schedule_query(uom_id).order_by(RateCard.id)).scalars().all()
    return [get_rate_card(db, r.id) for r in saved]


def update_rate_cards_uom_for_target(
    db: Session,
    rate_card_version_id: int,
    country_id: int,
    deployment_model_id: int,
    pricing_model_id: int,
    uom_id: int,
    pack_version_id: Optional[int] = None,
    feature_id: Optional[int] = None,
) -> int:
    rcv = db.get(RateCardVersion, rate_card_version_id)
    if not rcv:
        raise ResourceNotFoundError(f"Rate card version with id {rate_card_version_id} not found")
    if rcv.status == "retired":
        raise ProposalConflictError(f"Cannot modify rate cards for retired rate card version '{rcv.version_no}'")
    pm = db.get(PricingModel, pricing_model_id)
    if not pm:
        raise ResourceNotFoundError(f"Pricing model with id {pricing_model_id} not found")
    uom = db.get(UnitOfMeasure, uom_id)
    if not uom:
        raise ResourceNotFoundError(f"Unit of measure with id {uom_id} not found")
    validate_uom_for_pricing_model(db, pm, uom)

    stmt = select(RateCard).where(
        RateCard.rate_card_version_id == rate_card_version_id,
        RateCard.country_id == country_id,
        RateCard.deployment_model_id == deployment_model_id,
        RateCard.pricing_model_id == pricing_model_id,
    )
    if pack_version_id is not None:
        stmt = stmt.where(RateCard.pack_version_id == pack_version_id)
    elif feature_id is not None:
        stmt = stmt.where(RateCard.feature_id == feature_id)
    else:
        raise ProposalValidationError("Either pack_version_id or feature_id must be specified")

    items = list(db.execute(stmt).scalars().all())
    count = len(items)
    for item in items:
        item.uom_id = uom_id

    try:
        db.commit()
        return count
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot update rate card UOM: {exc.orig}") from exc


# =============================================================================
# 3. ServiceRate Operations
# =============================================================================

def list_service_rates(
    db: Session,
    country_id: Optional[int] = None,
    status: Optional[str] = None,
) -> List[ServiceRate]:
    stmt = (
        select(ServiceRate)
        .options(joinedload(ServiceRate.country), joinedload(ServiceRate.currency))
        .order_by(ServiceRate.id)
    )
    if country_id is not None:
        stmt = stmt.where(ServiceRate.country_id == country_id)
    if status:
        stmt = stmt.where(ServiceRate.status == status)

    records = list(db.execute(stmt).scalars().all())
    for r in records:
        if r.daily_rate is None and r.hourly_rate is not None and r.hours_per_day is not None:
            r.daily_rate = r.hourly_rate * r.hours_per_day
    return records


def get_service_rate(db: Session, service_rate_id: int) -> Optional[ServiceRate]:
    stmt = (
        select(ServiceRate)
        .options(joinedload(ServiceRate.country), joinedload(ServiceRate.currency))
        .where(ServiceRate.id == service_rate_id)
    )
    sr = db.execute(stmt).scalars().first()
    if sr and sr.daily_rate is None and sr.hourly_rate is not None and sr.hours_per_day is not None:
        sr.daily_rate = sr.hourly_rate * sr.hours_per_day
    return sr


def create_service_rate(
    db: Session,
    role_name: str,
    country_id: int,
    currency_id: int,
    hourly_rate: Optional[Decimal] = None,
    hours_per_day: Decimal = Decimal("8.00"),
    daily_rate: Optional[Decimal] = None,
    cost_rate: Optional[Decimal] = None,
    valid_from: Optional[date] = None,
    valid_to: Optional[date] = None,
    status: str = "active",
) -> ServiceRate:
    role_name = role_name.strip()
    if not role_name:
        raise ProposalValidationError("Role name / service line is required")

    country = db.get(Country, country_id)
    if not country:
        raise ResourceNotFoundError(f"Country with id {country_id} not found")

    currency = db.get(Currency, currency_id)
    if not currency:
        raise ResourceNotFoundError(f"Currency with id {currency_id} not found")

    if hourly_rate is not None and hourly_rate < 0:
        raise ProposalValidationError("Hourly rate cannot be negative")

    eff_valid_from = valid_from or date.today()

    # Check duplicate on (role_name, country_id, valid_from)
    dup = db.execute(
        select(ServiceRate).where(
            func.lower(ServiceRate.role_name) == role_name.lower(),
            ServiceRate.country_id == country_id,
            ServiceRate.valid_from == eff_valid_from,
        )
    ).scalars().first()
    if dup:
        raise ProposalConflictError(
            f"Service rate for '{role_name}' in country '{country.name}' starting {eff_valid_from} already exists"
        )

    # Calculate daily_rate if not provided
    computed_daily = daily_rate
    if computed_daily is None and hourly_rate is not None:
        computed_daily = hourly_rate * hours_per_day

    sr = ServiceRate(
        role_name=role_name,
        country_id=country_id,
        hourly_rate=hourly_rate,
        hours_per_day=hours_per_day,
        daily_rate=computed_daily,
        cost_rate=cost_rate,
        currency_id=currency_id,
        valid_from=eff_valid_from,
        valid_to=valid_to,
        status=status,
    )
    db.add(sr)
    try:
        db.commit()
        db.refresh(sr)
        return get_service_rate(db, sr.id)
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation creating service rate: {exc.orig}") from exc


def update_service_rate(db: Session, service_rate_id: int, data: ServiceRateUpdate) -> ServiceRate:
    sr = db.get(ServiceRate, service_rate_id)
    if not sr:
        raise ResourceNotFoundError(f"Service rate with id {service_rate_id} not found")

    update_dict = data.model_dump(exclude_unset=True)
    if "role_name" in update_dict and update_dict["role_name"] is not None:
        sr.role_name = update_dict["role_name"].strip()
    if "country_id" in update_dict and update_dict["country_id"] is not None:
        if not db.get(Country, update_dict["country_id"]):
            raise ResourceNotFoundError(f"Country with id {update_dict['country_id']} not found")
        sr.country_id = update_dict["country_id"]
    if "currency_id" in update_dict and update_dict["currency_id"] is not None:
        if not db.get(Currency, update_dict["currency_id"]):
            raise ResourceNotFoundError(f"Currency with id {update_dict['currency_id']} not found")
        sr.currency_id = update_dict["currency_id"]

    for field in ("hourly_rate", "hours_per_day", "daily_rate", "cost_rate", "valid_from", "valid_to", "status"):
        if field in update_dict:
            setattr(sr, field, update_dict[field])

    # Recalculate daily rate if hourly_rate updated and daily_rate not explicitly set
    if "hourly_rate" in update_dict and "daily_rate" not in update_dict:
        if sr.hourly_rate is not None:
            sr.daily_rate = sr.hourly_rate * sr.hours_per_day

    try:
        db.commit()
        db.refresh(sr)
        return get_service_rate(db, sr.id)
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation updating service rate: {exc.orig}") from exc


def delete_service_rate(db: Session, service_rate_id: int) -> None:
    sr = db.get(ServiceRate, service_rate_id)
    if not sr:
        raise ResourceNotFoundError(f"Service rate with id {service_rate_id} not found")
    try:
        db.delete(sr)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot delete service rate: {exc.orig}") from exc
