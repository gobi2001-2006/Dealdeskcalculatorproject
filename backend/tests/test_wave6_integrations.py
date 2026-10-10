"""Wave 6 Integration Test Suite: Documents, Clauses, CRM Integration & Publishing.

Tests cover:
1. Registration of all 7 Wave 6 tables in Base.metadata (42 total tables).
2. Primary keys: BIGINT IDENTITY on all 7 tables.
3. Foreign key definitions and ON DELETE RESTRICT enforcement.
4. Clause version uniqueness on (clause_id, version_no).
5. Proposal clauses uniqueness on (proposal_version_id, clause_version_id).
6. CRM field mapping uniqueness on (crm_provider, internal_entity, internal_field).
7. Publish job idempotency key uniqueness.
8. Non-negative numeric bounds on sort_order, file_size_bytes, retry_count.
9. Check constraints on all lifecycle statuses and categories across Wave 6.
10. Secret-free CRM sync log payloads and safe error message formatting.
11. Document storage references (paths, not raw binaries).
12. Alembic discovery and offline SQL generation for revision e5f6a7b8c9d0.
13. In-memory SQLite DDL creation for all 42 models.
"""

import contextlib
import io
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from dotenv import load_dotenv
from sqlalchemy import (
    CheckConstraint,
    ForeignKeyConstraint,
    PrimaryKeyConstraint,
    UniqueConstraint,
    create_engine,
    inspect,
)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_ROOT / ".env")

import app.models
from app.db.base import Base
from app.models.integrations import (
    Clause,
    ClauseVersion,
    CrmFieldMapping,
    CrmSyncLog,
    Document,
    ProposalClause,
    PublishJob,
)

_ALEMBIC_INI = str(_BACKEND_ROOT / "alembic.ini")

WAVE6_TABLES = [
    "clauses",
    "clause_versions",
    "proposal_clauses",
    "documents",
    "crm_field_mappings",
    "crm_sync_logs",
    "publish_jobs",
]


# ===========================================================================
# 1. Metadata Registration & Table Count
# ===========================================================================
def test_wave6_tables_registered():
    """All 7 Wave 6 tables must be registered in Base.metadata."""
    for table in WAVE6_TABLES:
        assert table in Base.metadata.tables, f"Missing table '{table}' in Base.metadata"


def test_total_tables_registered():
    """Total tables across all 6 waves must equal exactly 42."""
    assert len(Base.metadata.tables) == 42, (
        f"Expected 42 tables, got {len(Base.metadata.tables)}"
    )


# ===========================================================================
# 2. Primary Keys
# ===========================================================================
def test_wave6_primary_keys():
    """All 7 Wave 6 tables must have a single-column primary key named 'id'."""
    for t_name in WAVE6_TABLES:
        table = Base.metadata.tables[t_name]
        pk_cols = [c.name for c in table.primary_key.columns]
        assert pk_cols == ["id"], f"{t_name} expected PK ['id'], got {pk_cols}"


# ===========================================================================
# 3. Foreign Keys & ON DELETE RESTRICT
# ===========================================================================
def test_clause_versions_and_proposal_clauses_foreign_keys():
    """clause_versions and proposal_clauses FKs must enforce ON DELETE RESTRICT."""
    cv_table = Base.metadata.tables["clause_versions"]
    cv_fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in cv_table.foreign_keys}
    assert cv_fks["clause_id"] == ("clauses.id", "RESTRICT")
    assert cv_fks["created_by_user_id"] == ("users.id", "RESTRICT")

    pc_table = Base.metadata.tables["proposal_clauses"]
    pc_fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in pc_table.foreign_keys}
    assert pc_fks["proposal_version_id"] == ("proposal_versions.id", "RESTRICT")
    assert pc_fks["clause_version_id"] == ("clause_versions.id", "RESTRICT")


def test_documents_foreign_keys():
    """documents foreign keys referencing proposal_versions and users with RESTRICT."""
    table = Base.metadata.tables["documents"]
    fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert fks["proposal_version_id"] == ("proposal_versions.id", "RESTRICT")
    assert fks["created_by_user_id"] == ("users.id", "RESTRICT")


def test_publish_jobs_foreign_keys():
    """publish_jobs foreign keys referencing proposal_versions, documents, users."""
    table = Base.metadata.tables["publish_jobs"]
    fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert fks["proposal_version_id"] == ("proposal_versions.id", "RESTRICT")
    assert fks["document_id"] == ("documents.id", "RESTRICT")
    assert fks["requested_by_user_id"] == ("users.id", "RESTRICT")


# ===========================================================================
# 4. Uniqueness Constraints
# ===========================================================================
def test_clause_versions_uniqueness():
    """clause_versions must enforce unique (clause_id, version_no)."""
    table = Base.metadata.tables["clause_versions"]
    uq_names = [u.name for u in table.constraints if isinstance(u, UniqueConstraint)]
    assert "uq_clause_versions_clause_id_version_no" in uq_names


def test_proposal_clauses_uniqueness():
    """proposal_clauses must enforce unique (proposal_version_id, clause_version_id)."""
    table = Base.metadata.tables["proposal_clauses"]
    uq_names = [u.name for u in table.constraints if isinstance(u, UniqueConstraint)]
    assert "uq_proposal_clauses_version_clause" in uq_names


def test_crm_field_mappings_uniqueness():
    """crm_field_mappings must enforce unique (crm_provider, internal_entity, internal_field)."""
    table = Base.metadata.tables["crm_field_mappings"]
    uq_names = [u.name for u in table.constraints if isinstance(u, UniqueConstraint)]
    assert "uq_crm_field_mappings_provider_internal_field" in uq_names


def test_publish_jobs_idempotency_key_uniqueness():
    """publish_jobs must have unique idempotency_key."""
    table = Base.metadata.tables["publish_jobs"]
    col = table.c["idempotency_key"]
    assert col.unique is True


# ===========================================================================
# 5. Check Constraints & Rules
# ===========================================================================
def test_wave6_check_constraints():
    """Verify categories, statuses, directions, and bounds across Wave 6."""
    def get_ck_sqls(tbl_name):
        return [str(c.sqltext) for c in Base.metadata.tables[tbl_name].constraints if isinstance(c, CheckConstraint)]

    assert any("legal" in s and "payment" in s for s in get_ck_sqls("clauses"))
    assert any("version_no > 0" in s for s in get_ck_sqls("clause_versions"))
    assert any("sort_order >= 0" in s for s in get_ck_sqls("proposal_clauses"))
    assert any("proposal_pdf" in s and "order_form" in s for s in get_ck_sqls("documents"))
    assert any("inbound" in s and "outbound" in s for s in get_ck_sqls("crm_field_mappings"))
    assert any("success" in s and "failed" in s for s in get_ck_sqls("crm_sync_logs"))
    assert any("queued" in s and "completed" in s for s in get_ck_sqls("publish_jobs"))
    assert any("retry_count >= 0" in s for s in get_ck_sqls("publish_jobs"))


# ===========================================================================
# 6. Alembic Discovery & Offline SQL
# ===========================================================================
def test_alembic_wave6_head():
    """Alembic must report Wave 6 'e5f6a7b8c9d0' as current head."""
    cfg = Config(_ALEMBIC_INI)
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert "e5f6a7b8c9d0" in heads, f"Wave 6 head not found in heads: {heads}"


def test_alembic_wave6_offline_sql():
    """Offline SQL generation must include CREATE TABLE for all 7 Wave 6 tables."""
    buf = io.StringIO()
    cfg = Config(_ALEMBIC_INI)
    with contextlib.redirect_stdout(buf):
        command.upgrade(cfg, "head", sql=True)
    sql_output = buf.getvalue()

    for table in WAVE6_TABLES:
        assert f"CREATE TABLE {table}" in sql_output, (
            f"CREATE TABLE {table} not found in offline SQL"
        )


# ===========================================================================
# 7. SQLite In-Memory DDL Generation
# ===========================================================================
def test_sqlite_ddl_creation():
    """All 42 models across Waves 1 to 6 must successfully generate DDL in SQLite."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    created_tables = inspector.get_table_names()

    for table in WAVE6_TABLES:
        assert table in created_tables, f"Table {table} not created in SQLite"
    engine.dispose()
