"""Test suite for Wave 1 foundational database schema.

Verifies:
1. All nine Wave 1 tables are registered in Base.metadata.
2. Every table has a primary key (and composite PK where required).
3. Foreign keys reference valid tables and columns with ON DELETE RESTRICT.
4. Unique constraints and indexes exist as specified.
5. Money, percentage, and FX columns use specified precision and scale.
6. CHECK constraints enforce positive rates, multipliers, percentages, and valid dates.
7. Model imports work without a live database connection.
8. The FastAPI application starts and handles requests.
9. Application-level customer tier band overlap validation works correctly.
10. In-memory database can build all tables via Base.metadata.create_all.
11. Alembic discovers the Wave 1 migration head.
12. Alembic offline SQL generation produces DDL for all nine tables.
"""

import importlib
import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic import command

from app.db.base import Base
from app.models.master_data import (
    ContractTerm,
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    DeploymentPricingOption,
    FxRate,
    PricingModel,
    UnitOfMeasure,
)
from app.services.tier_validation import (
    TierBandOverlapError,
    validate_customer_tier_bands,
    validate_tier_range,
)
from app.main import app


EXPECTED_TABLES = {
    "currencies",
    "countries",
    "fx_rates",
    "units_of_measure",
    "deployment_models",
    "pricing_models",
    "deployment_pricing_options",
    "customer_tiers",
    "contract_terms",
}


def test_wave1_tables_registered():
    """Verify that all nine Wave 1 tables are registered in Base.metadata."""
    registered = set(Base.metadata.tables.keys())
    assert EXPECTED_TABLES.issubset(
        registered
    ), f"Missing tables: {EXPECTED_TABLES - registered}"


def test_primary_keys_defined():
    """Verify that every Wave 1 table has a primary key."""
    for table_name in EXPECTED_TABLES:
        table = Base.metadata.tables[table_name]
        pk_cols = [c.name for c in table.primary_key.columns]
        assert len(pk_cols) > 0, f"Table '{table_name}' has no primary key"

    # deployment_pricing_options must have composite primary key
    dpo = Base.metadata.tables["deployment_pricing_options"]
    dpo_pk_cols = {c.name for c in dpo.primary_key.columns}
    assert dpo_pk_cols == {
        "deployment_model_id",
        "pricing_model_id",
    }, f"Unexpected PK cols for deployment_pricing_options: {dpo_pk_cols}"


def test_foreign_keys_and_on_delete_restrict():
    """Verify foreign keys target expected tables/columns and use ON DELETE RESTRICT."""
    # countries -> currencies
    countries = Base.metadata.tables["countries"]
    fk_country = list(countries.foreign_keys)
    assert any(
        fk.target_fullname == "currencies.id" and fk.ondelete == "RESTRICT"
        for fk in fk_country
    ), "countries.currency_id FK to currencies.id with RESTRICT missing"

    # fx_rates -> currencies (from & to)
    fx_rates = Base.metadata.tables["fx_rates"]
    fk_fx = list(fx_rates.foreign_keys)
    assert len(fk_fx) == 2, f"Expected 2 FKs on fx_rates, found {len(fk_fx)}"
    for fk in fk_fx:
        assert fk.target_fullname == "currencies.id"
        assert fk.ondelete == "RESTRICT"

    # pricing_models -> units_of_measure
    pm = Base.metadata.tables["pricing_models"]
    fk_pm = list(pm.foreign_keys)
    assert any(
        fk.target_fullname == "units_of_measure.id" and fk.ondelete == "RESTRICT"
        for fk in fk_pm
    ), "pricing_models.uom_locked_id FK to units_of_measure.id with RESTRICT missing"

    # deployment_pricing_options -> deployment_models and pricing_models
    dpo = Base.metadata.tables["deployment_pricing_options"]
    fk_dpo = {fk.target_fullname: fk.ondelete for fk in dpo.foreign_keys}
    assert (
        "deployment_models.id" in fk_dpo
        and fk_dpo["deployment_models.id"] == "RESTRICT"
    )
    assert (
        "pricing_models.id" in fk_dpo
        and fk_dpo["pricing_models.id"] == "RESTRICT"
    )


