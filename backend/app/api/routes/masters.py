"""FastAPI router for Master Data endpoints (Wave 1 & Page 3 integration)."""

from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.errors import DOMAIN_ERRORS, http_error
from app.db.session import get_db
from app.models.governance import ApprovalThreshold
from app.schemas.governance import ApprovalThresholdResponse
from app.models.master_data import (
    Currency,
    Country,
    DeploymentModel,
    PricingModel,
    CustomerTier,
    ContractTerm,
    DeploymentPricingOption,
    UnitOfMeasure,
    FxRate,
)
from app.schemas.master_data import (
    CurrencyCreate,
    CurrencyResponse,
    CurrencyUpdate,
    CountryCreate,
    CountryDetailResponse,
    CountryResponse,
    CountryUpdate,
    DeploymentModelCreate,
    DeploymentModelResponse,
    DeploymentModelUpdate,
    PricingModelCreate,
    PricingModelResponse,
    PricingModelUpdate,
    CustomerTierCreate,
    CustomerTierResponse,
    CustomerTierUpdate,
    ContractTermResponse,
    DeploymentPricingOptionResponse,
    UnitOfMeasureCreate,
    UnitOfMeasureResponse,
    UnitOfMeasureUpdate,
    FxRateCreate,
    FxRateDetailResponse,
    FxRateResponse,
)
from app.services.master_service import (
    list_currencies as service_list_currencies,
    create_currency as service_create_currency,
    list_countries as service_list_countries,
    get_country as service_get_country,
    create_country as service_create_country,
    update_country as service_update_country,
    delete_country as service_delete_country,
    list_customer_tiers as service_list_customer_tiers,
    get_customer_tier as service_get_customer_tier,
    create_customer_tier as service_create_customer_tier,
    update_customer_tier as service_update_customer_tier,
    delete_customer_tier as service_delete_customer_tier,
    list_deployment_models as service_list_deployment_models,
    create_deployment_model as service_create_deployment_model,
    update_deployment_model as service_update_deployment_model,
    delete_deployment_model as service_delete_deployment_model,
    list_pricing_models as service_list_pricing_models,
    create_pricing_model as service_create_pricing_model,
    update_pricing_model as service_update_pricing_model,
    delete_pricing_model as service_delete_pricing_model,
    list_units_of_measure as service_list_units_of_measure,
    get_unit_of_measure as service_get_unit_of_measure,
    create_unit_of_measure as service_create_unit_of_measure,
    update_unit_of_measure as service_update_unit_of_measure,
    delete_unit_of_measure as service_delete_unit_of_measure,
    list_allowed_uoms_for_pricing_model as service_list_allowed_uoms_for_pricing_model,
    list_fx_rates as service_list_fx_rates,
    create_fx_rate as service_create_fx_rate,
    delete_fx_rate as service_delete_fx_rate,
)

router = APIRouter()


# =============================================================================
# Helper Request Schemas for UI Integration
# =============================================================================

class CountryCreatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100)
    iso_code: Optional[str] = Field(None, min_length=2, max_length=2)
    currency_id: Optional[int] = Field(None, gt=0)
    currency_code: Optional[str] = Field(None, min_length=1, max_length=10)
    currency_symbol: Optional[str] = Field(None, max_length=10)
    price_multiplier: Optional[Decimal] = Field(default=Decimal("1.000000"), gt=Decimal("0"))
    status: Optional[str] = "active"
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None


class CustomerTierCreatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=100)
    employee_min: Optional[int] = Field(default=0, ge=0)
    employee_max: Optional[int] = Field(default=None, ge=0)
    default_multiplier: Optional[Decimal] = Field(default=Decimal("1.000000"), gt=Decimal("0"))
    status: Optional[str] = "active"
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None


class FxRateCreatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    from_currency_id: int = Field(..., gt=0)
    to_currency_id: int = Field(..., gt=0)
    rate: Decimal = Field(..., gt=Decimal("0"))
    effective_date: Optional[date] = None
    rate_source: Optional[str] = Field(None, max_length=100)


# =============================================================================
# 1. Currencies
# =============================================================================

