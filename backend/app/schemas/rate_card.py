"""Pydantic schemas for Rate Card models (Wave 3).

Defines request and response schemas for:
1. RateCardVersion
2. RateCard
3. ServiceRate
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.catalogue import FeatureResponse, PackVersionResponse
from app.schemas.master_data import (
    CountryResponse,
    CurrencyResponse,
    CustomerTierResponse,
    DeploymentModelResponse,
    PricingModelResponse,
    UnitOfMeasureResponse,
)

# =============================================================================
# Constrained Types / Literals
# =============================================================================

RateCardVersionStatus = Literal["draft", "active", "retired"]
ServiceRateStatus = Literal["active", "inactive", "retired"]


# =============================================================================
# 1. RateCardVersion Schemas
# =============================================================================

class RateCardVersionBase(BaseModel):
    """Base fields for RateCardVersion."""

    model_config = ConfigDict(str_strip_whitespace=True)

    version_no: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique business version identifier (e.g. 'RC-2026.1')",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable version name (e.g. 'FY26 Q1 Global Rate Card')",
    )
    status: RateCardVersionStatus = Field(
        default="draft",
        description="Lifecycle status: 'draft' | 'active' | 'retired'",
    )
    valid_from: date = Field(
        ...,
        description="Effective start date",
    )
    valid_to: Optional[date] = Field(
        default=None,
        description="Effective end date (None means indefinitely active)",
    )
    created_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Creator user email or identity string",
    )
    activated_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Approver user email or identity string upon activation",
    )
    activated_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when version was activated",
    )


class RateCardVersionCreate(RateCardVersionBase):
    """Payload for creating a new rate card version."""

    @model_validator(mode="after")
    def validate_date_order(self) -> "RateCardVersionCreate":
        if self.valid_to is not None and self.valid_to < self.valid_from:
            raise ValueError("valid_to must be greater than or equal to valid_from")
        return self


class RateCardVersionUpdate(BaseModel):
    """Payload for updating an existing rate card version."""

    model_config = ConfigDict(str_strip_whitespace=True)

    version_no: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[RateCardVersionStatus] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    created_by: Optional[str] = Field(None, max_length=100)
    activated_by: Optional[str] = Field(None, max_length=100)
    activated_at: Optional[datetime] = None

    @field_validator(
        "version_no",
        "name",
        "status",
        "valid_from",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v

    @model_validator(mode="after")
    def validate_date_order(self) -> "RateCardVersionUpdate":
        if (
            self.valid_from is not None
            and self.valid_to is not None
            and self.valid_to < self.valid_from
        ):
            raise ValueError("valid_to must be greater than or equal to valid_from")
        return self


class RateCardVersionResponse(RateCardVersionBase):
    """API response schema for a rate card version."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 2. RateCard Schemas
# =============================================================================

class RateCardBase(BaseModel):
    """Base fields for commercial rate card entry across 6 dimensions."""

    model_config = ConfigDict(str_strip_whitespace=True)

    rate_card_version_id: int = Field(
        ...,
        gt=0,
        description="Rate card version ID referencing rate_card_versions.id",
    )
    country_id: int = Field(
        ...,
        gt=0,
        description="Country ID referencing countries.id",
    )
    deployment_model_id: int = Field(
        ...,
        gt=0,
        description="Deployment model ID referencing deployment_models.id",
    )
    pricing_model_id: int = Field(
        ...,
        gt=0,
        description="Pricing model ID referencing pricing_models.id",
    )
    tier_id: int = Field(
        ...,
        gt=0,
        description="Customer tier ID referencing customer_tiers.id",
    )
    uom_id: int = Field(
        ...,
        gt=0,
        description="Unit of measure ID referencing units_of_measure.id",
    )
    pack_version_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="Pack version ID referencing pack_versions.id (exclusive with feature_id)",
    )
    feature_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="Feature ID referencing features.id (exclusive with pack_version_id)",
    )
    currency_id: int = Field(
        ...,
        gt=0,
        description="Pricing currency ID referencing currencies.id",
    )
    fixed_fee: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Base recurring or one-time fixed component",
    )
    unit_rate: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Rate per UOM count (e.g. PEPM)",
    )
    floor_price: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Minimum threshold floor rate below which discounts cannot breach",
    )
    cost_fixed: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Internal COGS fixed base cost",
    )
    cost_unit: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Internal COGS unit cost per UOM",
    )
    amc_percentage: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        le=Decimal("100"),
        max_digits=7,
        decimal_places=4,
        description="Annual Maintenance (AMC) percentage on license fee (0-100%)",
    )


class RateCardCreate(RateCardBase):
    """Payload for creating a rate card entry."""

    @model_validator(mode="after")
    def validate_target_exclusive_and_fee_component(self) -> "RateCardCreate":
        # Target exclusive: exactly one of pack_version_id or feature_id
        has_pack = self.pack_version_id is not None
        has_feature = self.feature_id is not None
        if (has_pack and has_feature) or (not has_pack and not has_feature):
            raise ValueError(
                "Exactly one target must be provided: either pack_version_id or feature_id"
            )

        # Fee component required: at least fixed_fee or unit_rate
        if self.fixed_fee is None and self.unit_rate is None:
            raise ValueError(
                "At least one fee component (fixed_fee or unit_rate) must be provided"
            )
        return self


