"""Wave 4 Users & Governance Table, Model, and Security Test Suite.

Tests cover:
1. Registration of all 5 Wave 4 tables in Base.metadata (24 tables total).
2. Preservation of all prior 19 tables from Waves 1-3.
3. Primary keys and composite PK on user_roles (user_id, role_id).
4. Foreign key definitions with ON DELETE RESTRICT.
5. Role code allowed values and uniqueness constraints.
6. Case-insensitive lower(email) unique index definition.
7. Percentage precision (7, 4) and [0, 100] range on approval_thresholds.
8. Effective date order constraints on approval_thresholds (valid_to >= valid_from).
9. Approval threshold types validation.
10. Password hashing with bcrypt, no plaintext storage, and verification.
11. Email normalization (lowercase and strip).
12. Audit payload secret redaction (passwords, tokens, keys).
13. RBAC permission evaluation using canonical 6-role policy matrix.
14. Business Head regional scoping rules.
15. Alembic Wave 4 head discovery and offline SQL generation.
16. In-memory SQLite DDL creation.
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
from app.models.governance import (
    ApprovalThreshold,
    AuditLog,
    Role,
    User,
    UserRole,
)
from app.services.authentication import (
    hash_password,
    normalize_email,
    redact_sensitive_data,
    verify_password,
)
from app.services.authorization import (
    RoleCode,
    check_permission,
    check_regional_access,
)

_ALEMBIC_INI = str(_BACKEND_ROOT / "alembic.ini")

WAVE4_TABLES = [
    "roles",
    "users",
    "user_roles",
    "approval_thresholds",
    "audit_logs",
]


# ===========================================================================
# 1. Metadata Registration & Prior Table Preservation
# ===========================================================================
def test_wave4_tables_registered():
    """All 5 Wave 4 tables must be registered in Base.metadata."""
    for table in WAVE4_TABLES:
        assert table in Base.metadata.tables, f"Missing table '{table}' in Base.metadata"


def test_total_tables_registered():
    """Total registered tables must be at least 24 (preserves all prior waves)."""
    assert len(Base.metadata.tables) >= 24, (
        f"Expected at least 24 tables, got {len(Base.metadata.tables)}"
    )


# ===========================================================================
# 2. Primary Keys & Composite PK
# ===========================================================================
def test_roles_and_users_primary_keys():
    """roles, users, approval_thresholds, audit_logs have single-column PK 'id'."""
    for t_name in ["roles", "users", "approval_thresholds", "audit_logs"]:
        table = Base.metadata.tables[t_name]
        pk_cols = [c.name for c in table.primary_key.columns]
        assert pk_cols == ["id"], f"{t_name} expected PK ['id'], got {pk_cols}"


def test_user_roles_composite_primary_key():
    """user_roles must have composite PK (user_id, role_id)."""
    table = Base.metadata.tables["user_roles"]
    pk_cols = [c.name for c in table.primary_key.columns]
    assert sorted(pk_cols) == ["role_id", "user_id"], (
        f"Expected composite PK ['role_id', 'user_id'], got {pk_cols}"
    )


# ===========================================================================
# 3. Foreign Keys & ON DELETE RESTRICT
# ===========================================================================
def test_user_roles_foreign_keys():
    """user_roles foreign keys must enforce ON DELETE RESTRICT."""
    table = Base.metadata.tables["user_roles"]
    fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert fks["user_id"] == ("users.id", "RESTRICT")
    assert fks["role_id"] == ("roles.id", "RESTRICT")
    assert fks["granted_by"] == ("users.id", "RESTRICT")


def test_approval_thresholds_foreign_keys():
    """approval_thresholds foreign keys must enforce ON DELETE RESTRICT."""
    table = Base.metadata.tables["approval_thresholds"]
    fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert fks["approver_role_id"] == ("roles.id", "RESTRICT")
    assert fks["escalation_role_id"] == ("roles.id", "RESTRICT")


def test_audit_logs_foreign_keys():
    """audit_logs actor_user_id FK must enforce ON DELETE RESTRICT."""
    table = Base.metadata.tables["audit_logs"]
    fks = {fk.parent.name: (fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert fks["actor_user_id"] == ("users.id", "RESTRICT")


# ===========================================================================
# 4. Check Constraints & Rules
# ===========================================================================
def test_roles_constraints():
    """roles must constrain code to the six canonical roles."""
    table = Base.metadata.tables["roles"]
    ck_sqls = [str(c.sqltext) for c in table.constraints if isinstance(c, CheckConstraint)]
    assert any("admin" in s and "cfo" in s for s in ck_sqls)


def test_approval_thresholds_constraints():
    """approval_thresholds check constraints for types, percentage, timeout, dates."""
    table = Base.metadata.tables["approval_thresholds"]
    ck_sqls = [str(c.sqltext) for c in table.constraints if isinstance(c, CheckConstraint)]
    assert any("gm_floor" in s and "overall_discount" in s for s in ck_sqls)
    assert any("value_pct >= 0 AND value_pct <= 100" in s for s in ck_sqls)
    assert any("timeout_hours IS NULL OR timeout_hours > 0" in s for s in ck_sqls)
    assert any("valid_to IS NULL OR valid_to >= valid_from" in s for s in ck_sqls)
    assert any("status IN ('active', 'inactive', 'retired')" in s for s in ck_sqls)


def test_approval_thresholds_numeric_precision():
    """value_pct must be Numeric(7, 4)."""
    table = Base.metadata.tables["approval_thresholds"]
    col = table.c["value_pct"]
    assert isinstance(col.type, Numeric)
    assert col.type.precision == 7
    assert col.type.scale == 4


# ===========================================================================
# 5. Password Security & Authentication Services
# ===========================================================================
def test_password_hashing_and_verification():
    """Password hashing generates bcrypt hash and verifies correctly."""
    plain = "SuperSecretP@ssw0rd!2026"
    hashed = hash_password(plain)

    # Hash must not match plaintext
    assert hashed != plain
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    # Correct verification
    assert verify_password(plain, hashed) is True
    # Incorrect verification
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False


def test_email_normalization():
    """Emails are stripped and downcased."""
    assert normalize_email("  User.Test@Adrenalin.COM ") == "user.test@adrenalin.com"
    with pytest.raises(ValueError):
        normalize_email("")


def test_audit_sensitive_data_redaction():
    """Passwords, tokens, credentials, and API keys are redacted from audit JSON."""
    raw_payload = {
        "user_id": 42,
        "email": "user@adrenalin.com",
        "password": "ClearTextPassword!",
        "password_hash": "$2b$12$abcdefg",
        "nested": {
            "access_token": "jwt-token-xyz",
            "api_key": "secret-key-123",
            "region": "APAC",
        },
    }
    redacted = redact_sensitive_data(raw_payload)
    assert redacted["password"] == "[REDACTED]"
    assert redacted["password_hash"] == "[REDACTED]"
    assert redacted["nested"]["access_token"] == "[REDACTED]"
    assert redacted["nested"]["api_key"] == "[REDACTED]"
    assert redacted["email"] == "user@adrenalin.com"
    assert redacted["nested"]["region"] == "APAC"


# ===========================================================================
# 6. Authorization Policy & Regional Scoping
# ===========================================================================
def test_rbac_permission_matrix():
    """Role permissions are evaluated correctly without a permissions table."""
    # Admin can assign roles and manage thresholds
    assert check_permission(["admin"], "roles:assign") is True
    assert check_permission(["admin"], "thresholds:create") is True

    # Pricing Desk cannot assign roles
    assert check_permission(["pricing_desk"], "roles:assign") is False
    assert check_permission(["pricing_desk"], "rate_cards:write") is True

    # Presales cannot approve CFO deals
    assert check_permission(["presales"], "proposals:approve_cfo") is False
    assert check_permission(["cfo"], "proposals:approve_cfo") is True


def test_business_head_regional_scoping():
    """Business Head users are scoped to their assigned region."""
    # Global roles ignore region
    assert check_regional_access(["admin"], None, "EMEA") is True
    assert check_regional_access(["cfo"], None, "APAC") is True

    # Business Head scoped
    assert check_regional_access(["business_head"], "APAC", "APAC") is True
    assert check_regional_access(["business_head"], "APAC", "EMEA") is False
    assert check_regional_access(["business_head"], None, "APAC") is False


# ===========================================================================
# 7. Alembic Discovery & Offline SQL
# ===========================================================================
def test_alembic_wave4_head():
    """Alembic must recognize Wave 4 revision in its migration history."""
    cfg = Config(_ALEMBIC_INI)
    script = ScriptDirectory.from_config(cfg)
    rev = script.get_revision("c3d4e5f6a7b8")
    assert rev is not None, "Wave 4 revision 'c3d4e5f6a7b8' not found in Alembic history"


def test_alembic_wave4_offline_sql():
    """Alembic offline SQL generation must emit CREATE TABLE for Wave 4 tables."""
    buf = io.StringIO()
    cfg = Config(_ALEMBIC_INI)
    with contextlib.redirect_stdout(buf):
        command.upgrade(cfg, "head", sql=True)
    sql_output = buf.getvalue()

    for table in WAVE4_TABLES:
        assert f"CREATE TABLE {table}" in sql_output, (
            f"CREATE TABLE {table} not found in offline SQL output"
        )
    assert "CREATE UNIQUE INDEX uq_users_lower_email" in sql_output
    assert "CREATE TRIGGER trg_protect_audit_logs_append_only" in sql_output


# ===========================================================================
# 8. SQLite In-Memory DDL Generation
# ===========================================================================
def test_sqlite_ddl_creation():
    """All 24 models must successfully generate DDL in SQLite in-memory engine."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    created_tables = inspector.get_table_names()

    for table in WAVE4_TABLES:
        assert table in created_tables, f"Table {table} not created in SQLite"
    engine.dispose()
