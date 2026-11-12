"""Pydantic schemas for Catalogue and Packs (Wave 2).

Defines request and response schemas for:
- ProductFamily
- Product
- Feature
- ProductDescription
- Pack
- PackVersion
- PackItem
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

# =============================================================================
# Constrained Types / Literals
# =============================================================================

CatalogueStatus = Literal["active", "inactive", "retired"]
FeatureClassification = Literal["native", "ai_enabled", "partner"]
DescriptionStatus = Literal["draft", "active", "retired"]
PackVariant = Literal["standard", "premium"]
PackVersionStatus = Literal["draft", "active", "locked", "superseded"]


# =============================================================================
# 1. ProductFamily Schemas
# =============================================================================

class ProductFamilyBase(BaseModel):
    """Base fields for ProductFamily."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique business code for product family",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display name of the product family",
    )
    sort_order: Optional[int] = Field(
        default=None,
        description="Display sort order; lower values appear first",
    )
    status: CatalogueStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )


class ProductFamilyCreate(ProductFamilyBase):
    """Payload for creating a new product family."""

    pass


class ProductFamilyUpdate(BaseModel):
    """Payload for updating an existing product family."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    sort_order: Optional[int] = None
    status: Optional[CatalogueStatus] = None


class ProductFamilyResponse(ProductFamilyBase):
    """API response schema for a product family."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 2. Product Schemas
# =============================================================================

class ProductBase(BaseModel):
    """Base fields for Product."""

    model_config = ConfigDict(str_strip_whitespace=True)

    product_family_id: int = Field(
        ...,
        gt=0,
        description="Owning product family ID",
    )
    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique business code for this product module",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display name of the product module",
    )
    status: CatalogueStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )


class ProductCreate(ProductBase):
    """Payload for creating a new product module."""

    pass


class ProductUpdate(BaseModel):
    """Payload for updating an existing product module."""

    model_config = ConfigDict(str_strip_whitespace=True)

    product_family_id: Optional[int] = Field(None, gt=0)
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[CatalogueStatus] = None


class ProductResponse(ProductBase):
    """API response schema for a product module."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 3. Feature Schemas
# =============================================================================

class FeatureBase(BaseModel):
    """Base fields for Feature."""

    model_config = ConfigDict(str_strip_whitespace=True)

    product_id: int = Field(
        ...,
        gt=0,
        description="Owning product module ID",
    )
    code: str = Field(
        ...,
        min_length=1,
        max_length=60,
        description="Business code: {PRODUCT_CODE}-{NNN}",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display name of the feature",
    )
    classification: FeatureClassification = Field(
        ...,
        description="Feature type: native | ai_enabled | partner",
    )
    partner_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Required when classification = 'partner'",
    )
    status: CatalogueStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )


class FeatureCreate(FeatureBase):
    """Payload for creating a new feature."""

    @model_validator(mode="after")
    def validate_partner_name(self) -> "FeatureCreate":
        if self.classification == "partner":
            if not self.partner_name or not self.partner_name.strip():
                raise ValueError("partner_name is required when classification is 'partner'")
        return self


class FeatureUpdate(BaseModel):
    """Payload for updating an existing feature."""

    model_config = ConfigDict(str_strip_whitespace=True)

    product_id: Optional[int] = Field(None, gt=0)
    code: Optional[str] = Field(None, min_length=1, max_length=60)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    classification: Optional[FeatureClassification] = None
    partner_name: Optional[str] = Field(None, max_length=200)
    status: Optional[CatalogueStatus] = None

    @model_validator(mode="after")
    def validate_partner_name(self) -> "FeatureUpdate":
        if self.classification == "partner":
            if not self.partner_name or not self.partner_name.strip():
                raise ValueError("partner_name is required when classification is 'partner'")
        return self


class FeatureResponse(FeatureBase):
    """API response schema for a feature."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 4. ProductDescription Schemas
# =============================================================================

class ProductDescriptionBase(BaseModel):
    """Base fields for ProductDescription."""

    model_config = ConfigDict(str_strip_whitespace=True)

    feature_id: int = Field(
        ...,
        gt=0,
        description="Feature this description belongs to",
    )
    language: str = Field(
        default="en",
        min_length=2,
        max_length=10,
        description="BCP-47 language tag, e.g. en, fr, de",
    )
    scope_text: str = Field(
        ...,
        min_length=1,
        description="Approved scope-of-work text",
    )
    feature_narrative: Optional[str] = Field(
        default=None,
        description="Optional longer feature narrative",
    )
    version_no: int = Field(
        default=1,
        ge=1,
        description="Monotonically increasing version counter per (feature, language)",
    )
    valid_from: Optional[date] = Field(
        default=None,
        description="Effective start date; None means immediately",
    )
    valid_to: Optional[date] = Field(
        default=None,
        description="Effective end date; None means no expiry",
    )
    status: DescriptionStatus = Field(
        default="draft",
        description="Lifecycle status: draft | active | retired",
    )


class ProductDescriptionCreate(ProductDescriptionBase):
    """Payload for creating a product description."""

    @model_validator(mode="after")
    def validate_date_order(self) -> "ProductDescriptionCreate":
        if self.valid_from is not None and self.valid_to is not None:
            if self.valid_to <= self.valid_from:
                raise ValueError("valid_to must be strictly greater than valid_from")
        return self