def test_unique_constraints_and_indexes():
    """Verify business keys have unique constraints and required indexes."""
    # currencies: code unique
    currencies = Base.metadata.tables["currencies"]
    assert any(
        "code" in [c.name for c in uq.columns]
        for uq in currencies.constraints
        if hasattr(uq, "columns")
    )

    # countries: iso_code unique
    countries = Base.metadata.tables["countries"]
    assert any(
        "iso_code" in [c.name for c in uq.columns]
        for uq in countries.constraints
        if hasattr(uq, "columns")
    )

    # fx_rates: (from_currency_id, to_currency_id, effective_date) unique
    fx_rates = Base.metadata.tables["fx_rates"]
    assert any(
        set(c.name for c in uq.columns)
        == {"from_currency_id", "to_currency_id", "effective_date"}
        for uq in fx_rates.constraints
        if hasattr(uq, "columns")
    )
    # latest rate lookup index
    assert any(
        idx.name == "ix_fx_rates_latest_lookup" for idx in fx_rates.indexes
    )

    # units_of_measure: code unique
    uom = Base.metadata.tables["units_of_measure"]
    assert any(
        "code" in [c.name for c in uq.columns]
        for uq in uom.constraints
        if hasattr(uq, "columns")
    )

    # deployment_models: code unique
    dm = Base.metadata.tables["deployment_models"]
    assert any(
        "code" in [c.name for c in uq.columns]
        for uq in dm.constraints
        if hasattr(uq, "columns")
    )

    # pricing_models: code unique
    pricing = Base.metadata.tables["pricing_models"]
    assert any(
        "code" in [c.name for c in uq.columns]
        for uq in pricing.constraints
        if hasattr(uq, "columns")
    )

    # customer_tiers: name unique
    tiers = Base.metadata.tables["customer_tiers"]
    assert any(
        "name" in [c.name for c in uq.columns]
        for uq in tiers.constraints
        if hasattr(uq, "columns")
    )

    # contract_terms: term_months unique
    terms = Base.metadata.tables["contract_terms"]
    assert any(
        "term_months" in [c.name for c in uq.columns]
        for uq in terms.constraints
        if hasattr(uq, "columns")
    )


def test_numeric_precisions():
    """Verify precision and scale on multiplier, rate, and percentage columns."""
    countries = Base.metadata.tables["countries"]
    mult_col = countries.c.price_multiplier
    assert mult_col.type.precision == 10
    assert mult_col.type.scale == 6

    tiers = Base.metadata.tables["customer_tiers"]
    tier_mult = tiers.c.default_multiplier
    assert tier_mult.type.precision == 10
    assert tier_mult.type.scale == 6

    fx = Base.metadata.tables["fx_rates"]
    rate_col = fx.c.rate
    assert rate_col.type.precision == 18
    assert rate_col.type.scale == 8

    terms = Base.metadata.tables["contract_terms"]
    esc_col = terms.c.escalation_pct_per_renewal_year
    assert esc_col.type.precision == 7
    assert esc_col.type.scale == 4


def test_check_constraints():
    """Verify CHECK constraints enforce positive values, ranges, and date ordering."""

    def get_ck_sql(table):
        return [
            str(c.sqltext)
            for c in table.constraints
            if hasattr(c, "sqltext") and c.sqltext is not None
        ]

    # fx_rates: rate > 0 and from != to
    fx_cks = get_ck_sql(Base.metadata.tables["fx_rates"])
    assert any("rate > 0" in ck for ck in fx_cks)
    assert any("from_currency_id <> to_currency_id" in ck for ck in fx_cks)

    # countries: multiplier > 0 and valid_to > valid_from
    country_cks = get_ck_sql(Base.metadata.tables["countries"])
    assert any("price_multiplier > 0" in ck for ck in country_cks)
    assert any(
        "valid_to IS NULL OR valid_to > valid_from" in ck for ck in country_cks
    )

    # customer_tiers: default_multiplier > 0, min >= 0, max >= min, valid_to > valid_from
    tier_cks = get_ck_sql(Base.metadata.tables["customer_tiers"])
    assert any("default_multiplier > 0" in ck for ck in tier_cks)
    assert any("employee_min >= 0" in ck for ck in tier_cks)
    assert any(
        "employee_max IS NULL OR employee_max >= employee_min" in ck
        for ck in tier_cks
    )
    assert any(
        "valid_to IS NULL OR valid_to > valid_from" in ck for ck in tier_cks
    )

    # contract_terms: term_months > 0, escalation between 0 and 100
    term_cks = get_ck_sql(Base.metadata.tables["contract_terms"])
    assert any("term_months > 0" in ck for ck in term_cks)
    assert any(
        "escalation_pct_per_renewal_year >= 0 AND escalation_pct_per_renewal_year <= 100"
        in ck
        for ck in term_cks
    )

    # pricing_models: fixed_fee_basis in ('annual', 'one_time')
    pm_cks = get_ck_sql(Base.metadata.tables["pricing_models"])
    assert any(
        "fixed_fee_basis IS NULL OR fixed_fee_basis IN ('annual', 'one_time')"
        in ck
        for ck in pm_cks
    )