class RateCardUpdate(BaseModel):
    """Payload for updating an existing rate card entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    rate_card_version_id: Optional[int] = Field(None, gt=0)
    country_id: Optional[int] = Field(None, gt=0)
    deployment_model_id: Optional[int] = Field(None, gt=0)
    pricing_model_id: Optional[int] = Field(None, gt=0)
    tier_id: Optional[int] = Field(None, gt=0)
    uom_id: Optional[int] = Field(None, gt=0)
    pack_version_id: Optional[int] = Field(None, gt=0)
    feature_id: Optional[int] = Field(None, gt=0)
    currency_id: Optional[int] = Field(None, gt=0)
    fixed_fee: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )
    unit_rate: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )
    floor_price: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )
    cost_fixed: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )
    cost_unit: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )
    amc_percentage: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("100"),
        max_digits=7,
        decimal_places=4,
        description="Annual Maintenance (AMC) percentage on license fee (0-100%)",
    )

    @field_validator(
        "rate_card_version_id",
        "country_id",
        "deployment_model_id",
        "pricing_model_id",
        "tier_id",
        "uom_id",
        "currency_id",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v

    @model_validator(mode="after")
    def validate_targets_if_both_set(self) -> "RateCardUpdate":
        if self.pack_version_id is not None and self.feature_id is not None:
            raise ValueError("Cannot set both pack_version_id and feature_id on the same rate card")
        if "pack_version_id" in self.model_fields_set and "feature_id" in self.model_fields_set:
            if self.pack_version_id is None and self.feature_id is None:
                raise ValueError("Cannot clear both pack_version_id and feature_id; exactly one target is required")
        if "fixed_fee" in self.model_fields_set and "unit_rate" in self.model_fields_set:
            if self.fixed_fee is None and self.unit_rate is None:
                raise ValueError("At least one fee component (fixed_fee or unit_rate) must be provided")
        return self


class RateCardResponse(RateCardBase):
    """API response schema for a rate card entry."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 3. ServiceRate Schemas
# =============================================================================

class ServiceRateBase(BaseModel):
    """Base fields for professional service and consulting rates."""

    model_config = ConfigDict(str_strip_whitespace=True)

    role_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Professional service role (e.g. Solution Architect, PM)",
    )
    country_id: int = Field(
        ...,
        gt=0,
        description="Country ID referencing countries.id",
    )
    hourly_rate: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Standard billable hourly rate",
    )
    hours_per_day: Decimal = Field(
        default=Decimal("8.00"),
        gt=Decimal("0"),
        le=Decimal("24.00"),
        max_digits=5,
        decimal_places=2,
        description="Standard working hours per person day (default 8.00, 0 < x <= 24)",
    )
    daily_rate: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Explicit daily billing rate",
    )
    cost_rate: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Internal cost rate per day/hour for margin calculation",
    )
    currency_id: int = Field(
        ...,
        gt=0,
        description="Billing currency ID referencing currencies.id",
    )
    valid_from: date = Field(
        ...,
        description="Effective start date",
    )
    valid_to: Optional[date] = Field(
        default=None,
        description="Effective end date (None means indefinite)",
    )
    status: ServiceRateStatus = Field(
        default="active",
        description="Lifecycle status: 'active' | 'inactive' | 'retired'",
    )


class ServiceRateCreate(ServiceRateBase):
    """Payload for creating a service rate."""

    @model_validator(mode="after")
    def validate_date_order(self) -> "ServiceRateCreate":
        if self.valid_to is not None and self.valid_to < self.valid_from:
            raise ValueError("valid_to must be greater than or equal to valid_from")
        return self


class ServiceRateUpdate(BaseModel):
    """Payload for updating an existing service rate."""

    model_config = ConfigDict(str_strip_whitespace=True)

    role_name: Optional[str] = Field(None, min_length=1, max_length=100)
    country_id: Optional[int] = Field(None, gt=0)
    hourly_rate: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )
    hours_per_day: Optional[Decimal] = Field(
        None,
        gt=Decimal("0"),
        le=Decimal("24.00"),
        max_digits=5,
        decimal_places=2,
    )
    daily_rate: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )
    cost_rate: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )
    currency_id: Optional[int] = Field(None, gt=0)
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    status: Optional[ServiceRateStatus] = None

    @field_validator(
        "role_name",
        "country_id",
        "hours_per_day",
        "currency_id",
        "valid_from",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v

    @model_validator(mode="after")
    def validate_date_order(self) -> "ServiceRateUpdate":
        if (
            self.valid_from is not None
            and self.valid_to is not None
            and self.valid_to < self.valid_from
        ):
            raise ValueError("valid_to must be greater than or equal to valid_from")
        return self


class ServiceRateResponse(ServiceRateBase):
    """API response schema for a service rate."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def compute_default_daily_rate(self) -> "ServiceRateResponse":
        if self.daily_rate is None and self.hourly_rate is not None and self.hours_per_day is not None:
            self.daily_rate = self.hourly_rate * self.hours_per_day
        return self


# =============================================================================
# Nested / Detail Schemas
# =============================================================================

class RateCardDetailResponse(RateCardResponse):
    """RateCard response with populated dimension and target entities."""

    country: Optional[CountryResponse] = None
    deployment_model: Optional[DeploymentModelResponse] = None
    pricing_model: Optional[PricingModelResponse] = None
    tier: Optional[CustomerTierResponse] = None
    uom: Optional[UnitOfMeasureResponse] = None
    currency: Optional[CurrencyResponse] = None
    pack_version: Optional[PackVersionResponse] = None
    feature: Optional[FeatureResponse] = None


class RateCardVersionDetailResponse(RateCardVersionResponse):
    """RateCardVersion response with associated rate card entries."""

    rate_cards: list[RateCardResponse] = Field(default_factory=list)


class ServiceRateDetailResponse(ServiceRateResponse):
    """ServiceRate response with populated country and currency entities."""

    country: Optional[CountryResponse] = None
    currency: Optional[CurrencyResponse] = None
