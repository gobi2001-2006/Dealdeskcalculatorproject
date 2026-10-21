"""FastAPI router for pricing resolution and Rate Card / Service Rates management (Wave 3 & Page 3 integration)."""

from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import DOMAIN_ERRORS, http_error
from app.db.session import get_db
from app.models.master_data import Country, PricingModel, UnitOfMeasure
from app.schemas.rate_card import (
    RateCardCreate,
    RateCardDetailResponse,
    RateCardResponse,
    RateCardUpdate,
    RateCardVersionCreate,
    RateCardVersionResponse,
    RateCardVersionUpdate,
    ServiceRateCreate,
    ServiceRateDetailResponse,
    ServiceRateResponse,
    ServiceRateUpdate,
)
from app.services.pricing_engine import (
    AmbiguousRateCardMatchError,
    MissingConfigurationError,
    MissingRateCardMatchError,
    resolve_rate_card,
)
from app.services.proposal_service import (
    ResourceNotFoundError,
    ProposalValidationError,
    resolve_active_rate_card_version,
)
from app.services.rate_service import (
    list_rate_card_versions as service_list_rate_card_versions,
    get_rate_card_version as service_get_rate_card_version,
    get_active_rate_card_version as service_get_active_rate_card_version,
    create_rate_card_version as service_create_rate_card_version,
    activate_rate_card_version as service_activate_rate_card_version,
    list_rate_cards as service_list_rate_cards,
    get_rate_card as service_get_rate_card,
    create_rate_card as service_create_rate_card,
    upsert_rate_card as service_upsert_rate_card,
    update_rate_card as service_update_rate_card,
    delete_rate_card as service_delete_rate_card,
    delete_rate_cards_for_target as service_delete_rate_cards_for_target,
    list_service_rates as service_list_service_rates,
    get_service_rate as service_get_service_rate,
    create_service_rate as service_create_service_rate,
    update_service_rate as service_update_service_rate,
    delete_service_rate as service_delete_service_rate,
)

router = APIRouter()


# =============================================================================
# Helper Request Schemas
# =============================================================================

class RateCardResolveRequest(BaseModel):
    """The six pricing dimensions that identify exactly one rate-card row."""

    model_config = ConfigDict(str_strip_whitespace=True)

    rate_card_version_id: Optional[int] = Field(
        None, gt=0, description="Rate-card version to search; defaults to the active version"
    )
    country_id: int = Field(..., gt=0)
    deployment_model_id: int = Field(..., gt=0)
    pricing_model_id: int = Field(..., gt=0)
    tier_id: int = Field(..., gt=0)
    uom_id: int = Field(..., gt=0)
    pack_version_id: Optional[int] = Field(None, gt=0)
    feature_id: Optional[int] = Field(None, gt=0)

    @model_validator(mode="after")
    def validate_target_exclusive(self) -> "RateCardResolveRequest":
        if (self.pack_version_id is None) == (self.feature_id is None):
            raise ValueError("Exactly one of pack_version_id or feature_id must be provided")
        return self


class RateCardResolveResponse(BaseModel):
    """The single rate-card row that matched."""

    model_config = ConfigDict(from_attributes=True)

    rate_card_id: int
    rate_card_version_id: int
    country_id: int
    deployment_model_id: int
    pricing_model_id: int
    tier_id: int
    uom_id: int
    pack_version_id: Optional[int] = None
    feature_id: Optional[int] = None
    currency_id: int
    currency_code: str
    fixed_fee: Optional[Decimal] = None
    unit_rate: Optional[Decimal] = None
    floor_price: Optional[Decimal] = None


class ServiceRateCreatePayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    role_name: Optional[str] = None
    service_line: Optional[str] = None
    country_id: int = Field(..., gt=0)
    currency_id: Optional[int] = Field(None, gt=0)
    hourly_rate: Optional[Decimal] = Field(None, ge=Decimal("0"))
    hours_per_day: Optional[Decimal] = Field(Decimal("8.00"), gt=Decimal("0"), le=Decimal("24.00"))
    daily_rate: Optional[Decimal] = Field(None, ge=Decimal("0"))
    cost_rate: Optional[Decimal] = Field(None, ge=Decimal("0"))
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    status: Optional[str] = "active"


