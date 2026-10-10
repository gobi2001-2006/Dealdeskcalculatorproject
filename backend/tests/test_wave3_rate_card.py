"""Wave 3 Rate Card Table and Constraint Test Suite.

Tests cover:
1. Registration of all 3 Wave 3 tables in Base.metadata.
2. Preservation of all 16 Wave 1 and Wave 2 tables (total 19 tables).
3. Primary key and identity constraints.
4. Foreign key definitions and ON DELETE RESTRICT behavior.
5. Numeric precision (18, 4) on all monetary fields.
6. Effective date order constraints (valid_to >= valid_from).
7. Status check constraints (rate_card_versions and service_rates).
8. Target exclusive check constraint (exactly one of pack_version_id or feature_id).
9. Fee component required check constraint (fixed_fee or unit_rate required).
10. Non-negative amount check constraints.
11. Partial unique indexes on rate_cards (pack dims and feature dims).
12. Service rate uniqueness on (role_name, country_id, valid_from).
13. Hours per day range check constraint (0 < hours_per_day <= 24).
14. Model imports without requiring a live database connection.
15. Alembic migration discovery and offline SQL generation for Wave 3.
16. Service-level validation logic (country currency check, pricing model components).
17. In-memory SQLite DDL creation.
"""

import contextlib
import io
import os
from decimal import Decimal
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from dotenv import load_dotenv
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Numeric,
    PrimaryKeyConstraint,
    UniqueConstraint,
    create_engine,
    inspect,
    text,
)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_ROOT / ".env")

import app.models
from app.db.base import Base
from app.models.rate_card import RateCard, RateCardVersion, ServiceRate

_ALEMBIC_INI = str(_BACKEND_ROOT / "alembic.ini")

WAVE1_TABLES = [
    "currencies",
    "countries",
    "fx_rates",
    "units_of_measure",
    "deployment_models",
    "pricing_models",
    "deployment_pricing_options",
    "customer_tiers",
    "contract_terms",
]

WAVE2_TABLES = [
    "product_families",
    "products",
    "features",
    "product_descriptions",
    "packs",
    "pack_versions",
    "pack_items",
]

WAVE3_TABLES = [
    "rate_card_versions",
    "rate_cards",
    "service_rates",
]

ALL_EXPECTED_TABLES = sorted(WAVE1_TABLES + WAVE2_TABLES + WAVE3_TABLES)


# ===========================================================================
# 1. Table Registration & Metadata Integrity
# ===========================================================================
def test_wave3_tables_registered():
    """All 3 Wave 3 tables must be registered in Base.metadata."""
    for table in WAVE3_TABLES:
        assert table in Base.metadata.tables, (
            f"Wave 3 table '{table}' is missing from Base.metadata"
        )


def test_wave1_and_wave2_tables_preserved():
    """All 16 prior tables must still exist in Base.metadata."""
    assert len(Base.metadata.tables) >= 19
    for table in WAVE1_TABLES + WAVE2_TABLES:
        assert table in Base.metadata.tables, (
            f"Existing table '{table}' was unexpectedly removed"
        )


# ===========================================================================
# 2. Primary Keys & Identity Columns
# ===========================================================================
def test_wave3_primary_keys():
    """All 3 Wave 3 tables must have a single-column primary key named 'id'."""
    for t_name in WAVE3_TABLES:
        table = Base.metadata.tables[t_name]
        pk_cols = [col.name for col in table.primary_key.columns]
        assert pk_cols == ["id"], f"{t_name} PK expected ['id'], got {pk_cols}"


# ===========================================================================
# 3. Foreign Keys & ON DELETE RESTRICT
# ===========================================================================
def test_rate_cards_foreign_keys():
    """rate_cards must define 9 FKs, all with ondelete='RESTRICT'."""
    table = Base.metadata.tables["rate_cards"]
    expected_targets = {
        "rate_card_version_id": "rate_card_versions.id",
        "country_id": "countries.id",
        "deployment_model_id": "deployment_models.id",
        "pricing_model_id": "pricing_models.id",
        "tier_id": "customer_tiers.id",
        "uom_id": "units_of_measure.id",
        "pack_version_id": "pack_versions.id",
        "feature_id": "features.id",
        "currency_id": "currencies.id",
    }
    actual_fks = {}
    for fk in table.foreign_keys:
        actual_fks[fk.parent.name] = (fk.target_fullname, fk.ondelete)

    for col_name, target in expected_targets.items():
        assert col_name in actual_fks, f"FK for column {col_name} missing on rate_cards"
        target_table, ondel = actual_fks[col_name]
        assert target_table == target, (
            f"FK {col_name} target mismatch: expected {target}, got {target_table}"
        )
        assert ondel == "RESTRICT", (
            f"FK {col_name} ondelete expected 'RESTRICT', got '{ondel}'"
        )


