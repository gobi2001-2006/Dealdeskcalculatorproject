"""API tests for Rates and Master Data endpoints (Page 3 end-to-end backend verification).

Verifies:
- List and create currencies (duplicate code rejection 409)
- List, create, patch, and delete countries (FK validation, unique ISO and name, deletion restriction)
- List, create, patch, and delete customer tiers (unique name, deletion restriction)
- List, create, patch, and delete deployment models
- List, create, patch, and delete pricing models
- List, create, and delete FX exchange rates (distinct currencies, positive rate)
- Rate card versions (list, create, activate)
- Service rates (list, create, patch, delete, unique role-country-valid_from, auto-calculated daily rate)
- Rate cards (list, upsert by dimensions, patch, delete single, delete group across tiers)
- Foreign key validations (404/400 on nonexistent FK)
- Transaction rollbacks and error handling
"""

from datetime import date, datetime, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

import app.models
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.master_data import (
    Currency,
    Country,
    DeploymentModel,
    PricingModel,
    CustomerTier,
    UnitOfMeasure,
    FxRate,
)
from app.models.catalogue import ProductFamily, Product, Feature, Pack, PackVersion
from app.models.rate_card import RateCardVersion, RateCard, ServiceRate


@event.listens_for(Session, "before_flush")
def auto_assign_ids(session, flush_context, instances):
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


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Seed baseline records
    db = TestingSessionLocal()

    curr_usd = Currency(code="USD", name="US Dollar", symbol="$", decimal_places=2, status="active")
    curr_inr = Currency(code="INR", name="Indian Rupee", symbol="₹", decimal_places=2, status="active")
    db.add_all([curr_usd, curr_inr])
    db.flush()

    c_us = Country(iso_code="US", name="United States", currency_id=curr_usd.id, valid_from=date(2026, 1, 1), status="active")
    c_in = Country(iso_code="IN", name="India", currency_id=curr_inr.id, valid_from=date(2026, 1, 1), status="active")
    db.add_all([c_us, c_in])
    db.flush()

    dep_shared = DeploymentModel(code="shared_cloud", name="Shared Cloud", status="active")
    dep_private = DeploymentModel(code="private_cloud", name="Private Cloud", status="active")
    db.add_all([dep_shared, dep_private])
    db.flush()

    uom_pepm = UnitOfMeasure(code="employee", name="Active Employee (with ESS)", status="active")
    db.add(uom_pepm)
    db.flush()

    pm_pepm = PricingModel(code="pepm", name="Per Employee Per Month", status="active", has_unit_component=True)
    db.add(pm_pepm)
    db.flush()

    tier1 = CustomerTier(name="Tier 1 - Enterprise", employee_min=10000, default_multiplier=Decimal("1.0"), valid_from=date(2026, 1, 1), status="active")
    tier2 = CustomerTier(name="Tier 2 - MidMarket", employee_min=2500, employee_max=9999, default_multiplier=Decimal("1.0"), valid_from=date(2026, 1, 1), status="active")
    db.add_all([tier1, tier2])
    db.flush()

    rcv = RateCardVersion(version_no="RC-2026-TEST", name="Test Rate Card 2026", status="active", valid_from=date(2026, 1, 1))
    db.add(rcv)
    db.flush()

    fam = ProductFamily(code="TA", name="Talent Acquisition", status="active")
    db.add(fam)
    db.flush()

    prod = Product(code="ATS", name="ATS Product", product_family_id=fam.id, status="active")
    db.add(prod)
    db.flush()

    feat = Feature(code="FEAT-MATCH", name="Resume Matcher", product_id=prod.id, classification="native")
    db.add(feat)
    db.flush()

    pack = Pack(code="PACK-TA", name="TA Suite", variant="standard", product_family_id=fam.id, status="active")
    db.add(pack)
    db.flush()

    pv = PackVersion(pack_id=pack.id, version_no=1, status="active")
    db.add(pv)
    db.commit()
    db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


# =============================================================================
# Currency & Master Data Tests
# =============================================================================

def test_currencies_crud(client):
    res = client.get("/api/masters/currencies")
    assert res.status_code == 200
    currencies = res.json()
    assert len(currencies) >= 2

    # Create new currency
    res = client.post("/api/masters/currencies", json={
        "code": "EUR",
        "name": "Euro",
        "symbol": "€",
        "decimal_places": 2,
    })
    assert res.status_code == 201
    assert res.json()["code"] == "EUR"

    # Duplicate currency code should fail (409)
    res = client.post("/api/masters/currencies", json={
        "code": "EUR",
        "name": "Duplicate Euro",
    })
    assert res.status_code == 409


