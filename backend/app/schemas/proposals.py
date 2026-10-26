"""Pydantic schemas for Proposal & Deal Management (Wave 5).

Defines request and response schemas for:
1. Customer (customers)
2. Deal (deals)
3. Proposal (proposals)
4. ProposalContact (proposal_contacts)
5. ProposalVersion (proposal_versions)
6. ProposalCountry (proposal_countries)
7. ProposalLineItem (proposal_line_items)
8. ProposalServiceLine (proposal_service_lines)
9. CalculationSnapshot (calculation_snapshots - append-only audit record)
10. ProposalContent (proposal_content)
11. Approval (approvals)
"""

from datetime import date, datetime
from decimal import Decimal
import re
from typing import Any, Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.catalogue import (
    FeatureResponse,
    PackVersionResponse,
)
from app.schemas.governance import (
    ApprovalThresholdResponse,
    RoleResponse,
    UserResponse,
)
from app.schemas.master_data import (
    CountryResponse,
    CurrencyResponse,
    CustomerTierResponse,
    UnitOfMeasureResponse,
)
from app.schemas.rate_card import (
    RateCardVersionResponse,
    ServiceRateResponse,
)

# =============================================================================
# Constrained Types / Literals
# =============================================================================

CustomerStatus = Literal["active", "inactive", "prospect"]

DealStatus = Literal["open", "won", "lost", "abandoned"]

ProposalStatus = Literal[
    "draft",
    "submitted",
    "approved",
    "rejected",
    "superseded",
]

ProposalVersionStatus = Literal[
    "draft",
    "under_review",
    "approved",
    "rejected",
    "locked",
    "superseded",
]

ApprovalStatus = Literal[
    "pending",
    "approved",
    "rejected",
    "escalated",
    "cancelled",
]

_EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# =============================================================================
# 1. Customer Schemas
# =============================================================================

class CustomerBase(BaseModel):
    """Base fields for Customer account master."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique customer business code (e.g. 'CUST-001')",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Legal customer/organization name",
    )
    country_id: int = Field(
        ...,
        gt=0,
        description="Primary operating country ID referencing countries.id",
    )
    customer_tier_id: Optional[int] = Field(
        None,
        gt=0,
        description="Headcount volume tier band referencing customer_tiers.id",
    )
    industry: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="Industry vertical (e.g. IT, Manufacturing, Healthcare)",
    )
    status: CustomerStatus = Field(
        "active",
        description="Lifecycle status: 'active', 'inactive', 'prospect'",
    )


class CustomerCreate(CustomerBase):
    """Payload for creating a new customer account."""
    pass


class CustomerUpdate(BaseModel):
    """Payload for updating an existing customer account."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    country_id: Optional[int] = Field(None, gt=0)
    customer_tier_id: Optional[int] = Field(None, gt=0)
    industry: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[CustomerStatus] = None

    @field_validator(
        "code",
        "name",
        "country_id",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class CustomerResponse(CustomerBase):
    """API response schema for customer master."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 2. Deal Schemas
# =============================================================================

class DealBase(BaseModel):
    """Base fields for Deal / sales opportunity."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique deal identifier (e.g. 'DEAL-2026-001')",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Opportunity title",
    )
    customer_id: int = Field(
        ...,
        gt=0,
        description="Customer ID referencing customers.id",
    )
    owner_user_id: int = Field(
        ...,
        gt=0,
        description="Owner user ID referencing users.id",
    )
    status: DealStatus = Field(
        "open",
        description="Deal stage: 'open', 'won', 'lost', 'abandoned'",
    )
    target_close_date: Optional[date] = Field(
        None,
        description="Estimated contract signing date",
    )


class DealCreate(DealBase):
    """Payload for creating a new deal."""
    pass


class DealUpdate(BaseModel):
    """Payload for updating an existing deal."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    customer_id: Optional[int] = Field(None, gt=0)
    owner_user_id: Optional[int] = Field(None, gt=0)
    status: Optional[DealStatus] = None
    target_close_date: Optional[date] = None

    @field_validator(
        "code",
        "name",
        "customer_id",
        "owner_user_id",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class DealResponse(DealBase):
    """API response schema for deal record."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 3. Proposal Schemas
