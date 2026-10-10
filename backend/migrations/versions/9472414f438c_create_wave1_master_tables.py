"""create_wave1_master_tables

Revision ID: 9472414f438c
Revises:
Create Date: 2026-10-10 00:21:11.437099

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9472414f438c"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create Wave 1 foundational master tables."""
    # 1. currencies
    op.create_table(
        "currencies",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "code",
            sa.String(length=3),
            nullable=False,
            comment="ISO 4217 currency code",
        ),
        sa.Column(
            "name",
            sa.String(length=100),
            nullable=False,
            comment="Currency full display name",
        ),
        sa.Column(
            "symbol",
            sa.String(length=10),
            nullable=True,
            comment="Currency symbol (e.g. $, EUR)",
        ),
        sa.Column(
            "decimal_places",
            sa.SmallInteger(),
            server_default=sa.text("2"),
            nullable=False,
            comment="Standard decimal precision for display/rounding",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
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
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_currencies_status",
        ),
        sa.CheckConstraint(
            "decimal_places >= 0 AND decimal_places <= 6",
            name="ck_currencies_decimal_places_range",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_currencies")),
        sa.UniqueConstraint("code", name=op.f("uq_currencies_code")),
    )
    op.create_index(
        op.f("ix_currencies_code"), "currencies", ["code"], unique=True
    )

    # 2. countries
    op.create_table(
        "countries",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "iso_code",
            sa.String(length=2),
            nullable=False,
            comment="ISO 3166-1 alpha-2 country code",
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("currency_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "price_multiplier",
            sa.Numeric(precision=10, scale=6),
            server_default=sa.text("1.000000"),
            nullable=False,
            comment="Regional country pricing multiplier, must be > 0",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
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
        sa.CheckConstraint(
            "price_multiplier > 0",
            name="ck_countries_price_multiplier_positive",
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from",
            name="ck_countries_valid_date_order",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_countries_status",
        ),
        sa.ForeignKeyConstraint(
            ["currency_id"],
            ["currencies.id"],
            name=op.f("fk_countries_currency_id_currencies"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_countries")),
        sa.UniqueConstraint("iso_code", name=op.f("uq_countries_iso_code")),
    )
    op.create_index(
        op.f("ix_countries_iso_code"), "countries", ["iso_code"], unique=True
    )
    op.create_index(
        op.f("ix_countries_currency_id"),
        "countries",
        ["currency_id"],
        unique=False,
    )

    # 3. fx_rates
    op.create_table(
        "fx_rates",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("from_currency_id", sa.BigInteger(), nullable=False),
        sa.Column("to_currency_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "rate",
            sa.Numeric(precision=18, scale=8),
            nullable=False,
            comment="Exchange rate: 1 from_currency = rate to_currency, must be > 0",
        ),
        sa.Column(
            "rate_source",
            sa.String(length=100),
            nullable=True,
            comment="Source of rate (e.g. OANDA, Central Bank, Manual)",
        ),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column(
            "created_by",
            sa.BigInteger(),
            nullable=True,
            comment="User ID who recorded this rate",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "rate > 0",
            name="ck_fx_rates_rate_positive",
        ),
        sa.CheckConstraint(
            "from_currency_id <> to_currency_id",
            name="ck_fx_rates_distinct_currencies",
        ),
        sa.ForeignKeyConstraint(
            ["from_currency_id"],
            ["currencies.id"],
            name=op.f("fk_fx_rates_from_currency_id_currencies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["to_currency_id"],
            ["currencies.id"],
            name=op.f("fk_fx_rates_to_currency_id_currencies"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fx_rates")),
        sa.UniqueConstraint(
            "from_currency_id",
            "to_currency_id",
            "effective_date",
            name="uq_fx_rates_from_to_effective_date",
        ),
    )
    op.create_index(
        op.f("ix_fx_rates_from_currency_id"),
        "fx_rates",
        ["from_currency_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_fx_rates_to_currency_id"),
        "fx_rates",
        ["to_currency_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_fx_rates_effective_date"),
        "fx_rates",
        ["effective_date"],
        unique=False,
    )
    op.create_index(
        "ix_fx_rates_latest_lookup",
        "fx_rates",
        [
            "from_currency_id",
            "to_currency_id",
            sa.text("effective_date DESC"),
        ],
        unique=False,
    )

    # 4. units_of_measure
    op.create_table(
        "units_of_measure",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "code",
            sa.String(length=50),
            nullable=False,
            comment="UOM unique code (e.g. employee, candidate, transaction, flat)",
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "conversion_rule",
            sa.Text(),
            nullable=True,
            comment="Formula or guidance for unit conversion/scaling",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
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
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_units_of_measure_status",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_units_of_measure")),
        sa.UniqueConstraint("code", name=op.f("uq_units_of_measure_code")),
    )
    op.create_index(
        op.f("ix_units_of_measure_code"),
        "units_of_measure",
        ["code"],
        unique=True,
    )

    # 5. deployment_models
    op.create_table(
        "deployment_models",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "code",
            sa.String(length=50),
            nullable=False,
            comment="Unique identifier code (e.g. shared_cloud, private_cloud, on_premise)",
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "cost_basis_flag",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
            comment="Indicates if hosting cost basis applies to this model",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
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
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_deployment_models_status",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deployment_models")),
        sa.UniqueConstraint("code", name=op.f("uq_deployment_models_code")),
    )
    op.create_index(
        op.f("ix_deployment_models_code"),
        "deployment_models",
        ["code"],
        unique=True,
    )

    # 6. pricing_models
    op.create_table(
        "pricing_models",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column(
            "name",
            sa.String(length=100),
            nullable=False,
            comment="Approved terminology, e.g. 'Platform + Subscription'",
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "has_fixed_component",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
            comment="Requires fixed fee in rate card",
        ),
        sa.Column(
            "has_unit_component",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
            comment="Requires unit rate in rate card",
        ),
        sa.Column(
            "fixed_fee_basis",
            sa.String(length=20),
            nullable=True,
            comment="Fixed fee frequency: 'annual' or 'one_time'",
        ),
        sa.Column(
            "uom_locked_id",
            sa.BigInteger(),
            nullable=True,
            comment="Locked UOM if model strictly prescribes one",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
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
        sa.CheckConstraint(
            "fixed_fee_basis IS NULL OR fixed_fee_basis IN ('annual', 'one_time')",
            name="ck_pricing_models_fixed_fee_basis",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_pricing_models_status",
        ),
        sa.ForeignKeyConstraint(
            ["uom_locked_id"],
            ["units_of_measure.id"],
            name=op.f("fk_pricing_models_uom_locked_id_units_of_measure"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pricing_models")),
        sa.UniqueConstraint("code", name=op.f("uq_pricing_models_code")),
    )
    op.create_index(
        op.f("ix_pricing_models_code"), "pricing_models", ["code"], unique=True
    )
    op.create_index(
        op.f("ix_pricing_models_uom_locked_id"),
        "pricing_models",
        ["uom_locked_id"],
        unique=False,
    )

    # 7. deployment_pricing_options
    op.create_table(
        "deployment_pricing_options",
        sa.Column("deployment_model_id", sa.BigInteger(), nullable=False),
        sa.Column("pricing_model_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["deployment_model_id"],
            ["deployment_models.id"],
            name=op.f(
                "fk_deployment_pricing_options_deployment_model_id_deployment_models"
            ),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["pricing_model_id"],
            ["pricing_models.id"],
            name=op.f(
                "fk_deployment_pricing_options_pricing_model_id_pricing_models"
            ),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "deployment_model_id",
            "pricing_model_id",
            name=op.f("pk_deployment_pricing_options"),
        ),
    )

    # 8. customer_tiers
    op.create_table(
        "customer_tiers",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "employee_min",
            sa.Integer(),
            nullable=False,
            comment="Minimum headcount for tier inclusion (inclusive)",
        ),
        sa.Column(
            "employee_max",
            sa.Integer(),
            nullable=True,
            comment="Maximum headcount for tier inclusion (inclusive); NULL indicates open-ended top tier",
        ),
        sa.Column(
            "default_multiplier",
            sa.Numeric(precision=10, scale=6),
            server_default=sa.text("1.000000"),
            nullable=False,
            comment="Default tier discount/multiplier factor, must be > 0",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
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
        sa.CheckConstraint(
            "employee_min >= 0",
            name="ck_customer_tiers_min_non_negative",
        ),
        sa.CheckConstraint(
            "employee_max IS NULL OR employee_max >= employee_min",
            name="ck_customer_tiers_max_gte_min",
        ),
        sa.CheckConstraint(
            "default_multiplier > 0",
            name="ck_customer_tiers_multiplier_positive",
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from",
            name="ck_customer_tiers_valid_date_order",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_customer_tiers_status",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_tiers")),
        sa.UniqueConstraint("name", name=op.f("uq_customer_tiers_name")),
    )

    # 9. contract_terms
    op.create_table(
        "contract_terms",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "term_months",
            sa.Integer(),
            nullable=False,
            comment="Contract duration in months, must be > 0",
        ),
        sa.Column(
            "escalation_pct_per_renewal_year",
            sa.Numeric(precision=7, scale=4),
            server_default=sa.text("0.0000"),
            nullable=False,
            comment="Default escalation percentage per renewal year (0.0000 - 100.0000)",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
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
        sa.CheckConstraint(
            "term_months > 0",
            name="ck_contract_terms_term_months_positive",
        ),
        sa.CheckConstraint(
            "escalation_pct_per_renewal_year >= 0 AND escalation_pct_per_renewal_year <= 100",
            name="ck_contract_terms_escalation_pct_range",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_contract_terms_status",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contract_terms")),
        sa.UniqueConstraint(
            "term_months", name=op.f("uq_contract_terms_term_months")
        ),
    )


def downgrade() -> None:
    """Drop Wave 1 master tables in reverse dependency order."""
    op.drop_table("contract_terms")
    op.drop_table("customer_tiers")
    op.drop_table("deployment_pricing_options")
    op.drop_index(
        op.f("ix_pricing_models_uom_locked_id"), table_name="pricing_models"
    )
    op.drop_index(op.f("ix_pricing_models_code"), table_name="pricing_models")
    op.drop_table("pricing_models")
    op.drop_index(
        op.f("ix_deployment_models_code"), table_name="deployment_models"
    )
    op.drop_table("deployment_models")
    op.drop_index(
        op.f("ix_units_of_measure_code"), table_name="units_of_measure"
    )
    op.drop_table("units_of_measure")
    op.drop_index("ix_fx_rates_latest_lookup", table_name="fx_rates")
    op.drop_index(op.f("ix_fx_rates_effective_date"), table_name="fx_rates")
    op.drop_index(op.f("ix_fx_rates_to_currency_id"), table_name="fx_rates")
    op.drop_index(op.f("ix_fx_rates_from_currency_id"), table_name="fx_rates")
    op.drop_table("fx_rates")
    op.drop_index(op.f("ix_countries_currency_id"), table_name="countries")
    op.drop_index(op.f("ix_countries_iso_code"), table_name="countries")
    op.drop_table("countries")
    op.drop_index(op.f("ix_currencies_code"), table_name="currencies")
    op.drop_table("currencies")
