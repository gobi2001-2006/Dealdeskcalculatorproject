"""Master Data Service Layer.

Provides business logic and transaction management for:
- Currency
- Country
- CustomerTier
- DeploymentModel
- PricingModel
- FxRate
"""

import logging
from datetime import date, timezone
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.master_data import (
    Currency,
    Country,
    CustomerTier,
    DeploymentModel,
    PricingModel,
    UnitOfMeasure,
    FxRate,
)
from app.models.rate_card import RateCard, ServiceRate
from app.schemas.master_data import (
    CurrencyCreate,
    CurrencyUpdate,
    CountryCreate,
    CountryUpdate,
    CustomerTierCreate,
    CustomerTierUpdate,
    DeploymentModelCreate,
    DeploymentModelUpdate,
    PricingModelCreate,
    PricingModelUpdate,
    FxRateCreate,
)
from app.services.proposal_service import (
    ResourceNotFoundError,
    ProposalConflictError,
    ProposalValidationError,
)

logger = logging.getLogger(__name__)


# =============================================================================
# 1. Currency Operations
# =============================================================================

def list_currencies(db: Session, status: Optional[str] = None) -> List[Currency]:
    stmt = select(Currency).order_by(Currency.id)
    if status:
        stmt = stmt.where(Currency.status == status)
    return list(db.execute(stmt).scalars().all())


def get_currency(db: Session, currency_id: int) -> Optional[Currency]:
    return db.get(Currency, currency_id)


def get_currency_by_code(db: Session, code: str) -> Optional[Currency]:
    stmt = select(Currency).where(func.upper(Currency.code) == code.strip().upper())
    return db.execute(stmt).scalars().first()


def create_currency(db: Session, data: CurrencyCreate) -> Currency:
    code_upper = data.code.strip().upper()
    existing = get_currency_by_code(db, code_upper)
    if existing:
        raise ProposalConflictError(f"Currency with code '{code_upper}' already exists")

    currency = Currency(
        code=code_upper,
        name=data.name.strip(),
        symbol=data.symbol.strip() if data.symbol else None,
        decimal_places=data.decimal_places,
        status=data.status,
    )
    db.add(currency)
    try:
        db.commit()
        db.refresh(currency)
        return currency
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation creating currency: {exc.orig}") from exc


def get_or_create_currency(db: Session, code: str, name: Optional[str] = None, symbol: Optional[str] = None) -> Currency:
    code_upper = code.strip().upper()
    currency = get_currency_by_code(db, code_upper)
    if currency:
        return currency
    return create_currency(
        db,
        CurrencyCreate(
            code=code_upper,
            name=name.strip() if name else code_upper,
            symbol=symbol.strip() if symbol else code_upper,
            decimal_places=2,
            status="active",
        ),
    )


# =============================================================================
# 2. Country Operations
# =============================================================================

def list_countries(db: Session, status: Optional[str] = None) -> List[Country]:
    stmt = select(Country).options(joinedload(Country.currency)).order_by(Country.id)
    if status:
        stmt = stmt.where(Country.status == status)
    return list(db.execute(stmt).scalars().all())


def get_country(db: Session, country_id: int) -> Optional[Country]:
    stmt = select(Country).options(joinedload(Country.currency)).where(Country.id == country_id)
    return db.execute(stmt).scalars().first()


def _generate_unique_iso_code(db: Session, country_name: str) -> str:
    cleaned = "".join(ch for ch in country_name if ch.isalpha()).upper()
    prefix = cleaned[:2] if len(cleaned) >= 2 else (cleaned + "X")[:2]
    candidate = prefix
    existing_codes = set(db.execute(select(Country.iso_code)).scalars().all())
    if candidate not in existing_codes:
        return candidate

    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        candidate = prefix[0] + ch
        if candidate not in existing_codes:
            return candidate

    import random
    while True:
        candidate = "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ", k=2))
        if candidate not in existing_codes:
            return candidate