# =============================================================================

class ProposalBase(BaseModel):
    """Base fields for Proposal container."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique proposal business code (e.g. 'PROP-2026-0001')",
    )
    deal_id: int = Field(
        ...,
        gt=0,
        description="Deal ID referencing deals.id",
    )
    customer_id: int = Field(
        ...,
        gt=0,
        description="Customer ID referencing customers.id",
    )
    currency_id: int = Field(
        ...,
        gt=0,
        description="Presentation currency ID referencing currencies.id",
    )
    status: ProposalStatus = Field(
        "draft",
        description="Lifecycle status: 'draft', 'submitted', 'approved', 'rejected', 'superseded'",
    )
    created_by_user_id: int = Field(
        ...,
        gt=0,
        description="User ID who authored the proposal referencing users.id",
    )


class ProposalCreate(ProposalBase):
    """Payload for creating a new proposal."""
    customer_id: Optional[int] = Field(
        None,
        gt=0,
        description="Customer ID referencing customers.id (defaults to deal's customer_id if omitted)",
    )
    rate_card_version_id: Optional[int] = Field(
        None,
        gt=0,
        description="Optional rate card version ID to auto-create initial version 1",
    )


class ProposalUpdate(BaseModel):
    """Payload for updating an existing proposal."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    deal_id: Optional[int] = Field(None, gt=0)
    customer_id: Optional[int] = Field(None, gt=0)
    currency_id: Optional[int] = Field(None, gt=0)
    status: Optional[ProposalStatus] = None
    created_by_user_id: Optional[int] = Field(None, gt=0)

    @field_validator(
        "code",
        "deal_id",
        "customer_id",
        "currency_id",
        "status",
        "created_by_user_id",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ProposalResponse(ProposalBase):
    """API response schema for proposal record."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 4. ProposalContact Schemas
# =============================================================================

class ProposalContactBase(BaseModel):
    """Base fields for ProposalContact stakeholder."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_id: int = Field(
        ...,
        gt=0,
        description="Proposal ID referencing proposals.id",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Contact person full name",
    )
    email: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="Contact email address",
    )
    phone: Optional[str] = Field(
        None,
        min_length=1,
        max_length=50,
        description="Contact phone number",
    )
    role_title: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="Client title (e.g. 'HR Director', 'Procurement Officer')",
    )
    is_primary: bool = Field(
        False,
        description="Whether this is the primary client contact",
    )

    @field_validator("email", mode="before")
    @classmethod
    def validate_and_normalize_email(cls, v: Any) -> Any:
        if isinstance(v, str):
            email = v.strip().lower()
            if not _EMAIL_REGEX.match(email):
                raise ValueError("Invalid email format")
            return email
        return v


class ProposalContactCreate(ProposalContactBase):
    """Payload for creating a proposal contact."""
    pass


class ProposalContactUpdate(BaseModel):
    """Payload for updating an existing proposal contact."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_id: Optional[int] = Field(None, gt=0)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = Field(None, min_length=3, max_length=255)
    phone: Optional[str] = Field(None, min_length=1, max_length=50)
    role_title: Optional[str] = Field(None, min_length=1, max_length=100)
    is_primary: Optional[bool] = None

    @field_validator("email", mode="before")
    @classmethod
    def validate_and_normalize_email(cls, v: Any) -> Any:
        if v is None:
            raise ValueError("email cannot be null")
        if isinstance(v, str):
            email = v.strip().lower()
            if not _EMAIL_REGEX.match(email):
                raise ValueError("Invalid email format")
            return email
        return v

    @field_validator(
        "proposal_id",
        "name",
        "is_primary",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ProposalContactResponse(ProposalContactBase):
    """API response schema for proposal contact."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime


# =============================================================================
# 5. ProposalVersion Schemas
# =============================================================================

