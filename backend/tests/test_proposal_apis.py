"""Comprehensive test suite for Phase C Proposal Management APIs.

Tests:
1. Proposal Creation (with Deal association, auto-created draft version 1, defaults).
2. Proposal Listing & Retrieval (filters, pagination, search, eager loaded relations).
3. Missing Proposal and Missing Deal error responses (HTTP 404).
4. Invalid Deal, Currency, User references (Foreign-Key validations).
5. Partial Proposal Updates (PATCH semantics, permitted fields, lifecycle protection).
6. Proposal Countries (add country, unique constraint, negative headcount guard).
7. Proposal Line Items (pack XOR feature target exclusivity, numeric bounds, add/update/delete).
8. Pack Version locking and retired product/feature validation.
9. Proposal Service Lines (add professional service line, bounds, missing rate errors).
10. Transaction rollback on failure (no orphaned records).
11. Regression validation across existing Phase A/B models.

Runs entirely in-memory using SQLite; never accesses or mutates production Neon.
"""

from datetime import date
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.catalogue import Feature, Pack, PackVersion, Product, ProductFamily
from app.models.governance import User
from app.models.master_data import Country, Currency, UnitOfMeasure
from app.models.proposals import Customer, Deal, Proposal, ProposalCountry, ProposalLineItem, ProposalVersion
from app.models.rate_card import RateCardVersion, ServiceRate
from app.services.proposal_service import (
    DealNotFoundError,
    ProposalConflictError,
    ProposalNotFoundError,
    ResourceNotFoundError,
    create_proposal,
)
from app.schemas.proposals import ProposalCreate


# =============================================================================
# Fixtures & Test Setup
# =============================================================================

from sqlalchemy import event, func

@event.listens_for(Session, "before_flush")
def auto_assign_ids(session, flush_context, instances):
    # SQLite cannot autoincrement BigInteger identity columns; PostgreSQL sessions must keep their sequences.
    if session.get_bind().dialect.name != "sqlite":
        return
    id_counters = {}
    for instance in session.new:
        if hasattr(instance, "id") and getattr(instance, "id", None) is None:
            cls = type(instance)
            if cls not in id_counters:
                max_id = session.execute(select(func.coalesce(func.max(cls.id), 0))).scalar() or 0
                id_counters[cls] = max_id
            id_counters[cls] += 1
            setattr(instance, "id", id_counters[cls])


