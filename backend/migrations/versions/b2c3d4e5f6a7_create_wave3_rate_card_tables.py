"""create_wave3_rate_card_tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-10 14:15:00.000000

Wave 3 — Rate Card
Creates three tables in dependency order:
  1. rate_card_versions
  2. rate_cards (with 2 partial unique indexes for deterministic lookup)
  3. service_rates
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. rate_card_versions
    # -----------------------------------------------------------------------
    op.create_table(
        "rate_card_versions",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "version_no",
            sa.String(length=50),
            nullable=False,
            comment="Unique business version identifier (e.g. 'RC-2026.1')",
        ),
        sa.Column(
            "name",
            sa.String(length=200),
            nullable=False,
            comment="Human-readable version name (e.g. 'FY26 Q1 Global Rate Card')",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'draft'"),
            nullable=False,
            comment="Lifecycle status: 'draft', 'active', 'retired'",
        ),
        sa.Column(
            "valid_from",
            sa.Date(),
            nullable=False,
            comment="Effective start date",
        ),
        sa.Column(
            "valid_to",
            sa.Date(),
            nullable=True,
            comment="Effective end date (NULL means indefinitely active)",
        ),
        sa.Column(
            "created_by",
            sa.String(length=100),
            nullable=True,
            comment="Creator user email or identity string",
        ),
        sa.Column(
            "activated_by",
            sa.String(length=100),
            nullable=True,
            comment="Approver user email or identity string upon activation",
        ),
        sa.Column(
            "activated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp when version was activated",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rate_card_versions")),
        sa.UniqueConstraint(
            "version_no",
            name=op.f("uq_rate_card_versions_version_no"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'retired')",
            name="ck_rate_card_versions_status",
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to >= valid_from",
            name="ck_rate_card_versions_valid_date_order",
        ),
    )
    op.create_index(
        op.f("ix_rate_card_versions_version_no"),
        "rate_card_versions",
        ["version_no"],
        unique=False,
    )

    # -----------------------------------------------------------------------
    # 2. rate_cards
    # -----------------------------------------------------------------------
    op.create_table(
        "rate_cards",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("rate_card_version_id", sa.BigInteger(), nullable=False),
        sa.Column("country_id", sa.BigInteger(), nullable=False),
        sa.Column("deployment_model_id", sa.BigInteger(), nullable=False),
        sa.Column("pricing_model_id", sa.BigInteger(), nullable=False),
        sa.Column("tier_id", sa.BigInteger(), nullable=False),
        sa.Column("uom_id", sa.BigInteger(), nullable=False),
        sa.Column("pack_version_id", sa.BigInteger(), nullable=True),
        sa.Column("feature_id", sa.BigInteger(), nullable=True),
        sa.Column("currency_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "fixed_fee",
            sa.Numeric(precision=18, scale=4),
            nullable=True,
            comment="Base recurring or one-time fixed component",
        ),
        sa.Column(
            "unit_rate",
            sa.Numeric(precision=18, scale=4),
            nullable=True,
            comment="Rate per UOM count (e.g. PEPM)",
        ),
        sa.Column(
            "floor_price",
            sa.Numeric(precision=18, scale=4),
            nullable=True,
            comment="Minimum threshold floor rate below which discounts cannot breach",
        ),
        sa.Column(
            "cost_fixed",
            sa.Numeric(precision=18, scale=4),
            nullable=True,
            comment="Internal COGS fixed base cost",
        ),
        sa.Column(
            "cost_unit",
            sa.Numeric(precision=18, scale=4),
            nullable=True,
            comment="Internal COGS unit cost per UOM",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rate_cards")),
        sa.ForeignKeyConstraint(
            ["rate_card_version_id"],
            ["rate_card_versions.id"],
            name=op.f("fk_rate_cards_rate_card_version_id_rate_card_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["country_id"],
            ["countries.id"],
            name=op.f("fk_rate_cards_country_id_countries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["deployment_model_id"],
            ["deployment_models.id"],
            name=op.f("fk_rate_cards_deployment_model_id_deployment_models"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["pricing_model_id"],
            ["pricing_models.id"],
            name=op.f("fk_rate_cards_pricing_model_id_pricing_models"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["tier_id"],
            ["customer_tiers.id"],
            name=op.f("fk_rate_cards_tier_id_customer_tiers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["uom_id"],
            ["units_of_measure.id"],
            name=op.f("fk_rate_cards_uom_id_units_of_measure"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["pack_version_id"],
            ["pack_versions.id"],
            name=op.f("fk_rate_cards_pack_version_id_pack_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["feature_id"],
            ["features.id"],
            name=op.f("fk_rate_cards_feature_id_features"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["currency_id"],
            ["currencies.id"],
            name=op.f("fk_rate_cards_currency_id_currencies"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "(pack_version_id IS NOT NULL AND feature_id IS NULL) OR "
            "(pack_version_id IS NULL AND feature_id IS NOT NULL)",
            name="ck_rate_cards_target_exclusive",
        ),
        sa.CheckConstraint(
            "fixed_fee IS NOT NULL OR unit_rate IS NOT NULL",
            name="ck_rate_cards_fee_component_required",
        ),
        sa.CheckConstraint(
            "fixed_fee IS NULL OR fixed_fee >= 0",
            name="ck_rate_cards_fixed_fee_non_negative",
        ),
        sa.CheckConstraint(
            "unit_rate IS NULL OR unit_rate >= 0",
            name="ck_rate_cards_unit_rate_non_negative",
        ),
        sa.CheckConstraint(
            "floor_price IS NULL OR floor_price >= 0",
            name="ck_rate_cards_floor_price_non_negative",
        ),
        sa.CheckConstraint(
            "cost_fixed IS NULL OR cost_fixed >= 0",
            name="ck_rate_cards_cost_fixed_non_negative",
        ),
        sa.CheckConstraint(
            "cost_unit IS NULL OR cost_unit >= 0",
            name="ck_rate_cards_cost_unit_non_negative",
        ),
    )

    # Standard foreign key indexes
    op.create_index(
        op.f("ix_rate_cards_rate_card_version_id"),
        "rate_cards",
        ["rate_card_version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rate_cards_country_id"),
        "rate_cards",
        ["country_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rate_cards_deployment_model_id"),
        "rate_cards",
        ["deployment_model_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rate_cards_pricing_model_id"),
        "rate_cards",
        ["pricing_model_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rate_cards_tier_id"),
        "rate_cards",
        ["tier_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rate_cards_uom_id"),
        "rate_cards",
        ["uom_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rate_cards_pack_version_id"),
        "rate_cards",
        ["pack_version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rate_cards_feature_id"),
        "rate_cards",
        ["feature_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_rate_cards_currency_id"),
        "rate_cards",
        ["currency_id"],
        unique=False,
    )

    # Partial unique indexes for deterministic lookup
    op.create_index(
        "uq_rate_cards_pack_dims",
        "rate_cards",
        [
            "rate_card_version_id",
            "country_id",
            "deployment_model_id",
            "pricing_model_id",
            "tier_id",
            "uom_id",
            "pack_version_id",
        ],
        unique=True,
        postgresql_where=sa.text("pack_version_id IS NOT NULL"),
    )
    op.create_index(
        "uq_rate_cards_feature_dims",
        "rate_cards",
        [
            "rate_card_version_id",
            "country_id",
            "deployment_model_id",
            "pricing_model_id",
            "tier_id",
            "uom_id",
            "feature_id",
        ],
        unique=True,
        postgresql_where=sa.text("feature_id IS NOT NULL"),
    )

    # -----------------------------------------------------------------------
    # 3. service_rates
    # -----------------------------------------------------------------------
    op.create_table(
        "service_rates",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "role_name",
            sa.String(length=100),
            nullable=False,
            comment="Professional service role (e.g. Solution Architect, PM, Integration Engineer)",
        ),
        sa.Column("country_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "hourly_rate",
            sa.Numeric(precision=18, scale=4),
            nullable=True,
            comment="Standard billable hourly rate",
        ),
        sa.Column(
            "hours_per_day",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("8.00"),
            nullable=False,
            comment="Standard working hours per person day (default 8.00)",
        ),
        sa.Column(
            "daily_rate",
            sa.Numeric(precision=18, scale=4),
            nullable=True,
            comment="Explicit daily billing rate; calculated from hourly * hours_per_day if NULL",
        ),
        sa.Column(
            "cost_rate",
            sa.Numeric(precision=18, scale=4),
            nullable=True,
            comment="Internal cost rate per day/hour for margin calculation",
        ),
        sa.Column(
            "currency_id",
            sa.BigInteger(),
            nullable=False,
            comment="Billing currency",
        ),
        sa.Column(
            "valid_from",
            sa.Date(),
            nullable=False,
            comment="Effective start date",
        ),
        sa.Column(
            "valid_to",
            sa.Date(),
            nullable=True,
            comment="Effective end date",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
            comment="Lifecycle status: 'active', 'inactive', 'retired'",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_rates")),
        sa.ForeignKeyConstraint(
            ["country_id"],
            ["countries.id"],
            name=op.f("fk_service_rates_country_id_countries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["currency_id"],
            ["currencies.id"],
            name=op.f("fk_service_rates_currency_id_currencies"),
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "role_name",
            "country_id",
            "valid_from",
            name=op.f("uq_service_rates_role_name"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_service_rates_status",
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to >= valid_from",
            name="ck_service_rates_valid_date_order",
        ),
        sa.CheckConstraint(
            "hourly_rate IS NULL OR hourly_rate >= 0",
            name="ck_service_rates_hourly_rate_non_negative",
        ),
        sa.CheckConstraint(
            "hours_per_day > 0 AND hours_per_day <= 24",
            name="ck_service_rates_hours_per_day_range",
        ),
        sa.CheckConstraint(
            "daily_rate IS NULL OR daily_rate >= 0",
            name="ck_service_rates_daily_rate_non_negative",
        ),
        sa.CheckConstraint(
            "cost_rate IS NULL OR cost_rate >= 0",
            name="ck_service_rates_cost_rate_non_negative",
        ),
    )
    op.create_index(
        op.f("ix_service_rates_role_name"),
        "service_rates",
        ["role_name"],
        unique=False,
    )
    op.create_index(
        op.f("ix_service_rates_country_id"),
        "service_rates",
        ["country_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_service_rates_currency_id"),
        "service_rates",
        ["currency_id"],
        unique=False,
    )


def downgrade() -> None:
    # 3. service_rates
    op.drop_index(op.f("ix_service_rates_currency_id"), table_name="service_rates")
    op.drop_index(op.f("ix_service_rates_country_id"), table_name="service_rates")
    op.drop_index(op.f("ix_service_rates_role_name"), table_name="service_rates")
    op.drop_table("service_rates")

    # 2. rate_cards
    op.drop_index("uq_rate_cards_feature_dims", table_name="rate_cards")
    op.drop_index("uq_rate_cards_pack_dims", table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_currency_id"), table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_feature_id"), table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_pack_version_id"), table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_uom_id"), table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_tier_id"), table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_pricing_model_id"), table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_deployment_model_id"), table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_country_id"), table_name="rate_cards")
    op.drop_index(op.f("ix_rate_cards_rate_card_version_id"), table_name="rate_cards")
    op.drop_table("rate_cards")

    # 1. rate_card_versions
    op.drop_index(op.f("ix_rate_card_versions_version_no"), table_name="rate_card_versions")
    op.drop_table("rate_card_versions")