class ProposalVersionBase(BaseModel):
    """Base fields for ProposalVersion iteration."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_id: int = Field(
        ...,
        gt=0,
        description="Proposal ID referencing proposals.id",
    )
    version_no: int = Field(
        ...,
        gt=0,
        description="Sequential version number (1, 2, 3...)",
    )
    rate_card_version_id: int = Field(
        ...,
        gt=0,
        description="Pinned rate card version referencing rate_card_versions.id",
    )
    status: ProposalVersionStatus = Field(
        "draft",
        description="Version status: 'draft', 'under_review', 'approved', 'rejected', 'locked', 'superseded'",
    )
    created_by_user_id: int = Field(
        ...,
        gt=0,
        description="Author user ID referencing users.id",
    )
    notes: Optional[str] = Field(
        None,
        description="Internal notes regarding this version revision",
    )
    locked_at: Optional[datetime] = Field(
        None,
        description="Timestamp when version was locked against modifications",
    )


class ProposalVersionCreate(ProposalVersionBase):
    """Payload for creating a new proposal version."""
    pass


class ProposalVersionUpdate(BaseModel):
    """Payload for updating an existing proposal version."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_id: Optional[int] = Field(None, gt=0)
    version_no: Optional[int] = Field(None, gt=0)
    rate_card_version_id: Optional[int] = Field(None, gt=0)
    status: Optional[ProposalVersionStatus] = None
    created_by_user_id: Optional[int] = Field(None, gt=0)
    notes: Optional[str] = None
    locked_at: Optional[datetime] = None

    @field_validator(
        "proposal_id",
        "version_no",
        "rate_card_version_id",
        "status",
        "created_by_user_id",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ProposalVersionResponse(ProposalVersionBase):
    """API response schema for proposal version."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 6. ProposalCountry Schemas
# =============================================================================

class ProposalCountryBase(BaseModel):
    """Base fields for ProposalCountry deployment scope."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_id: int = Field(
        ...,
        gt=0,
        description="Proposal ID referencing proposals.id",
    )
    country_id: int = Field(
        ...,
        gt=0,
        description="Country ID referencing countries.id",
    )
    deployment_model_id: Optional[int] = Field(
        None,
        gt=0,
        description="Rate-card dimension: deployment model ID (set together with pricing_model_id)",
    )
    pricing_model_id: Optional[int] = Field(
        None,
        gt=0,
        description="Rate-card dimension: pricing model ID (set together with deployment_model_id)",
    )
    user_headcount: Optional[int] = Field(
        None,
        ge=0,
        description="Specific employee count deployed in this country",
    )
    is_primary_deployment: bool = Field(
        False,
        description="Whether this country is the primary deployment location",
    )

    @model_validator(mode="after")
    def validate_pricing_dimensions_together(self) -> "ProposalCountryBase":
        if (self.deployment_model_id is None) != (self.pricing_model_id is None):
            raise ValueError(
                "deployment_model_id and pricing_model_id must be provided together"
            )
        return self


class ProposalCountryCreate(ProposalCountryBase):
    """Payload for linking a deployment country to a proposal."""
    proposal_id: Optional[int] = Field(
        None,
        gt=0,
        description="Proposal ID referencing proposals.id (optional if provided in route path)",
    )


class ProposalCountryUpdate(BaseModel):
    """Payload for updating a proposal country deployment."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_id: Optional[int] = Field(None, gt=0)
    country_id: Optional[int] = Field(None, gt=0)
    deployment_model_id: Optional[int] = Field(None, gt=0)
    pricing_model_id: Optional[int] = Field(None, gt=0)
    user_headcount: Optional[int] = Field(None, ge=0)
    is_primary_deployment: Optional[bool] = None

    @field_validator(
        "proposal_id",
        "country_id",
        "is_primary_deployment",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ProposalCountryResponse(ProposalCountryBase):
    """API response schema for proposal country."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime


# =============================================================================
# 7. ProposalLineItem Schemas
# =============================================================================