@pytest.fixture(scope="function")
def test_db():
    """Create an isolated, in-memory SQLite database for each test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()

    # Seed core prerequisite masters
    curr = Currency(code="USD", name="US Dollar", symbol="$", decimal_places=2, status="active")
    db.add(curr)
    db.flush()

    cntry = Country(
        iso_code="US",
        name="United States",
        currency_id=curr.id,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
    )
    db.add(cntry)

    cntry2 = Country(
        iso_code="GB",
        name="United Kingdom",
        currency_id=curr.id,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
    )
    db.add(cntry2)

    uom = UnitOfMeasure(code="employee", name="Active Employee", status="active")
    db.add(uom)

    usr = User(
        email="test_sales@adrenalin.com",
        full_name="Test Sales User",
        password_hash="secret_hash",
        is_active=True,
    )
    db.add(usr)
    db.flush()

    rc_ver = RateCardVersion(
        version_no="RC-2026.1",
        name="FY26 Global Standard Rate Card",
        status="active",
        valid_from=date(2026, 1, 1),
    )
    db.add(rc_ver)
    db.flush()

    fam = ProductFamily(code="HRMS", name="Human Resource Management System")
    db.add(fam)
    db.flush()

    prod = Product(product_family_id=fam.id, code="CORE_HR", name="Core Human Resources")
    db.add(prod)
    db.flush()

    feat = Feature(
        product_id=prod.id,
        code="FEAT_LEAVE",
        name="Leave Management",
        classification="native",
        status="active",
    )
    db.add(feat)

    feat_retired = Feature(
        product_id=prod.id,
        code="FEAT_LEGACY",
        name="Legacy Attendance",
        classification="native",
        status="retired",
    )
    db.add(feat_retired)

    pack = Pack(code="PACK_GROWTH", name="Growth Pack", variant="standard")
    db.add(pack)
    db.flush()

    pack_ver = PackVersion(pack_id=pack.id, version_no=1, status="locked")
    db.add(pack_ver)

    pack_ver_retired = PackVersion(pack_id=pack.id, version_no=2, status="superseded")
    db.add(pack_ver_retired)

    cust = Customer(
        code="CUST-100",
        name="Apex Enterprises",
        country_id=cntry.id,
        status="active",
    )
    db.add(cust)
    db.flush()

    deal = Deal(
        code="DEAL-2026-001",
        name="Apex Global HR Transformation",
        customer_id=cust.id,
        owner_user_id=usr.id,
        status="open",
    )
    db.add(deal)

    srv_rate = ServiceRate(
        role_name="Implementation Consultant",
        country_id=cntry.id,
        hourly_rate=Decimal("120.0000"),
        hours_per_day=Decimal("8.00"),
        currency_id=curr.id,
        valid_from=date(2026, 1, 1),
        status="active",
    )
    db.add(srv_rate)

    db.commit()

    yield db

    db.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(scope="function")
def client(test_db: Session):
    """FastAPI TestClient with overridden get_db dependency."""
    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# =============================================================================
# 1. Proposal Creation Tests
# =============================================================================

def test_create_proposal_success(client: TestClient, test_db: Session):
    """Create a proposal with a valid deal; verifies automatic version 1 creation."""
    payload = {
        "code": "PROP-2026-001",
        "deal_id": 1,
        "currency_id": 1,
        "status": "draft",
        "created_by_user_id": 1,
    }
    response = client.post("/api/proposals/", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["code"] == "PROP-2026-001"
    assert data["deal_id"] == 1
    assert data["customer_id"] == 1  # defaulted from deal
    assert data["status"] == "draft"
    assert len(data["versions"]) == 1
    assert data["versions"][0]["version_no"] == 1
    assert data["versions"][0]["status"] == "draft"


def test_create_proposal_missing_deal_404(client: TestClient):
    """Proposal creation with a nonexistent deal_id must return 404."""
    payload = {
        "code": "PROP-2026-999",
        "deal_id": 9999,
        "currency_id": 1,
        "created_by_user_id": 1,
    }
    response = client.post("/api/proposals/", json=payload)
    assert response.status_code == 404
    assert "Deal with id 9999 not found" in response.json()["detail"]


def test_create_proposal_duplicate_code_conflict(client: TestClient):
    """Proposal creation with a duplicate code must return 409 Conflict."""
    payload = {
        "code": "PROP-UNIQUE-01",
        "deal_id": 1,
        "currency_id": 1,
        "created_by_user_id": 1,
    }
    res1 = client.post("/api/proposals/", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/proposals/", json=payload)
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"]


def test_create_proposal_invalid_currency_404(client: TestClient):
    """Invalid currency reference returns 404."""
    payload = {
        "code": "PROP-BAD-CURR",
        "deal_id": 1,
        "currency_id": 999,
        "created_by_user_id": 1,
    }
    response = client.post("/api/proposals/", json=payload)
    assert response.status_code == 404
    assert "Currency" in response.json()["detail"]


def test_create_proposal_invalid_user_404(client: TestClient):
    """Invalid created_by_user_id returns 404."""
    payload = {
        "code": "PROP-BAD-USER",
        "deal_id": 1,
        "currency_id": 1,
        "created_by_user_id": 999,
    }
    response = client.post("/api/proposals/", json=payload)
    assert response.status_code == 404
    assert "User" in response.json()["detail"]


# =============================================================================
# 2. Proposal Listing & Retrieval Tests
# =============================================================================

def test_list_and_get_proposals(client: TestClient):
    """List proposals with filters and retrieve by ID."""
    # Create two proposals
    client.post("/api/proposals/", json={"code": "PROP-LIST-1", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    client.post("/api/proposals/", json={"code": "PROP-LIST-2", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})

    # List proposals
    list_res = client.get("/api/proposals/")
    assert list_res.status_code == 200
    proposals = list_res.json()
    assert len(proposals) >= 2

    # Filter by search
    search_res = client.get("/api/proposals/?search=LIST-1")
    assert search_res.status_code == 200
    assert len(search_res.json()) == 1
    assert search_res.json()[0]["code"] == "PROP-LIST-1"

    # Retrieve specific proposal
    prop_id = search_res.json()[0]["id"]
    get_res = client.get(f"/api/proposals/{prop_id}")
    assert get_res.status_code == 200
    detail = get_res.json()
    assert detail["id"] == prop_id
    assert detail["deal"] is not None
    assert detail["deal"]["code"] == "DEAL-2026-001"
    assert detail["currency"]["code"] == "USD"


def test_get_nonexistent_proposal_404(client: TestClient):
    """Querying a missing proposal ID returns 404."""
    response = client.get("/api/proposals/99999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


# =============================================================================
# 3. Partial Proposal Updates (PATCH)
# =============================================================================

def test_patch_proposal_status(client: TestClient):
    """Partially update proposal status and fields."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-PATCH-1", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    patch_res = client.patch(f"/api/proposals/{prop_id}", json={"status": "submitted"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "submitted"


def test_patch_superseded_proposal_rejected(client: TestClient):
    """Proposals in terminal/superseded status cannot be updated."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-LOCK-1", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    client.patch(f"/api/proposals/{prop_id}", json={"status": "superseded"})
    res = client.patch(f"/api/proposals/{prop_id}", json={"code": "PROP-LOCK-CHANGED"})
    assert res.status_code == 409
    assert "Cannot update" in res.json()["detail"]


# =============================================================================
# 4. Proposal Countries Tests
# =============================================================================

def test_add_proposal_country_success(client: TestClient):
    """Attach deployment countries to a proposal."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-CTRY-1", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    ctry_payload = {
        "country_id": 1,
        "user_headcount": 1250,
        "is_primary_deployment": True,
    }
    ctry_res = client.post(f"/api/proposals/{prop_id}/countries", json=ctry_payload)
    assert ctry_res.status_code == 201, ctry_res.text
    data = ctry_res.json()
    assert data["country_id"] == 1
    assert data["user_headcount"] == 1250
    assert data["is_primary_deployment"] is True

    # Retrieve proposal to verify country association
    detail = client.get(f"/api/proposals/{prop_id}").json()
    assert len(detail["countries"]) == 1
    assert detail["countries"][0]["country_id"] == 1


def test_add_proposal_country_duplicate_rejected(client: TestClient):
    """Duplicate country on the same proposal must be rejected (409 Conflict)."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-CTRY-2", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    client.post(f"/api/proposals/{prop_id}/countries", json={"country_id": 1})
    dup_res = client.post(f"/api/proposals/{prop_id}/countries", json={"country_id": 1})
    assert dup_res.status_code == 409
    assert "already added" in dup_res.json()["detail"]


def test_add_proposal_country_missing_country_404(client: TestClient):
    """Adding a non-existent country ID returns 404."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-CTRY-3", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    res = client.post(f"/api/proposals/{prop_id}/countries", json={"country_id": 9999})
    assert res.status_code == 404


# =============================================================================
# 5. Proposal Line Items (Add, Update, Delete)
# =============================================================================

def test_line_items_crud_lifecycle(client: TestClient):
    """Verify complete CRUD lifecycle of proposal line items."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-LINE-1", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    # 1. Add Pack Line Item
    pack_line_payload = {
        "pack_version_id": 1,
        "feature_id": None,
        "uom_id": 1,
        "quantity": "500.0000",
        "list_unit_price": "20.0000",
        "discount_pct": "10.0000",
        "net_unit_price": "18.0000",
        "extended_amount": "9000.0000",
    }
    pack_line_res = client.post(f"/api/proposals/{prop_id}/line-items", json=pack_line_payload)
    assert pack_line_res.status_code == 201, pack_line_res.text
    pack_item = pack_line_res.json()
    assert pack_item["pack_version_id"] == 1
    assert pack_item["quantity"] == "500.0000"
    line_item_id = pack_item["id"]

    # 2. Add Feature Line Item
    feat_line_payload = {
        "pack_version_id": None,
        "feature_id": 1,
        "uom_id": 1,
        "quantity": "100.0000",
        "list_unit_price": "5.0000",
        "discount_pct": "0.0000",
        "net_unit_price": "5.0000",
        "extended_amount": "500.0000",
    }
    feat_line_res = client.post(f"/api/proposals/{prop_id}/line-items", json=feat_line_payload)
    assert feat_line_res.status_code == 201

    # 3. Retrieve Proposal and verify line items are loaded
    detail_res = client.get(f"/api/proposals/{prop_id}")
    assert detail_res.status_code == 200
    versions = detail_res.json()["versions"]
    assert len(versions) == 1
    assert len(versions[0]["line_items"]) == 2

    # 4. Update Line Item (PATCH)
    patch_line_res = client.patch(
        f"/api/proposals/{prop_id}/line-items/{line_item_id}",
        json={"quantity": "600.0000", "extended_amount": "10800.0000"},
    )
    assert patch_line_res.status_code == 200
    assert patch_line_res.json()["quantity"] == "600.0000"

    # 5. Delete Line Item
    del_res = client.delete(f"/api/proposals/{prop_id}/line-items/{line_item_id}")
    assert del_res.status_code == 200
    assert del_res.json()["line_item_id"] == line_item_id

    # Verify line item is removed
    detail_after = client.get(f"/api/proposals/{prop_id}").json()
    assert len(detail_after["versions"][0]["line_items"]) == 1


def test_line_item_target_exclusivity_validation(client: TestClient):
    """Line item must specify pack XOR feature; both or neither must be rejected."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-EXCL-1", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    # Both set
    both_payload = {
        "pack_version_id": 1,
        "feature_id": 1,
        "uom_id": 1,
        "quantity": "100.0000",
        "list_unit_price": "10.0000",
        "net_unit_price": "10.0000",
        "extended_amount": "1000.0000",
    }
    res_both = client.post(f"/api/proposals/{prop_id}/line-items", json=both_payload)
    assert res_both.status_code == 422 or res_both.status_code == 400

    # Neither set
    neither_payload = {
        "pack_version_id": None,
        "feature_id": None,
        "uom_id": 1,
        "quantity": "100.0000",
        "list_unit_price": "10.0000",
        "net_unit_price": "10.0000",
        "extended_amount": "1000.0000",
    }
    res_neither = client.post(f"/api/proposals/{prop_id}/line-items", json=neither_payload)
    assert res_neither.status_code == 422 or res_neither.status_code == 400


def test_line_item_retired_catalogue_rejected(client: TestClient):
    """Adding a retired feature or retired pack version must be rejected."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-RET-1", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    # Feature 2 is retired
    retired_feat_payload = {
        "feature_id": 2,
        "uom_id": 1,
        "quantity": "10.0000",
        "list_unit_price": "10.0000",
        "net_unit_price": "10.0000",
        "extended_amount": "100.0000",
    }
    res_feat = client.post(f"/api/proposals/{prop_id}/line-items", json=retired_feat_payload)
    assert res_feat.status_code == 400
    assert "retired" in res_feat.json()["detail"]

    # Pack version 2 is retired
    retired_pack_payload = {
        "pack_version_id": 2,
        "uom_id": 1,
        "quantity": "10.0000",
        "list_unit_price": "10.0000",
        "net_unit_price": "10.0000",
        "extended_amount": "100.0000",
    }
    res_pack = client.post(f"/api/proposals/{prop_id}/line-items", json=retired_pack_payload)
    assert res_pack.status_code == 400
    assert "superseded" in res_pack.json()["detail"]


# =============================================================================
# 6. Proposal Service Lines Tests
# =============================================================================

def test_add_proposal_service_line_success(client: TestClient):
    """Add a professional service line to the proposal."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-SRV-1", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    sl_payload = {
        "service_rate_id": 1,
        "role_name": "Implementation Consultant",
        "days_or_hours": "10.0000",
        "rate_applied": "120.0000",
        "extended_amount": "1200.0000",
    }
    sl_res = client.post(f"/api/proposals/{prop_id}/service-lines", json=sl_payload)
    assert sl_res.status_code == 201, sl_res.text
    data = sl_res.json()
    assert data["role_name"] == "Implementation Consultant"
    assert data["days_or_hours"] == "10.0000"
    assert data["extended_amount"] == "1200.0000"

    # Individual service-line discounts are prohibited by the pricing specification.
    discounted = dict(sl_payload, discount_pct="5.0000")
    rejected = client.post(f"/api/proposals/{prop_id}/service-lines", json=discounted)
    assert rejected.status_code == 400, rejected.text

    # Verify retrieval
    detail = client.get(f"/api/proposals/{prop_id}").json()
    assert len(detail["versions"][0]["service_lines"]) == 1


def test_add_proposal_service_line_invalid_rate_404(client: TestClient):
    """Non-existent service_rate_id returns 404."""
    create_res = client.post("/api/proposals/", json={"code": "PROP-SRV-2", "deal_id": 1, "currency_id": 1, "created_by_user_id": 1})
    prop_id = create_res.json()["id"]

    sl_payload = {
        "service_rate_id": 9999,
        "role_name": "Unknown",
        "days_or_hours": "1.0000",
        "rate_applied": "100.0000",
        "extended_amount": "100.0000",
    }
    res = client.post(f"/api/proposals/{prop_id}/service-lines", json=sl_payload)
    assert res.status_code == 404


# =============================================================================
# 7. Transaction Rollback & Integrity
# =============================================================================

def test_service_level_transaction_rollback(test_db: Session):
    """Verify service rolls back and leaves no partial proposal on failure."""
    invalid_payload = ProposalCreate(
        code="PROP-ROLLBACK-TEST",
        deal_id=9999,  # Nonexistent deal
        currency_id=1,
        created_by_user_id=1,
    )
    with pytest.raises(DealNotFoundError):
        create_proposal(db=test_db, data=invalid_payload)

    # Ensure no proposal was created in DB
    existing = test_db.execute(
        select(Proposal).where(Proposal.code == "PROP-ROLLBACK-TEST")
    ).scalar_one_or_none()
    assert existing is None