def create_country(
    db: Session,
    name: str,
    iso_code: Optional[str] = None,
    currency_id: Optional[int] = None,
    currency_code: Optional[str] = None,
    currency_symbol: Optional[str] = None,
    price_multiplier: Decimal = Decimal("1.000000"),
    status: str = "active",
    valid_from: Optional[date] = None,
    valid_to: Optional[date] = None,
) -> Country:
    trimmed_name = name.strip()
    if not trimmed_name:
        raise ProposalValidationError("Country name is required")

    # Check duplicate country name
    dup = db.execute(
        select(Country).where(func.lower(Country.name) == trimmed_name.lower())
    ).scalars().first()
    if dup:
        raise ProposalConflictError(f"A country named '{trimmed_name}' already exists")

    # Resolve currency
    if currency_id is not None:
        curr = get_currency(db, currency_id)
        if not curr:
            raise ResourceNotFoundError(f"Currency with id {currency_id} not found")
        resolved_curr_id = curr.id
    elif currency_code:
        curr = get_or_create_currency(db, code=currency_code, name=currency_code, symbol=currency_symbol)
        resolved_curr_id = curr.id
    else:
        raise ProposalValidationError("Either currency_id or currency_code must be provided")

    # Resolve ISO code
    if iso_code and iso_code.strip():
        resolved_iso = iso_code.strip().upper()[:2]
        iso_dup = db.execute(
            select(Country).where(Country.iso_code == resolved_iso)
        ).scalars().first()
        if iso_dup:
            raise ProposalConflictError(f"Country with ISO code '{resolved_iso}' already exists")
    else:
        resolved_iso = _generate_unique_iso_code(db, trimmed_name)

    country = Country(
        name=trimmed_name,
        iso_code=resolved_iso,
        currency_id=resolved_curr_id,
        price_multiplier=price_multiplier,
        status=status,
        valid_from=valid_from or date.today(),
        valid_to=valid_to,
    )
    db.add(country)
    try:
        db.commit()
        db.refresh(country)
        return get_country(db, country.id)
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation creating country: {exc.orig}") from exc


def update_country(db: Session, country_id: int, data: CountryUpdate) -> Country:
    country = db.get(Country, country_id)
    if not country:
        raise ResourceNotFoundError(f"Country with id {country_id} not found")

    update_dict = data.model_dump(exclude_unset=True)
    if "name" in update_dict and update_dict["name"] is not None:
        trimmed = update_dict["name"].strip()
        dup = db.execute(
            select(Country).where(func.lower(Country.name) == trimmed.lower(), Country.id != country_id)
        ).scalars().first()
        if dup:
            raise ProposalConflictError(f"A country named '{trimmed}' already exists")
        country.name = trimmed

    if "iso_code" in update_dict and update_dict["iso_code"] is not None:
        iso_upper = update_dict["iso_code"].strip().upper()
        iso_dup = db.execute(
            select(Country).where(Country.iso_code == iso_upper, Country.id != country_id)
        ).scalars().first()
        if iso_dup:
            raise ProposalConflictError(f"Country with ISO code '{iso_upper}' already exists")
        country.iso_code = iso_upper

    if "currency_id" in update_dict and update_dict["currency_id"] is not None:
        curr = get_currency(db, update_dict["currency_id"])
        if not curr:
            raise ResourceNotFoundError(f"Currency with id {update_dict['currency_id']} not found")
        country.currency_id = curr.id

    for field in ("price_multiplier", "status", "valid_from", "valid_to"):
        if field in update_dict and update_dict[field] is not None:
            setattr(country, field, update_dict[field])

    try:
        db.commit()
        db.refresh(country)
        return get_country(db, country.id)
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation updating country: {exc.orig}") from exc


def delete_country(db: Session, country_id: int) -> None:
    country = db.get(Country, country_id)
    if not country:
        raise ResourceNotFoundError(f"Country with id {country_id} not found")

    # Check deletion restrictions
    rate_card_ref = db.execute(select(RateCard).where(RateCard.country_id == country_id)).first()
    if rate_card_ref:
        raise ProposalConflictError(f"Cannot delete country '{country.name}' because it is referenced in rate cards")

    service_rate_ref = db.execute(select(ServiceRate).where(ServiceRate.country_id == country_id)).first()
    if service_rate_ref:
        raise ProposalConflictError(f"Cannot delete country '{country.name}' because it is referenced in service rates")

    try:
        db.delete(country)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot delete country: {exc.orig}") from exc