def test_models_import_without_database_connection(monkeypatch):
    """Verify models and Base can be imported without DATABASE_URL set or live DB."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    # Reload modules to test import resilience
    import app.db.base
    import app.models.foundation
    import app.models

    importlib.reload(app.db.base)
    importlib.reload(app.models.foundation)
    importlib.reload(app.models)

    assert hasattr(app.models, "Currency")
    assert hasattr(app.models, "Country")


def test_fastapi_app_running():
    """Verify FastAPI application starts and home endpoint returns expected message."""
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Adrenalin Deal Desk API is running"}


def test_customer_tier_band_validation():
    """Verify application-level tier band validation rules."""
    # 1. Valid non-overlapping bands
    valid_tiers = [
        {"name": "Tier 1", "employee_min": 1, "employee_max": 500},
        {"name": "Tier 2", "employee_min": 501, "employee_max": 2000},
        {"name": "Tier 3", "employee_min": 2001, "employee_max": 5000},
        {"name": "Enterprise", "employee_min": 5001, "employee_max": None},
    ]
    validate_customer_tier_bands(valid_tiers)  # Should not raise

    # 2. Overlapping bands
    overlapping = [
        {"name": "Tier 1", "employee_min": 1, "employee_max": 500},
        {"name": "Tier 2", "employee_min": 400, "employee_max": 1000},
    ]
    with pytest.raises(TierBandOverlapError, match="overlaps"):
        validate_customer_tier_bands(overlapping)

    # 3. Open-ended band not at the top
    open_ended_not_last = [
        {"name": "Tier 1", "employee_min": 1, "employee_max": None},
        {"name": "Tier 2", "employee_min": 501, "employee_max": 1000},
    ]
    with pytest.raises(TierBandOverlapError, match="open-ended"):
        validate_customer_tier_bands(open_ended_not_last)

    # 4. Negative min headcount
    with pytest.raises(ValueError, match="non-negative"):
        validate_tier_range(-1, 100)

    # 5. max < min
    with pytest.raises(ValueError, match="must be >= employee_min"):
        validate_tier_range(500, 200)


def test_in_memory_sqlite_ddl_creation():
    """Verify that all models can be created in an isolated local engine."""
    sqlite_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(sqlite_engine)
    inspector = inspect(sqlite_engine)
    created_tables = set(inspector.get_table_names())
    assert EXPECTED_TABLES.issubset(created_tables)


def test_alembic_heads_and_discovery():
    """Verify Alembic configuration discovers the Wave 1 migration revision.

    Wave 1 revision 9472414f438c may not be the *head* once later waves are
    added (the head advances to the newest revision).  This test therefore
    checks that the revision is reachable in the script directory rather than
    asserting it is the sole head.
    """
    cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(cfg)
    # Wave 1 revision must be discoverable as a script
    rev = script.get_revision("9472414f438c")
    assert rev is not None, "Wave 1 revision '9472414f438c' not found in migration history"


def test_alembic_offline_sql_generation():
    """Verify Alembic offline SQL generation emits DDL for all 9 Wave 1 tables."""
    import contextlib

    buf = io.StringIO()
    cfg = Config("alembic.ini")
    with contextlib.redirect_stdout(buf):
        command.upgrade(cfg, "head", sql=True)
    sql_output = buf.getvalue()

    for table in EXPECTED_TABLES:
        assert f"CREATE TABLE {table}" in sql_output, (
            f"Table creation statement for '{table}' not found in generated SQL"
        )
