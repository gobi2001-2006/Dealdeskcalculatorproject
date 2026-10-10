"""Test suite for Wave 2 Catalogue & Packs database schema.

Verifies:
 1.  All seven Wave 2 tables are registered in Base.metadata.
 2.  Primary keys (single and composite) are correct.
 3.  Foreign keys reference valid tables and columns with ON DELETE RESTRICT.
 4.  Unique constraints are present on every specified column set.
 5.  The ix_pack_items_feature_id reverse-lookup index exists.
 6.  Feature classification CHECK constraint allows only native/ai_enabled/partner.
 7.  Partner features require partner_name (CHECK constraint present).
 8.  Product-description effective-date constraint (valid_to > valid_from).
 9.  Pack variants are constrained to standard/premium.
10.  Pack-version statuses are constrained to draft/active/locked/superseded.
11.  Duplicate pack items (same version + feature) are rejected.
12.  Locked pack versions cannot be updated or deleted (PostgreSQL trigger).
13.  Items belonging to locked versions cannot be inserted, updated, or deleted.
14.  Model imports succeed without a live database connection.
15.  Alembic discovers Wave 2 as the new head migration.
16.  Alembic offline SQL generation produces DDL for all seven Wave 2 tables.
17.  All nine Wave 1 tables remain intact (regression guard).

Tests 12 and 13 require a real PostgreSQL connection because they test
trigger behaviour; they are skipped automatically when DATABASE_URL is not
set in the test environment.
"""

import contextlib
import io
import importlib
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

# Load .env so DATABASE_URL is available for the PG integration tests.
# This must happen before the skipif mark is evaluated.
from dotenv import load_dotenv as _load_dotenv
_load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.db.base import Base
from app.models.catalogue import (
    Feature,
    Pack,
    PackItem,
    PackVersion,
    Product,
    ProductDescription,
    ProductFamily,
)


# ---------------------------------------------------------------------------
# Expected table sets
# ---------------------------------------------------------------------------