# =============================================================================
# 3. Customer Tier Operations
# =============================================================================

def list_customer_tiers(db: Session, status: Optional[str] = None) -> List[CustomerTier]:
    stmt = select(CustomerTier).order_by(CustomerTier.id)
    if status:
        stmt = stmt.where(CustomerTier.status == status)
    return list(db.execute(stmt).scalars().all())


def get_customer_tier(db: Session, tier_id: int) -> Optional[CustomerTier]:
    return db.get(CustomerTier, tier_id)


def create_customer_tier(db: Session, data: CustomerTierCreate) -> CustomerTier:
    trimmed_name = data.name.strip()
    dup = db.execute(
        select(CustomerTier).where(func.lower(CustomerTier.name) == trimmed_name.lower())
    ).scalars().first()
    if dup:
        raise ProposalConflictError(f"A pricing tier named '{trimmed_name}' already exists")

    tier = CustomerTier(
        name=trimmed_name,
        employee_min=data.employee_min,
        employee_max=data.employee_max,
        default_multiplier=data.default_multiplier,
        status=data.status,
        valid_from=data.valid_from or date.today(),
        valid_to=data.valid_to,
    )
    db.add(tier)
    try:
        db.commit()
        db.refresh(tier)
        return tier
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation creating tier: {exc.orig}") from exc


def update_customer_tier(db: Session, tier_id: int, data: CustomerTierUpdate) -> CustomerTier:
    tier = db.get(CustomerTier, tier_id)
    if not tier:
        raise ResourceNotFoundError(f"Customer tier with id {tier_id} not found")

    update_dict = data.model_dump(exclude_unset=True)
    if "name" in update_dict and update_dict["name"] is not None:
        trimmed = update_dict["name"].strip()
        dup = db.execute(
            select(CustomerTier).where(func.lower(CustomerTier.name) == trimmed.lower(), CustomerTier.id != tier_id)
        ).scalars().first()
        if dup:
            raise ProposalConflictError(f"A pricing tier named '{trimmed}' already exists")
        tier.name = trimmed

    for field in ("employee_min", "employee_max", "default_multiplier", "status", "valid_from", "valid_to"):
        if field in update_dict and update_dict[field] is not None:
            setattr(tier, field, update_dict[field])

    try:
        db.commit()
        db.refresh(tier)
        return tier
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation updating tier: {exc.orig}") from exc


def delete_customer_tier(db: Session, tier_id: int) -> None:
    tier = db.get(CustomerTier, tier_id)
    if not tier:
        raise ResourceNotFoundError(f"Customer tier with id {tier_id} not found")

    rate_card_ref = db.execute(select(RateCard).where(RateCard.tier_id == tier_id)).first()
    if rate_card_ref:
        raise ProposalConflictError(f"Cannot delete pricing tier '{tier.name}' because it has configured rate card values")

    try:
        db.delete(tier)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot delete customer tier: {exc.orig}") from exc


# =============================================================================
# 4. Deployment Model Operations
# =============================================================================

def list_deployment_models(db: Session, status: Optional[str] = None) -> List[DeploymentModel]:
    stmt = select(DeploymentModel).order_by(DeploymentModel.id)
    if status:
        stmt = stmt.where(DeploymentModel.status == status)
    return list(db.execute(stmt).scalars().all())


def create_deployment_model(db: Session, data: DeploymentModelCreate) -> DeploymentModel:
    code = data.code.strip()
    name = data.name.strip()

    dup = db.execute(
        select(DeploymentModel).where(or_(
            func.lower(DeploymentModel.code) == code.lower(),
            func.lower(DeploymentModel.name) == name.lower(),
        ))
    ).scalars().first()
    if dup:
        raise ProposalConflictError(f"Deployment model '{name}' or code '{code}' already exists")

    model = DeploymentModel(
        code=code,
        name=name,
        description=data.description.strip() if data.description else None,
        cost_basis_flag=data.cost_basis_flag,
        status=data.status,
    )
    db.add(model)
    try:
        db.commit()
        db.refresh(model)
        return model
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation creating deployment model: {exc.orig}") from exc


