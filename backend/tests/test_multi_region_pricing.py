"""Multi-region proposals (Proposal Pricing Model PDF, section 3).

Each product is priced in its own country block (country + deployment + pricing model), in that
country's rate card and currency, with that country's service rates; the proposal is consolidated
into the reporting currency with the FX master. All figures are test fixtures worked out by hand.

  India (INR)  TA feature : 380,000 + 80 x 250 x 12  = 620,000 INR ; services 8 d x 12,000 = 96,000 INR
  USA   (USD)  TO feature : 100,000 + 5 x 1,000 x 12 = 160,000 USD ; services 2 d x 1,200  =  2,400 USD
  Germany(EUR) TD feature :  50,000 + 4 x 500 x 12   =  74,000 EUR
  FX: 1 INR = 0.012 USD ; 1 EUR = 1.08 USD
  USD totals: India 716,000 x 0.012 = 8,592 ; USA 162,400 ; Germany 74,000 x 1.08 = 79,920 -> 250,912
"""

from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    Country, Currency, CustomerTier, DeploymentModel, DeploymentPricingOption, Feature, FxRate,
    PricingModel, Product, ProductFamily, RateCard, RateCardVersion, UnitOfMeasure, User,
)
from app.models.rate_card import ServiceRate


@pytest.fixture
def mr():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    @event.listens_for(Session, "before_flush")
    def _ids(sess, ctx, inst):
        counters = {}
        for obj in sess.new:
            if hasattr(obj, "id") and getattr(obj, "id", None) is None:
                cls = type(obj)
                if cls not in counters:
                    counters[cls] = sess.execute(select(func.coalesce(func.max(cls.id), 0))).scalar() or 0
                counters[cls] += 1
                obj.id = counters[cls]

    db = Session()
    cur = {c: Currency(code=c, name=c, symbol=c, decimal_places=2, status="active") for c in ("INR", "USD", "EUR")}
    db.add_all(cur.values())
    db.flush()
    ctry = {
        "IN": Country(iso_code="IN", name="India", currency_id=cur["INR"].id, valid_from=date(2026, 1, 1), status="active"),
        "US": Country(iso_code="US", name="United States", currency_id=cur["USD"].id, valid_from=date(2026, 1, 1), status="active"),
        "DE": Country(iso_code="DE", name="Germany", currency_id=cur["EUR"].id, valid_from=date(2026, 1, 1), status="active"),
    }
    tier = CustomerTier(name="Tier 1", employee_min=0, valid_from=date(2026, 1, 1))
    dep = DeploymentModel(code="shared_cloud", name="Shared Cloud", status="active")
    uom = UnitOfMeasure(code="candidate", name="Candidate Inflow", category="uom2", status="active")
    user = User(email="mr@example.test", full_name="MR", password_hash="!", is_active=True)
    db.add_all([*ctry.values(), tier, dep, uom, user])
    db.flush()
    pm = PricingModel(code="platform_subscription", name="Platform + Subscription", has_fixed_component=True,
                      has_unit_component=True, fixed_fee_basis="annual", unit_rate_basis="monthly")
    db.add(pm)
    db.flush()
    db.add(DeploymentPricingOption(deployment_model_id=dep.id, pricing_model_id=pm.id))
    rcv = RateCardVersion(version_no="RC-MR", name="MR", status="active", valid_from=date(2026, 1, 1))
    fam = ProductFamily(code="TALENT", name="Talent")
    db.add_all([rcv, fam])
    db.flush()
    prods = {code: Product(code=code, name=name, product_family_id=fam.id)
             for code, name in (("TA", "Talent Acquisition"), ("TO", "Talent Optimization"), ("TD", "Talent Development"))}
    db.add_all(prods.values())
    db.flush()
    feats = {code: Feature(code=f"{code}_F", name=f"{code} feature", product_id=p.id, classification="native")
             for code, p in prods.items()}
    db.add_all(feats.values())
    db.flush()

    def rate(country, feature, fixed, unit):
        db.add(RateCard(rate_card_version_id=rcv.id, country_id=ctry[country].id, deployment_model_id=dep.id,
                        pricing_model_id=pm.id, tier_id=tier.id, uom_id=uom.id, feature_id=feats[feature].id,
                        currency_id=ctry[country].currency_id, fixed_fee=fixed, unit_rate=unit))

    rate("IN", "TA", 380000, 80)
    rate("US", "TO", 100000, 5)
    rate("DE", "TD", 50000, 4)
    rate("US", "TA", 90000, 2)  # TA is also sold in the USA (same product, second country)
    db.add_all([
        FxRate(from_currency_id=cur["INR"].id, to_currency_id=cur["USD"].id, rate="0.012", effective_date=date(2026, 1, 1), rate_source="test"),
        FxRate(from_currency_id=cur["EUR"].id, to_currency_id=cur["USD"].id, rate="1.08", effective_date=date(2026, 1, 1), rate_source="test"),
    ])
    srv_in = ServiceRate(role_name="Consultant", country_id=ctry["IN"].id, currency_id=cur["INR"].id, hourly_rate=1500,
                         hours_per_day=8, valid_from=date(2026, 1, 1), status="active")
    srv_us = ServiceRate(role_name="Consultant", country_id=ctry["US"].id, currency_id=cur["USD"].id, hourly_rate=150,
                         hours_per_day=8, valid_from=date(2026, 1, 1), status="active")
    db.add_all([srv_in, srv_us])
    db.commit()

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    ids = SimpleNamespace(cur={k: v.id for k, v in cur.items()}, ctry={k: v.id for k, v in ctry.items()}, tier=tier.id,
                          dep=dep.id, pm=pm.id, uom=uom.id, user=user.id, rcv=rcv.id,
                          feat={k: v.id for k, v in feats.items()}, srv_in=srv_in.id, srv_us=srv_us.id)
    try:
        yield SimpleNamespace(client=TestClient(app), ids=ids)
    finally:
        app.dependency_overrides.pop(get_db, None)
        db.close()


