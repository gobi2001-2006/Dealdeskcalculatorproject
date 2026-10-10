"""create_wave2_catalogue_pack_tables

Revision ID: a1b2c3d4e5f6
Revises: 9472414f438c
Create Date: 2026-10-10 13:31:00.000000

Wave 2 — Catalogue & Packs
Creates seven tables in dependency order:
  1. product_families
  2. products
  3. features
  4. product_descriptions
  5. packs
  6. pack_versions
  7. pack_items

Also installs two PostgreSQL trigger functions to protect locked
pack versions and their items from modification or deletion.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "9472414f438c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Trigger SQL — defined as module-level constants for readability
# ---------------------------------------------------------------------------

# Trigger function: prevent UPDATE or DELETE on a locked pack_version row.
_CREATE_PROTECT_PACK_VERSION_FN = """
CREATE OR REPLACE FUNCTION trg_fn_protect_locked_pack_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'locked' THEN
        RAISE EXCEPTION
            'pack_versions row id=% is locked and cannot be modified or deleted.',
            OLD.id;
    END IF;
    RETURN NEW;
END;
$$;
"""

_CREATE_PROTECT_PACK_VERSION_TRIGGER = """
CREATE TRIGGER trg_protect_locked_pack_version
BEFORE UPDATE OR DELETE ON pack_versions
FOR EACH ROW
EXECUTE FUNCTION trg_fn_protect_locked_pack_version();
"""

# Trigger function: prevent INSERT, UPDATE, or DELETE on pack_items when the
# referenced pack_version is locked.
_CREATE_PROTECT_PACK_ITEMS_FN = """
CREATE OR REPLACE FUNCTION trg_fn_protect_locked_pack_items()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_version_id BIGINT;
    v_status     TEXT;
BEGIN
    -- For DELETE/UPDATE OLD row determines the version; for INSERT use NEW.
    IF TG_OP = 'DELETE' THEN
        v_version_id := OLD.pack_version_id;
    ELSE
        v_version_id := NEW.pack_version_id;
    END IF;

    SELECT status INTO v_status
    FROM pack_versions
    WHERE id = v_version_id;

    IF v_status = 'locked' THEN
        RAISE EXCEPTION
            'pack_items for pack_version_id=% cannot be changed because the version is locked.',
            v_version_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