class ProductDescriptionUpdate(BaseModel):
    """Payload for updating an existing product description."""

    model_config = ConfigDict(str_strip_whitespace=True)

    feature_id: Optional[int] = Field(None, gt=0)
    language: Optional[str] = Field(None, min_length=2, max_length=10)
    scope_text: Optional[str] = Field(None, min_length=1)
    feature_narrative: Optional[str] = None
    version_no: Optional[int] = Field(None, ge=1)
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    status: Optional[DescriptionStatus] = None

    @model_validator(mode="after")
    def validate_date_order(self) -> "ProductDescriptionUpdate":
        if self.valid_from is not None and self.valid_to is not None:
            if self.valid_to <= self.valid_from:
                raise ValueError("valid_to must be strictly greater than valid_from")
        return self


class ProductDescriptionResponse(ProductDescriptionBase):
    """API response schema for a product description."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 5. Pack Schemas
# =============================================================================

class PackBase(BaseModel):
    """Base fields for Pack."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique business code for this pack",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Display name of the pack",
    )
    variant: PackVariant = Field(
        ...,
        description="Pack tier: standard | premium",
    )
    product_family_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="Primary product family; None when pack spans multiple families",
    )
    status: CatalogueStatus = Field(
        default="active",
        description="Lifecycle status: active | inactive | retired",
    )


class PackCreate(PackBase):
    """Payload for creating a new pack bundle."""

    pass


class PackUpdate(BaseModel):
    """Payload for updating an existing pack bundle."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    variant: Optional[PackVariant] = None
    product_family_id: Optional[int] = Field(None, gt=0)
    status: Optional[CatalogueStatus] = None


class PackResponse(PackBase):
    """API response schema for a pack bundle."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 6. PackVersion Schemas
# =============================================================================

class PackVersionBase(BaseModel):
    """Base fields for PackVersion."""

    model_config = ConfigDict(str_strip_whitespace=True)

    pack_id: int = Field(
        ...,
        gt=0,
        description="Owning pack ID",
    )
    version_no: int = Field(
        default=1,
        ge=1,
        description="Monotonically increasing version number per pack",
    )
    status: PackVersionStatus = Field(
        default="draft",
        description="Version lifecycle: draft | active | locked | superseded",
    )
    locked_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when this version was locked; None while not locked",
    )
    list_price_ref: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
        description="Reference list price for this version; None on draft",
    )


class PackVersionCreate(PackVersionBase):
    """Payload for creating a new pack version."""

    pass


class PackVersionUpdate(BaseModel):
    """Payload for updating an existing pack version."""

    model_config = ConfigDict(str_strip_whitespace=True)

    pack_id: Optional[int] = Field(None, gt=0)
    version_no: Optional[int] = Field(None, ge=1)
    status: Optional[PackVersionStatus] = None
    locked_at: Optional[datetime] = None
    list_price_ref: Optional[Decimal] = Field(
        default=None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=4,
    )


class PackVersionResponse(PackVersionBase):
    """API response schema for a pack version."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 7. PackItem Schemas
# =============================================================================

class PackItemBase(BaseModel):
    """Base fields for PackItem."""

    model_config = ConfigDict(str_strip_whitespace=True)

    pack_version_id: int = Field(
        ...,
        gt=0,
        description="Pack version this item belongs to",
    )
    feature_id: int = Field(
        ...,
        gt=0,
        description="Feature included in this pack version",
    )
    is_required: bool = Field(
        default=True,
        description="Whether this feature is required (mandatory) or optional in this pack version",
    )


class PackItemCreate(PackItemBase):
    """Payload for associating a feature with a pack version."""

    pass


class PackItemInput(BaseModel):
    """Input payload for a pack item when creating or syncing pack versions."""

    model_config = ConfigDict(str_strip_whitespace=True)

    feature_id: int = Field(..., gt=0, description="Feature ID included in pack version")
    is_required: bool = Field(default=True, description="Whether this feature is required (mandatory) or optional")


class PackItemsSyncRequest(BaseModel):
    """Request payload for syncing all items of a pack version."""

    model_config = ConfigDict(str_strip_whitespace=True)

    items: list[PackItemInput] = Field(default_factory=list, description="Target list of features and their requirement flags")


class PackItemUpdate(BaseModel):
    """Payload for updating a pack item association."""

    model_config = ConfigDict(str_strip_whitespace=True)

    pack_version_id: Optional[int] = Field(None, gt=0)
    feature_id: Optional[int] = Field(None, gt=0)
    is_required: Optional[bool] = None


class PackItemResponse(PackItemBase):
    """API response schema for a pack item."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


# =============================================================================
# Nested / Detail Schemas
# =============================================================================

class PackItemDetailResponse(PackItemResponse):
    """PackItem response with populated Feature."""

    feature: Optional[FeatureResponse] = None


class PackVersionDetailResponse(PackVersionResponse):
    """PackVersion response with nested pack items."""

    pack_items: list[PackItemDetailResponse] = Field(default_factory=list)


class PackDetailResponse(PackResponse):
    """Pack response with nested pack versions."""

    pack_versions: list[PackVersionDetailResponse] = Field(default_factory=list)


class FeatureDetailResponse(FeatureResponse):
    """Feature response with nested approved descriptions."""

    product_descriptions: list[ProductDescriptionResponse] = Field(default_factory=list)


class ProductDetailResponse(ProductResponse):
    """Product response with nested features."""

    features: list[FeatureResponse] = Field(default_factory=list)


class ProductFamilyDetailResponse(ProductFamilyResponse):
    """ProductFamily response with nested products and packs."""

    products: list[ProductResponse] = Field(default_factory=list)
    packs: list[PackResponse] = Field(default_factory=list)
