"""Catalogue & Packs Models for Adrenalin Deal Desk — Wave 2.

Defines the product hierarchy and pack tables:
    1. product_families   — Level 1 hierarchy
    2. products           — Level 2 modules
    3. features           — Level 3 features
    4. product_descriptions — Approved scope/narrative text per feature
    5. packs              — Reusable product bundles
    6. pack_versions      — Versioned, lockable pack configurations
    7. pack_items         — Feature membership in a pack version

Feature code generation strategy
---------------------------------
Codes follow the pattern  {PRODUCT_CODE}-{NNN}  where NNN is a zero-padded
three-digit counter scoped to the parent product (e.g. HRM-001, HRM-002).

The counter is maintained at the **application layer**: before inserting a
Feature the service layer queries ``MAX(code)`` for the product, extracts
the numeric suffix, increments it, and assembles the new code.

Duplicate prevention: the ``code`` column carries a database-level
``UNIQUE`` constraint.  If two concurrent sessions attempt to insert the same
code the DB will raise an ``IntegrityError``, which the service layer catches
and retries with the next available suffix.  This is a standard optimistic-
concurrency pattern — no sequence object is needed because the code also
encodes the product prefix and must stay human-readable.

Locked-pack-version protection
--------------------------------
Two PostgreSQL trigger functions (``trg_fn_protect_locked_pack_version`` and
``trg_fn_protect_locked_pack_items``) are created inside the Alembic migration.
They raise an exception if any DML targets a ``locked`` pack_version row or
its associated pack_items rows.  The ORM models themselves do **not**
implement this logic — it lives exclusively in the database layer so it
cannot be bypassed via any client.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# =============================================================================
# 1. PRODUCT FAMILIES
# =============================================================================
class ProductFamily(Base):
    """Level 1 of the product hierarchy."""

    __tablename__ = "product_families"
    __table_args__ = (
        UniqueConstraint("code", name="uq_product_families_code"),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_product_families_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Unique business code for this product family",
    )
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Display name of the product family",
    )
    sort_order: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Display sort order; lower values appear first",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default=text("'active'"),
        comment="Lifecycle status",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    products: Mapped[list["Product"]] = relationship(
        "Product",
        back_populates="product_family",
    )
    packs: Mapped[list["Pack"]] = relationship(
        "Pack",
        back_populates="product_family",
    )


# =============================================================================
# 2. PRODUCTS
# =============================================================================
class Product(Base):
    """Level 2 product modules belonging to a product family."""

    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("code", name="uq_products_code"),
        UniqueConstraint(
            "product_family_id",
            "name",
            name="uq_products_product_family_id_name",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_products_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    product_family_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("product_families.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Owning product family",
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Unique business code for this product module",
    )
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Display name of the product module",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default=text("'active'"),
        comment="Lifecycle status",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    product_family: Mapped["ProductFamily"] = relationship(
        "ProductFamily",
        back_populates="products",
    )
    features: Mapped[list["Feature"]] = relationship(
        "Feature",
        back_populates="product",
    )


# =============================================================================
# 3. FEATURES
# =============================================================================
class Feature(Base):
    """Level 3 features belonging to a product.

    Feature codes follow the pattern  {PRODUCT_CODE}-{NNN}  and are managed
    at the application layer.  The UNIQUE constraint on ``code`` is the
    database-level guarantee against collisions.
    """

    __tablename__ = "features"
    __table_args__ = (
        UniqueConstraint("code", name="uq_features_code"),
        UniqueConstraint(
            "product_id",
            "name",
            name="uq_features_product_id_name",
        ),
        CheckConstraint(
            "classification IN ('native', 'ai_enabled', 'partner')",
            name="ck_features_classification",
        ),
        CheckConstraint(
            "classification <> 'partner' OR partner_name IS NOT NULL",
            name="ck_features_partner_name_required",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_features_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Owning product module",
    )
    code: Mapped[str] = mapped_column(
        String(60),
        nullable=False,
        index=True,
        comment="Business code: {PRODUCT_CODE}-{NNN}",
    )
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Display name of the feature",
    )
    classification: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Feature type: native | ai_enabled | partner",
    )
    partner_name: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        comment="Required when classification = 'partner'",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default=text("'active'"),
        comment="Lifecycle status",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="features",
    )
    product_descriptions: Mapped[list["ProductDescription"]] = relationship(
        "ProductDescription",
        back_populates="feature",
    )
    pack_items: Mapped[list["PackItem"]] = relationship(
        "PackItem",
        back_populates="feature",
    )


# =============================================================================
# 4. PRODUCT DESCRIPTIONS
# =============================================================================
class ProductDescription(Base):
    """Approved scope-of-work and feature narrative text for a feature.

    Multiple versions per (feature, language) are supported.
    Only one version should be 'active' at a time; that rule is enforced at
    the application layer, not the database (to allow draft preparation).

    The effective-date CHECK constraint ensures valid_to IS NULL or
    valid_to > valid_from.
    """

    __tablename__ = "product_descriptions"
    __table_args__ = (
        UniqueConstraint(
            "feature_id",
            "language",
            "version_no",
            name="uq_product_descriptions_feature_id_language_version_no",
        ),
        CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from",
            name="ck_product_descriptions_valid_date_order",
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'retired')",
            name="ck_product_descriptions_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    feature_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("features.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Feature this description belongs to",
    )
    language: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="en",
        server_default=text("'en'"),
        comment="BCP-47 language tag, e.g. en, fr, de",
    )
    scope_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Approved scope-of-work text",
    )
    feature_narrative: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Optional longer feature narrative",
    )
    version_no: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Monotonically increasing version counter per (feature, language)",
    )
    valid_from: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Effective start date; NULL means immediately",
    )
    valid_to: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Effective end date; NULL means no expiry",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="draft",
        server_default=text("'draft'"),
        comment="Lifecycle status: draft | active | retired",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    feature: Mapped["Feature"] = relationship(
        "Feature",
        back_populates="product_descriptions",
    )


# =============================================================================
# 5. PACKS
# =============================================================================
class Pack(Base):
    """Reusable product bundles that can span product families.

    Assumption: a pack is loosely associated with one product_family for
    grouping/reporting purposes (nullable FK).  When a pack genuinely spans
    families the field is left NULL.
    """

    __tablename__ = "packs"
    __table_args__ = (
        UniqueConstraint("code", name="uq_packs_code"),
        CheckConstraint(
            "variant IN ('standard', 'premium')",
            name="ck_packs_variant",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_packs_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Unique business code for this pack",
    )
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Display name of the pack",
    )
    variant: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="Pack tier: standard | premium",
    )
    product_family_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("product_families.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="Primary product family; NULL when pack spans multiple families",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default=text("'active'"),
        comment="Lifecycle status",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    product_family: Mapped[Optional["ProductFamily"]] = relationship(
        "ProductFamily",
        back_populates="packs",
    )
    pack_versions: Mapped[list["PackVersion"]] = relationship(
        "PackVersion",
        back_populates="pack",
    )


# =============================================================================
# 6. PACK VERSIONS
# =============================================================================
class PackVersion(Base):
    """A versioned snapshot of a pack's feature composition.

    Once a version moves to 'locked' status neither the version row itself
    nor its pack_items can be modified or deleted.  This rule is enforced by
    two PostgreSQL trigger functions created in the Wave 2 Alembic migration:

      * trg_fn_protect_locked_pack_version  — fires BEFORE UPDATE/DELETE on
        pack_versions; raises an exception when old.status = 'locked'.

      * trg_fn_protect_locked_pack_items    — fires BEFORE INSERT/UPDATE/DELETE
        on pack_items; looks up the referenced pack_version and raises if it
        is locked.

    Assumption: list_price_ref is stored as Numeric(18,4).
    It is nullable because a draft version may not yet have a price attached.
    """

    __tablename__ = "pack_versions"
    __table_args__ = (
        UniqueConstraint(
            "pack_id",
            "version_no",
            name="uq_pack_versions_pack_id_version_no",
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'locked', 'superseded')",
            name="ck_pack_versions_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    pack_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("packs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Owning pack",
    )
    version_no: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Monotonically increasing version number per pack",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="draft",
        server_default=text("'draft'"),
        comment="Version lifecycle: draft | active | locked | superseded",
    )
    locked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when this version was locked; NULL while not locked",
    )
    list_price_ref: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4),
        nullable=True,
        comment="Reference list price for this version; NULL on draft",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    pack: Mapped["Pack"] = relationship(
        "Pack",
        back_populates="pack_versions",
    )
    pack_items: Mapped[list["PackItem"]] = relationship(
        "PackItem",
        back_populates="pack_version",
    )


# =============================================================================
# 7. PACK ITEMS
# =============================================================================
class PackItem(Base):
    """Membership of a feature inside a specific pack version.

    Composite primary key (pack_version_id, feature_id) prevents duplicate
    entries.  An additional index on feature_id supports reverse lookups
    (i.e., 'which pack versions include this feature?').

    Modifications to items belonging to a locked pack version are rejected
    by the ``trg_fn_protect_locked_pack_items`` trigger.

    No created_at/updated_at columns: the row is immutable by design once
    the version is locked, and tracking timestamps on a pure join table adds
    no analytical value.
    """

    __tablename__ = "pack_items"
    __table_args__ = (
        Index("ix_pack_items_feature_id", "feature_id"),
    )

    pack_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("pack_versions.id", ondelete="RESTRICT"),
        primary_key=True,
        nullable=False,
        comment="Pack version this item belongs to",
    )
    feature_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("features.id", ondelete="RESTRICT"),
        primary_key=True,
        nullable=False,
        comment="Feature included in this pack version",
    )

    # Relationships
    pack_version: Mapped["PackVersion"] = relationship(
        "PackVersion",
        back_populates="pack_items",
    )
    feature: Mapped["Feature"] = relationship(
        "Feature",
        back_populates="pack_items",
    )
