"""API routes for Product Catalogue management.

Supports complete CRUD for:
- Product Families: GET /api/catalogue/families, POST, GET /{id}, PATCH /{id}, DELETE /{id}
- Products: GET /api/catalogue/products, POST, GET /{id}, PATCH /{id}, DELETE /{id}
- Features: GET /api/catalogue/features, POST, GET /{id}, PATCH /{id}, DELETE /{id}
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.errors import DOMAIN_ERRORS, http_error
from app.db.session import get_db
from app.schemas.catalogue import (
    ProductFamilyCreate,
    ProductFamilyResponse,
    ProductFamilyUpdate,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    FeatureCreate,
    FeatureResponse,
    FeatureUpdate,
)
from app.services.catalogue_service import (
    list_product_families,
    get_product_family,
    create_product_family,
    update_product_family,
    delete_product_family,
    list_products,
    get_product,
    create_product,
    update_product,
    delete_product,
    list_features,
    create_feature,
    update_feature,
    delete_feature,
)

router = APIRouter()


# =============================================================================
# 1. Product Family Endpoints
# =============================================================================

@router.get("/families", response_model=List[ProductFamilyResponse])
def get_families(
    status: Optional[str] = Query(None, description="Filter by status (active | inactive | retired)"),
    db: Session = Depends(get_db),
):
    """Retrieve all product families."""
    return list_product_families(db=db, status=status)


@router.post("/families", response_model=ProductFamilyResponse, status_code=status.HTTP_201_CREATED)
def post_family(
    payload: ProductFamilyCreate,
    db: Session = Depends(get_db),
):
    """Create a new product family."""
    try:
        return create_product_family(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get("/families/{family_id}", response_model=ProductFamilyResponse)
def get_family_by_id(
    family_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve a specific product family by ID."""
    family = get_product_family(db=db, family_id=family_id)
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product family with id {family_id} not found")
    return family


@router.patch("/families/{family_id}", response_model=ProductFamilyResponse)
def patch_family(
    family_id: int,
    payload: ProductFamilyUpdate,
    db: Session = Depends(get_db),
):
    """Update a product family."""
    try:
        return update_product_family(db=db, family_id=family_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/families/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_family(
    family_id: int,
    db: Session = Depends(get_db),
):
    """Delete a product family. Fails if products are attached to this family."""
    try:
        delete_product_family(db=db, family_id=family_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 2. Product Endpoints
# =============================================================================

@router.get("/products", response_model=List[ProductResponse])
def get_products(
    family_id: Optional[int] = Query(None, description="Filter by product family ID"),
    status: Optional[str] = Query(None, description="Filter by status (active | inactive | retired)"),
    db: Session = Depends(get_db),
):
    """Retrieve products with optional filtering."""
    return list_products(db=db, family_id=family_id, status=status)


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def post_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
):
    """Create a new product module."""
    try:
        return create_product(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product_by_id(
    product_id: int,
    db: Session = Depends(get_db),
):
    """Retrieve a specific product by ID."""
    product = get_product(db=db, product_id=product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product with id {product_id} not found")
    return product


@router.patch("/products/{product_id}", response_model=ProductResponse)
def patch_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing product."""
    try:
        return update_product(db=db, product_id=product_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product_endpoint(
    product_id: int,
    db: Session = Depends(get_db),
):
    """Delete a product. Fails if features are attached to this product."""
    try:
        delete_product(db=db, product_id=product_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


# =============================================================================
# 3. Feature Endpoints
# =============================================================================

@router.get("/features", response_model=List[FeatureResponse])
def get_features(
    product_id: Optional[int] = Query(None, description="Filter by product ID"),
    status: Optional[str] = Query(None, description="Filter by status (active | inactive | retired)"),
    db: Session = Depends(get_db),
):
    """Retrieve features with optional filtering."""
    return list_features(db=db, product_id=product_id, status=status)


@router.post("/features", response_model=FeatureResponse, status_code=status.HTTP_201_CREATED)
def post_feature(
    payload: FeatureCreate,
    db: Session = Depends(get_db),
):
    """Create a new feature."""
    try:
        return create_feature(db=db, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.patch("/features/{feature_id}", response_model=FeatureResponse)
def patch_feature(
    feature_id: int,
    payload: FeatureUpdate,
    db: Session = Depends(get_db),
):
    """Update a feature."""
    try:
        return update_feature(db=db, feature_id=feature_id, data=payload)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc


@router.delete("/features/{feature_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feature_endpoint(
    feature_id: int,
    db: Session = Depends(get_db),
):
    """Delete a feature."""
    try:
        delete_feature(db=db, feature_id=feature_id)
    except DOMAIN_ERRORS as exc:
        raise http_error(exc) from exc
