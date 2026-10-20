from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.master_data import (
    Currency,
    Country,
    DeploymentModel,
    PricingModel,
    CustomerTier,
    ContractTerm,
    DeploymentPricingOption,
    UnitOfMeasure,
)
from app.schemas.master_data import (
    CurrencyResponse,
    CountryResponse,
    DeploymentModelResponse,
    PricingModelResponse,
    CustomerTierResponse,
    ContractTermResponse,
    DeploymentPricingOptionResponse,
    UnitOfMeasureResponse,
)

router = APIRouter()

@router.get("/currencies", response_model=list[CurrencyResponse], summary="List all currencies")
def list_currencies(db: Session = Depends(get_db)):
    stmt = select(Currency).order_by(Currency.id)
    return db.execute(stmt).scalars().all()

@router.get("/countries", response_model=list[CountryResponse], summary="List all countries")
def list_countries(db: Session = Depends(get_db)):
    stmt = select(Country).order_by(Country.id)
    return db.execute(stmt).scalars().all()

@router.get("/deployment-models", response_model=list[DeploymentModelResponse], summary="List all deployment models")
def list_deployment_models(db: Session = Depends(get_db)):
    stmt = select(DeploymentModel).order_by(DeploymentModel.id)
    return db.execute(stmt).scalars().all()

@router.get("/pricing-models", response_model=list[PricingModelResponse], summary="List all pricing models")
def list_pricing_models(db: Session = Depends(get_db)):
    stmt = select(PricingModel).order_by(PricingModel.id)
    return db.execute(stmt).scalars().all()

@router.get("/customer-tiers", response_model=list[CustomerTierResponse], summary="List all customer tiers")
def list_customer_tiers(db: Session = Depends(get_db)):
    stmt = select(CustomerTier).order_by(CustomerTier.id)
    return db.execute(stmt).scalars().all()

@router.get("/contract-terms", response_model=list[ContractTermResponse], summary="List all contract terms")
def list_contract_terms(db: Session = Depends(get_db)):
    stmt = select(ContractTerm).order_by(ContractTerm.id)
    return db.execute(stmt).scalars().all()


@router.get("/units-of-measure", response_model=list[UnitOfMeasureResponse], summary="List all units of measure")
def list_units_of_measure(db: Session = Depends(get_db)):
    stmt = select(UnitOfMeasure).order_by(UnitOfMeasure.id)
    return db.execute(stmt).scalars().all()


@router.get(
    "/deployment-pricing-options",
    response_model=list[DeploymentPricingOptionResponse],
    summary="List which pricing models are allowed for each deployment model",
)
def list_deployment_pricing_options(db: Session = Depends(get_db)):
    stmt = select(DeploymentPricingOption).order_by(
        DeploymentPricingOption.deployment_model_id, DeploymentPricingOption.pricing_model_id
    )
    return db.execute(stmt).scalars().all()
