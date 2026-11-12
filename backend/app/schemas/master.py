"""Pydantic schemas for Master Data models (matching app.models.master).

Re-exports schema definitions for master data models:
1. Currency
2. Country
3. FxRate
4. DeploymentModel
5. PricingModel
6. CustomerTier
7. ContractTerm
8. UnitOfMeasure
9. DeploymentPricingOption
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

# Semantic status alias for master data
MasterStatus = MasterDataStatus

__all__ = [
    # Types & Status
    "MasterDataStatus",
    "MasterStatus",
    "FixedFeeBasis",
    # Master data (in business flow order)
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
    # PricingModel
    "PricingModelBase",
    "PricingModelCreate",
    "PricingModelUpdate",
    "PricingModelResponse",
    "PricingModelDetailResponse",
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
    # Supporting Master dimensions
    # UnitOfMeasure
    "UnitOfMeasureBase",
    "UnitOfMeasureCreate",
    "UnitOfMeasureUpdate",
    "UnitOfMeasureResponse",
    # DeploymentPricingOption
    "DeploymentPricingOptionBase",
    "DeploymentPricingOptionCreate",
    "DeploymentPricingOptionUpdate",
    "DeploymentPricingOptionResponse",
    "DeploymentPricingOptionDetailResponse",
]
