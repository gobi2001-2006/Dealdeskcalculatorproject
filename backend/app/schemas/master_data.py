"""Pydantic schemas for Master Data models (Wave 1).

Defines request and response schemas for:
1. Currency
2. Country
3. FxRate
4. DeploymentModel
5. UnitOfMeasure
6. PricingModel
7. DeploymentPricingOption
8. CustomerTier
9. ContractTerm
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

# =============================================================================
# Constrained Types / Literals
# =============================================================================

MasterDataStatus = Literal["active", "inactive", "retired"]
FixedFeeBasis = Literal["annual", "one_time"]
UnitRateBasis = Literal["monthly", "annual", "one_time"]


# =============================================================================
# 1. Currency Schemas
# =============================================================================

class CurrencyBase(BaseModel):
    """Base fields for ISO 4217 Currency."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=3,
        max_length=3,
        description="ISO 4217 currency code (e.g. USD, EUR, INR)",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Currency full display name",
    )
    symbol: Optional[str] = Field(
        default=None,
        max_length=10,
        description="Currency symbol (e.g. $, EUR, ₹)",
    )
    decimal_places: int = Field(
        default=2,
        ge=0,
        le=6,
        description="Standard decimal precision for display/rounding (0-6)",
    )
    status: MasterDataStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )


class CurrencyCreate(CurrencyBase):
    """Payload for creating a new currency."""

    pass


class CurrencyUpdate(BaseModel):
    """Payload for updating an existing currency."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=3, max_length=3)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    symbol: Optional[str] = Field(None, max_length=10)
    decimal_places: Optional[int] = Field(None, ge=0, le=6)
    status: Optional[MasterDataStatus] = None

    @field_validator("code", "name", "decimal_places", "status", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class CurrencyResponse(CurrencyBase):
    """API response schema for a currency."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 2. Country Schemas
# =============================================================================

class CountryBase(BaseModel):
    """Base fields for Country."""

    model_config = ConfigDict(str_strip_whitespace=True)

    iso_code: str = Field(
        ...,
        min_length=2,
        max_length=2,
        description="ISO 3166-1 alpha-2 country code (e.g. US, IN, GB)",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Country display name",
    )
    currency_id: int = Field(
        ...,
        gt=0,
        description="Local currency ID referencing currencies.id",
    )
    price_multiplier: Decimal = Field(
        default=Decimal("1.000000"),
        gt=Decimal("0"),
        max_digits=10,
        decimal_places=6,
        description="Regional country pricing multiplier (must be > 0)",
    )
    status: MasterDataStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )
    valid_from: date = Field(
        ...,
        description="Effective start date",
    )
    valid_to: Optional[date] = Field(
        default=None,
        description="Effective end date; None means indefinite",
    )


class CountryCreate(CountryBase):
    """Payload for creating a new country."""

    @model_validator(mode="after")
    def validate_date_order(self) -> "CountryCreate":
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be strictly greater than valid_from")
        return self