class RateCardUpsertPayload(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    rate_card_version_id: Optional[int] = Field(None, gt=0)
    country_id: int = Field(..., gt=0)
    deployment_model_id: int = Field(..., gt=0)
    pricing_model_id: int = Field(..., gt=0)
    tier_id: int = Field(..., gt=0)
    uom_id: Optional[int] = Field(None, gt=0)
    pack_version_id: Optional[int] = Field(None, gt=0)
    feature_id: Optional[int] = Field(None, gt=0)
    currency_id: Optional[int] = Field(None, gt=0)
    unit_rate: Optional[Decimal] = Field(None, ge=Decimal("0"))
    fixed_fee: Optional[Decimal] = Field(None, ge=Decimal("0"))
    floor_price: Optional[Decimal] = Field(None, ge=Decimal("0"))
    cost_fixed: Optional[Decimal] = Field(None, ge=Decimal("0"))
    cost_unit: Optional[Decimal] = Field(None, ge=Decimal("0"))


# =============================================================================
# 1. Commercial Pricing Resolution (Preserved)
# =============================================================================

@router.post(
    "/resolve",
    response_model=RateCardResolveResponse,
    summary="Resolve the single rate-card row for the six pricing dimensions",
    responses={
        404: {"description": "No rate-card row matches the dimensions"},
        409: {"description": "More than one row matches (ambiguous)"},
    },
)
def resolve_rates(request: RateCardResolveRequest, db: Session = Depends(get_db)):
    try:
        version_id = resolve_active_rate_card_version(db, request.rate_card_version_id).id
        rate_card = resolve_rate_card(
            db,
            rate_card_version_id=version_id,
            country_id=request.country_id,
            deployment_model_id=request.deployment_model_id,
            pricing_model_id=request.pricing_model_id,
            tier_id=request.tier_id,
            uom_id=request.uom_id,
            pack_version_id=request.pack_version_id,
            feature_id=request.feature_id,
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc
    except MissingRateCardMatchError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AmbiguousRateCardMatchError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except MissingConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return RateCardResolveResponse(
        rate_card_id=rate_card.id,
        rate_card_version_id=rate_card.rate_card_version_id,
        country_id=rate_card.country_id,
        deployment_model_id=rate_card.deployment_model_id,
        pricing_model_id=rate_card.pricing_model_id,
        tier_id=rate_card.tier_id,
        uom_id=rate_card.uom_id,
        pack_version_id=rate_card.pack_version_id,
        feature_id=rate_card.feature_id,
        currency_id=rate_card.currency_id,
        currency_code=rate_card.currency.code,
        fixed_fee=rate_card.fixed_fee,
        unit_rate=rate_card.unit_rate,
        floor_price=rate_card.floor_price,
    )


# =============================================================================
# 2. Rate Card Versions
# =============================================================================

@router.get("/versions", response_model=List[RateCardVersionResponse], summary="List all rate card versions")
def list_versions(status: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return service_list_rate_card_versions(db=db, status=status)


@router.get("/versions/active", response_model=Optional[RateCardVersionResponse], summary="Get currently active rate card version")
def get_active_version(db: Session = Depends(get_db)):
    return service_get_active_rate_card_version(db=db)


@router.post("/versions", response_model=RateCardVersionResponse, status_code=status.HTTP_201_CREATED, summary="Create rate card version")
def create_version(payload: RateCardVersionCreate, db: Session = Depends(get_db)):
    try:
        return service_create_rate_card_version(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.post("/versions/{version_id}/activate", response_model=RateCardVersionResponse, summary="Activate a rate card version")
def activate_version(version_id: int, activated_by: Optional[str] = Query(None), db: Session = Depends(get_db)):
    try:
        return service_activate_rate_card_version(db=db, version_id=version_id, activated_by=activated_by)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 3. Service Rates (Hourly Rates)
# =============================================================================

@router.get("/service-rates", response_model=List[ServiceRateDetailResponse], summary="List all service rates")
def list_service_rates(
    country_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return service_list_service_rates(db=db, country_id=country_id, status=status)


@router.post("/service-rates", response_model=ServiceRateDetailResponse, status_code=status.HTTP_201_CREATED, summary="Create a service rate")
def create_service_rate(payload: ServiceRateCreatePayload, db: Session = Depends(get_db)):
    name = (payload.role_name or payload.service_line or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role_name or service_line is required")

    # If currency_id is not provided, look it up from country
    curr_id = payload.currency_id
    if not curr_id:
        country = db.get(Country, payload.country_id)
        if not country:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Country with id {payload.country_id} not found")
        curr_id = country.currency_id

    try:
        return service_create_service_rate(
            db=db,
            role_name=name,
            country_id=payload.country_id,
            currency_id=curr_id,
            hourly_rate=payload.hourly_rate,
            hours_per_day=payload.hours_per_day or Decimal("8.00"),
            daily_rate=payload.daily_rate,
            cost_rate=payload.cost_rate,
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
            status=payload.status or "active",
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get("/service-rates/{service_rate_id}", response_model=ServiceRateDetailResponse, summary="Get service rate by ID")
def get_service_rate(service_rate_id: int, db: Session = Depends(get_db)):
    sr = service_get_service_rate(db=db, service_rate_id=service_rate_id)
    if not sr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Service rate with id {service_rate_id} not found")
    return sr


@router.patch("/service-rates/{service_rate_id}", response_model=ServiceRateDetailResponse, summary="Update service rate")
def update_service_rate(service_rate_id: int, payload: ServiceRateUpdate, db: Session = Depends(get_db)):
    try:
        return service_update_service_rate(db=db, service_rate_id=service_rate_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/service-rates/{service_rate_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete service rate")
def delete_service_rate(service_rate_id: int, db: Session = Depends(get_db)):
    try:
        service_delete_service_rate(db=db, service_rate_id=service_rate_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 4. Commercial Rate Cards
# =============================================================================

@router.get("/rate-cards", response_model=List[RateCardDetailResponse], summary="List commercial rate card entries")
def list_rate_cards(
    rate_card_version_id: Optional[int] = Query(None),
    country_id: Optional[int] = Query(None),
    deployment_model_id: Optional[int] = Query(None),
    pricing_model_id: Optional[int] = Query(None),
    tier_id: Optional[int] = Query(None),
    pack_version_id: Optional[int] = Query(None),
    feature_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return service_list_rate_cards(
        db=db,
        rate_card_version_id=rate_card_version_id,
        country_id=country_id,
        deployment_model_id=deployment_model_id,
        pricing_model_id=pricing_model_id,
        tier_id=tier_id,
        pack_version_id=pack_version_id,
        feature_id=feature_id,
    )


@router.post("/rate-cards", response_model=RateCardDetailResponse, status_code=status.HTTP_201_CREATED, summary="Create or upsert rate card entry")
def upsert_rate_card_entry(payload: RateCardUpsertPayload, db: Session = Depends(get_db)):
    # Resolve rate card version if not provided
    version_id = payload.rate_card_version_id
    if not version_id:
        active_v = service_get_active_rate_card_version(db=db)
        if not active_v:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active rate card version found; please provide rate_card_version_id or activate a version",
            )
        version_id = active_v.id

    # Resolve currency if not provided
    currency_id = payload.currency_id
    if not currency_id:
        country = db.get(Country, payload.country_id)
        if not country:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Country with id {payload.country_id} not found")
        currency_id = country.currency_id

    # Resolve UOM if not provided
    uom_id = payload.uom_id
    if not uom_id:
        pm = db.get(PricingModel, payload.pricing_model_id)
        if pm and pm.uom_locked_id:
            uom_id = pm.uom_locked_id
        else:
            default_uom = db.execute(select(UnitOfMeasure).order_by(UnitOfMeasure.id)).scalars().first()
            if not default_uom:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No unit of measure found in database")
            uom_id = default_uom.id

    try:
        return service_upsert_rate_card(
            db=db,
            rate_card_version_id=version_id,
            country_id=payload.country_id,
            deployment_model_id=payload.deployment_model_id,
            pricing_model_id=payload.pricing_model_id,
            tier_id=payload.tier_id,
            uom_id=uom_id,
            currency_id=currency_id,
            unit_rate=payload.unit_rate,
            fixed_fee=payload.fixed_fee,
            floor_price=payload.floor_price,
            cost_fixed=payload.cost_fixed,
            cost_unit=payload.cost_unit,
            pack_version_id=payload.pack_version_id,
            feature_id=payload.feature_id,
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/rate-cards/group", status_code=status.HTTP_204_NO_CONTENT, summary="Delete rate card entries for a target across tiers")
def delete_rate_cards_group(
    rate_card_version_id: Optional[int] = Query(None),
    country_id: int = Query(...),
    deployment_model_id: int = Query(...),
    pricing_model_id: int = Query(...),
    pack_version_id: Optional[int] = Query(None),
    feature_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    version_id = rate_card_version_id
    if not version_id:
        active_v = service_get_active_rate_card_version(db=db)
        if not active_v:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active rate card version found")
        version_id = active_v.id

    try:
        service_delete_rate_cards_for_target(
            db=db,
            rate_card_version_id=version_id,
            country_id=country_id,
            deployment_model_id=deployment_model_id,
            pricing_model_id=pricing_model_id,
            pack_version_id=pack_version_id,
            feature_id=feature_id,
        )
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get("/rate-cards/{rate_card_id}", response_model=RateCardDetailResponse, summary="Get rate card entry by ID")
def get_rate_card(rate_card_id: int, db: Session = Depends(get_db)):
    rc = service_get_rate_card(db=db, rate_card_id=rate_card_id)
    if not rc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Rate card with id {rate_card_id} not found")
    return rc


@router.patch("/rate-cards/{rate_card_id}", response_model=RateCardDetailResponse, summary="Update rate card entry")
def update_rate_card(rate_card_id: int, payload: RateCardUpdate, db: Session = Depends(get_db)):
    try:
        return service_update_rate_card(db=db, rate_card_id=rate_card_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/rate-cards/{rate_card_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete rate card entry")
def delete_rate_card(rate_card_id: int, db: Session = Depends(get_db)):
    try:
        service_delete_rate_card(db=db, rate_card_id=rate_card_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc

