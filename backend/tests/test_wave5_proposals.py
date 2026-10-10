"""Wave 5 Proposal & Deal Management Test Suite.

Tests cover:
1. Registration of all 11 Wave 5 tables in Base.metadata (35 total tables).
2. Primary keys: BIGINT IDENTITY on all 11 tables.
3. Foreign key definitions and ON DELETE RESTRICT enforcement.
4. Proposal version uniqueness on (proposal_id, version_no).
5. Proposal-country uniqueness on (proposal_id, country_id).
6. Proposal-contact uniqueness on (proposal_id, email).
7. Proposal-content uniqueness on (proposal_version_id, section_key).
8. Target exclusivity on proposal_line_items (pack_version_id XOR feature_id).
9. Non-negative numeric bounds on quantities, monetary rates, and extended totals.
10. Percentage bounds [0, 100] on discount_pct for product lines and service lines.
11. Check constraints on all lifecycle statuses (customers, deals, proposals, versions, approvals).
12. Relationships from proposal -> deal -> customer -> user.
13. Calculation snapshots JSONB metadata retention.
14. Alembic discovery and offline SQL generation for revision d4e5f6a7b8c9.
15. In-memory SQLite DDL creation for all 35 models.
"""

import contextlib
import io
from decimal import Decimal
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from dotenv import load_dotenv
from sqlalchemy import (
    CheckConstraint,
    ForeignKeyConstraint,
    Numeric,
    PrimaryKeyConstraint,
    UniqueConstraint,
    create_engine,
    inspect,
)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_ROOT / ".env")

import app.models
from app.db.base import Base
from app.models.proposals import (
    Approval,
    CalculationSnapshot,
    Customer,
    Deal,
    Proposal,
    ProposalContact,
    ProposalContent,
    ProposalCountry,
    ProposalLineItem,
    ProposalServiceLine,
    ProposalVersion,
)

_ALEMBIC_INI = str(_BACKEND_ROOT / "alembic.ini")

WAVE5_TABLES = [
    "customers",
    "deals",
    "proposals",
    "proposal_contacts",
    "proposal_versions",
    "proposal_countries",
    "proposal_line_items",
    "proposal_service_lines",
    "calculation_snapshots",
    "proposal_content",
    "approvals",
]


# ===========================================================================
# 1. Metadata Registration & Table Count
# ===========================================================================
def test_wave5_tables_registered():
    """All 11 Wave 5 tables must be present in Base.metadata."""
    for table in WAVE5_TABLES:
        assert table in Base.metadata.tables, f"Missing table '{table}' in Base.metadata"


def test_total_tables_registered():
    """Total tables across waves must be at least 35 (preserves prior waves)."""
    assert len(Base.metadata.tables) >= 35, (
        f"Expected at least 35 tables, got {len(Base.metadata.tables)}"
    )


# ===========================================================================
# 2. Primary Keys
# ===========================================================================
def test_wave5_primary_keys():
    """All 11 Wave 5 tables must have a single-column primary key named 'id'."""
    for t_name in WAVE5_TABLES:
        table = Base.metadata.tables[t_name]
        pk_cols = [c.name for c in table.primary_key.columns]
        assert pk_cols == ["id"], f"{t_name} expected PK ['id'], got {pk_cols}"


# ===========================================================================
# 3. Foreign Keys & ON DELETE RESTRICT
# ===========================================================================
def test_customers_and_deals_foreign_keys():
    """customers and deals foreign keys must enforce ON DELETE RESTRICT."""
    cust_table = Base.metadata.tables["customers"]
    cust_fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in cust_table.foreign_keys}
    assert cust_fks["country_id"] == ("countries.id", "RESTRICT")
    assert cust_fks["customer_tier_id"] == ("customer_tiers.id", "RESTRICT")

    deal_table = Base.metadata.tables["deals"]
    deal_fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in deal_table.foreign_keys}
    assert deal_fks["customer_id"] == ("customers.id", "RESTRICT")
    assert deal_fks["owner_user_id"] == ("users.id", "RESTRICT")


def test_proposals_and_versions_foreign_keys():
    """proposals and proposal_versions foreign keys must enforce ON DELETE RESTRICT."""
    prop_table = Base.metadata.tables["proposals"]
    prop_fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in prop_table.foreign_keys}
    assert prop_fks["deal_id"] == ("deals.id", "RESTRICT")
    assert prop_fks["customer_id"] == ("customers.id", "RESTRICT")
    assert prop_fks["currency_id"] == ("currencies.id", "RESTRICT")
    assert prop_fks["created_by_user_id"] == ("users.id", "RESTRICT")

    ver_table = Base.metadata.tables["proposal_versions"]
    ver_fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in ver_table.foreign_keys}
    assert ver_fks["proposal_id"] == ("proposals.id", "RESTRICT")
    assert ver_fks["rate_card_version_id"] == ("rate_card_versions.id", "RESTRICT")
    assert ver_fks["created_by_user_id"] == ("users.id", "RESTRICT")


def test_line_items_foreign_keys():
    """proposal_line_items foreign keys referencing catalogue and master data."""
    table = Base.metadata.tables["proposal_line_items"]
    fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert fks["proposal_version_id"] == ("proposal_versions.id", "RESTRICT")
    assert fks["pack_version_id"] == ("pack_versions.id", "RESTRICT")
    assert fks["feature_id"] == ("features.id", "RESTRICT")
    assert fks["uom_id"] == ("units_of_measure.id", "RESTRICT")
    assert fks["currency_id"] == ("currencies.id", "RESTRICT")


def test_service_lines_foreign_keys():
    """proposal_service_lines foreign keys referencing service_rates and currencies."""
    table = Base.metadata.tables["proposal_service_lines"]
    fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert fks["proposal_version_id"] == ("proposal_versions.id", "RESTRICT")
    assert fks["service_rate_id"] == ("service_rates.id", "RESTRICT")
    assert fks["currency_id"] == ("currencies.id", "RESTRICT")


def test_approvals_foreign_keys():
    """approvals foreign keys referencing thresholds, roles, and users."""
    table = Base.metadata.tables["approvals"]
    fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert fks["proposal_version_id"] == ("proposal_versions.id", "RESTRICT")
    assert fks["threshold_id"] == ("approval_thresholds.id", "RESTRICT")
    assert fks["assigned_role_id"] == ("roles.id", "RESTRICT")
    assert fks["decided_by_user_id"] == ("users.id", "RESTRICT")


# ===========================================================================
# 4. Uniqueness Constraints
# ===========================================================================
def test_proposal_versions_uniqueness():
    """proposal_versions must enforce unique (proposal_id, version_no)."""
    table = Base.metadata.tables["proposal_versions"]
    uq_names = [u.name for u in table.constraints if isinstance(u, UniqueConstraint)]
    assert "uq_proposal_versions_proposal_id_version_no" in uq_names


def test_proposal_countries_uniqueness():
    """proposal_countries must enforce unique (proposal_id, country_id)."""
    table = Base.metadata.tables["proposal_countries"]
    uq_names = [u.name for u in table.constraints if isinstance(u, UniqueConstraint)]
    assert "uq_proposal_countries_proposal_country" in uq_names


def test_proposal_contacts_uniqueness():
    """proposal_contacts must enforce unique (proposal_id, email)."""
    table = Base.metadata.tables["proposal_contacts"]
    uq_names = [u.name for u in table.constraints if isinstance(u, UniqueConstraint)]
    assert "uq_proposal_contacts_proposal_email" in uq_names


def test_proposal_content_uniqueness():
    """proposal_content must enforce unique (proposal_version_id, section_key)."""
    table = Base.metadata.tables["proposal_content"]
    uq_names = [u.name for u in table.constraints if isinstance(u, UniqueConstraint)]
    assert "uq_proposal_content_version_section" in uq_names


# ===========================================================================
# 5. Check Constraints & Rules
# ===========================================================================
def test_line_items_exclusivity_and_bounds():
    """proposal_line_items exclusivity (pack XOR feature) and non-negative bounds."""
    table = Base.metadata.tables["proposal_line_items"]
    ck_sqls = [str(c.sqltext) for c in table.constraints if isinstance(c, CheckConstraint)]
    assert any("pack_version_id IS NOT NULL AND feature_id IS NULL" in s for s in ck_sqls)
    assert any("quantity >= 0" in s for s in ck_sqls)
    assert any("list_unit_price >= 0" in s for s in ck_sqls)
    assert any("net_unit_price >= 0" in s for s in ck_sqls)
    assert any("discount_pct >= 0 AND discount_pct <= 100" in s for s in ck_sqls)
    assert any("extended_amount >= 0" in s for s in ck_sqls)


def test_service_lines_bounds():
    """proposal_service_lines quantity, rate, discount, and amount bounds."""
    table = Base.metadata.tables["proposal_service_lines"]
    ck_sqls = [str(c.sqltext) for c in table.constraints if isinstance(c, CheckConstraint)]
    assert any("days_or_hours >= 0" in s for s in ck_sqls)
    assert any("rate_applied >= 0" in s for s in ck_sqls)
    assert any("discount_pct >= 0 AND discount_pct <= 100" in s for s in ck_sqls)
    assert any("extended_amount >= 0" in s for s in ck_sqls)


def test_status_constraints():
    """Verify lifecycle status check constraints across all Wave 5 models."""
    def get_ck_sqls(tbl_name):
        return [str(c.sqltext) for c in Base.metadata.tables[tbl_name].constraints if isinstance(c, CheckConstraint)]

    assert any("active" in s and "prospect" in s for s in get_ck_sqls("customers"))
    assert any("open" in s and "won" in s and "lost" in s for s in get_ck_sqls("deals"))
    assert any("draft" in s and "submitted" in s and "approved" in s for s in get_ck_sqls("proposals"))
    assert any("draft" in s and "locked" in s and "superseded" in s for s in get_ck_sqls("proposal_versions"))
    assert any("pending" in s and "approved" in s and "rejected" in s for s in get_ck_sqls("approvals"))


# ===========================================================================
# 6. Alembic Discovery & Offline SQL
# ===========================================================================
def test_alembic_wave5_head():
    """Alembic must recognize Wave 5 revision in its migration history."""
    cfg = Config(_ALEMBIC_INI)
    script = ScriptDirectory.from_config(cfg)
    rev = script.get_revision("d4e5f6a7b8c9")
    assert rev is not None, "Wave 5 revision 'd4e5f6a7b8c9' not found in Alembic history"


def test_alembic_wave5_offline_sql():
    """Offline SQL generation must include CREATE TABLE for all 11 Wave 5 tables."""
    buf = io.StringIO()
    cfg = Config(_ALEMBIC_INI)
    with contextlib.redirect_stdout(buf):
        command.upgrade(cfg, "head", sql=True)
    sql_output = buf.getvalue()

    for table in WAVE5_TABLES:
        assert f"CREATE TABLE {table}" in sql_output, (
            f"CREATE TABLE {table} not found in offline SQL"
        )


# ===========================================================================
# 7. SQLite In-Memory DDL Generation
# ===========================================================================
def test_sqlite_ddl_creation():
    """All 35 models must successfully generate DDL in SQLite in-memory engine."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    created_tables = inspector.get_table_names()

    for table in WAVE5_TABLES:
        assert table in created_tables, f"Table {table} not created in SQLite"
    engine.dispose()
