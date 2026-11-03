"""Regression tests for the business reference examples (calculation explained.xlsx and the PDF).

Every expected total below is the workbook input worked out by hand, NOT the workbook's cached
result: the workbook's Tier 2 / Tier 3 "Total price (platform + subscription)" cells use a
different formula from Tier 1 (see docs/PRICING_CALCULATION_AUDIT.md), so they are not trusted.

Rates are configured through PUT /api/rates/rate-cards/target and priced through
POST /api/proposals/{id}/calculate, i.e. the same path the browser uses.
"""

from datetime import date
from decimal import Decimal
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
    Country, Currency, CustomerTier, DeploymentModel, DeploymentPricingOption, Feature, Pack,
    PackItem, PackVersion, PricingModel, PricingModelUom, Product, ProductFamily, RateCardVersion,
    UnitOfMeasure, User,
)

YEARS = 5
QTY = (10000, 20000, 30000)

# Workbook inputs (calculation explained.xlsx, Sheet1) and hand-worked expected totals.
PLATFORM = {
    "ESS": {"fee": (100000, 200000, 300000), "rate": (3, 4, 5),
            "platform_total": (500000, 1000000, 1500000), "subscription_total": (1800000, 4800000, 9000000),
            "combined": (2300000, 5800000, 10500000)},
    "NON": {"fee": (25000, 50000, 100000), "rate": (3, 4, 5),
            "platform_total": (125000, 250000, 500000), "subscription_total": (1800000, 4800000, 9000000),
            "combined": (1925000, 5050000, 9500000)},
}
PEPM = {"ESS": {"rate": (3, 4, 5), "total": (1800000, 4800000, 9000000)}}
LICENSE = {
    "ESS": {"fee": (100000, 200000, 300000), "amc": (5, 7, 10),
            "licence_total": (1000000000, 4000000000, 9000000000), "annual_amc": (50000000, 280000000, 900000000),
            "total": (1250000000, 5400000000, 13500000000)},
    "NON": {"fee": (25000, 40000, 50000), "amc": (5, 7, 10),
            "licence_total": (250000000, 800000000, 1500000000), "annual_amc": (12500000, 56000000, 150000000),
            "total": (312500000, 1080000000, 2250000000)},
}