def update_deployment_model(db: Session, model_id: int, data: DeploymentModelUpdate) -> DeploymentModel:
    model = db.get(DeploymentModel, model_id)
    if not model:
        raise ResourceNotFoundError(f"Deployment model with id {model_id} not found")

    update_dict = data.model_dump(exclude_unset=True)
    if "code" in update_dict and update_dict["code"] is not None:
        code = update_dict["code"].strip()
        dup = db.execute(
            select(DeploymentModel).where(func.lower(DeploymentModel.code) == code.lower(), DeploymentModel.id != model_id)
        ).scalars().first()
        if dup:
            raise ProposalConflictError(f"Deployment model code '{code}' already exists")
        model.code = code

    if "name" in update_dict and update_dict["name"] is not None:
        name = update_dict["name"].strip()
        dup = db.execute(
            select(DeploymentModel).where(func.lower(DeploymentModel.name) == name.lower(), DeploymentModel.id != model_id)
        ).scalars().first()
        if dup:
            raise ProposalConflictError(f"Deployment model named '{name}' already exists")
        model.name = name

    for field in ("description", "cost_basis_flag", "status"):
        if field in update_dict:
            setattr(model, field, update_dict[field])

    try:
        db.commit()
        db.refresh(model)
        return model
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation updating deployment model: {exc.orig}") from exc


def delete_deployment_model(db: Session, model_id: int) -> None:
    model = db.get(DeploymentModel, model_id)
    if not model:
        raise ResourceNotFoundError(f"Deployment model with id {model_id} not found")

    rate_card_ref = db.execute(select(RateCard).where(RateCard.deployment_model_id == model_id)).first()
    if rate_card_ref:
        raise ProposalConflictError(f"Cannot delete deployment model '{model.name}' because it is referenced in rate cards")

    try:
        db.delete(model)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot delete deployment model: {exc.orig}") from exc


# =============================================================================
# 5. Pricing Model Operations
# =============================================================================

def list_pricing_models(db: Session, status: Optional[str] = None) -> List[PricingModel]:
    stmt = select(PricingModel).order_by(PricingModel.id)
    if status:
        stmt = stmt.where(PricingModel.status == status)
    return list(db.execute(stmt).scalars().all())


def create_pricing_model(db: Session, data: PricingModelCreate) -> PricingModel:
    code = data.code.strip()
    name = data.name.strip()

    dup = db.execute(
        select(PricingModel).where(or_(
            func.lower(PricingModel.code) == code.lower(),
            func.lower(PricingModel.name) == name.lower(),
        ))
    ).scalars().first()
    if dup:
        raise ProposalConflictError(f"Pricing model '{name}' or code '{code}' already exists")

    model = PricingModel(
        code=code,
        name=name,
        description=data.description.strip() if data.description else None,
        has_fixed_component=data.has_fixed_component,
        has_unit_component=data.has_unit_component,
        fixed_fee_basis=data.fixed_fee_basis,
        uom_locked_id=data.uom_locked_id,
        status=data.status,
    )
    db.add(model)
    try:
        db.commit()
        db.refresh(model)
        return model
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation creating pricing model: {exc.orig}") from exc


def update_pricing_model(db: Session, model_id: int, data: PricingModelUpdate) -> PricingModel:
    model = db.get(PricingModel, model_id)
    if not model:
        raise ResourceNotFoundError(f"Pricing model with id {model_id} not found")

    update_dict = data.model_dump(exclude_unset=True)
    if "code" in update_dict and update_dict["code"] is not None:
        code = update_dict["code"].strip()
        dup = db.execute(
            select(PricingModel).where(func.lower(PricingModel.code) == code.lower(), PricingModel.id != model_id)
        ).scalars().first()
        if dup:
            raise ProposalConflictError(f"Pricing model code '{code}' already exists")
        model.code = code

    if "name" in update_dict and update_dict["name"] is not None:
        name = update_dict["name"].strip()
        dup = db.execute(
            select(PricingModel).where(func.lower(PricingModel.name) == name.lower(), PricingModel.id != model_id)
        ).scalars().first()
        if dup:
            raise ProposalConflictError(f"Pricing model named '{name}' already exists")
        model.name = name

    for field in ("description", "has_fixed_component", "has_unit_component", "fixed_fee_basis", "uom_locked_id", "status"):
        if field in update_dict:
            setattr(model, field, update_dict[field])

    try:
        db.commit()
        db.refresh(model)
        return model
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation updating pricing model: {exc.orig}") from exc