class ProposalLineItemBase(BaseModel):
    """Base fields for ProposalLineItem subscription pricing line."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: int = Field(
        ...,
        gt=0,
        description="Proposal version ID referencing proposal_versions.id",
    )
    line_number: int = Field(
        ...,
        ge=1,
        description="Ordering sequence of line items",
    )
    pack_version_id: Optional[int] = Field(
        None,
        gt=0,
        description="Referenced pack version ID referencing pack_versions.id",
    )
    feature_id: Optional[int] = Field(
        None,
        gt=0,
        description="Referenced standalone feature ID referencing features.id",
    )
    uom_id: int = Field(
        ...,
        gt=0,
        description="Unit of measure ID referencing units_of_measure.id",
    )
    quantity: Decimal = Field(
        ...,
        ge=Decimal("0"),
        decimal_places=4,
        description="Purchased volume/headcount",
    )
    list_unit_price: Decimal = Field(
        ...,
        ge=Decimal("0"),
        decimal_places=4,
        description="Base catalog rate before discounts",
    )
    discount_pct: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("100"),
        decimal_places=4,
        description="Discount percentage granted (0-100%)",
    )
    net_unit_price: Decimal = Field(
        ...,
        ge=Decimal("0"),
        decimal_places=4,
        description="Final calculated unit rate after discount",
    )
    extended_amount: Decimal = Field(
        ...,
        ge=Decimal("0"),
        decimal_places=4,
        description="Annualized or total line extended value",
    )
    currency_id: int = Field(
        ...,
        gt=0,
        description="Line presentation currency referencing currencies.id",
    )


class ProposalLineItemCreate(ProposalLineItemBase):
    """Payload for creating a proposal line item."""

    proposal_version_id: Optional[int] = Field(
        None,
        gt=0,
        description="Proposal version ID (optional if attaching to proposal's draft version)",
    )
    line_number: Optional[int] = Field(
        None,
        ge=1,
        description="Ordering sequence of line items (auto-assigned if omitted)",
    )
    currency_id: Optional[int] = Field(
        None,
        gt=0,
        description="Line presentation currency referencing currencies.id (defaults to proposal currency)",
    )
    list_unit_price: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        decimal_places=4,
        description="Ignored on input. Prices always come from the rate card; the server fills this in on calculation.",
    )
    net_unit_price: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        decimal_places=4,
        description="Ignored on input. Computed by the server on calculation.",
    )
    extended_amount: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        decimal_places=4,
        description="Ignored on input. Computed by the server on calculation.",
    )

    @model_validator(mode="after")
    def validate_target_exclusive(self) -> "ProposalLineItemCreate":
        has_pack = self.pack_version_id is not None
        has_feature = self.feature_id is not None
        if has_pack == has_feature:
            raise ValueError(
                "Exactly one target (pack_version_id XOR feature_id) must be provided"
            )
        return self


class ProposalLineItemUpdate(BaseModel):
    """Payload for updating an existing proposal line item."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: Optional[int] = Field(None, gt=0)
    line_number: Optional[int] = Field(None, ge=1)
    pack_version_id: Optional[int] = Field(None, gt=0)
    feature_id: Optional[int] = Field(None, gt=0)
    uom_id: Optional[int] = Field(None, gt=0)
    quantity: Optional[Decimal] = Field(None, ge=Decimal("0"), decimal_places=4)
    list_unit_price: Optional[Decimal] = Field(None, ge=Decimal("0"), decimal_places=4)
    discount_pct: Optional[Decimal] = Field(None, ge=Decimal("0"), le=Decimal("100"), decimal_places=4)
    net_unit_price: Optional[Decimal] = Field(None, ge=Decimal("0"), decimal_places=4)
    extended_amount: Optional[Decimal] = Field(None, ge=Decimal("0"), decimal_places=4)
    currency_id: Optional[int] = Field(None, gt=0)

    @field_validator(
        "proposal_version_id",
        "line_number",
        "uom_id",
        "quantity",
        "list_unit_price",
        "net_unit_price",
        "extended_amount",
        "currency_id",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v

    @model_validator(mode="after")
    def validate_targets_if_both_set(self) -> "ProposalLineItemUpdate":
        if self.pack_version_id is not None and self.feature_id is not None:
            raise ValueError(
                "Cannot set both pack_version_id and feature_id on the same line item"
            )
        if (
            "pack_version_id" in self.model_fields_set
            and "feature_id" in self.model_fields_set
        ):
            if self.pack_version_id is None and self.feature_id is None:
                raise ValueError(
                    "Cannot clear both pack_version_id and feature_id; exactly one target is required"
                )
        return self


class ProposalLineItemResponse(ProposalLineItemBase):
    """API response schema for proposal line item."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 8. ProposalServiceLine Schemas
# =============================================================================

class ProposalServiceLineBase(BaseModel):
    """Base fields for ProposalServiceLine consulting/services line."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: int = Field(
        ...,
        gt=0,
        description="Proposal version ID referencing proposal_versions.id",
    )
    service_rate_id: Optional[int] = Field(
        None,
        gt=0,
        description="Reference service rate sheet item from Wave 3",
    )
    role_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Professional service role description",
    )
    days_or_hours: Decimal = Field(
        ...,
        ge=Decimal("0"),
        decimal_places=4,
        description="Billable volume in days or hours",
    )
    rate_applied: Decimal = Field(
        ...,
        ge=Decimal("0"),
        decimal_places=4,
        description="Hourly or daily rate charged",
    )
    discount_pct: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("100"),
        decimal_places=4,
        description="Discretionary service discount (0-100%)",
    )
    extended_amount: Decimal = Field(
        ...,
        ge=Decimal("0"),
        decimal_places=4,
        description="Total net line fee",
    )
    currency_id: int = Field(
        ...,
        gt=0,
        description="Presentation currency referencing currencies.id",
    )