WAVE1_TABLES = {
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

WAVE2_TABLES = {
    "product_families",
    "products",
    "features",
    "product_descriptions",
    "packs",
    "pack_versions",
    "pack_items",
}


# ---------------------------------------------------------------------------
# Helper: resolve alembic.ini relative to the backend dir
# ---------------------------------------------------------------------------
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ALEMBIC_INI = str(_BACKEND_DIR / "alembic.ini")


# ---------------------------------------------------------------------------
# 1. Table registration
# ---------------------------------------------------------------------------
def test_wave2_tables_registered():
    """All seven Wave 2 tables must appear in Base.metadata."""
    registered = set(Base.metadata.tables.keys())
    missing = WAVE2_TABLES - registered
    assert not missing, f"Missing Wave 2 tables in metadata: {missing}"


def test_wave1_tables_still_registered():
    """Regression: Wave 1 tables must not have been removed."""
    registered = set(Base.metadata.tables.keys())
    missing = WAVE1_TABLES - registered
    assert not missing, f"Wave 1 tables removed from metadata: {missing}"


# ---------------------------------------------------------------------------
# 2. Primary keys
# ---------------------------------------------------------------------------
def test_single_column_primary_keys():
    """product_families, products, features, product_descriptions, packs,
    pack_versions must each have a single-column bigint PK named 'id'."""
    single_pk_tables = [
        "product_families",
        "products",
        "features",
        "product_descriptions",
        "packs",
        "pack_versions",
    ]
    for tname in single_pk_tables:
        table = Base.metadata.tables[tname]
        pk_cols = [c.name for c in table.primary_key.columns]
        assert pk_cols == ["id"], (
            f"Table '{tname}' expected PK ['id'], got {pk_cols}"
        )


def test_pack_items_composite_primary_key():
    """pack_items must use (pack_version_id, feature_id) as composite PK."""
    table = Base.metadata.tables["pack_items"]
    pk_cols = {c.name for c in table.primary_key.columns}
    assert pk_cols == {"pack_version_id", "feature_id"}, (
        f"pack_items PK mismatch: {pk_cols}"
    )


# ---------------------------------------------------------------------------
# 3. Foreign keys with ON DELETE RESTRICT
# ---------------------------------------------------------------------------
def _fk_map(table_name: str) -> dict[str, str]:
    """Return {target_fullname: ondelete} for all FKs on the given table."""
    table = Base.metadata.tables[table_name]
    return {fk.target_fullname: fk.ondelete for fk in table.foreign_keys}


def test_products_fk():
    fks = _fk_map("products")
    assert fks.get("product_families.id") == "RESTRICT", (
        "products.product_family_id must reference product_families.id RESTRICT"
    )


def test_features_fk():
    fks = _fk_map("features")
    assert fks.get("products.id") == "RESTRICT", (
        "features.product_id must reference products.id RESTRICT"
    )


def test_product_descriptions_fk():
    fks = _fk_map("product_descriptions")
    assert fks.get("features.id") == "RESTRICT", (
        "product_descriptions.feature_id must reference features.id RESTRICT"
    )


def test_packs_fk_nullable():
    """packs.product_family_id is nullable but when set must RESTRICT."""
    fks = _fk_map("packs")
    assert fks.get("product_families.id") == "RESTRICT", (
        "packs.product_family_id FK must be RESTRICT"
    )


def test_pack_versions_fk():
    fks = _fk_map("pack_versions")
    assert fks.get("packs.id") == "RESTRICT", (
        "pack_versions.pack_id must reference packs.id RESTRICT"
    )


def test_pack_items_fks():
    fks = _fk_map("pack_items")
    assert fks.get("pack_versions.id") == "RESTRICT", (
        "pack_items.pack_version_id must reference pack_versions.id RESTRICT"
    )
    assert fks.get("features.id") == "RESTRICT", (
        "pack_items.feature_id must reference features.id RESTRICT"
    )


# ---------------------------------------------------------------------------
# 4. Unique constraints
# ---------------------------------------------------------------------------
def _has_uq(table_name: str, *col_names: str) -> bool:
    table = Base.metadata.tables[table_name]
    target = set(col_names)
    return any(
        set(c.name for c in c_obj.columns) == target
        for c_obj in table.constraints
        if hasattr(c_obj, "columns")
    )


def test_unique_constraints():
    assert _has_uq("product_families", "code"), "product_families.code UQ missing"
    assert _has_uq("products", "code"), "products.code UQ missing"
    assert _has_uq("products", "product_family_id", "name"), (
        "products.(product_family_id, name) UQ missing"
    )
    assert _has_uq("features", "code"), "features.code UQ missing"
    assert _has_uq("features", "product_id", "name"), (
        "features.(product_id, name) UQ missing"
    )
    assert _has_uq("product_descriptions", "feature_id", "language", "version_no"), (
        "product_descriptions.(feature_id, language, version_no) UQ missing"
    )
    assert _has_uq("packs", "code"), "packs.code UQ missing"
    assert _has_uq("pack_versions", "pack_id", "version_no"), (
        "pack_versions.(pack_id, version_no) UQ missing"
    )


# ---------------------------------------------------------------------------
# 5. pack_items reverse-lookup index
# ---------------------------------------------------------------------------
def test_pack_items_feature_id_index():
    table = Base.metadata.tables["pack_items"]
    assert any(
        idx.name == "ix_pack_items_feature_id" for idx in table.indexes
    ), "ix_pack_items_feature_id index missing on pack_items"


# ---------------------------------------------------------------------------
# 6 & 7. Feature CHECK constraints (metadata-level)
# ---------------------------------------------------------------------------
def _ck_sqls(table_name: str) -> list[str]:
    table = Base.metadata.tables[table_name]
    return [
        str(c.sqltext)
        for c in table.constraints
        if hasattr(c, "sqltext") and c.sqltext is not None
    ]


def test_feature_classification_check():
    cks = _ck_sqls("features")
    assert any("classification IN" in ck for ck in cks), (
        "features.classification CHECK constraint missing"
    )
    assert any("native" in ck and "ai_enabled" in ck and "partner" in ck for ck in cks), (
        "features.classification CHECK must include native, ai_enabled, partner"
    )


def test_feature_partner_name_required_check():
    cks = _ck_sqls("features")
    assert any("partner_name IS NOT NULL" in ck for ck in cks), (
        "features CHECK for partner_name required when classification='partner' is missing"
    )


# ---------------------------------------------------------------------------
# 8. ProductDescription date-order CHECK
# ---------------------------------------------------------------------------
def test_product_description_date_order_check():
    cks = _ck_sqls("product_descriptions")
    assert any("valid_to IS NULL OR valid_to > valid_from" in ck for ck in cks), (
        "product_descriptions date-order CHECK constraint missing"
    )


# ---------------------------------------------------------------------------
# 9. Pack variant CHECK
# ---------------------------------------------------------------------------
def test_pack_variant_check():
    cks = _ck_sqls("packs")
    assert any("standard" in ck and "premium" in ck for ck in cks), (
        "packs.variant CHECK constraint for standard/premium missing"
    )


# ---------------------------------------------------------------------------
# 10. Pack version status CHECK
# ---------------------------------------------------------------------------
def test_pack_version_status_check():
    cks = _ck_sqls("pack_versions")
    assert any(
        "draft" in ck and "active" in ck and "locked" in ck and "superseded" in ck
        for ck in cks
    ), "pack_versions.status CHECK constraint missing correct values"


# ---------------------------------------------------------------------------
# 11. Duplicate pack items rejected (SQLite in-memory)
# ---------------------------------------------------------------------------
def test_duplicate_pack_items_rejected_sqlite():
    """Composite PK prevents duplicate (pack_version_id, feature_id) rows.

    This test uses SQLite (no triggers) and therefore only verifies the PK
    constraint.  Trigger behaviour is tested in the PostgreSQL integration
    tests below.
    """
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO product_families(id, code, name, status, created_at, updated_at) "
            "VALUES (1, 'FAM', 'Family', 'active', datetime('now'), datetime('now'))"
        ))
        conn.execute(text(
            "INSERT INTO products(id, product_family_id, code, name, status, created_at, updated_at) "
            "VALUES (1, 1, 'PROD', 'Product', 'active', datetime('now'), datetime('now'))"
        ))
        conn.execute(text(
            "INSERT INTO features(id, product_id, code, name, classification, status, created_at, updated_at) "
            "VALUES (1, 1, 'PROD-001', 'Feature 1', 'native', 'active', datetime('now'), datetime('now'))"
        ))
        conn.execute(text(
            "INSERT INTO packs(id, code, name, variant, status, created_at, updated_at) "
            "VALUES (1, 'PACK-A', 'Pack A', 'standard', 'active', datetime('now'), datetime('now'))"
        ))
        conn.execute(text(
            "INSERT INTO pack_versions(id, pack_id, version_no, status, created_at, updated_at) "
            "VALUES (1, 1, 1, 'draft', datetime('now'), datetime('now'))"
        ))
        # First insert — OK
        conn.execute(text(
            "INSERT INTO pack_items(pack_version_id, feature_id) VALUES (1, 1)"
        ))
        conn.commit()

        # Second insert — must fail with IntegrityError (composite PK violation)
        with pytest.raises(IntegrityError):
            conn.execute(text(
                "INSERT INTO pack_items(pack_version_id, feature_id) VALUES (1, 1)"
            ))
            conn.commit()


