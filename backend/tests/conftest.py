"""Shared pytest configuration.

SAFETY: the test suite must never reach the production Neon database.
`app.db.session` calls `load_dotenv()`, which would otherwise pick up the real
DATABASE_URL from backend/.env. `python-dotenv` never overrides variables that
are already set, so we pin DATABASE_URL *before* the application is imported:

  * If TEST_DATABASE_URL is set, DATABASE_URL points at it (after safety checks).
  * Otherwise DATABASE_URL points at an unreachable local port, so any accidental
    use of the real engine fails fast instead of touching a real database.

PostgreSQL integration tests are opt-in: set TEST_DATABASE_URL to a *local*
database whose name contains "test", e.g.
    postgresql+psycopg://postgres@127.0.0.1:54329/dealdesk_test
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

import pytest

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
_UNREACHABLE_URL = "postgresql+psycopg://nobody:nobody@127.0.0.1:1/dealdesk_unreachable"


def _validated_test_url() -> str | None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        return None
    parsed = urlparse(url.replace("postgresql+psycopg", "postgresql", 1))
    database = (parsed.path or "").lstrip("/")
    if (parsed.hostname or "") not in _LOCAL_HOSTS or "test" not in database.lower():
        raise RuntimeError(
            "TEST_DATABASE_URL must point at a LOCAL database whose name contains 'test'. "
            "Refusing to run tests against anything else."
        )
    return url


_TEST_URL = _validated_test_url()
os.environ["DATABASE_URL"] = _TEST_URL or _UNREACHABLE_URL


BACKEND_DIR = Path(__file__).resolve().parents[1]

# Transactional tables cleared after every PostgreSQL integration test.
# Reference/seed data (masters, catalogue, rate cards, user) is kept for the session.
_TRANSACTIONAL_TABLES = (
    "calculation_snapshots, approvals, proposal_content, proposal_service_lines, "
    "proposal_line_items, proposal_countries, proposal_contacts, proposal_versions, "
    "proposals, deals, customers"
)


@pytest.fixture(scope="session")
def pg_engine():
    """Fresh PostgreSQL schema built by Alembic (also verifies migration consistency) plus DEV seed."""
    if not _TEST_URL:
        pytest.skip("TEST_DATABASE_URL not set; PostgreSQL integration tests skipped")

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session

    engine = create_engine(_TEST_URL, future=True)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.upgrade(cfg, "head")

    from scripts.seed_dev_data import seed

    with Session(engine) as session:
        seed(session)
        session.commit()

    yield engine
    engine.dispose()


@pytest.fixture(scope="session")
def pg_seed_ids(pg_engine):
    from sqlalchemy.orm import Session

    from scripts.seed_dev_data import seed

    with Session(pg_engine) as session:
        ids = seed(session)  # idempotent: returns the existing ids
        session.commit()
    return ids


@pytest.fixture()
def pg_client(pg_engine):
    """TestClient wired to the local PostgreSQL test database; cleans transactional tables afterwards."""
    from fastapi.testclient import TestClient
    from sqlalchemy import text
    from sqlalchemy.orm import sessionmaker

    from app.db.session import get_db
    from app.main import app

    factory = sessionmaker(bind=pg_engine, autocommit=False, autoflush=False)

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.pop(get_db, None)
    with pg_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {_TRANSACTIONAL_TABLES} RESTART IDENTITY CASCADE"))