def _proposal(mr, countries=("IN", "US", "DE"), reporting="USD"):
    c, ids = mr.client, mr.ids
    cust = c.post("/api/customers/", json={"code": "MR-C", "name": "Global Co", "country_id": ids.ctry["IN"], "customer_tier_id": ids.tier}).json()
    deal = c.post("/api/deals/", json={"code": "MR-D", "name": "Global", "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    prop = c.post("/api/proposals/", json={"code": "MR-P", "deal_id": deal["id"], "customer_id": cust["id"],
                                           "currency_id": ids.cur[reporting], "created_by_user_id": ids.user,
                                           "rate_card_version_id": ids.rcv}).json()
    blocks = {}
    for i, iso in enumerate(countries):
        r = c.post(f"/api/proposals/{prop['id']}/countries", json={
            "country_id": ids.ctry[iso], "deployment_model_id": ids.dep, "pricing_model_id": ids.pm, "is_primary_deployment": i == 0})
        assert r.status_code == 201, r.text
        blocks[iso] = r.json()["id"]
    return prop["id"], blocks


def _line(mr, pid, block, feature, qty):
    return mr.client.post(f"/api/proposals/{pid}/line-items", json={
        "proposal_country_id": block, "feature_id": mr.ids.feat[feature], "uom_id": mr.ids.uom, "quantity": str(qty)})


def _service(mr, pid, block, rate_id, days):
    return mr.client.post(f"/api/proposals/{pid}/service-lines", json={
        "proposal_country_id": block, "role_name": "Consultant", "service_rate_id": rate_id, "days_or_hours": str(days)})


def test_three_regions_priced_in_their_own_currency_and_consolidated(mr):
    pid, b = _proposal(mr)
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    assert _line(mr, pid, b["US"], "TO", 1000).status_code == 201
    assert _line(mr, pid, b["DE"], "TD", 500).status_code == 201
    assert _service(mr, pid, b["IN"], mr.ids.srv_in, 8).status_code == 201
    assert _service(mr, pid, b["US"], mr.ids.srv_us, 2).status_code == 201

    res = mr.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12})
    assert res.status_code == 200, res.text
    payload = res.json()["snapshot_payload"]
    products = {p["product_code"]: p for p in payload["products"]}

    assert [p["country_iso"] for p in payload["products"]] == ["IN", "US", "DE"]  # primary first
    assert products["TA"]["native_currency_code"] == "INR" and products["TA"]["product_native_total"] == 716000
    assert products["TA"]["service_subtotal_before_discount"] == 96000
    assert products["TA"]["product_reporting_total"] == 8592
    assert products["TO"]["native_currency_code"] == "USD" and products["TO"]["product_native_total"] == 162400
    assert products["TO"]["fx_rate_multiplier"] == 1 and products["TO"]["product_reporting_total"] == 162400  # no double conversion
    assert products["TD"]["native_currency_code"] == "EUR" and products["TD"]["product_native_total"] == 74000
    assert products["TD"]["product_reporting_total"] == 79920
    assert payload["total_proposal_reporting_currency"] == 250912
    assert not any("NOT priced" in w for w in payload["warnings"])
    assert {li["country_iso"] for li in payload["all_subscription_line_items"]} == {"IN", "US", "DE"}