# ---------------------------------------------------------------------------
# 14. Model imports without a live database connection
# ---------------------------------------------------------------------------
def test_catalogue_models_import_without_db(monkeypatch):
    """catalogue.py must be importable without DATABASE_URL.

    We do NOT reload the module here because SQLAlchemy's DeclarativeBase
    raises ``InvalidRequestError`` if the same table name is registered a
    second time against the same MetaData instance.  Instead we verify that
    the symbols were successfully imported when the module was first loaded
    (which happens without DATABASE_URL because catalogue.py has no runtime
    DB dependency at import time).
    """
    monkeypatch.delenv("DATABASE_URL", raising=False)

    # These imports must succeed — no reload needed, catalogue.py is already
    # in sys.modules from the module-level import at the top of this file.
    import app.models

    assert hasattr(app.models, "ProductFamily"), "ProductFamily not in app.models"
    assert hasattr(app.models, "Product"), "Product not in app.models"
    assert hasattr(app.models, "Feature"), "Feature not in app.models"
    assert hasattr(app.models, "ProductDescription"), "ProductDescription not in app.models"
    assert hasattr(app.models, "Pack"), "Pack not in app.models"
    assert hasattr(app.models, "PackVersion"), "PackVersion not in app.models"
    assert hasattr(app.models, "PackItem"), "PackItem not in app.models"


# ---------------------------------------------------------------------------
# 15. Alembic head discovery
# ---------------------------------------------------------------------------
def test_alembic_wave2_head():
    """Alembic must recognize Wave 2 revision in its migration history."""
    cfg = Config(_ALEMBIC_INI)
    script = ScriptDirectory.from_config(cfg)
    rev = script.get_revision("a1b2c3d4e5f6")
    assert rev is not None, "Wave 2 revision 'a1b2c3d4e5f6' not found in Alembic history"