class ProposalServiceLineCreate(ProposalServiceLineBase):
    """Payload for creating a proposal service line."""
    proposal_version_id: Optional[int] = Field(
        None,
        gt=0,
        description="Proposal version ID (optional if attaching to proposal's draft version)",
    )
    currency_id: Optional[int] = Field(
        None,
        gt=0,
        description="Line presentation currency referencing currencies.id (defaults to proposal currency)",
    )
    rate_applied: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        decimal_places=4,
        description="Ignored on input. The day rate always comes from the service-rate master.",
    )
    extended_amount: Decimal = Field(
        Decimal("0"),
        ge=Decimal("0"),
        decimal_places=4,
        description="Ignored on input. Computed by the server on calculation.",
    )


class ProposalServiceLineUpdate(BaseModel):
    """Payload for updating an existing proposal service line."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: Optional[int] = Field(None, gt=0)
    service_rate_id: Optional[int] = Field(None, gt=0)
    role_name: Optional[str] = Field(None, min_length=1, max_length=100)
    days_or_hours: Optional[Decimal] = Field(None, ge=Decimal("0"), decimal_places=4)
    rate_applied: Optional[Decimal] = Field(None, ge=Decimal("0"), decimal_places=4)
    discount_pct: Optional[Decimal] = Field(None, ge=Decimal("0"), le=Decimal("100"), decimal_places=4)
    extended_amount: Optional[Decimal] = Field(None, ge=Decimal("0"), decimal_places=4)
    currency_id: Optional[int] = Field(None, gt=0)

    @field_validator(
        "proposal_version_id",
        "role_name",
        "days_or_hours",
        "rate_applied",
        "extended_amount",
        "currency_id",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ProposalServiceLineResponse(ProposalServiceLineBase):
    """API response schema for proposal service line."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 9. CalculationSnapshot Schemas (Append-only / Immutable)
# =============================================================================

class CalculationSnapshotBase(BaseModel):
    """Base fields for reproducible CalculationSnapshot audit record."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: int = Field(
        ...,
        gt=0,
        description="Proposal version ID referencing proposal_versions.id",
    )
    snapshot_payload: dict[str, Any] = Field(
        ...,
        description="Full JSON payload of commercial calculations, totals, ARR, TCV, GM%",
    )
    calculated_by_user_id: Optional[int] = Field(
        None,
        gt=0,
        description="User ID who triggered the calculation",
    )

    @field_validator("snapshot_payload")
    @classmethod
    def validate_snapshot_payload(cls, v: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(v, dict):
            raise ValueError("snapshot_payload must be a valid dictionary")
        return v


class CalculationSnapshotCreate(CalculationSnapshotBase):
    """Payload for recording a calculation snapshot (immutable audit record)."""
    pass


# CalculationSnapshot is append-only and strictly immutable. No Update schema is provided.


class CalculationSnapshotResponse(CalculationSnapshotBase):
    """API response schema for calculation snapshot."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    calculated_at: datetime