@pytest.fixture
def wb():
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
    inr = Currency(code="INR", name="Indian Rupee", symbol="₹", decimal_places=2, status="active")
    db.add(inr)
    db.flush()
    india = Country(iso_code="IN", name="India", currency_id=inr.id, valid_from=date(2026, 1, 1), status="active")
    tiers = [CustomerTier(name=f"Tier {i}", employee_min=i * 1000, employee_max=i * 1000 + 999,
                          valid_from=date(2026, 1, 1)) for i in (1, 2, 3)]
    deps = {c: DeploymentModel(code=c, name=c.replace("_", " ").title(), status="active")
            for c in ("shared_cloud", "private_cloud", "on_premise")}
    ess = UnitOfMeasure(code="employee", name="Active Employees (with ESS)", category="uom1", status="active")
    non = UnitOfMeasure(code="active_employees_non_ess", name="Active Employees (non-ESS)", category="uom1", status="active")
    user = User(email="wb@example.test", full_name="Workbook", password_hash="!", is_active=True)
    db.add_all([india, *tiers, *deps.values(), ess, non, user])
    db.flush()
    pms = {
        "platform": PricingModel(code="platform_subscription", name="Platform + Subscription", has_fixed_component=True,
                                 has_unit_component=True, fixed_fee_basis="annual", unit_rate_basis="monthly"),
        "pepm": PricingModel(code="pepm", name="Per Employee Per Month", has_unit_component=True,
                             unit_rate_basis="monthly", uom_locked_id=ess.id),
        "license": PricingModel(code="license_amc", name="License Fee + AMC", has_unit_component=True,
                                unit_rate_basis="one_time"),
    }
    db.add_all(pms.values())
    db.flush()
    db.add_all([
        DeploymentPricingOption(deployment_model_id=deps["shared_cloud"].id, pricing_model_id=pms["platform"].id),
        DeploymentPricingOption(deployment_model_id=deps["private_cloud"].id, pricing_model_id=pms["platform"].id),
        DeploymentPricingOption(deployment_model_id=deps["shared_cloud"].id, pricing_model_id=pms["pepm"].id),
        DeploymentPricingOption(deployment_model_id=deps["private_cloud"].id, pricing_model_id=pms["pepm"].id),
        DeploymentPricingOption(deployment_model_id=deps["on_premise"].id, pricing_model_id=pms["license"].id),
        PricingModelUom(pricing_model_id=pms["license"].id, uom_id=ess.id, is_default=True),
        PricingModelUom(pricing_model_id=pms["license"].id, uom_id=non.id),
    ])
    rcv = RateCardVersion(version_no="RC-WB", name="Workbook", status="active", valid_from=date(2026, 1, 1))
    fam = ProductFamily(code="TA", name="Talent Acquisition")
    db.add_all([rcv, fam])
    db.flush()
    prod = Product(code="TA_MAX", name="TA Max", product_family_id=fam.id)
    pack = Pack(code="TA_STD", name="TA Standard", variant="standard", product_family_id=fam.id)
    db.add_all([prod, pack])
    db.flush()
    feat = Feature(code="TA_RECRUIT", name="TA Max Recruit", product_id=prod.id, classification="native")
    pv = PackVersion(pack_id=pack.id, version_no=1, status="active")
    db.add_all([feat, pv])
    db.flush()
    db.add(PackItem(pack_version_id=pv.id, feature_id=feat.id))
    db.commit()

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    ids = SimpleNamespace(inr=inr.id, india=india.id, tiers=[t.id for t in tiers], dep={k: v.id for k, v in deps.items()},
                          pm={k: v.id for k, v in pms.items()}, uom={"ESS": ess.id, "NON": non.id}, rcv=rcv.id,
                          pv=pv.id, user=user.id)
    try:
        yield SimpleNamespace(client=TestClient(app), ids=ids, Session=Session)
    finally:
        app.dependency_overrides.pop(get_db, None)
        db.close()


def save(env, dep, pm, uom, tiers, unit_rate=None, current_uom=None):
    body = {"rate_card_version_id": env.ids.rcv, "country_id": env.ids.india, "deployment_model_id": env.ids.dep[dep],
            "pricing_model_id": env.ids.pm[pm], "pack_version_id": env.ids.pv, "uom_id": env.ids.uom[uom],
            "unit_rate": None if unit_rate is None else str(unit_rate), "tier_fees": tiers}
    if current_uom:
        body["current_uom_id"] = env.ids.uom[current_uom]
    return env.client.put("/api/rates/rate-cards/target", json=body)