def test_same_product_in_two_countries_gets_country_keys_and_its_own_discount(mr):
    pid, b = _proposal(mr, countries=("IN", "US"))
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    assert _line(mr, pid, b["US"], "TA", 1000).status_code == 201  # same feature, second country: allowed

    res = mr.client.post(f"/api/proposals/{pid}/calculate", json={
        "contract_term_months": 12, "product_subscription_discounts": {"TA@US": "10"}})
    assert res.status_code == 200, res.text
    products = {p["product_key"]: p for p in res.json()["snapshot_payload"]["products"]}
    assert set(products) == {"TA@IN", "TA@US"}
    assert products["TA@IN"]["subscription_discount_pct"] == 0 and products["TA@IN"]["product_native_total"] == 620000
    # USA: 90,000 + 2 x 1,000 x 12 = 114,000 USD, less 10% = 102,600
    assert products["TA@US"]["product_native_total"] == 102600

    bad = mr.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12, "product_subscription_discounts": {"TA": "10"}})
    assert bad.status_code == 400 and "TA@IN" in bad.json()["detail"]


def test_single_country_keys_stay_plain_product_codes(mr):
    pid, b = _proposal(mr, countries=("IN",), reporting="INR")
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    res = mr.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12, "product_subscription_discounts": {"TA": "5"}})
    assert res.status_code == 200, res.text
    product = res.json()["snapshot_payload"]["products"][0]
    assert product["product_key"] == "TA" and product["subscription_total_after_discount"] == 589000


def test_same_feature_twice_in_one_country_is_still_rejected(mr):
    pid, b = _proposal(mr, countries=("IN", "US"))
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    dup = _line(mr, pid, b["IN"], "TA", 10)
    assert dup.status_code == 409 and "for this country" in dup.json()["detail"]


def test_line_without_country_block_belongs_to_the_primary_country(mr):
    pid, b = _proposal(mr, countries=("IN", "US"))
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    # No proposal_country_id: same as the primary block (India), so this is a duplicate.
    dup = mr.client.post(f"/api/proposals/{pid}/line-items", json={"feature_id": mr.ids.feat["TA"], "uom_id": mr.ids.uom, "quantity": "1"})
    assert dup.status_code == 409


def test_service_rate_must_belong_to_the_lines_country(mr):
    pid, b = _proposal(mr, countries=("IN", "US"))
    wrong = _service(mr, pid, b["US"], mr.ids.srv_in, 2)
    assert wrong.status_code == 400 and "belongs to country_id" in wrong.json()["detail"]


def test_country_block_of_another_proposal_is_rejected(mr):
    pid, b = _proposal(mr, countries=("IN",))
    r = mr.client.post(f"/api/proposals/{pid}/line-items", json={
        "proposal_country_id": 999, "feature_id": mr.ids.feat["TA"], "uom_id": mr.ids.uom, "quantity": "1"})
    assert r.status_code == 404


def test_country_block_with_lines_cannot_be_deleted(mr):
    pid, b = _proposal(mr, countries=("IN", "US"))
    line = _line(mr, pid, b["US"], "TO", 10).json()
    r = mr.client.delete(f"/api/proposals/{pid}/countries/{b['US']}")
    assert r.status_code == 409 and "remove those lines first" in r.json()["detail"]
    assert mr.client.delete(f"/api/proposals/{pid}/line-items/{line['id']}").status_code in (200, 204)
    assert mr.client.delete(f"/api/proposals/{pid}/countries/{b['US']}").status_code in (200, 204)


def test_moving_a_line_to_another_country_reprices_it(mr):
    pid, b = _proposal(mr, countries=("IN", "US"))
    line = _line(mr, pid, b["IN"], "TA", 1000).json()
    r = mr.client.patch(f"/api/proposals/{pid}/line-items/{line['id']}", json={"proposal_country_id": b["US"]})
    assert r.status_code == 200, r.text
    product = mr.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12}).json()["snapshot_payload"]["products"][0]
    assert product["country_iso"] == "US" and product["native_currency_code"] == "USD" and product["product_native_total"] == 114000