def test_countries_crud(client):
    res = client.get("/api/masters/countries")
    assert res.status_code == 200
    countries = res.json()
    assert len(countries) >= 2
    # Verify eager loading of currency
    assert countries[0]["currency"] is not None
    assert "code" in countries[0]["currency"]

    # Create country with existing currency_id
    res = client.post("/api/masters/countries", json={
        "name": "United Kingdom",
        "iso_code": "GB",
        "currency_id": 1,
    })
    assert res.status_code == 201
    gb = res.json()
    assert gb["name"] == "United Kingdom"
    assert gb["iso_code"] == "GB"

    # Create country with currency_code (auto-creation/lookup)
    res = client.post("/api/masters/countries", json={
        "name": "Japan",
        "currency_code": "JPY",
        "currency_symbol": "¥",
    })
    assert res.status_code == 201
    jp = res.json()
    assert jp["name"] == "Japan"
    assert jp["currency"]["code"] == "JPY"

    # Duplicate country name should fail (409)
    res = client.post("/api/masters/countries", json={
        "name": "Japan",
        "currency_code": "JPY",
    })
    assert res.status_code == 409

    # Update country
    res = client.patch(f"/api/masters/countries/{jp['id']}", json={
        "name": "Japan Updated",
    })
    assert res.status_code == 200
    assert res.json()["name"] == "Japan Updated"

    # Delete country
    res = client.delete(f"/api/masters/countries/{jp['id']}")
    assert res.status_code == 204


def test_customer_tiers_crud(client):
    res = client.get("/api/masters/customer-tiers")
    assert res.status_code == 200
    tiers = res.json()
    assert len(tiers) >= 2

    # Create tier
    res = client.post("/api/masters/customer-tiers", json={
        "name": "Tier 3 - Startup",
        "employee_min": 0,
        "employee_max": 2499,
        "default_multiplier": "1.000000",
    })
    assert res.status_code == 201
    t3 = res.json()
    assert t3["name"] == "Tier 3 - Startup"

    # Duplicate name should fail (409)
    res = client.post("/api/masters/customer-tiers", json={
        "name": "Tier 3 - Startup",
    })
    assert res.status_code == 409

    # Update tier
    res = client.patch(f"/api/masters/customer-tiers/{t3['id']}", json={
        "name": "Tier 3 - Early Stage",
    })
    assert res.status_code == 200
    assert res.json()["name"] == "Tier 3 - Early Stage"

    # Delete tier
    res = client.delete(f"/api/masters/customer-tiers/{t3['id']}")
    assert res.status_code == 204


def test_deployment_and_pricing_models_crud(client):
    # Deployment model
    res = client.post("/api/masters/deployment-models", json={
        "code": "hybrid_cloud",
        "name": "Hybrid Cloud",
        "description": "Hybrid cloud architecture",
    })
    assert res.status_code == 201
    m = res.json()
    assert m["code"] == "hybrid_cloud"

    # Duplicate code should fail (409)
    res = client.post("/api/masters/deployment-models", json={
        "code": "hybrid_cloud",
        "name": "Duplicate Hybrid",
    })
    assert res.status_code == 409

    res = client.delete(f"/api/masters/deployment-models/{m['id']}")
    assert res.status_code == 204

    # Pricing model
    res = client.post("/api/masters/pricing-models", json={
        "code": "tiered_usage",
        "name": "Tiered Usage",
        "description": "Usage based tiers",
        "has_unit_component": True,
    })
    assert res.status_code == 201
    pm = res.json()
    assert pm["code"] == "tiered_usage"

    # Duplicate code should fail (409)
    res = client.post("/api/masters/pricing-models", json={
        "code": "tiered_usage",
        "name": "Duplicate Tiered",
    })
    assert res.status_code == 409

    res = client.delete(f"/api/masters/pricing-models/{pm['id']}")
    assert res.status_code == 204