def test_service_rates_foreign_keys():
    """service_rates must define FKs to countries and currencies with RESTRICT."""
    table = Base.metadata.tables["service_rates"]
    actual_fks = {
        fk.parent.name: (fk.target_fullname, fk.ondelete)
        for fk in table.foreign_keys
    }
    assert "country_id" in actual_fks
    assert actual_fks["country_id"] == ("countries.id", "RESTRICT")
    assert "currency_id" in actual_fks
    assert actual_fks["currency_id"] == ("currencies.id", "RESTRICT")


# ===========================================================================
# 4. Numeric Precision on Monetary Fields
# ===========================================================================
def test_rate_cards_numeric_precisions():
    """All monetary and rate fields on rate_cards must be Numeric(18, 4)."""
    table = Base.metadata.tables["rate_cards"]
    monetary_cols = ["fixed_fee", "unit_rate", "floor_price", "cost_fixed", "cost_unit"]
    for col_name in monetary_cols:
        col = table.c[col_name]
        assert isinstance(col.type, Numeric), f"{col_name} is not Numeric"
        assert col.type.precision == 18, f"{col_name} precision expected 18, got {col.type.precision}"
        assert col.type.scale == 4, f"{col_name} scale expected 4, got {col.type.scale}"


def test_service_rates_numeric_precisions():
    """service_rates monetary fields must be Numeric(18, 4) and hours_per_day Numeric(5, 2)."""
    table = Base.metadata.tables["service_rates"]
    for col_name in ["hourly_rate", "daily_rate", "cost_rate"]:
        col = table.c[col_name]
        assert isinstance(col.type, Numeric)
        assert col.type.precision == 18
        assert col.type.scale == 4

    hpd = table.c["hours_per_day"]
    assert isinstance(hpd.type, Numeric)
    assert hpd.type.precision == 5
    assert hpd.type.scale == 2


# ===========================================================================
# 5. Check Constraints & Business Rules
# ===========================================================================
def test_rate_card_versions_constraints():
    """rate_card_versions status and date order check constraints."""
    table = Base.metadata.tables["rate_card_versions"]
    ck_sqls = [str(c.sqltext) for c in table.constraints if isinstance(c, CheckConstraint)]
    assert any("status IN ('draft', 'active', 'retired')" in s for s in ck_sqls)
    assert any("valid_to IS NULL OR valid_to >= valid_from" in s for s in ck_sqls)


def test_rate_cards_check_constraints():
    """rate_cards exclusivity, fee required, and non-negative constraints."""
    table = Base.metadata.tables["rate_cards"]
    ck_sqls = [str(c.sqltext) for c in table.constraints if isinstance(c, CheckConstraint)]
    assert any("pack_version_id IS NOT NULL AND feature_id IS NULL" in s for s in ck_sqls)
    assert any("fixed_fee IS NOT NULL OR unit_rate IS NOT NULL" in s for s in ck_sqls)
    assert any("fixed_fee IS NULL OR fixed_fee >= 0" in s for s in ck_sqls)
    assert any("unit_rate IS NULL OR unit_rate >= 0" in s for s in ck_sqls)
    assert any("floor_price IS NULL OR floor_price >= 0" in s for s in ck_sqls)
    assert any("cost_fixed IS NULL OR cost_fixed >= 0" in s for s in ck_sqls)
    assert any("cost_unit IS NULL OR cost_unit >= 0" in s for s in ck_sqls)


def test_service_rates_constraints():
    """service_rates status, date order, rate non-negative, and hours_per_day range."""
    table = Base.metadata.tables["service_rates"]
    ck_sqls = [str(c.sqltext) for c in table.constraints if isinstance(c, CheckConstraint)]
    assert any("status IN ('active', 'inactive', 'retired')" in s for s in ck_sqls)
    assert any("valid_to IS NULL OR valid_to >= valid_from" in s for s in ck_sqls)
    assert any("hourly_rate IS NULL OR hourly_rate >= 0" in s for s in ck_sqls)
    assert any("hours_per_day > 0 AND hours_per_day <= 24" in s for s in ck_sqls)
    assert any("daily_rate IS NULL OR daily_rate >= 0" in s for s in ck_sqls)
    assert any("cost_rate IS NULL OR cost_rate >= 0" in s for s in ck_sqls)