@router.get("/currencies", response_model=List[CurrencyResponse], summary="List all currencies")
def list_currencies(status: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return service_list_currencies(db=db, status=status)


@router.post("/currencies", response_model=CurrencyResponse, status_code=status.HTTP_201_CREATED, summary="Create currency")
def create_currency(payload: CurrencyCreate, db: Session = Depends(get_db)):
    try:
        return service_create_currency(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 2. Countries
# =============================================================================

@router.get("/countries", response_model=List[CountryDetailResponse], summary="List all countries with currencies")
def list_countries(status: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return service_list_countries(db=db, status=status)


@router.post("/countries", response_model=CountryDetailResponse, status_code=status.HTTP_201_CREATED, summary="Create country")
def create_country(payload: CountryCreatePayload, db: Session = Depends(get_db)):
    try:
        return service_create_country(
            db=db,
            name=payload.name,
            iso_code=payload.iso_code,
            currency_id=payload.currency_id,
            currency_code=payload.currency_code,
            currency_symbol=payload.currency_symbol,
            price_multiplier=payload.price_multiplier or Decimal("1.000000"),
            status=payload.status or "active",
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get("/countries/{country_id}", response_model=CountryDetailResponse, summary="Get country by ID")
def get_country(country_id: int, db: Session = Depends(get_db)):
    country = service_get_country(db=db, country_id=country_id)
    if not country:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Country with id {country_id} not found")
    return country


@router.patch("/countries/{country_id}", response_model=CountryDetailResponse, summary="Update country")
def update_country(country_id: int, payload: CountryUpdate, db: Session = Depends(get_db)):
    try:
        return service_update_country(db=db, country_id=country_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/countries/{country_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete country")
def delete_country(country_id: int, db: Session = Depends(get_db)):
    try:
        service_delete_country(db=db, country_id=country_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 3. Customer Tiers
# =============================================================================

@router.get("/customer-tiers", response_model=List[CustomerTierResponse], summary="List all customer tiers")
def list_customer_tiers(status: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return service_list_customer_tiers(db=db, status=status)


@router.post("/customer-tiers", response_model=CustomerTierResponse, status_code=status.HTTP_201_CREATED, summary="Create customer tier")
def create_customer_tier(payload: CustomerTierCreatePayload, db: Session = Depends(get_db)):
    try:
        tier_data = CustomerTierCreate(
            name=payload.name,
            employee_min=payload.employee_min if payload.employee_min is not None else 0,
            employee_max=payload.employee_max,
            default_multiplier=payload.default_multiplier or Decimal("1.000000"),
            status=payload.status or "active",
            valid_from=payload.valid_from or date.today(),
            valid_to=payload.valid_to,
        )
        return service_create_customer_tier(db=db, data=tier_data)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get("/customer-tiers/{tier_id}", response_model=CustomerTierResponse, summary="Get customer tier by ID")
def get_customer_tier(tier_id: int, db: Session = Depends(get_db)):
    tier = service_get_customer_tier(db=db, tier_id=tier_id)
    if not tier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Customer tier with id {tier_id} not found")
    return tier


@router.patch("/customer-tiers/{tier_id}", response_model=CustomerTierResponse, summary="Update customer tier")
def update_customer_tier(tier_id: int, payload: CustomerTierUpdate, db: Session = Depends(get_db)):
    try:
        return service_update_customer_tier(db=db, tier_id=tier_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/customer-tiers/{tier_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete customer tier")
def delete_customer_tier(tier_id: int, db: Session = Depends(get_db)):
    try:
        service_delete_customer_tier(db=db, tier_id=tier_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 4. Deployment Models
# =============================================================================

@router.get("/deployment-models", response_model=List[DeploymentModelResponse], summary="List all deployment models")
def list_deployment_models(status: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return service_list_deployment_models(db=db, status=status)


@router.post("/deployment-models", response_model=DeploymentModelResponse, status_code=status.HTTP_201_CREATED, summary="Create deployment model")
def create_deployment_model(payload: DeploymentModelCreate, db: Session = Depends(get_db)):
    try:
        return service_create_deployment_model(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.patch("/deployment-models/{model_id}", response_model=DeploymentModelResponse, summary="Update deployment model")
def update_deployment_model(model_id: int, payload: DeploymentModelUpdate, db: Session = Depends(get_db)):
    try:
        return service_update_deployment_model(db=db, model_id=model_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/deployment-models/{model_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete deployment model")
def delete_deployment_model(model_id: int, db: Session = Depends(get_db)):
    try:
        service_delete_deployment_model(db=db, model_id=model_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 5. Pricing Models
# =============================================================================

@router.get("/pricing-models", response_model=List[PricingModelResponse], summary="List all pricing models")
def list_pricing_models(status: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return service_list_pricing_models(db=db, status=status)


@router.post("/pricing-models", response_model=PricingModelResponse, status_code=status.HTTP_201_CREATED, summary="Create pricing model")
def create_pricing_model(payload: PricingModelCreate, db: Session = Depends(get_db)):
    try:
        return service_create_pricing_model(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.patch("/pricing-models/{model_id}", response_model=PricingModelResponse, summary="Update pricing model")
def update_pricing_model(model_id: int, payload: PricingModelUpdate, db: Session = Depends(get_db)):
    try:
        return service_update_pricing_model(db=db, model_id=model_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/pricing-models/{model_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete pricing model")
def delete_pricing_model(model_id: int, db: Session = Depends(get_db)):
    try:
        service_delete_pricing_model(db=db, model_id=model_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get(
    "/pricing-models/{model_id}/allowed-uoms",
    response_model=List[UnitOfMeasureResponse],
    summary="Retrieve allowed units of measure for a pricing model",
)
def get_allowed_uoms_for_pricing_model(model_id: int, db: Session = Depends(get_db)):
    try:
        return service_list_allowed_uoms_for_pricing_model(db=db, pricing_model_id=model_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get(
    "/approval-thresholds",
    response_model=List[ApprovalThresholdResponse],
    summary="List approval thresholds in effect today (read-only)",
)
def list_approval_thresholds(db: Session = Depends(get_db)):
    """Active approval thresholds whose validity covers today, straight from approval_thresholds.

    Shown on Pricing & Discounts instead of invented demo values. Nothing enforces them yet.
    """
    today = date.today()
    stmt = (
        select(ApprovalThreshold)
        .where(
            ApprovalThreshold.status == "active",
            ApprovalThreshold.valid_from <= today,
            or_(ApprovalThreshold.valid_to.is_(None), ApprovalThreshold.valid_to >= today),
        )
        .order_by(ApprovalThreshold.threshold_type, ApprovalThreshold.value_pct)
    )
    return list(db.execute(stmt).scalars().all())


# =============================================================================
# 6. FX Exchange Rates
# =============================================================================

@router.get("/fx-rates", response_model=List[FxRateDetailResponse], summary="List FX exchange rates")
def list_fx_rates(
    from_currency_id: Optional[int] = Query(None),
    to_currency_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return service_list_fx_rates(db=db, from_currency_id=from_currency_id, to_currency_id=to_currency_id)


@router.post("/fx-rates", response_model=FxRateDetailResponse, status_code=status.HTTP_201_CREATED, summary="Create FX rate")
def create_fx_rate(payload: FxRateCreatePayload, db: Session = Depends(get_db)):
    try:
        return service_create_fx_rate(
            db=db,
            from_currency_id=payload.from_currency_id,
            to_currency_id=payload.to_currency_id,
            rate=payload.rate,
            effective_date=payload.effective_date,
            rate_source=payload.rate_source,
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/fx-rates/{fx_rate_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete FX rate")
def delete_fx_rate(fx_rate_id: int, db: Session = Depends(get_db)):
    try:
        service_delete_fx_rate(db=db, fx_rate_id=fx_rate_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 7. Other Masters (Contract Terms, UOMs, Deployment-Pricing Options)
# =============================================================================

@router.get("/contract-terms", response_model=List[ContractTermResponse], summary="List all contract terms")
def list_contract_terms(db: Session = Depends(get_db)):
    stmt = select(ContractTerm).order_by(ContractTerm.id)
    return db.execute(stmt).scalars().all()


@router.get("/units-of-measure", response_model=List[UnitOfMeasureResponse], summary="List all units of measure")
def list_units_of_measure(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return service_list_units_of_measure(db=db, status=status, category=category)


@router.post(
    "/units-of-measure",
    response_model=UnitOfMeasureResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new unit of measure",
)
def create_unit_of_measure(payload: UnitOfMeasureCreate, db: Session = Depends(get_db)):
    try:
        return service_create_unit_of_measure(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get(
    "/units-of-measure/{uom_id}",
    response_model=UnitOfMeasureResponse,
    summary="Get unit of measure by ID",
)
def get_unit_of_measure(uom_id: int, db: Session = Depends(get_db)):
    uom = service_get_unit_of_measure(db=db, uom_id=uom_id)
    if not uom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unit of measure with id {uom_id} not found",
        )
    return uom


@router.patch(
    "/units-of-measure/{uom_id}",
    response_model=UnitOfMeasureResponse,
    summary="Update an existing unit of measure",
)
def update_unit_of_measure(
    uom_id: int, payload: UnitOfMeasureUpdate, db: Session = Depends(get_db)
):
    try:
        return service_update_unit_of_measure(db=db, uom_id=uom_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete(
    "/units-of-measure/{uom_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete or retire a unit of measure",
)
def delete_unit_of_measure(uom_id: int, db: Session = Depends(get_db)):
    try:
        service_delete_unit_of_measure(db=db, uom_id=uom_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get(
    "/deployment-pricing-options",
    response_model=List[DeploymentPricingOptionResponse],
    summary="List which pricing models are allowed for each deployment model",
)
def list_deployment_pricing_options(db: Session = Depends(get_db)):
    stmt = select(DeploymentPricingOption).order_by(
        DeploymentPricingOption.deployment_model_id, DeploymentPricingOption.pricing_model_id
    )
    return db.execute(stmt).scalars().all()