class CountryUpdate(BaseModel):
    """Payload for updating an existing country."""

    model_config = ConfigDict(str_strip_whitespace=True)

    iso_code: Optional[str] = Field(None, min_length=2, max_length=2)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    currency_id: Optional[int] = Field(None, gt=0)
    price_multiplier: Optional[Decimal] = Field(
        None,
        gt=Decimal("0"),
        max_digits=10,
        decimal_places=6,
    )
    status: Optional[MasterDataStatus] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None

    @field_validator(
        "iso_code",
        "name",
        "currency_id",
        "price_multiplier",
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
    def validate_date_order(self) -> "CountryUpdate":
        if self.valid_from is not None and self.valid_to is not None:
            if self.valid_to <= self.valid_from:
                raise ValueError("valid_to must be strictly greater than valid_from")
        return self


class CountryResponse(CountryBase):
    """API response schema for a country."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 3. FX Rate Schemas
# =============================================================================

class FxRateBase(BaseModel):
    """Base fields for FX exchange rates."""

    model_config = ConfigDict(str_strip_whitespace=True)

    from_currency_id: int = Field(
        ...,
        gt=0,
        description="Source currency ID referencing currencies.id",
    )
    to_currency_id: int = Field(
        ...,
        gt=0,
        description="Target currency ID referencing currencies.id",
    )
    rate: Decimal = Field(
        ...,
        gt=Decimal("0"),
        max_digits=18,
        decimal_places=8,
        description="Exchange rate: 1 from_currency = rate to_currency (must be > 0)",
    )
    rate_source: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Source of rate (e.g. OANDA, Central Bank, Manual)",
    )
    effective_date: date = Field(
        ...,
        description="Date this rate became effective",
    )
    created_by: Optional[int] = Field(
        default=None,
        gt=0,
        description="User ID who recorded this rate",
    )


class FxRateCreate(FxRateBase):
    """Payload for recording a new FX exchange rate."""

    @model_validator(mode="after")
    def validate_distinct_currencies(self) -> "FxRateCreate":
        if self.from_currency_id == self.to_currency_id:
            raise ValueError("from_currency_id and to_currency_id must be distinct currencies")
        return self


class FxRateUpdate(BaseModel):
    """Payload for updating an FX exchange rate record."""

    model_config = ConfigDict(str_strip_whitespace=True)

    from_currency_id: Optional[int] = Field(None, gt=0)
    to_currency_id: Optional[int] = Field(None, gt=0)
    rate: Optional[Decimal] = Field(
        None,
        gt=Decimal("0"),
        max_digits=18,
        decimal_places=8,
    )
    rate_source: Optional[str] = Field(None, max_length=100)
    effective_date: Optional[date] = None
    created_by: Optional[int] = Field(None, gt=0)

    @field_validator(
        "from_currency_id",
        "to_currency_id",
        "rate",
        "effective_date",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v

    @model_validator(mode="after")
    def validate_distinct_currencies(self) -> "FxRateUpdate":
        if (
            self.from_currency_id is not None
            and self.to_currency_id is not None
            and self.from_currency_id == self.to_currency_id
        ):
            raise ValueError("from_currency_id and to_currency_id must be distinct currencies")
        return self


class FxRateResponse(FxRateBase):
    """API response schema for an FX exchange rate."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime


# =============================================================================
# 4. Deployment Model Schemas
# =============================================================================

class DeploymentModelBase(BaseModel):
    """Base fields for DeploymentModel."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique deployment code (e.g. shared_cloud, private_cloud, on_premise)",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Display name of deployment architecture",
    )
    description: Optional[str] = Field(
        default=None,
        description="Detailed description of hosting architecture",
    )
    cost_basis_flag: bool = Field(
        default=False,
        description="Indicates if hosting cost basis applies to this model",
    )
    status: MasterDataStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )


class DeploymentModelCreate(DeploymentModelBase):
    """Payload for creating a new deployment model."""

    pass


class DeploymentModelUpdate(BaseModel):
    """Payload for updating an existing deployment model."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    cost_basis_flag: Optional[bool] = None
    status: Optional[MasterDataStatus] = None

    @field_validator(
        "code",
        "name",
        "cost_basis_flag",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class DeploymentModelResponse(DeploymentModelBase):
    """API response schema for a deployment model."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 5. Unit of Measure Schemas
# =============================================================================

class UnitOfMeasureBase(BaseModel):
    """Base fields for UnitOfMeasure."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="UOM unique code (e.g. employee, candidate, transaction, flat)",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Display name of unit of measure",
    )
    category: str = Field(
        default="uom2",
        description="Category of unit of measure: 'uom1' (employee-level) or 'uom2' (product-specific)",
    )
    conversion_rule: Optional[str] = Field(
        default=None,
        description="Formula or guidance for unit conversion/scaling",
    )
    status: MasterDataStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in ("uom1", "uom2"):
            raise ValueError("category must be 'uom1' or 'uom2'")
        return v


class UnitOfMeasureCreate(UnitOfMeasureBase):
    """Payload for creating a unit of measure."""

    pass


class UnitOfMeasureUpdate(BaseModel):
    """Payload for updating a unit of measure."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[str] = Field(None, description="Category: 'uom1' or 'uom2'")
    conversion_rule: Optional[str] = None
    status: Optional[MasterDataStatus] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("uom1", "uom2"):
            raise ValueError("category must be 'uom1' or 'uom2'")
        return v

    @field_validator("code", "name", "status", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class UnitOfMeasureResponse(UnitOfMeasureBase):
    """API response schema for a unit of measure."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 6. Pricing Model Schemas
# =============================================================================

class PricingModelBase(BaseModel):
    """Base fields for PricingModel."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Pricing model unique code",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Approved terminology (e.g. 'Platform + Subscription')",
    )
    description: Optional[str] = Field(
        default=None,
        description="Description of commercial structure",
    )
    has_fixed_component: bool = Field(
        default=False,
        description="Requires fixed fee in rate card",
    )
    has_unit_component: bool = Field(
        default=False,
        description="Requires unit rate in rate card",
    )
    fixed_fee_basis: Optional[FixedFeeBasis] = Field(
        default=None,
        description="Fixed fee frequency: 'annual' | 'one_time'",
    )
    unit_rate_basis: UnitRateBasis = Field(
        default="monthly",
        description="How the unit rate is billed: 'monthly' | 'annual' | 'one_time'",
    )
    uom_locked_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="Locked UOM if model strictly prescribes one",
    )
    status: MasterDataStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )


class PricingModelCreate(PricingModelBase):
    """Payload for creating a pricing model."""

    pass


class PricingModelUpdate(BaseModel):
    """Payload for updating an existing pricing model."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    has_fixed_component: Optional[bool] = None
    has_unit_component: Optional[bool] = None
    fixed_fee_basis: Optional[FixedFeeBasis] = None
    unit_rate_basis: Optional[UnitRateBasis] = None
    uom_locked_id: Optional[int] = Field(None, gt=0)
    status: Optional[MasterDataStatus] = None

    @field_validator(
        "code",
        "name",
        "has_fixed_component",
        "has_unit_component",
        "unit_rate_basis",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class PricingModelUomResponse(BaseModel):
    """API response schema for a pricing-model-to-UOM mapping."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    pricing_model_id: int
    uom_id: int
    is_default: bool
    created_at: datetime
    uom: Optional[UnitOfMeasureResponse] = None


class PricingModelResponse(PricingModelBase):
    """API response schema for a pricing model."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime
    uom_locked: Optional[UnitOfMeasureResponse] = None
    allowed_uoms: Optional[list[PricingModelUomResponse]] = None


# =============================================================================
# 7. Deployment Pricing Option Schemas
# =============================================================================

class DeploymentPricingOptionBase(BaseModel):
    """Base fields for DeploymentPricingOption matrix association."""

    model_config = ConfigDict(str_strip_whitespace=True)

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


class DeploymentPricingOptionCreate(DeploymentPricingOptionBase):
    """Payload for linking a deployment model to a pricing model."""

    pass


class DeploymentPricingOptionUpdate(BaseModel):
    """Payload for updating a deployment-pricing combination."""

    model_config = ConfigDict(str_strip_whitespace=True)

    deployment_model_id: Optional[int] = Field(None, gt=0)
    pricing_model_id: Optional[int] = Field(None, gt=0)

    @field_validator(
        "deployment_model_id",
        "pricing_model_id",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class DeploymentPricingOptionResponse(DeploymentPricingOptionBase):
    """API response schema for a deployment-pricing matrix option."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    created_at: datetime


# =============================================================================
# 8. Customer Tier Schemas
# =============================================================================

class CustomerTierBase(BaseModel):
    """Base fields for CustomerTier volume headcounts."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Customer tier name (e.g. Tier 1 - Startup, Tier 2 - Enterprise)",
    )
    employee_min: int = Field(
        default=0,
        ge=0,
        description="Minimum headcount for tier inclusion (inclusive, >= 0)",
    )
    employee_max: Optional[int] = Field(
        default=None,
        ge=0,
        description="Maximum headcount for tier inclusion (inclusive); None indicates open-ended top tier",
    )
    default_multiplier: Decimal = Field(
        default=Decimal("1.000000"),
        gt=Decimal("0"),
        max_digits=10,
        decimal_places=6,
        description="Default tier discount/multiplier factor (must be > 0)",
    )
    status: MasterDataStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )
    valid_from: date = Field(
        ...,
        description="Effective start date",
    )
    valid_to: Optional[date] = Field(
        default=None,
        description="Effective end date; None indicates indefinite",
    )


class CustomerTierCreate(CustomerTierBase):
    """Payload for creating a customer tier."""

    @model_validator(mode="after")
    def validate_tier_ranges_and_dates(self) -> "CustomerTierCreate":
        if self.employee_max is not None and self.employee_max < self.employee_min:
            raise ValueError("employee_max must be greater than or equal to employee_min")
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be strictly greater than valid_from")
        return self


class CustomerTierUpdate(BaseModel):
    """Payload for updating an existing customer tier."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    employee_min: Optional[int] = Field(None, ge=0)
    employee_max: Optional[int] = Field(None, ge=0)
    default_multiplier: Optional[Decimal] = Field(
        None,
        gt=Decimal("0"),
        max_digits=10,
        decimal_places=6,
    )
    status: Optional[MasterDataStatus] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None

    @field_validator(
        "name",
        "employee_min",
        "default_multiplier",
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
    def validate_tier_ranges_and_dates(self) -> "CustomerTierUpdate":
        if (
            self.employee_min is not None
            and self.employee_max is not None
            and self.employee_max < self.employee_min
        ):
            raise ValueError("employee_max must be greater than or equal to employee_min")
        if (
            self.valid_from is not None
            and self.valid_to is not None
            and self.valid_to <= self.valid_from
        ):
            raise ValueError("valid_to must be strictly greater than valid_from")
        return self


class CustomerTierResponse(CustomerTierBase):
    """API response schema for a customer tier."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 9. Contract Term Schemas
# =============================================================================

class ContractTermBase(BaseModel):
    """Base fields for ContractTerm commitment durations."""

    model_config = ConfigDict(str_strip_whitespace=True)

    term_months: int = Field(
        ...,
        gt=0,
        description="Contract duration in months (must be > 0)",
    )
    escalation_pct_per_renewal_year: Decimal = Field(
        default=Decimal("0.0000"),
        ge=Decimal("0"),
        le=Decimal("100"),
        max_digits=7,
        decimal_places=4,
        description="Default escalation percentage per renewal year (0.0000 - 100.0000)",
    )
    status: MasterDataStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )


class ContractTermCreate(ContractTermBase):
    """Payload for creating a contract term."""

    pass


class ContractTermUpdate(BaseModel):
    """Payload for updating an existing contract term."""

    model_config = ConfigDict(str_strip_whitespace=True)

    term_months: Optional[int] = Field(None, gt=0)
    escalation_pct_per_renewal_year: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("100"),
        max_digits=7,
        decimal_places=4,
    )
    status: Optional[MasterDataStatus] = None

    @field_validator(
        "term_months",
        "escalation_pct_per_renewal_year",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v, info):
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ContractTermResponse(ContractTermBase):
    """API response schema for a contract term."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Nested / Detail Schemas
# =============================================================================

class CountryDetailResponse(CountryResponse):
    """Country response with populated local currency."""

    currency: Optional[CurrencyResponse] = None


class FxRateDetailResponse(FxRateResponse):
    """FX rate response with populated from and to currencies."""

    from_currency: Optional[CurrencyResponse] = None
    to_currency: Optional[CurrencyResponse] = None


class DeploymentPricingOptionDetailResponse(DeploymentPricingOptionResponse):
    """Deployment pricing option with populated deployment and pricing models."""

    deployment_model: Optional[DeploymentModelResponse] = None
    pricing_model: Optional[PricingModelResponse] = None


class PricingModelDetailResponse(PricingModelResponse):
    """Pricing model response with locked UOM and allowed deployment options."""

    uom_locked: Optional[UnitOfMeasureResponse] = None
    deployment_options: list[DeploymentPricingOptionResponse] = Field(default_factory=list)


class DeploymentModelDetailResponse(DeploymentModelResponse):
    """Deployment model response with allowed pricing options."""

    pricing_options: list[DeploymentPricingOptionResponse] = Field(default_factory=list)