# =============================================================================
# 10. ProposalContent Schemas
# =============================================================================

class ProposalContentBase(BaseModel):
    """Base fields for ProposalContent narrative/terms section."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: int = Field(
        ...,
        gt=0,
        description="Proposal version ID referencing proposal_versions.id",
    )
    section_key: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Section identifier (e.g. 'executive_summary', 'payment_terms', 'sla')",
    )
    content_text: str = Field(
        ...,
        min_length=1,
        description="Formatted narrative body or Markdown text",
    )


class ProposalContentCreate(ProposalContentBase):
    """Payload for creating a proposal narrative section."""
    pass


class ProposalContentUpdate(BaseModel):
    """Payload for updating an existing proposal narrative section."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: Optional[int] = Field(None, gt=0)
    section_key: Optional[str] = Field(None, min_length=1, max_length=100)
    content_text: Optional[str] = Field(None, min_length=1)

    @field_validator(
        "proposal_version_id",
        "section_key",
        "content_text",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ProposalContentResponse(ProposalContentBase):
    """API response schema for proposal narrative section."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 11. Approval Schemas
# =============================================================================

class ApprovalBase(BaseModel):
    """Base fields for Approval workflow request/decision record."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: int = Field(
        ...,
        gt=0,
        description="Proposal version ID referencing proposal_versions.id",
    )
    threshold_id: Optional[int] = Field(
        None,
        gt=0,
        description="Rule trigger threshold that mandated this approval",
    )
    assigned_role_id: int = Field(
        ...,
        gt=0,
        description="Required approver role referencing roles.id",
    )
    decided_by_user_id: Optional[int] = Field(
        None,
        gt=0,
        description="User who decided the request referencing users.id",
    )
    status: ApprovalStatus = Field(
        "pending",
        description="Status: 'pending', 'approved', 'rejected', 'escalated', 'cancelled'",
    )
    decision_notes: Optional[str] = Field(
        None,
        description="Approver feedback, rationale, or rejection reason",
    )
    decided_at: Optional[datetime] = Field(
        None,
        description="Decision timestamp",
    )


class ApprovalCreate(ApprovalBase):
    """Payload for initiating a proposal approval workflow item."""
    pass


class ApprovalUpdate(BaseModel):
    """Payload for updating/deciding an approval item."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: Optional[int] = Field(None, gt=0)
    threshold_id: Optional[int] = Field(None, gt=0)
    assigned_role_id: Optional[int] = Field(None, gt=0)
    decided_by_user_id: Optional[int] = Field(None, gt=0)
    status: Optional[ApprovalStatus] = None
    decision_notes: Optional[str] = None
    decided_at: Optional[datetime] = None

    @field_validator(
        "proposal_version_id",
        "assigned_role_id",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ApprovalResponse(ApprovalBase):
    """API response schema for approval record."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Nested / Detail Schemas
# =============================================================================

class CustomerDetailResponse(CustomerResponse):
    """Customer response with populated country and tier references."""

    country: Optional[CountryResponse] = None
    customer_tier: Optional[CustomerTierResponse] = None


class DealDetailResponse(DealResponse):
    """Deal response with populated customer and owner user references."""

    customer: Optional[CustomerResponse] = None
    owner_user: Optional[UserResponse] = None


class ProposalContactDetailResponse(ProposalContactResponse):
    """ProposalContact response with associated proposal reference."""

    proposal: Optional[ProposalResponse] = None


class ProposalCountryDetailResponse(ProposalCountryResponse):
    """ProposalCountry response with populated country reference."""

    country: Optional[CountryResponse] = None


class ProposalLineItemDetailResponse(ProposalLineItemResponse):
    """ProposalLineItem response with resolved pack/feature, UOM, and currency."""

    pack_version: Optional[PackVersionResponse] = None
    feature: Optional[FeatureResponse] = None
    uom: Optional[UnitOfMeasureResponse] = None
    currency: Optional[CurrencyResponse] = None


