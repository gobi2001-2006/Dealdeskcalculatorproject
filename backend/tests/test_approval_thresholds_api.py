"""GET /api/masters/approval-thresholds: the thresholds Pricing & Discounts shows come from the database.

Replaces the demo values (30% / 15% / 20%) that were hard-coded in the frontend. Display only:
nothing enforces the thresholds yet.
"""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.governance import ApprovalThreshold, Role


@pytest.fixture
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    role = Role(id=1, code="business_head", name="Business Head")
    db.add(role)
    db.flush()
    today = date.today()
    db.add_all([
        ApprovalThreshold(id=1, threshold_type="overall_discount", value_pct="12.5", approver_role_id=role.id,
                          valid_from=today - timedelta(days=10), status="active"),
        ApprovalThreshold(id=2, threshold_type="line_discount", value_pct="8", approver_role_id=role.id,
                          valid_from=today - timedelta(days=10), status="inactive"),            # not active
        ApprovalThreshold(id=3, threshold_type="gm_floor", value_pct="30", approver_role_id=role.id,
                          valid_from=today - timedelta(days=60), valid_to=today - timedelta(days=1), status="active"),  # expired
        ApprovalThreshold(id=4, threshold_type="service_discount", value_pct="15", approver_role_id=role.id,
                          valid_from=today + timedelta(days=5), status="active"),               # not yet valid
    ])
    db.commit()

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        db.close()


def test_only_thresholds_in_effect_today_are_listed(env):
    r = env.get("/api/masters/approval-thresholds")
    assert r.status_code == 200, r.text
    assert [(t["threshold_type"], float(t["value_pct"])) for t in r.json()] == [("overall_discount", 12.5)]


def test_empty_table_returns_an_empty_list_not_defaults(env):
    # Nothing in effect -> nothing invented.
    s = next(app.dependency_overrides[get_db]())
    s.query(ApprovalThreshold).delete()
    s.commit()
    assert env.get("/api/masters/approval-thresholds").json() == []
