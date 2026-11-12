"""Catalogue Service Layer.

Provides business logic and database transaction management for:
- ProductFamily (List, Create, Update, Delete)
- Product (List, Get, Create, Update, Delete)
- Feature (List, Create, Update, Delete)
"""

import logging
from datetime import datetime, timezone
from typing import Any, List, Optional
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.catalogue import ProductFamily, Product, Feature, Pack, PackVersion, PackItem
from app.schemas.catalogue import (
    ProductFamilyCreate,
    ProductFamilyUpdate,
    ProductCreate,
    ProductUpdate,
    FeatureCreate,
    FeatureUpdate,
    PackCreate,
    PackUpdate,
    PackVersionCreate,
    PackVersionUpdate,
    PackItemCreate,
)
from app.services.proposal_service import (
    ResourceNotFoundError,
    ProposalConflictError,
    ProposalValidationError,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Product Family Operations
# =============================================================================

def list_product_families(
    db: Session,
    status: Optional[str] = None,
) -> List[ProductFamily]:
    """Retrieve all product families, optionally filtered by status."""
    stmt = select(ProductFamily).order_by(ProductFamily.id)
    if status:
        stmt = stmt.where(ProductFamily.status == status)
    return db.execute(stmt).scalars().all()


def get_product_family(db: Session, family_id: int) -> Optional[ProductFamily]:
    """Retrieve a single product family by primary key."""
    return db.get(ProductFamily, family_id)


def create_product_family(db: Session, data: ProductFamilyCreate) -> ProductFamily:
    """Create a new product family.
    
    Validates uniqueness of code and name before writing.
    """
    # Check duplicate code
    existing_code = db.execute(
        select(ProductFamily.id).where(ProductFamily.code == data.code)
    ).first()
    if existing_code:
        raise ProposalConflictError(f"Product family with code '{data.code}' already exists")

    # Check duplicate name (case-insensitive)
    existing_name = db.execute(
        select(ProductFamily.id).where(func.lower(ProductFamily.name) == data.name.strip().lower())
    ).first()
    if existing_name:
        raise ProposalConflictError(f"Product family with name '{data.name}' already exists")

    family = ProductFamily(
        code=data.code,
        name=data.name,
        sort_order=data.sort_order,
        status=data.status,
    )
    try:
        db.add(family)
        db.commit()
        db.refresh(family)
        return family
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error creating product family: %s", exc)
        raise ProposalConflictError("Failed to create product family due to a database constraint violation")


def update_product_family(
    db: Session,
    family_id: int,
    data: ProductFamilyUpdate,
) -> ProductFamily:
    """Update an existing product family."""
    family = db.get(ProductFamily, family_id)
    if not family:
        raise ResourceNotFoundError(f"Product family with id {family_id} not found")

    update_dict = data.model_dump(exclude_unset=True)

    if "code" in update_dict and update_dict["code"] != family.code:
        existing = db.execute(
            select(ProductFamily.id).where(
                ProductFamily.code == update_dict["code"],
                ProductFamily.id != family_id,
            )
        ).first()
        if existing:
            raise ProposalConflictError(f"Product family with code '{update_dict['code']}' already exists")

    if "name" in update_dict and update_dict["name"].lower() != family.name.lower():
        existing = db.execute(
            select(ProductFamily.id).where(
                func.lower(ProductFamily.name) == update_dict["name"].lower(),
                ProductFamily.id != family_id,
            )
        ).first()
        if existing:
            raise ProposalConflictError(f"Product family with name '{update_dict['name']}' already exists")

    for key, value in update_dict.items():
        setattr(family, key, value)

    try:
        db.commit()
        db.refresh(family)
        return family
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error updating product family: %s", exc)
        raise ProposalConflictError("Failed to update product family due to a database constraint violation")


def delete_product_family(db: Session, family_id: int) -> None:
    """Safely delete or deactivate a product family.
    
    Prevents deletion if products are linked to this family.
    """
    family = db.get(ProductFamily, family_id)
    if not family:
        raise ResourceNotFoundError(f"Product family with id {family_id} not found")

    # Check child products
    has_products = db.execute(
        select(Product.id).where(Product.product_family_id == family_id)
    ).first()
    if has_products:
        raise ProposalConflictError(
            f"Cannot delete product family '{family.name}' because it contains associated products. Delete or reassign products first."
        )

    try:
        db.delete(family)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error deleting product family: %s", exc)
        raise ProposalConflictError("Cannot delete product family due to dependent references")


# =============================================================================
# Product Operations
# =============================================================================

def list_products(
    db: Session,
    family_id: Optional[int] = None,
    status: Optional[str] = None,
) -> List[Product]:
    """Retrieve products with optional filtering by family and status."""
    stmt = select(Product).order_by(Product.id)
    if family_id is not None:
        stmt = stmt.where(Product.product_family_id == family_id)
    if status is not None:
        stmt = stmt.where(Product.status == status)
    return db.execute(stmt).scalars().all()


def get_product(db: Session, product_id: int) -> Optional[Product]:
    """Retrieve a single product by primary key."""
    return db.get(Product, product_id)


def create_product(db: Session, data: ProductCreate) -> Product:
    """Create a new product module.
    
    Validates parent family existence and code uniqueness.
    """
    # Validate family exists
    family = db.get(ProductFamily, data.product_family_id)
    if not family:
        raise ResourceNotFoundError(f"Product family with id {data.product_family_id} not found")

    # Validate code unique
    existing_code = db.execute(
        select(Product.id).where(Product.code == data.code)
    ).first()
    if existing_code:
        raise ProposalConflictError(f"Product with code '{data.code}' already exists")

    # Validate family_id + name unique
    existing_name = db.execute(
        select(Product.id).where(
            Product.product_family_id == data.product_family_id,
            func.lower(Product.name) == data.name.strip().lower(),
        )
    ).first()
    if existing_name:
        raise ProposalConflictError(f"Product with name '{data.name}' already exists in this family")

    product = Product(
        product_family_id=data.product_family_id,
        code=data.code,
        name=data.name,
        status=data.status,
    )
    try:
        db.add(product)
        db.commit()
        db.refresh(product)
        return product
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error creating product: %s", exc)
        raise ProposalConflictError("Failed to create product due to a database constraint violation")


def update_product(
    db: Session,
    product_id: int,
    data: ProductUpdate,
) -> Product:
    """Update an existing product module."""
    product = db.get(Product, product_id)
    if not product:
        raise ResourceNotFoundError(f"Product with id {product_id} not found")

    update_dict = data.model_dump(exclude_unset=True)

    if "product_family_id" in update_dict and update_dict["product_family_id"] != product.product_family_id:
        family = db.get(ProductFamily, update_dict["product_family_id"])
        if not family:
            raise ResourceNotFoundError(f"Product family with id {update_dict['product_family_id']} not found")

    if "code" in update_dict and update_dict["code"] != product.code:
        existing = db.execute(
            select(Product.id).where(
                Product.code == update_dict["code"],
                Product.id != product_id,
            )
        ).first()
        if existing:
            raise ProposalConflictError(f"Product with code '{update_dict['code']}' already exists")

    target_family_id = update_dict.get("product_family_id", product.product_family_id)
    target_name = update_dict.get("name", product.name)
    if target_name.lower() != product.name.lower() or target_family_id != product.product_family_id:
        existing = db.execute(
            select(Product.id).where(
                Product.product_family_id == target_family_id,
                func.lower(Product.name) == target_name.lower(),
                Product.id != product_id,
            )
        ).first()
        if existing:
            raise ProposalConflictError(f"Product with name '{target_name}' already exists in this family")

    for key, value in update_dict.items():
        setattr(product, key, value)

    try:
        db.commit()
        db.refresh(product)
        return product
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error updating product: %s", exc)
        raise ProposalConflictError("Failed to update product due to a database constraint violation")


def delete_product(db: Session, product_id: int) -> None:
    """Safely delete a product module.
    
    Prevents deletion if features or proposals reference this product.
    """
    product = db.get(Product, product_id)
    if not product:
        raise ResourceNotFoundError(f"Product with id {product_id} not found")

    # Check child features
    has_features = db.execute(
        select(Feature.id).where(Feature.product_id == product_id)
    ).first()
    if has_features:
        raise ProposalConflictError(
            f"Cannot delete product '{product.name}' because it contains associated features. Delete features first."
        )

    try:
        db.delete(product)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error deleting product: %s", exc)
        raise ProposalConflictError("Cannot delete product due to dependent references")


# =============================================================================
# Feature Operations
# =============================================================================

def list_features(
    db: Session,
    product_id: Optional[int] = None,
    status: Optional[str] = None,
) -> List[Feature]:
    """Retrieve features with optional filtering by product and status."""
    stmt = select(Feature).order_by(Feature.id)
    if product_id is not None:
        stmt = stmt.where(Feature.product_id == product_id)
    if status is not None:
        stmt = stmt.where(Feature.status == status)
    return db.execute(stmt).scalars().all()


def create_feature(db: Session, data: FeatureCreate) -> Feature:
    """Create a new feature under a product."""
    product = db.get(Product, data.product_id)
    if not product:
        raise ResourceNotFoundError(f"Product with id {data.product_id} not found")

    existing_code = db.execute(
        select(Feature.id).where(Feature.code == data.code)
    ).first()
    if existing_code:
        raise ProposalConflictError(f"Feature with code '{data.code}' already exists")

    feature = Feature(
        product_id=data.product_id,
        code=data.code,
        name=data.name,
        classification=data.classification,
        partner_name=data.partner_name,
        status=data.status,
    )
    try:
        db.add(feature)
        db.commit()
        db.refresh(feature)
        return feature
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error creating feature: %s", exc)
        raise ProposalConflictError("Failed to create feature due to a database constraint violation")


def update_feature(db: Session, feature_id: int, data: FeatureUpdate) -> Feature:
    """Update an existing feature."""
    feature = db.get(Feature, feature_id)
    if not feature:
        raise ResourceNotFoundError(f"Feature with id {feature_id} not found")

    update_dict = data.model_dump(exclude_unset=True)

    if "code" in update_dict and update_dict["code"] != feature.code:
        existing = db.execute(
            select(Feature.id).where(Feature.code == update_dict["code"], Feature.id != feature_id)
        ).first()
        if existing:
            raise ProposalConflictError(f"Feature with code '{update_dict['code']}' already exists")

    for key, value in update_dict.items():
        setattr(feature, key, value)

    try:
        db.commit()
        db.refresh(feature)
        return feature
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error updating feature: %s", exc)
        raise ProposalConflictError("Failed to update feature due to a database constraint violation")


def delete_feature(db: Session, feature_id: int) -> None:
    """Safely delete a feature."""
    feature = db.get(Feature, feature_id)
    if not feature:
        raise ResourceNotFoundError(f"Feature with id {feature_id} not found")

    try:
        db.delete(feature)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error deleting feature: %s", exc)
        raise ProposalConflictError("Cannot delete feature due to dependent references in packs or proposals")


# =============================================================================
# Pack Operations
# =============================================================================

def list_packs_service(
    db: Session,
    status: Optional[str] = None,
) -> List[Pack]:
    """Retrieve all packs with their pack versions and constituent features."""
    from sqlalchemy.orm import selectinload
    stmt = (
        select(Pack)
        .options(
            selectinload(Pack.pack_versions)
            .selectinload(PackVersion.pack_items)
            .selectinload(PackItem.feature)
        )
        .order_by(Pack.id)
    )
    if status:
        stmt = stmt.where(Pack.status == status)
    return list(db.execute(stmt).scalars().all())


def get_pack_service(db: Session, pack_id: int) -> Optional[Pack]:
    """Retrieve a single pack with its versions and constituent features."""
    from sqlalchemy.orm import selectinload
    stmt = (
        select(Pack)
        .where(Pack.id == pack_id)
        .options(
            selectinload(Pack.pack_versions)
            .selectinload(PackVersion.pack_items)
            .selectinload(PackItem.feature)
        )
    )
    return db.execute(stmt).scalar_one_or_none()


def create_pack_service(
    db: Session,
    data: PackCreate,
    initial_version: Optional[int] = 1,
    feature_ids: Optional[List[int]] = None,
    required_feature_ids: Optional[List[int]] = None,
    items: Optional[List[Any]] = None,
) -> Pack:
    """Create a new pack bundle and optionally initialize Version 1 with items."""
    # Check duplicate code
    existing_code = db.execute(select(Pack.id).where(Pack.code == data.code)).first()
    if existing_code:
        raise ProposalConflictError(f"Pack with code '{data.code}' already exists")

    if data.product_family_id is not None:
        family = db.get(ProductFamily, data.product_family_id)
        if not family:
            raise ResourceNotFoundError(f"Product family with id {data.product_family_id} not found")

    pack = Pack(
        code=data.code,
        name=data.name,
        variant=data.variant,
        product_family_id=data.product_family_id,
        status=data.status,
    )

    try:
        db.add(pack)
        db.flush()

        # Initialize version 1 if requested
        if initial_version is not None:
            ver = PackVersion(
                pack_id=pack.id,
                version_no=initial_version,
                status="active",
            )
            db.add(ver)
            db.flush()

            # Attach initial features/products if provided
            if items:
                for it in items:
                    fid = it.feature_id if hasattr(it, "feature_id") else it["feature_id"]
                    is_req = it.is_required if hasattr(it, "is_required") else it.get("is_required", True)
                    if db.get(Feature, fid) is None:
                        raise ResourceNotFoundError(f"Feature with id {fid} not found")
                    db.add(
                        PackItem(
                            pack_version_id=ver.id,
                            feature_id=fid,
                            is_required=is_req,
                        )
                    )
            elif feature_ids:
                req_set = set(required_feature_ids) if required_feature_ids is not None else set(feature_ids)
                for fid in set(feature_ids):
                    if db.get(Feature, fid) is None:
                        raise ResourceNotFoundError(f"Feature with id {fid} not found")
                    db.add(
                        PackItem(
                            pack_version_id=ver.id,
                            feature_id=fid,
                            is_required=(fid in req_set),
                        )
                    )

        db.commit()
        db.refresh(pack)
        return pack
    except ResourceNotFoundError:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error creating pack: %s", exc)
        raise ProposalConflictError("Failed to create pack due to a constraint violation")


def update_pack_service(db: Session, pack_id: int, data: PackUpdate) -> Pack:
    """Update pack metadata."""
    pack = db.get(Pack, pack_id)
    if not pack:
        raise ResourceNotFoundError(f"Pack with id {pack_id} not found")

    update_dict = data.model_dump(exclude_unset=True)

    if "code" in update_dict and update_dict["code"] != pack.code:
        existing = db.execute(
            select(Pack.id).where(Pack.code == update_dict["code"], Pack.id != pack_id)
        ).first()
        if existing:
            raise ProposalConflictError(f"Pack with code '{update_dict['code']}' already exists")

    if "product_family_id" in update_dict and update_dict["product_family_id"] is not None:
        family = db.get(ProductFamily, update_dict["product_family_id"])
        if not family:
            raise ResourceNotFoundError(f"Product family with id {update_dict['product_family_id']} not found")

    for key, value in update_dict.items():
        setattr(pack, key, value)

    try:
        db.commit()
        db.refresh(pack)
        return pack
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error updating pack: %s", exc)
        raise ProposalConflictError("Failed to update pack due to a constraint violation")


def delete_pack_service(db: Session, pack_id: int) -> None:
    """Delete a pack and its versions/items if not referenced by proposals."""
    pack = db.get(Pack, pack_id)
    if not pack:
        raise ResourceNotFoundError(f"Pack with id {pack_id} not found")

    try:
        # Delete associated items and versions
        versions = db.execute(select(PackVersion).where(PackVersion.pack_id == pack_id)).scalars().all()
        for v in versions:
            db.execute(PackItem.__table__.delete().where(PackItem.pack_version_id == v.id))
            db.delete(v)
        db.delete(pack)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error deleting pack: %s", exc)
        raise ProposalConflictError("Cannot delete pack because it is referenced by existing proposals")


# =============================================================================
# Pack Version & Item Operations
# =============================================================================

def get_pack_version_service(db: Session, pack_version_id: int) -> Optional[PackVersion]:
    """Retrieve a single pack version with its pack items and feature details."""
    from sqlalchemy.orm import selectinload
    stmt = (
        select(PackVersion)
        .where(PackVersion.id == pack_version_id)
        .options(selectinload(PackVersion.pack_items).selectinload(PackItem.feature))
    )
    ver = db.execute(stmt).scalar_one_or_none()
    if ver:
        ver.pack_items.sort(key=lambda item: item.feature_id)
    return ver


def create_pack_version_service(db: Session, data: PackVersionCreate) -> PackVersion:
    """Create a new version for an existing pack."""
    pack = db.get(Pack, data.pack_id)
    if not pack:
        raise ResourceNotFoundError(f"Pack with id {data.pack_id} not found")

    existing_ver = db.execute(
        select(PackVersion.id).where(
            PackVersion.pack_id == data.pack_id,
            PackVersion.version_no == data.version_no,
        )
    ).first()
    if existing_ver:
        raise ProposalConflictError(f"Pack version {data.version_no} already exists for pack {data.pack_id}")

    version = PackVersion(
        pack_id=data.pack_id,
        version_no=data.version_no,
        status=data.status,
        locked_at=data.locked_at,
        list_price_ref=data.list_price_ref,
    )
    try:
        db.add(version)
        db.commit()
        db.refresh(version)
        return version
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error creating pack version: %s", exc)
        raise ProposalConflictError("Failed to create pack version")


def update_pack_version_service(db: Session, pack_version_id: int, data: PackVersionUpdate) -> PackVersion:
    """Update pack version status, locked timestamp, or list price reference."""
    ver = db.get(PackVersion, pack_version_id)
    if not ver:
        raise ResourceNotFoundError(f"PackVersion with id {pack_version_id} not found")
    if ver.status == "locked" and data.status != "locked":
        raise ProposalConflictError("Cannot modify a locked pack version")
    if ver.status == "superseded" and data.status not in (None, "superseded"):
        raise ProposalConflictError("A superseded pack version cannot be reactivated; create a new version")

    update_dict = data.model_dump(exclude_unset=True)
    for field, val in update_dict.items():
        setattr(ver, field, val)

    # One active version per pack: activating a version supersedes the previously active one,
    # so "the active version" used by the configurator is never ambiguous.
    if update_dict.get("status") == "active":
        others = db.execute(
            select(PackVersion).where(
                PackVersion.pack_id == ver.pack_id,
                PackVersion.id != ver.id,
                PackVersion.status == "active",
            )
        ).scalars().all()
        for other in others:
            other.status = "superseded"

    if ver.status == "locked" and not ver.locked_at:
        ver.locked_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(ver)
        return ver
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error updating pack version: %s", exc)
        raise ProposalConflictError("Failed to update pack version")


def add_item_to_pack_version(
    db: Session,
    pack_version_id: int,
    feature_id: int,
    is_required: bool = True,
) -> PackItem:
    """Add a feature to a pack version."""
    ver = db.get(PackVersion, pack_version_id)
    if not ver:
        raise ResourceNotFoundError(f"PackVersion with id {pack_version_id} not found")
    if ver.status in ("locked", "superseded"):
        raise ProposalConflictError(f"Cannot add items to a {ver.status} pack version")

    feat = db.get(Feature, feature_id)
    if not feat:
        raise ResourceNotFoundError(f"Feature with id {feature_id} not found")

    existing_item = db.execute(
        select(PackItem).where(
            PackItem.pack_version_id == pack_version_id,
            PackItem.feature_id == feature_id,
        )
    ).scalar_one_or_none()
    if existing_item:
        raise ProposalConflictError(f"Feature with id {feature_id} already exists in pack version {pack_version_id}")

    item = PackItem(pack_version_id=pack_version_id, feature_id=feature_id, is_required=is_required)
    try:
        db.add(item)
        db.commit()
        return item
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error adding pack item: %s", exc)
        raise ProposalConflictError("Failed to add item to pack version")


def remove_item_from_pack_version(db: Session, pack_version_id: int, feature_id: int) -> None:
    """Remove a feature from a pack version."""
    ver = db.get(PackVersion, pack_version_id)
    if not ver:
        raise ResourceNotFoundError(f"PackVersion with id {pack_version_id} not found")
    if ver.status in ("locked", "superseded"):
        raise ProposalConflictError(f"Cannot remove items from a {ver.status} pack version")

    item = db.execute(
        select(PackItem).where(
            PackItem.pack_version_id == pack_version_id,
            PackItem.feature_id == feature_id,
        )
    ).scalar_one_or_none()
    if not item:
        raise ResourceNotFoundError(f"Feature {feature_id} not found in pack version {pack_version_id}")

    try:
        db.delete(item)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error removing pack item: %s", exc)
        raise ProposalConflictError("Failed to remove item from pack version")


def update_item_in_pack_version(
    db: Session,
    pack_version_id: int,
    feature_id: int,
    is_required: bool,
) -> PackItem:
    """Update requirement status for an existing feature in a pack version."""
    ver = db.get(PackVersion, pack_version_id)
    if not ver:
        raise ResourceNotFoundError(f"PackVersion with id {pack_version_id} not found")
    if ver.status in ("locked", "superseded"):
        raise ProposalConflictError(f"Cannot modify items in a {ver.status} pack version")

    item = db.execute(
        select(PackItem).where(
            PackItem.pack_version_id == pack_version_id,
            PackItem.feature_id == feature_id,
        )
    ).scalar_one_or_none()
    if not item:
        raise ResourceNotFoundError(f"Feature with id {feature_id} not found in pack version {pack_version_id}")

    item.is_required = is_required
    try:
        db.commit()
        db.refresh(item)
        return item
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error updating pack item: %s", exc)
        raise ProposalConflictError("Failed to update pack item")


def sync_pack_version_items_service(
    db: Session,
    pack_version_id: int,
    items: List[Any],
) -> List[PackItem]:
    """Synchronize all items in an active or draft pack version."""
    ver = db.get(PackVersion, pack_version_id)
    if not ver:
        raise ResourceNotFoundError(f"PackVersion with id {pack_version_id} not found")
    if ver.status in ("locked", "superseded"):
        raise ProposalConflictError(f"Cannot modify items in a {ver.status} pack version")

    existing_items = db.execute(
        select(PackItem).where(PackItem.pack_version_id == pack_version_id)
    ).scalars().all()
    existing_map = {item.feature_id: item for item in existing_items}

    target_map = {}
    for it in items:
        fid = it.feature_id if hasattr(it, "feature_id") else it["feature_id"]
        is_req = it.is_required if hasattr(it, "is_required") else it.get("is_required", True)
        target_map[fid] = is_req

    # 1. Delete items that are no longer in target
    for fid, item in list(existing_map.items()):
        if fid not in target_map:
            db.delete(item)

    # 2. Add or update items
    for fid, is_req in target_map.items():
        feat = db.get(Feature, fid)
        if not feat:
            raise ResourceNotFoundError(f"Feature with id {fid} not found")
        if fid in existing_map:
            existing_map[fid].is_required = is_req
        else:
            new_item = PackItem(
                pack_version_id=pack_version_id,
                feature_id=fid,
                is_required=is_req,
            )
            db.add(new_item)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Integrity error syncing pack items: %s", exc)
        raise ProposalConflictError("Failed to sync pack items due to constraint violation")

    return list(
        db.execute(
            select(PackItem).where(PackItem.pack_version_id == pack_version_id).order_by(PackItem.feature_id)
        ).scalars().all()
    )