"""

_CREATE_PROTECT_PACK_ITEMS_TRIGGER = """
CREATE TRIGGER trg_protect_locked_pack_items
BEFORE INSERT OR UPDATE OR DELETE ON pack_items
FOR EACH ROW
EXECUTE FUNCTION trg_fn_protect_locked_pack_items();
"""

# Downgrade: drop triggers first, then functions.
_DROP_PACK_ITEMS_TRIGGER = "DROP TRIGGER IF EXISTS trg_protect_locked_pack_items ON pack_items;"
_DROP_PACK_VERSION_TRIGGER = "DROP TRIGGER IF EXISTS trg_protect_locked_pack_version ON pack_versions;"
_DROP_PROTECT_PACK_ITEMS_FN = "DROP FUNCTION IF EXISTS trg_fn_protect_locked_pack_items();"
_DROP_PROTECT_PACK_VERSION_FN = "DROP FUNCTION IF EXISTS trg_fn_protect_locked_pack_version();"


def upgrade() -> None:
    """Create Wave 2 Catalogue & Packs tables and lock-protection triggers."""

    # ------------------------------------------------------------------
    # 1. product_families
    # ------------------------------------------------------------------
    op.create_table(
        "product_families",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
            comment="Surrogate primary key",
        ),
        sa.Column(
            "code",
            sa.String(length=50),
            nullable=False,
            comment="Unique business code for this product family",
        ),
        sa.Column(
            "name",
            sa.String(length=200),
            nullable=False,
            comment="Display name of the product family",
        ),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=True,
            comment="Display sort order; lower values appear first",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
            comment="Lifecycle status",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_product_families_status",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_product_families"),
        sa.UniqueConstraint("code", name="uq_product_families_code"),
    )
    op.create_index(
        "ix_product_families_code",
        "product_families",
        ["code"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # 2. products
    # ------------------------------------------------------------------
    op.create_table(
        "products",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
            comment="Surrogate primary key",
        ),
        sa.Column(
            "product_family_id",
            sa.BigInteger(),
            nullable=False,
            comment="Owning product family",
        ),
        sa.Column(
            "code",
            sa.String(length=50),
            nullable=False,
            comment="Unique business code for this product module",
        ),
        sa.Column(
            "name",
            sa.String(length=200),
            nullable=False,
            comment="Display name of the product module",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
            comment="Lifecycle status",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_products_status",
        ),
        sa.ForeignKeyConstraint(
            ["product_family_id"],
            ["product_families.id"],
            name="fk_products_product_family_id_product_families",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_products"),
        sa.UniqueConstraint("code", name="uq_products_code"),
        sa.UniqueConstraint(
            "product_family_id",
            "name",
            name="uq_products_product_family_id_name",
        ),
    )
    op.create_index(
        "ix_products_product_family_id",
        "products",
        ["product_family_id"],
        unique=False,
    )
    op.create_index(
        "ix_products_code",
        "products",
        ["code"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # 3. features
    # ------------------------------------------------------------------
    op.create_table(
        "features",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
            comment="Surrogate primary key",
        ),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            nullable=False,
            comment="Owning product module",
        ),
        sa.Column(
            "code",
            sa.String(length=60),
            nullable=False,
            comment="Business code: {PRODUCT_CODE}-{NNN}",
        ),
        sa.Column(
            "name",
            sa.String(length=200),
            nullable=False,
            comment="Display name of the feature",
        ),
        sa.Column(
            "classification",
            sa.String(length=20),
            nullable=False,
            comment="Feature type: native | ai_enabled | partner",
        ),
        sa.Column(
            "partner_name",
            sa.String(length=200),
            nullable=True,
            comment="Required when classification = 'partner'",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
            comment="Lifecycle status",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "classification IN ('native', 'ai_enabled', 'partner')",
            name="ck_features_classification",
        ),
        sa.CheckConstraint(
            "classification <> 'partner' OR partner_name IS NOT NULL",
            name="ck_features_partner_name_required",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_features_status",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name="fk_features_product_id_products",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_features"),
        sa.UniqueConstraint("code", name="uq_features_code"),
        sa.UniqueConstraint(
            "product_id",
            "name",
            name="uq_features_product_id_name",
        ),
    )
    op.create_index(
        "ix_features_product_id",
        "features",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        "ix_features_code",
        "features",
        ["code"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # 4. product_descriptions
    # ------------------------------------------------------------------
    op.create_table(
        "product_descriptions",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
            comment="Surrogate primary key",
        ),
        sa.Column(
            "feature_id",
            sa.BigInteger(),
            nullable=False,
            comment="Feature this description belongs to",
        ),
        sa.Column(
            "language",
            sa.String(length=10),
            server_default=sa.text("'en'"),
            nullable=False,
            comment="BCP-47 language tag, e.g. en, fr, de",
        ),
        sa.Column(
            "scope_text",
            sa.Text(),
            nullable=False,
            comment="Approved scope-of-work text",
        ),
        sa.Column(
            "feature_narrative",
            sa.Text(),
            nullable=True,
            comment="Optional longer feature narrative",
        ),
        sa.Column(
            "version_no",
            sa.Integer(),
            nullable=False,
            comment="Monotonically increasing version counter per (feature, language)",
        ),
        sa.Column(
            "valid_from",
            sa.Date(),
            nullable=True,
            comment="Effective start date; NULL means immediately",
        ),
        sa.Column(
            "valid_to",
            sa.Date(),
            nullable=True,
            comment="Effective end date; NULL means no expiry",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'draft'"),
            nullable=False,
            comment="Lifecycle status: draft | active | retired",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from",
            name="ck_product_descriptions_valid_date_order",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'retired')",
            name="ck_product_descriptions_status",
        ),
        sa.ForeignKeyConstraint(
            ["feature_id"],
            ["features.id"],
            name="fk_product_descriptions_feature_id_features",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_product_descriptions"),
        sa.UniqueConstraint(
            "feature_id",
            "language",
            "version_no",
            name="uq_product_descriptions_feature_id_language_version_no",
        ),
    )
    op.create_index(
        "ix_product_descriptions_feature_id",
        "product_descriptions",
        ["feature_id"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # 5. packs
    # ------------------------------------------------------------------
    op.create_table(
        "packs",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
            comment="Surrogate primary key",
        ),
        sa.Column(
            "code",
            sa.String(length=50),
            nullable=False,
            comment="Unique business code for this pack",
        ),
        sa.Column(
            "name",
            sa.String(length=200),
            nullable=False,
            comment="Display name of the pack",
        ),
        sa.Column(
            "variant",
            sa.String(length=20),
            nullable=False,
            comment="Pack tier: standard | premium",
        ),
        sa.Column(
            "product_family_id",
            sa.BigInteger(),
            nullable=True,
            comment="Primary product family; NULL when pack spans multiple families",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
            comment="Lifecycle status",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "variant IN ('standard', 'premium')",
            name="ck_packs_variant",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_packs_status",
        ),
        sa.ForeignKeyConstraint(
            ["product_family_id"],
            ["product_families.id"],
            name="fk_packs_product_family_id_product_families",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_packs"),
        sa.UniqueConstraint("code", name="uq_packs_code"),
    )
    op.create_index(
        "ix_packs_code",
        "packs",
        ["code"],
        unique=False,
    )
    op.create_index(
        "ix_packs_product_family_id",
        "packs",
        ["product_family_id"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # 6. pack_versions
    # ------------------------------------------------------------------
    op.create_table(
        "pack_versions",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
            comment="Surrogate primary key",
        ),
        sa.Column(
            "pack_id",
            sa.BigInteger(),
            nullable=False,
            comment="Owning pack",
        ),
        sa.Column(
            "version_no",
            sa.Integer(),
            nullable=False,
            comment="Monotonically increasing version number per pack",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'draft'"),
            nullable=False,
            comment="Version lifecycle: draft | active | locked | superseded",
        ),
        sa.Column(
            "locked_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp when this version was locked; NULL while not locked",
        ),
        sa.Column(
            "list_price_ref",
            sa.Numeric(18, 4),
            nullable=True,
            comment="Reference list price for this version; NULL on draft",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'locked', 'superseded')",
            name="ck_pack_versions_status",
        ),
        sa.ForeignKeyConstraint(
            ["pack_id"],
            ["packs.id"],
            name="fk_pack_versions_pack_id_packs",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_pack_versions"),
        sa.UniqueConstraint(
            "pack_id",
            "version_no",
            name="uq_pack_versions_pack_id_version_no",
        ),
    )
    op.create_index(
        "ix_pack_versions_pack_id",
        "pack_versions",
        ["pack_id"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # 7. pack_items
    # ------------------------------------------------------------------
    op.create_table(
        "pack_items",
        sa.Column(
            "pack_version_id",
            sa.BigInteger(),
            nullable=False,
            comment="Pack version this item belongs to",
        ),
        sa.Column(
            "feature_id",
            sa.BigInteger(),
            nullable=False,
            comment="Feature included in this pack version",
        ),
        sa.ForeignKeyConstraint(
            ["feature_id"],
            ["features.id"],
            name="fk_pack_items_feature_id_features",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["pack_version_id"],
            ["pack_versions.id"],
            name="fk_pack_items_pack_version_id_pack_versions",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "pack_version_id",
            "feature_id",
            name="pk_pack_items",
        ),
    )
    op.create_index(
        "ix_pack_items_feature_id",
        "pack_items",
        ["feature_id"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # Trigger functions and triggers for locked-version protection
    # ------------------------------------------------------------------
    op.execute(_CREATE_PROTECT_PACK_VERSION_FN)
    op.execute(_CREATE_PROTECT_PACK_VERSION_TRIGGER)
    op.execute(_CREATE_PROTECT_PACK_ITEMS_FN)
    op.execute(_CREATE_PROTECT_PACK_ITEMS_TRIGGER)


def downgrade() -> None:
    """Drop Wave 2 Catalogue & Packs tables and lock-protection triggers."""

    # Drop triggers and functions before dropping the tables they reference
    op.execute(_DROP_PACK_ITEMS_TRIGGER)
    op.execute(_DROP_PACK_VERSION_TRIGGER)
    op.execute(_DROP_PROTECT_PACK_ITEMS_FN)
    op.execute(_DROP_PROTECT_PACK_VERSION_FN)

    # Drop tables in reverse dependency order
    op.drop_index("ix_pack_items_feature_id", table_name="pack_items")
    op.drop_table("pack_items")

    op.drop_index("ix_pack_versions_pack_id", table_name="pack_versions")
    op.drop_table("pack_versions")

    op.drop_index("ix_packs_product_family_id", table_name="packs")
    op.drop_index("ix_packs_code", table_name="packs")
    op.drop_table("packs")

    op.drop_index(
        "ix_product_descriptions_feature_id", table_name="product_descriptions"
    )
    op.drop_table("product_descriptions")

    op.drop_index("ix_features_code", table_name="features")
    op.drop_index("ix_features_product_id", table_name="features")
    op.drop_table("features")

    op.drop_index("ix_products_code", table_name="products")
    op.drop_index("ix_products_product_family_id", table_name="products")
    op.drop_table("products")

    op.drop_index("ix_product_families_code", table_name="product_families")
    op.drop_table("product_families")