def delete_pricing_model(db: Session, model_id: int) -> None:
    model = db.get(PricingModel, model_id)
    if not model:
        raise ResourceNotFoundError(f"Pricing model with id {model_id} not found")

    rate_card_ref = db.execute(select(RateCard).where(RateCard.pricing_model_id == model_id)).first()
    if rate_card_ref:
        raise ProposalConflictError(f"Cannot delete pricing model '{model.name}' because it is referenced in rate cards")

    try:
        db.delete(model)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot delete pricing model: {exc.orig}") from exc


# =============================================================================
# 6. FX Rate Operations
# =============================================================================

def list_fx_rates(
    db: Session,
    from_currency_id: Optional[int] = None,
    to_currency_id: Optional[int] = None,
) -> List[FxRate]:
    stmt = (
        select(FxRate)
        .options(joinedload(FxRate.from_currency), joinedload(FxRate.to_currency))
        .order_by(FxRate.effective_date.desc(), FxRate.id.desc())
    )
    if from_currency_id is not None:
        stmt = stmt.where(FxRate.from_currency_id == from_currency_id)
    if to_currency_id is not None:
        stmt = stmt.where(FxRate.to_currency_id == to_currency_id)
    return list(db.execute(stmt).scalars().all())


def create_fx_rate(
    db: Session,
    from_currency_id: int,
    to_currency_id: int,
    rate: Decimal,
    effective_date: Optional[date] = None,
    rate_source: Optional[str] = None,
) -> FxRate:
    if from_currency_id == to_currency_id:
        raise ProposalValidationError("from_currency_id and to_currency_id must be distinct currencies")
    if rate <= 0:
        raise ProposalValidationError("Exchange rate must be strictly positive")

    from_curr = get_currency(db, from_currency_id)
    if not from_curr:
        raise ResourceNotFoundError(f"Source currency with id {from_currency_id} not found")

    to_curr = get_currency(db, to_currency_id)
    if not to_curr:
        raise ResourceNotFoundError(f"Target currency with id {to_currency_id} not found")

    eff_date = effective_date or date.today()

    # Check unique constraint on (from_currency_id, to_currency_id, effective_date)
    existing = db.execute(
        select(FxRate).where(
            FxRate.from_currency_id == from_currency_id,
            FxRate.to_currency_id == to_currency_id,
            FxRate.effective_date == eff_date,
        )
    ).scalars().first()
    if existing:
        raise ProposalConflictError(
            f"Exchange rate from {from_curr.code} to {to_curr.code} on {eff_date} already exists"
        )

    fx = FxRate(
        from_currency_id=from_currency_id,
        to_currency_id=to_currency_id,
        rate=rate,
        rate_source=rate_source.strip() if rate_source else "Manual",
        effective_date=eff_date,
    )
    db.add(fx)
    try:
        db.commit()
        db.refresh(fx)
        stmt = (
            select(FxRate)
            .options(joinedload(FxRate.from_currency), joinedload(FxRate.to_currency))
            .where(FxRate.id == fx.id)
        )
        return db.execute(stmt).scalars().first()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Database constraint violation creating FX rate: {exc.orig}") from exc


def delete_fx_rate(db: Session, fx_rate_id: int) -> None:
    fx = db.get(FxRate, fx_rate_id)
    if not fx:
        raise ResourceNotFoundError(f"FX rate with id {fx_rate_id} not found")
    try:
        db.delete(fx)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProposalConflictError(f"Cannot delete FX rate: {exc.orig}") from exc