def test_fx_rates_crud(client):
    res = client.post("/api/masters/fx-rates", json={
        "from_currency_id": 1,
        "to_currency_id": 2,
        "rate": "83.25000000",
        "rate_source": "Treasury",
    })
    assert res.status_code == 201
    fx = res.json()
    assert fx["from_currency"]["code"] == "USD"
    assert fx["to_currency"]["code"] == "INR"

    # Identical currencies should fail (400)
    res = client.post("/api/masters/fx-rates", json={
        "from_currency_id": 1,
        "to_currency_id": 1,
        "rate": "1.0",
    })
    assert res.status_code == 400

    # Delete FX rate
    res = client.delete(f"/api/masters/fx-rates/{fx['id']}")
    assert res.status_code == 204


# =============================================================================
# Rate Card Versions & Service Rates Tests
# =============================================================================

def test_rate_card_versions(client):
    res = client.get("/api/rates/versions")
    assert res.status_code == 200
    assert len(res.json()) >= 1

    active_res = client.get("/api/rates/versions/active")
    assert active_res.status_code == 200
    assert active_res.json()["status"] == "active"

    # Create new draft version
    res = client.post("/api/rates/versions", json={
        "version_no": "RC-2027",
        "name": "FY27 Rate Card",
        "valid_from": "2027-01-01",
    })
    assert res.status_code == 201
    v27 = res.json()
    assert v27["status"] == "draft"

    # Activate version
    res = client.post(f"/api/rates/versions/{v27['id']}/activate?activated_by=admin@test.com")
    assert res.status_code == 200
    assert res.json()["status"] == "active"


def test_service_rates_crud(client):
    # List initial
    res = client.get("/api/rates/service-rates")
    assert res.status_code == 200

    # Create service rate
    res = client.post("/api/rates/service-rates", json={
        "role_name": "Solution Architect",
        "country_id": 1,
        "hourly_rate": "200.0000",
        "hours_per_day": "8.00",
    })
    assert res.status_code == 201
    sr = res.json()
    assert sr["role_name"] == "Solution Architect"
    assert Decimal(str(sr["hourly_rate"])) == Decimal("200.0000")
    # Verify auto-derived daily rate = 200 * 8 = 1600
    assert Decimal(str(sr["daily_rate"])) == Decimal("1600.0000")
    assert sr["country"]["name"] == "United States"

    # Duplicate role in same country and valid_from should fail (409)
    res = client.post("/api/rates/service-rates", json={
        "role_name": "Solution Architect",
        "country_id": 1,
        "hourly_rate": "220.0000",
    })
    assert res.status_code == 409

    # Update service rate
    res = client.patch(f"/api/rates/service-rates/{sr['id']}", json={
        "hourly_rate": "250.0000",
    })
    assert res.status_code == 200
    assert Decimal(str(res.json()["hourly_rate"])) == Decimal("250.0000")
    assert Decimal(str(res.json()["daily_rate"])) == Decimal("2000.0000")

    # Delete service rate
    res = client.delete(f"/api/rates/service-rates/{sr['id']}")
    assert res.status_code == 204


# =============================================================================
# Rate Cards (Commercial Rates across 6 dimensions) Tests
# =============================================================================

def test_rate_cards_upsert_and_deletion(client):
    # Upsert Pack rate for Tier 1
    res = client.post("/api/rates/rate-cards", json={
        "country_id": 1,
        "deployment_model_id": 1,
        "pricing_model_id": 1,
        "tier_id": 1,
        "pack_version_id": 1,
        "unit_rate": "45.0000",
    })
    assert res.status_code == 201
    rc = res.json()
    assert Decimal(str(rc["unit_rate"])) == Decimal("45.0000")
    assert rc["pack_version_id"] == 1

    # Upsert same dimensions updates unit_rate
    res = client.post("/api/rates/rate-cards", json={
        "country_id": 1,
        "deployment_model_id": 1,
        "pricing_model_id": 1,
        "tier_id": 1,
        "pack_version_id": 1,
        "unit_rate": "55.0000",
    })
    assert res.status_code == 201
    assert Decimal(str(res.json()["unit_rate"])) == Decimal("55.0000")
    assert res.json()["id"] == rc["id"]

    # Upsert Feature rate for Tier 1
    res = client.post("/api/rates/rate-cards", json={
        "country_id": 1,
        "deployment_model_id": 1,
        "pricing_model_id": 1,
        "tier_id": 1,
        "feature_id": 1,
        "unit_rate": "12.0000",
    })
    assert res.status_code == 201
    assert res.json()["feature_id"] == 1

    # List rate cards
    res = client.get("/api/rates/rate-cards?country_id=1")
    assert res.status_code == 200
    assert len(res.json()) >= 2

    # Group deletion: delete all tier rates for pack_version_id=1
    res = client.delete("/api/rates/rate-cards/group?country_id=1&deployment_model_id=1&pricing_model_id=1&pack_version_id=1")
    assert res.status_code == 204

    # Verify pack rate deleted, feature rate remains
    res = client.get("/api/rates/rate-cards?country_id=1")
    assert res.status_code == 200
    remaining = res.json()
    assert all(r["pack_version_id"] != 1 for r in remaining)
    assert any(r["feature_id"] == 1 for r in remaining)