class ProposalServiceLineDetailResponse(ProposalServiceLineResponse):
    """ProposalServiceLine response with resolved service rate and currency."""

    service_rate: Optional[ServiceRateResponse] = None
    currency: Optional[CurrencyResponse] = None


class CalculationSnapshotDetailResponse(CalculationSnapshotResponse):
    """CalculationSnapshot response with resolved calculation author."""

    calculated_by_user: Optional[UserResponse] = None


class ProposalContentDetailResponse(ProposalContentResponse):
    """ProposalContent response schema."""
    pass


class ApprovalDetailResponse(ApprovalResponse):
    """Approval response with resolved threshold, role, and approver user."""

    threshold: Optional[ApprovalThresholdResponse] = None
    assigned_role: Optional[RoleResponse] = None
    decided_by_user: Optional[UserResponse] = None


class ProposalVersionDetailResponse(ProposalVersionResponse):
    """ProposalVersion response with resolved relationships and children."""

    proposal: Optional[ProposalResponse] = None
    rate_card_version: Optional[RateCardVersionResponse] = None
    created_by_user: Optional[UserResponse] = None
    line_items: list[ProposalLineItemDetailResponse | ProposalLineItemResponse] = Field(default_factory=list)
    service_lines: list[ProposalServiceLineDetailResponse | ProposalServiceLineResponse] = Field(default_factory=list)
    snapshots: list[CalculationSnapshotResponse] = Field(default_factory=list)
    content: list[ProposalContentResponse] = Field(default_factory=list)
    approvals: list[ApprovalResponse] = Field(default_factory=list)


class ProposalDetailResponse(ProposalResponse):
    """Proposal response with populated deal, customer, currency, and versions."""

    deal: Optional[DealResponse] = None
    customer: Optional[CustomerResponse] = None
    currency: Optional[CurrencyResponse] = None
    created_by_user: Optional[UserResponse] = None
    contacts: list[ProposalContactResponse] = Field(default_factory=list)
    versions: list[ProposalVersionDetailResponse | ProposalVersionResponse] = Field(default_factory=list)
    countries: list[ProposalCountryDetailResponse | ProposalCountryResponse] = Field(default_factory=list)


# =============================================================================
# 12. Phase D — Pricing Calculation Schemas
# =============================================================================

class LineItemCalculationResult(BaseModel):
    """Calculation result for a single subscription line item."""

    model_config = ConfigDict(str_strip_whitespace=True)

    line_item_id: int
    line_number: int
    pack_version_id: Optional[int] = None
    feature_id: Optional[int] = None
    target_name: Optional[str] = None
    product_id: Optional[int] = None
    product_name: str
    product_code: str
    uom_id: int
    currency_id: int
    currency_code: str
    platform_fee: float = Field(description="Annual platform/fixed fee from rate card")
    rate_per_unit: float = Field(description="Rate per unit of measure (PEPM)")
    average_monthly_volume: float = Field(description="Average monthly quantity/volume")
    annual_consumption_fee: float = Field(description="rate_per_unit × avg_monthly_volume × 12")
    item_subscription_before_discount: float = Field(description="platform_fee + annual_consumption_fee")
    item_discount_pct: float = Field(description="Item-level discount percentage (0–100)")
    item_discount_amount: float = Field(description="subscription_before_discount × discount_pct / 100")
    item_subscription_after_discount: float = Field(description="Subscription after applying item discount")
    # Contract-Period Duration Fields (dynamic contract term)
    contract_term_months: Optional[int] = Field(default=12, description="Contract term in months")
    contract_consumption_fee: Optional[float] = Field(default=None, description="rate_per_unit × avg_monthly_volume × contract_term_months")
    contract_platform_fee: Optional[float] = Field(default=None, description="platform_fee × (contract_term_months / 12)")
    contract_subscription_before_discount: Optional[float] = Field(default=None, description="contract_platform_fee + contract_consumption_fee")
    contract_discount_amount: Optional[float] = Field(default=None, description="Item discount amount on contract subscription")
    contract_subscription_after_discount: Optional[float] = Field(default=None, description="Contract subscription after discount")