def price(env, tier_idx, dep, pm, uom, qty, months=YEARS * 12):
    c, ids = env.client, env.ids
    n = f"{dep}-{pm}-{uom}-{tier_idx}-{qty}-{months}"
    cust = c.post("/api/customers/", json={"code": f"C-{n}", "name": n, "country_id": ids.india,
                                           "customer_tier_id": ids.tiers[tier_idx]}).json()
    deal = c.post("/api/deals/", json={"code": f"D-{n}", "name": n, "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    prop = c.post("/api/proposals/", json={"code": f"P-{n}", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.inr,
                                           "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}).json()
    assert c.post(f"/api/proposals/{prop['id']}/countries", json={
        "country_id": ids.india, "deployment_model_id": ids.dep[dep], "pricing_model_id": ids.pm[pm],
        "is_primary_deployment": True}).status_code == 201
    ver = c.get(f"/api/proposals/{prop['id']}").json()["versions"][0]["id"]
    assert c.post(f"/api/proposals/{prop['id']}/line-items", json={
        "proposal_version_id": ver, "line_number": 1, "pack_version_id": ids.pv, "uom_id": ids.uom[uom],
        "quantity": str(qty)}).status_code == 201
    res = c.post(f"/api/proposals/{prop['id']}/calculate", json={"contract_term_months": months})
    return res


def configure_workbook(env):
    for dep in ("shared_cloud", "private_cloud"):
        for uom, cfg in PLATFORM.items():
            r = save(env, dep, "platform", uom, [{"tier_id": t, "fixed_fee": str(cfg["fee"][i]), "unit_rate": str(cfg["rate"][i])}
                                                  for i, t in enumerate(env.ids.tiers)])
            assert r.status_code == 200, r.text
        r = save(env, dep, "pepm", "ESS", [{"tier_id": t, "unit_rate": str(PEPM["ESS"]["rate"][i])} for i, t in enumerate(env.ids.tiers)])
        assert r.status_code == 200, r.text
    for uom, cfg in LICENSE.items():
        r = save(env, "on_premise", "license", uom, [{"tier_id": t, "unit_rate": str(cfg["fee"][i]), "amc_percentage": str(cfg["amc"][i])}
                                                      for i, t in enumerate(env.ids.tiers)])
        assert r.status_code == 200, r.text


@pytest.mark.parametrize("dep", ["shared_cloud", "private_cloud"])
@pytest.mark.parametrize("uom", ["ESS", "NON"])
@pytest.mark.parametrize("tier", [0, 1, 2])
def test_platform_subscription_workbook(wb, dep, uom, tier):
    configure_workbook(wb)
    res = price(wb, tier, dep, "platform", uom, QTY[tier])
    assert res.status_code == 200, res.text
    li = res.json()["snapshot_payload"]["all_subscription_line_items"][0]
    cfg = PLATFORM[uom]
    assert li["contract_platform_fee"] == cfg["platform_total"][tier]
    assert li["contract_consumption_fee"] == cfg["subscription_total"][tier]
    assert li["contract_subscription_before_discount"] == cfg["combined"][tier]
    # PDF annual figure: platform fee + rate x monthly volume x 12
    assert li["item_subscription_before_discount"] == cfg["fee"][tier] + cfg["rate"][tier] * QTY[tier] * 12


@pytest.mark.parametrize("dep", ["shared_cloud", "private_cloud"])
@pytest.mark.parametrize("tier", [0, 1, 2])
def test_pepm_workbook(wb, dep, tier):
    configure_workbook(wb)
    res = price(wb, tier, dep, "pepm", "ESS", QTY[tier])
    assert res.status_code == 200, res.text
    li = res.json()["snapshot_payload"]["all_subscription_line_items"][0]
    assert li["contract_subscription_before_discount"] == PEPM["ESS"]["total"][tier]
    assert li["contract_platform_fee"] == 0


def test_pepm_non_ess_rate_is_rejected_by_the_locked_uom(wb):
    r = save(wb, "shared_cloud", "pepm", "NON", [{"tier_id": wb.ids.tiers[0], "unit_rate": "3"}])
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]


@pytest.mark.parametrize("uom", ["ESS", "NON"])
@pytest.mark.parametrize("tier", [0, 1, 2])
def test_license_amc_workbook(wb, uom, tier):
    configure_workbook(wb)
    res = price(wb, tier, "on_premise", "license", uom, QTY[tier])
    assert res.status_code == 200, res.text
    li = res.json()["snapshot_payload"]["all_subscription_line_items"][0]
    cfg = LICENSE[uom]
    assert li["contract_platform_fee"] == cfg["licence_total"][tier]                 # one-time licence total
    assert li["annual_consumption_fee"] == cfg["annual_amc"][tier]                  # AMC % applied once, not /100 twice
    assert li["contract_consumption_fee"] == cfg["annual_amc"][tier] * YEARS
    assert li["contract_subscription_before_discount"] == cfg["total"][tier]
    assert li["amc_percentage"] == cfg["amc"][tier]


def test_workbook_tier2_cached_total_uses_a_different_formula(wb):
    """The workbook's D12 (=D3+D9) gives 1,160,000 for Tier 2; the consistent formula gives 5,800,000."""
    configure_workbook(wb)
    li = price(wb, 1, "shared_cloud", "platform", "ESS", QTY[1]).json()["snapshot_payload"]["all_subscription_line_items"][0]
    assert li["item_subscription_before_discount"] == 1160000   # = one year: 200,000 + 4 x 20,000 x 12
    assert li["contract_subscription_before_discount"] == 5800000


def test_formula_does_not_depend_on_pricing_model_names(wb):
    """Rename every pricing model: the totals must not change (the engine reads billing bases, not names)."""
    configure_workbook(wb)
    s = wb.Session()
    for pm in s.execute(select(PricingModel)).scalars():
        pm.code, pm.name = f"model_{pm.id}", f"Renamed model {pm.id}"
    s.commit()
    s.close()
    lic = price(wb, 2, "on_premise", "license", "ESS", QTY[2]).json()["snapshot_payload"]["all_subscription_line_items"][0]
    plat = price(wb, 2, "shared_cloud", "platform", "NON", QTY[2]).json()["snapshot_payload"]["all_subscription_line_items"][0]
    assert lic["contract_subscription_before_discount"] == LICENSE["ESS"]["total"][2]
    assert plat["contract_subscription_before_discount"] == PLATFORM["NON"]["combined"][2]


def test_licence_without_amc_percentage_is_an_error_not_zero(wb):
    r = save(wb, "on_premise", "license", "ESS", [{"tier_id": wb.ids.tiers[0], "unit_rate": "100000"}])
    assert r.status_code == 200, r.text
    res = price(wb, 0, "on_premise", "license", "ESS", 10)
    assert res.status_code == 422
    assert "AMC" in res.json()["detail"]


def test_amc_is_rejected_for_a_periodic_unit_rate(wb):
    r = save(wb, "shared_cloud", "platform", "ESS", [{"tier_id": wb.ids.tiers[0], "fixed_fee": "1", "unit_rate": "1", "amc_percentage": "5"}])
    assert r.status_code == 400
    assert "AMC" in r.json()["detail"]


def test_ess_and_non_ess_schedules_are_independent(wb):
    configure_workbook(wb)
    # Editing the non-ESS schedule must not touch the ESS schedule of the same pack.
    r = save(wb, "shared_cloud", "platform", "NON", [{"tier_id": t, "fixed_fee": "1", "unit_rate": "1"} for t in wb.ids.tiers])
    assert r.status_code == 200, r.text
    li = price(wb, 0, "shared_cloud", "platform", "ESS", QTY[0]).json()["snapshot_payload"]["all_subscription_line_items"][0]
    assert li["contract_subscription_before_discount"] == PLATFORM["ESS"]["combined"][0]


def test_moving_a_schedule_onto_an_existing_uom_is_a_conflict(wb):
    configure_workbook(wb)
    r = save(wb, "shared_cloud", "platform", "ESS", [{"tier_id": wb.ids.tiers[0], "fixed_fee": "1", "unit_rate": "1"}],
             current_uom="NON")
    assert r.status_code == 409
    assert "already has a rate schedule" in r.json()["detail"]


def test_deleting_one_uom_schedule_keeps_the_other(wb):
    configure_workbook(wb)
    ids = wb.ids
    r = wb.client.delete("/api/rates/rate-cards/group", params={
        "rate_card_version_id": ids.rcv, "country_id": ids.india, "deployment_model_id": ids.dep["shared_cloud"],
        "pricing_model_id": ids.pm["platform"], "pack_version_id": ids.pv, "uom_id": ids.uom["NON"]})
    assert r.status_code == 204, r.text
    assert price(wb, 0, "shared_cloud", "platform", "ESS", QTY[0]).status_code == 200
    assert price(wb, 0, "shared_cloud", "platform", "NON", QTY[0]).status_code == 422


@pytest.mark.parametrize("months, platform, subscription", [
    (12, 100000, 360000),      # one year
    (36, 300000, 1080000),     # three years
    (18, 150000, 540000),      # partial year: platform pro-rated by months/12 (current rule, needs sign-off)
])
def test_contract_durations(wb, months, platform, subscription):
    configure_workbook(wb)
    li = price(wb, 0, "shared_cloud", "platform", "ESS", QTY[0], months=months).json()["snapshot_payload"]["all_subscription_line_items"][0]
    assert li["contract_platform_fee"] == platform
    assert li["contract_consumption_fee"] == subscription
