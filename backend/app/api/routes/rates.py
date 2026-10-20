"""FastAPI router for pricing resolution (rate-card lookup by the six pricing dimensions)."""

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.api.errors import DOMAIN_ERRORS, http_error
from app.db.session import get_db
from app.services.pricing_engine import (
    AmbiguousRateCardMatchError,
    MissingConfigurationError,
    MissingRateCardMatchError,
    resolve_rate_card,
)
from app.services.proposal_service import resolve_active_rate_card_version

router = APIRouter()


class RateCardResolveRequest(BaseModel):
    """The six pricing dimensions that identify exactly one rate-card row.

    Dimensions: country, deployment model, pricing model, customer tier, pack-or-feature
    and unit of measure, within one rate-card version (defaults to the active version).
    """

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