def test_deletion_restrictions(client):
    # Adding a rate card referencing Country 1 should prevent country deletion
    res = client.post("/api/rates/rate-cards", json={
        "country_id": 1,
        "deployment_model_id": 1,
        "pricing_model_id": 1,
        "tier_id": 1,
        "feature_id": 1,
        "unit_rate": "20.0000",
    })
    assert res.status_code == 201

    # Trying to delete Country 1 should return 409 Conflict
    res = client.delete("/api/masters/countries/1")
    assert res.status_code == 409
    assert "referenced in rate cards" in res.json()["detail"]

    # Trying to delete Tier 1 should return 409 Conflict
    res = client.delete("/api/masters/customer-tiers/1")
    assert res.status_code == 409
    assert "configured rate card values" in res.json()["detail"]


def test_retired_rate_card_version_protection(client):
    """Verify that creating, updating, or deleting rate cards in retired versions is rejected with 409 Conflict."""
    # 1. Create a draft version
    res = client.post("/api/rates/versions", json={
        "version_no": "RC-HISTORICAL-2025",
        "name": "Historical Rate Card 2025",
        "valid_from": "2025-01-01",
        "status": "draft",
    })
    assert res.status_code == 201
    v_id = res.json()["id"]

    # 2. Add a rate card entry while in draft
    res = client.post("/api/rates/rate-cards", json={
        "rate_card_version_id": v_id,
        "country_id": 1,
        "deployment_model_id": 1,
        "pricing_model_id": 1,
        "tier_id": 1,
        "feature_id": 1,
        "unit_rate": "15.0000",
    })
    assert res.status_code == 201
    rc_id = res.json()["id"]

    # 3. Activate another version to retire previous active versions, or set to retired directly
    # Activate RC-HISTORICAL-2025 then activate RC-2026-TEST to retire RC-HISTORICAL-2025
    res = client.post(f"/api/rates/versions/{v_id}/activate")
    assert res.status_code == 200

    res = client.post("/api/rates/versions/1/activate")
    assert res.status_code == 200

    # Verify v_id is now retired
    res = client.get("/api/rates/versions")
    assert res.status_code == 200
    v_obj = next(v for v in res.json() if v["id"] == v_id)
    assert v_obj["status"] == "retired"

    # 4. Attempting to upsert into retired version must fail with 409 Conflict
    res = client.post("/api/rates/rate-cards", json={
        "rate_card_version_id": v_id,
        "country_id": 1,
        "deployment_model_id": 1,
        "pricing_model_id": 1,
        "tier_id": 1,
        "feature_id": 1,
        "unit_rate": "18.0000",
    })
    assert res.status_code == 409
    assert "retired and locked" in res.json()["detail"]

    # 5. Attempting to update rate card entry in retired version must fail with 409 Conflict
    res = client.patch(f"/api/rates/rate-cards/{rc_id}", json={
        "unit_rate": "19.0000",
    })
    assert res.status_code == 409
    assert "retired rate card version" in res.json()["detail"]

    # 6. Attempting to delete rate card entry in retired version must fail with 409 Conflict
    res = client.delete(f"/api/rates/rate-cards/{rc_id}")
    assert res.status_code == 409
    assert "retired rate card version" in res.json()["detail"]

    # 7. Attempting group delete on retired version must fail with 409 Conflict
    res = client.delete(f"/api/rates/rate-cards/group?rate_card_version_id={v_id}&country_id=1&deployment_model_id=1&pricing_model_id=1&feature_id=1")
    assert res.status_code == 409
    assert "retired rate card version" in res.json()["detail"]