class ServiceLineCalculationResult(BaseModel):
    """Calculation result for a single service / implementation line."""

    model_config = ConfigDict(str_strip_whitespace=True)

    service_line_id: int
    role_name: str
    service_rate_id: Optional[int] = None
    man_days: float
    hourly_rate: Optional[float] = None
    standard_hours_per_day: float
    day_rate: float = Field(description="hourly_rate × standard_hours_per_day (or explicit daily_rate)")
    service_line_total: float = Field(description="man_days × day_rate")
    currency_id: int
    currency_code: str
    discount_pct: float
    product_code: Optional[str] = None


class ProductCalculationResult(BaseModel):
    """Consolidated calculation result aggregated by product."""

    model_config = ConfigDict(str_strip_whitespace=True)

    product_id: Optional[int] = None
    product_name: str
    product_code: str
    native_currency_id: int
    native_currency_code: str

    # Subscription
    subscription_subtotal_before_discount: float
    subscription_discount_pct: float
    subscription_discount_amount: float
    subscription_total_after_discount: float

    # Services
    service_subtotal_before_discount: float
    service_discount_pct: float
    service_discount_amount: float
    service_total_after_discount: float

    # Totals
    product_native_total: float
    fx_rate_multiplier: float
    currency_pair: str
    reporting_currency_id: int
    reporting_currency_code: str
    product_reporting_total: float

    line_items: list[LineItemCalculationResult] = Field(default_factory=list)
    service_lines: list[ServiceLineCalculationResult] = Field(default_factory=list)

    # Contract Duration Figures
    contract_term_months: Optional[int] = Field(default=12, description="Contract term in months")
    contract_subscription_subtotal_before_discount: Optional[float] = None
    contract_subscription_discount_amount: Optional[float] = None
    contract_subscription_total_after_discount: Optional[float] = None
    contract_product_native_total: Optional[float] = None
    contract_product_reporting_total: Optional[float] = None


class CalculationRequest(BaseModel):
    """Request payload to trigger a proposal pricing calculation.

    All monetary overrides are optional — the engine performs a full
    server-side recalculation using rate cards and service rates from
    the database.  Discount overrides are accepted per product code.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    version_id: Optional[int] = Field(
        None,
        gt=0,
        description="Target a specific proposal version; defaults to the latest draft",
    )
    contract_term_months: Optional[int] = Field(
        None,
        gt=0,
        le=120,
        description="Contract term in months for full-contract period calculations (default 12)",
    )
    product_subscription_discounts: dict[str, Decimal] = Field(
        default_factory=dict,
        description="Optional map of product_code → subscription discount % to override",
    )
    product_service_discounts: dict[str, Decimal] = Field(
        default_factory=dict,
        description="Optional map of product_code → service discount % to override",
    )
    default_hours_per_day: Optional[Decimal] = Field(
        None,
        gt=Decimal("0"),
        le=Decimal("24"),
        description="Override working hours per day (default 8.00)",
    )
    calculated_by_user_id: Optional[int] = Field(
        None,
        gt=0,
        description="User ID triggering the calculation (audit trail)",
    )


class ProposalCalculationResponse(BaseModel):
    """Top-level response returned by the calculation engine."""

    model_config = ConfigDict(str_strip_whitespace=True)

    snapshot_id: int
    proposal_id: int
    proposal_version_id: int
    version_no: int
    calculated_at: str
    reporting_currency_code: str
    total_proposal_reporting_currency: float
    contract_term_months: Optional[int] = Field(default=12, description="Contract duration in months")
    total_proposal_annual_reporting_currency: Optional[float] = Field(default=None, description="Annual consumption & ARR total in reporting currency")
    total_proposal_contract_reporting_currency: Optional[float] = Field(default=None, description="Full-contract total in reporting currency across configured term")
    is_stale: Optional[bool] = Field(
        default=None,
        description=(
            "True when the saved proposal inputs changed after this snapshot was calculated; "
            "None when the snapshot predates input fingerprints."
        ),
    )
    snapshot_payload: dict[str, Any]


# Rebuild any models that declare circular or forward references
ProposalDetailResponse.model_rebuild()
ProposalVersionDetailResponse.model_rebuild()
