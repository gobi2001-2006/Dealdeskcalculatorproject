"""Pydantic schemas for Foundation models (Wave 1 Master Data).

Re-exports schema definitions for foundational master data models:
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

from app.schemas.master_data import (
    ContractTermBase,
    ContractTermCreate,
    ContractTermResponse,
    ContractTermUpdate,
    CountryBase,
    CountryCreate,
    CountryDetailResponse,
    CountryResponse,
    CountryUpdate,
    CurrencyBase,
    CurrencyCreate,
    CurrencyResponse,
    CurrencyUpdate,
    CustomerTierBase,
    CustomerTierCreate,
    CustomerTierResponse,
    CustomerTierUpdate,
    DeploymentModelBase,
    DeploymentModelCreate,
    DeploymentModelDetailResponse,
    DeploymentModelResponse,
    DeploymentModelUpdate,
    DeploymentPricingOptionBase,
    DeploymentPricingOptionCreate,
    DeploymentPricingOptionDetailResponse,
    DeploymentPricingOptionResponse,
    DeploymentPricingOptionUpdate,
    FixedFeeBasis,
    FxRateBase,
    FxRateCreate,
    FxRateDetailResponse,
    FxRateResponse,
    FxRateUpdate,
    MasterDataStatus,
    PricingModelBase,
    PricingModelCreate,
    PricingModelDetailResponse,
    PricingModelResponse,
    PricingModelUpdate,
    UnitOfMeasureBase,
    UnitOfMeasureCreate,
    UnitOfMeasureResponse,
    UnitOfMeasureUpdate,
)

# Foundation status alias for semantic consistency
FoundationStatus = MasterDataStatus

__all__ = [
    # Status and Types
    "MasterDataStatus",
    "FoundationStatus",
    "FixedFeeBasis",
    # Currency
    "CurrencyBase",
    "CurrencyCreate",
    "CurrencyUpdate",
    "CurrencyResponse",
    # Country
    "CountryBase",
    "CountryCreate",
    "CountryUpdate",
    "CountryResponse",
    "CountryDetailResponse",
    # FxRate
    "FxRateBase",
    "FxRateCreate",
    "FxRateUpdate",
    "FxRateResponse",
    "FxRateDetailResponse",
    # DeploymentModel
    "DeploymentModelBase",
    "DeploymentModelCreate",
    "DeploymentModelUpdate",
    "DeploymentModelResponse",
    "DeploymentModelDetailResponse",
    # UnitOfMeasure
    "UnitOfMeasureBase",
    "UnitOfMeasureCreate",
    "UnitOfMeasureUpdate",
    "UnitOfMeasureResponse",
    # PricingModel
    "PricingModelBase",
    "PricingModelCreate",
    "PricingModelUpdate",
    "PricingModelResponse",
    "PricingModelDetailResponse",
    # DeploymentPricingOption
    "DeploymentPricingOptionBase",
    "DeploymentPricingOptionCreate",
    "DeploymentPricingOptionUpdate",
    "DeploymentPricingOptionResponse",
    "DeploymentPricingOptionDetailResponse",
    # CustomerTier
    "CustomerTierBase",
    "CustomerTierCreate",
    "CustomerTierUpdate",
    "CustomerTierResponse",
    # ContractTerm
    "ContractTermBase",
    "ContractTermCreate",
    "ContractTermUpdate",
    "ContractTermResponse",
]