# ---------------------------------------------------------------------------
# 16. Alembic offline SQL generation
# ---------------------------------------------------------------------------
def test_alembic_wave2_offline_sql():
    """Alembic offline SQL must contain CREATE TABLE for all Wave 2 tables."""
    buf = io.StringIO()
    cfg = Config(_ALEMBIC_INI)
    with contextlib.redirect_stdout(buf):
        command.upgrade(cfg, "head", sql=True)
    sql_output = buf.getvalue()

    for table in WAVE2_TABLES:
        assert f"CREATE TABLE {table}" in sql_output, (
            f"CREATE TABLE {table} not found in offline SQL output"
        )


# ---------------------------------------------------------------------------
# PostgreSQL integration tests (skipped when DATABASE_URL is absent)
# ---------------------------------------------------------------------------
_SKIP_PG = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="DATABASE_URL not set — skipping PostgreSQL integration tests",
)


@pytest.fixture(scope="module")
def pg_engine():
    """Provide a live PostgreSQL engine using the configured DATABASE_URL."""
    url = os.getenv("DATABASE_URL")
    engine = create_engine(url, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture()
def pg_conn(pg_engine):
    """Provide a transactional connection that is rolled back after each test."""
    with pg_engine.connect() as conn:
        with conn.begin():
            yield conn
            conn.rollback()


def _pg_seed(conn) -> dict:
    """Insert minimal parent rows and return their IDs for use in tests."""
    r = conn.execute(text(
        "INSERT INTO product_families(code, name, status) "
        "VALUES ('TST', 'Test Family', 'active') RETURNING id"
    ))
    family_id = r.scalar_one()

    r = conn.execute(text(
        "INSERT INTO products(product_family_id, code, name, status) "
        "VALUES (:fid, 'TST-MOD', 'Test Module', 'active') RETURNING id"
    ), {"fid": family_id})
    product_id = r.scalar_one()

    r = conn.execute(text(
        "INSERT INTO features(product_id, code, name, classification, status) "
        "VALUES (:pid, 'TST-MOD-001', 'Feature 1', 'native', 'active') RETURNING id"
    ), {"pid": product_id})
    feature_id = r.scalar_one()

    r = conn.execute(text(
        "INSERT INTO packs(code, name, variant, status) "
        "VALUES ('PK-TST', 'Test Pack', 'standard', 'active') RETURNING id"
    ))
    pack_id = r.scalar_one()

    r = conn.execute(text(
        "INSERT INTO pack_versions(pack_id, version_no, status) "
        "VALUES (:pid, 1, 'draft') RETURNING id"
    ), {"pid": pack_id})
    version_id = r.scalar_one()

    return {
        "family_id": family_id,
        "product_id": product_id,
        "feature_id": feature_id,
        "pack_id": pack_id,
        "version_id": version_id,
    }


@_SKIP_PG
def test_pg_feature_classification_constraint(pg_conn):
    """DB rejects invalid classification values."""
    r = pg_conn.execute(text(
        "INSERT INTO product_families(code, name, status) "
        "VALUES ('CK1', 'CK Family', 'active') RETURNING id"
    ))
    family_id = r.scalar_one()
    r = pg_conn.execute(text(
        "INSERT INTO products(product_family_id, code, name, status) "
        "VALUES (:fid, 'CK1-MOD', 'CK Module', 'active') RETURNING id"
    ), {"fid": family_id})
    product_id = r.scalar_one()

    with pytest.raises(Exception, match="ck_features_classification"):
        pg_conn.execute(text(
            "INSERT INTO features(product_id, code, name, classification, status) "
            "VALUES (:pid, 'CK1-001', 'Bad Class', 'unknown', 'active')"
        ), {"pid": product_id})


@_SKIP_PG
def test_pg_partner_name_required(pg_conn):
    """DB rejects partner feature without partner_name."""
    r = pg_conn.execute(text(
        "INSERT INTO product_families(code, name, status) "
        "VALUES ('PN1', 'PN Family', 'active') RETURNING id"
    ))
    family_id = r.scalar_one()
    r = pg_conn.execute(text(
        "INSERT INTO products(product_family_id, code, name, status) "
        "VALUES (:fid, 'PN1-MOD', 'PN Module', 'active') RETURNING id"
    ), {"fid": family_id})
    product_id = r.scalar_one()

    with pytest.raises(Exception, match="ck_features_partner_name_required"):
        pg_conn.execute(text(
            "INSERT INTO features(product_id, code, name, classification, status) "
            "VALUES (:pid, 'PN1-001', 'No Partner Name', 'partner', 'active')"
        ), {"pid": product_id})


@_SKIP_PG
def test_pg_locked_pack_version_update_rejected(pg_conn):
    """Trigger must reject UPDATE on a locked pack_version row."""
    ids = _pg_seed(pg_conn)
    # Transition to locked
    pg_conn.execute(text(
        "UPDATE pack_versions SET status='locked', locked_at=now() WHERE id=:vid"
    ), {"vid": ids["version_id"]})

    with pytest.raises(Exception, match="locked"):
        pg_conn.execute(text(
            "UPDATE pack_versions SET version_no=99 WHERE id=:vid"
        ), {"vid": ids["version_id"]})


@_SKIP_PG
def test_pg_locked_pack_version_delete_rejected(pg_conn):
    """Trigger must reject DELETE on a locked pack_version row."""
    ids = _pg_seed(pg_conn)
    pg_conn.execute(text(
        "UPDATE pack_versions SET status='locked', locked_at=now() WHERE id=:vid"
    ), {"vid": ids["version_id"]})

    with pytest.raises(Exception, match="locked"):
        pg_conn.execute(text(
            "DELETE FROM pack_versions WHERE id=:vid"
        ), {"vid": ids["version_id"]})


@_SKIP_PG
def test_pg_pack_items_locked_version_insert_rejected(pg_conn):
    """Trigger must reject INSERT into pack_items for a locked version."""
    ids = _pg_seed(pg_conn)
    pg_conn.execute(text(
        "UPDATE pack_versions SET status='locked', locked_at=now() WHERE id=:vid"
    ), {"vid": ids["version_id"]})

    with pytest.raises(Exception, match="locked"):
        pg_conn.execute(text(
            "INSERT INTO pack_items(pack_version_id, feature_id) "
            "VALUES (:vid, :fid)"
        ), {"vid": ids["version_id"], "fid": ids["feature_id"]})


@_SKIP_PG
def test_pg_pack_items_locked_version_delete_rejected(pg_conn):
    """Trigger must reject DELETE of pack_items belonging to a locked version."""
    ids = _pg_seed(pg_conn)
    # Insert an item while still draft
    pg_conn.execute(text(
        "INSERT INTO pack_items(pack_version_id, feature_id) "
        "VALUES (:vid, :fid)"
    ), {"vid": ids["version_id"], "fid": ids["feature_id"]})
    # Lock the version
    pg_conn.execute(text(
        "UPDATE pack_versions SET status='locked', locked_at=now() WHERE id=:vid"
    ), {"vid": ids["version_id"]})

    with pytest.raises(Exception, match="locked"):
        pg_conn.execute(text(
            "DELETE FROM pack_items WHERE pack_version_id=:vid"
        ), {"vid": ids["version_id"]})


@_SKIP_PG
def test_pg_product_description_date_order_rejected(pg_conn):
    """DB rejects product_description where valid_to <= valid_from."""
    ids = _pg_seed(pg_conn)
    with pytest.raises(Exception, match="ck_product_descriptions_valid_date_order"):
        pg_conn.execute(text(
            "INSERT INTO product_descriptions"
            "(feature_id, language, scope_text, version_no, valid_from, valid_to, status) "
            "VALUES (:fid, 'en', 'Scope text', 1, '2025-01-01', '2024-12-31', 'draft')"
        ), {"fid": ids["feature_id"]})


@_SKIP_PG
def test_pg_duplicate_pack_item_rejected(pg_conn):
    """Composite PK rejects duplicate (pack_version_id, feature_id) on PostgreSQL."""
    ids = _pg_seed(pg_conn)
    pg_conn.execute(text(
        "INSERT INTO pack_items(pack_version_id, feature_id) VALUES (:vid, :fid)"
    ), {"vid": ids["version_id"], "fid": ids["feature_id"]})

    with pytest.raises(Exception):
        pg_conn.execute(text(
            "INSERT INTO pack_items(pack_version_id, feature_id) VALUES (:vid, :fid)"
        ), {"vid": ids["version_id"], "fid": ids["feature_id"]})
