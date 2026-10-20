from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.catalogue import ProductFamily, Product, Feature
from app.schemas.catalogue import (
    ProductFamilyResponse,
    ProductResponse,
    FeatureResponse,
)

router = APIRouter()

@router.get("/families", response_model=list[ProductFamilyResponse])
def list_families(db: Session = Depends(get_db)):
    stmt = select(ProductFamily).order_by(ProductFamily.id)
    families = db.execute(stmt).scalars().all()
    return families

@router.get("/products", response_model=list[ProductResponse])
def list_products(
    family_id: int | None = Query(default=None, description="Filter by product family ID"),
    db: Session = Depends(get_db),
):
    stmt = select(Product)
    if family_id is not None:
        stmt = stmt.where(Product.product_family_id == family_id)
    stmt = stmt.order_by(Product.id)
    products = db.execute(stmt).scalars().all()
    return products

@router.get("/features", response_model=list[FeatureResponse])
def list_features(
    product_id: int | None = Query(default=None, description="Filter by product ID"),
    db: Session = Depends(get_db),
):
    stmt = select(Feature)
    if product_id is not None:
        stmt = stmt.where(Feature.product_id == product_id)
    stmt = stmt.order_by(Feature.id)
    features = db.execute(stmt).scalars().all()
    return features