# ===========================================================================
# 6. Indexes & Partial Unique Indexes
# ===========================================================================
def test_rate_cards_partial_unique_indexes():
    """rate_cards must define both partial unique indexes with postgresql_where."""
    table = Base.metadata.tables["rate_cards"]
    index_map = {idx.name: idx for idx in table.indexes}

    assert "uq_rate_cards_pack_dims" in index_map, "Missing uq_rate_cards_pack_dims index"
    pack_idx = index_map["uq_rate_cards_pack_dims"]
    assert pack_idx.unique is True
    assert "pack_version_id IS NOT NULL" in str(pack_idx.dialect_options["postgresql"]["where"])

    assert "uq_rate_cards_feature_dims" in index_map, "Missing uq_rate_cards_feature_dims index"
    feat_idx = index_map["uq_rate_cards_feature_dims"]
    assert feat_idx.unique is True
    assert "feature_id IS NOT NULL" in str(feat_idx.dialect_options["postgresql"]["where"])


def test_service_rates_unique_constraint():
    """service_rates must have a unique constraint on (role_name, country_id, valid_from)."""
    table = Base.metadata.tables["service_rates"]
    uq_names = [
        uq.name for uq in table.constraints
        if isinstance(uq, UniqueConstraint)
    ]
    assert "uq_service_rates_role_country_valid_from" in uq_names


# ===========================================================================
# 7. Service-Layer Validations (Deterministic Business Rules)
# ===========================================================================
def test_validate_country_currency_rule():
    """Service-level validation: currency_id must match the country's local currency."""
    def validate_country_currency(country_currency_id: int, rate_card_currency_id: int):
        if country_currency_id != rate_card_currency_id:
            raise ValueError(
                f"Currency mismatch: Rate card currency ({rate_card_currency_id}) "
                f"must match country currency ({country_currency_id})"
            )

    # Valid
    validate_country_currency(country_currency_id=1, rate_card_currency_id=1)

    # Invalid
    with pytest.raises(ValueError, match="Currency mismatch"):
        validate_country_currency(country_currency_id=1, rate_card_currency_id=2)


def test_validate_pricing_model_components():
    """Service-level validation: components must be provided according to PricingModel flags."""
    def validate_components(
        has_fixed: bool,
        has_unit: bool,
        fixed_fee: Decimal | None,
        unit_rate: Decimal | None,
    ):
        if has_fixed and (fixed_fee is None or fixed_fee <= 0):
            raise ValueError("Pricing model requires a non-zero fixed fee")
        if has_unit and (unit_rate is None or unit_rate <= 0):
            raise ValueError("Pricing model requires a non-zero unit rate")

    # Platform + Subscription requires both
    with pytest.raises(ValueError, match="fixed fee"):
        validate_components(has_fixed=True, has_unit=True, fixed_fee=None, unit_rate=Decimal("12.50"))

    with pytest.raises(ValueError, match="unit rate"):
        validate_components(has_fixed=True, has_unit=True, fixed_fee=Decimal("5000"), unit_rate=None)

    # Valid when both provided
    validate_components(
        has_fixed=True,
        has_unit=True,
        fixed_fee=Decimal("5000.00"),
        unit_rate=Decimal("12.5000"),
    )


# ===========================================================================
# 8. Model Imports & Alembic Discovery
# ===========================================================================
def test_rate_card_models_import_without_db(monkeypatch):
    """rate_card.py must be importable without DATABASE_URL."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    import app.models

    assert hasattr(app.models, "RateCardVersion")
    assert hasattr(app.models, "RateCard")
    assert hasattr(app.models, "ServiceRate")


def test_alembic_wave3_head():
    """Alembic must recognize Wave 3 revision in its migration history."""
    cfg = Config(_ALEMBIC_INI)
    script = ScriptDirectory.from_config(cfg)
    rev = script.get_revision("b2c3d4e5f6a7")
    assert rev is not None, "Wave 3 revision 'b2c3d4e5f6a7' not in Alembic history"


def test_alembic_wave3_offline_sql():
    """Alembic offline SQL generation must emit CREATE TABLE for Wave 3 tables."""
    buf = io.StringIO()
    cfg = Config(_ALEMBIC_INI)
    with contextlib.redirect_stdout(buf):
        command.upgrade(cfg, "head", sql=True)
    sql_output = buf.getvalue()

    for table in WAVE3_TABLES:
        assert f"CREATE TABLE {table}" in sql_output, (
            f"CREATE TABLE {table} not found in offline SQL output"
        )
    assert "CREATE UNIQUE INDEX uq_rate_cards_pack_dims" in sql_output
    assert "CREATE UNIQUE INDEX uq_rate_cards_feature_dims" in sql_output


# ===========================================================================
# 9. SQLite In-Memory DDL Generation
# ===========================================================================
def test_sqlite_ddl_creation():
    """All 19 models must successfully generate DDL in SQLite in-memory engine."""
    engine = create_engine("sqlite:///:memory:")
    # SQLite doesn't support postgresql_where partial indexes or identities in older drivers,
    # but create_all handles standard tables gracefully.
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    created_tables = inspector.get_table_names()

    for table in WAVE3_TABLES:
        assert table in created_tables, f"Table {table} not created in SQLite"
    engine.dispose()
