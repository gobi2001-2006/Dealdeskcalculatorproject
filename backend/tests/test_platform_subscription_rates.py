"""Platform + Subscription rate card: tier platform fees, one UOM and one subscription rate per item.

Covers:
  - allowed-UOM rules (locked UOM, pricing_model_uoms mapping, unrestricted) through the API
  - PUT /rates/rate-cards/target: create, reopen, edit, change UOM, clear a tier, rejections
  - pricing engine: tier selection, separate platform / subscription totals, billing bases

All values are test fixtures, not business rates.
"""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (registers every table)
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    Country,
    Currency,
    Customer,
    CustomerTier,
    Deal,
    DeploymentModel,
    DeploymentPricingOption,
    Feature,
    Pack,
    PackVersion,
    PricingModel,
    PricingModelUom,
    Product,
    ProductFamily,
    Proposal,
    ProposalCountry,
    ProposalLineItem,
    ProposalVersion,
    RateCard,
    RateCardVersion,
    UnitOfMeasure,
    User,
)
from app.services.pricing_engine import MissingRateCardMatchError, PricingCalculationEngine


@pytest.fixture
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    @event.listens_for(Session, "before_flush")
    def _assign_ids(sess, flush_ctx, instances):  # SQLite has no BIGINT identity
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
    t1 = CustomerTier(name="Tier A", employee_min=0, employee_max=999, valid_from=date(2026, 1, 1))
    t2 = CustomerTier(name="Tier B", employee_min=1000, employee_max=4999, valid_from=date(2026, 1, 1))
    t3 = CustomerTier(name="Tier C", employee_min=5000, valid_from=date(2026, 1, 1))
    shared = DeploymentModel(code="shared_cloud", name="Shared Cloud", status="active")
    u_emp = UnitOfMeasure(code="employee", name="Active Employees (with ESS)", category="uom1", status="active")
    u_cand = UnitOfMeasure(code="candidate", name="Candidate Inflow", category="uom2", status="active")
    u_gb = UnitOfMeasure(code="gb_data", name="GB of Data", category="uom2", status="active")
    u_old = UnitOfMeasure(code="old_unit", name="Retired Unit", category="uom2", status="inactive")
    db.add_all([india, t1, t2, t3, shared, u_emp, u_cand, u_gb, u_old])
    db.flush()

    platform = PricingModel(
        code="platform_subscription", name="Platform + Subscription",
        has_fixed_component=True, has_unit_component=True, fixed_fee_basis="annual", unit_rate_basis="monthly",
    )
    pepm = PricingModel(code="pepm", name="Per Employee Per Month", has_unit_component=True, uom_locked_id=u_emp.id)
    restricted = PricingModel(
        code="platform_restricted", name="Platform (restricted UOMs)",
        has_fixed_component=True, has_unit_component=True, fixed_fee_basis="annual",
    )
    db.add_all([platform, pepm, restricted])
    db.flush()
    db.add_all([
        DeploymentPricingOption(deployment_model_id=shared.id, pricing_model_id=platform.id),
        DeploymentPricingOption(deployment_model_id=shared.id, pricing_model_id=pepm.id),
        DeploymentPricingOption(deployment_model_id=shared.id, pricing_model_id=restricted.id),
        PricingModelUom(pricing_model_id=restricted.id, uom_id=u_cand.id, is_default=True),
    ])
    rcv = RateCardVersion(version_no="RC-T-1", name="Test RC", status="active", valid_from=date(2026, 1, 1))
    family = ProductFamily(code="TA", name="Talent Acquisition")
    db.add_all([rcv, family])
    db.flush()
    product = Product(code="TA_MAX", name="TA Max", product_family_id=family.id)
    pack = Pack(code="TA_STD", name="TA Standard", variant="standard", product_family_id=family.id)
    db.add_all([product, pack])
    db.flush()
    feature = Feature(code="TA_MICRO", name="TA Candidate Microsite", product_id=product.id, classification="native")
    pack_ver = PackVersion(pack_id=pack.id, version_no=1, status="active")
    db.add_all([feature, pack_ver])
    db.commit()

    ids = SimpleNamespace(
        inr=inr.id, india=india.id, t1=t1.id, t2=t2.id, t3=t3.id, shared=shared.id,
        u_emp=u_emp.id, u_cand=u_cand.id, u_gb=u_gb.id, u_old=u_old.id,
        platform=platform.id, pepm=pepm.id, restricted=restricted.id, rcv=rcv.id,
        feature=feature.id, pack_ver=pack_ver.id,
    )

    def override_get_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    try:
        yield SimpleNamespace(db=db, client=client, ids=ids, Session=Session)
    finally:
        app.dependency_overrides.pop(get_db, None)
        db.close()


def _payload(ids, **overrides):
    body = {
        "rate_card_version_id": ids.rcv,
        "country_id": ids.india,
        "deployment_model_id": ids.shared,
        "pricing_model_id": ids.platform,
        "pack_version_id": ids.pack_ver,
        "uom_id": ids.u_cand,
        "unit_rate": "80",
        "tier_fees": [
            {"tier_id": ids.t1, "fixed_fee": "562500"},
            {"tier_id": ids.t2, "fixed_fee": "375000"},
            {"tier_id": ids.t3, "fixed_fee": "262500"},
        ],
    }
    body.update(overrides)
    return body


def _rows(env, **filters):
    s = env.Session()
    try:
        stmt = select(RateCard).where(RateCard.rate_card_version_id == env.ids.rcv)
        for k, v in filters.items():
            stmt = stmt.where(getattr(RateCard, k) == v)
        return {r.tier_id: r for r in s.execute(stmt).scalars().all()}
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Allowed UOMs
# ---------------------------------------------------------------------------
def test_allowed_uoms_locked_mapped_and_unrestricted(env):
    ids, c = env.ids, env.client
    locked = c.get(f"/api/masters/pricing-models/{ids.pepm}/allowed-uoms")
    assert locked.status_code == 200, locked.text
    assert [u["id"] for u in locked.json()] == [ids.u_emp]

    mapped = c.get(f"/api/masters/pricing-models/{ids.restricted}/allowed-uoms").json()
    assert [u["id"] for u in mapped] == [ids.u_cand]

    open_list = c.get(f"/api/masters/pricing-models/{ids.platform}/allowed-uoms").json()
    assert {u["id"] for u in open_list} == {ids.u_emp, ids.u_cand, ids.u_gb}  # inactive unit excluded


def test_units_of_measure_list_comes_from_database(env):
    res = env.client.get("/api/masters/units-of-measure", params={"status": "active"})
    assert res.status_code == 200
    assert {u["code"] for u in res.json()} == {"employee", "candidate", "gb_data"}


# ---------------------------------------------------------------------------
# Saving a pack / feature row
# ---------------------------------------------------------------------------
def test_save_creates_one_row_per_tier_with_shared_uom_and_rate(env):
    res = env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids))
    assert res.status_code == 200, res.text
    assert len(res.json()) == 3

    rows = _rows(env, pack_version_id=env.ids.pack_ver)
    assert {t: r.fixed_fee for t, r in rows.items()} == {
        env.ids.t1: Decimal("562500"), env.ids.t2: Decimal("375000"), env.ids.t3: Decimal("262500"),
    }
    assert {r.unit_rate for r in rows.values()} == {Decimal("80")}
    assert {r.uom_id for r in rows.values()} == {env.ids.u_cand}
    assert {r.currency_id for r in rows.values()} == {env.ids.inr}


def test_reopen_returns_saved_values(env):
    env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids))
    listed = env.client.get("/api/rates/rate-cards", params={"rate_card_version_id": env.ids.rcv}).json()
    assert len(listed) == 3
    assert {(r["tier_id"], Decimal(str(r["fixed_fee"]))) for r in listed} == {
        (env.ids.t1, Decimal("562500")), (env.ids.t2, Decimal("375000")), (env.ids.t3, Decimal("262500")),
    }
    assert {r["uom_id"] for r in listed} == {env.ids.u_cand}


def test_edit_changes_uom_rate_and_fee_without_duplicates(env):
    ids = env.ids
    env.client.put("/api/rates/rate-cards/target", json=_payload(ids))
    before = _rows(env, pack_version_id=ids.pack_ver)

    res = env.client.put("/api/rates/rate-cards/target", json=_payload(
        ids, uom_id=ids.u_gb, current_uom_id=ids.u_cand, unit_rate="95",
        tier_fees=[{"tier_id": ids.t1, "fixed_fee": "600000"}, {"tier_id": ids.t2, "fixed_fee": "375000"},
                   {"tier_id": ids.t3, "fixed_fee": "262500"}],
    ))
    assert res.status_code == 200, res.text
    after = _rows(env, pack_version_id=ids.pack_ver)
    assert len(after) == 3
    assert {t: r.id for t, r in after.items()} == {t: r.id for t, r in before.items()}  # updated in place
    assert after[ids.t1].fixed_fee == Decimal("600000")
    assert after[ids.t2].fixed_fee == Decimal("375000")  # other tiers untouched
    assert {r.uom_id for r in after.values()} == {ids.u_gb}
    assert {r.unit_rate for r in after.values()} == {Decimal("95")}


def test_clearing_a_tier_fee_removes_only_that_tier(env):
    ids = env.ids
    env.client.put("/api/rates/rate-cards/target", json=_payload(ids))
    res = env.client.put("/api/rates/rate-cards/target", json=_payload(
        ids, tier_fees=[{"tier_id": ids.t1, "fixed_fee": "562500"}, {"tier_id": ids.t2, "fixed_fee": "375000"},
                        {"tier_id": ids.t3, "fixed_fee": None}],
    ))
    assert res.status_code == 200, res.text
    assert set(_rows(env, pack_version_id=ids.pack_ver)) == {ids.t1, ids.t2}


def test_feature_rows_are_independent_from_pack_rows(env):
    ids = env.ids
    env.client.put("/api/rates/rate-cards/target", json=_payload(ids))
    res = env.client.put("/api/rates/rate-cards/target", json=_payload(
        ids, pack_version_id=None, feature_id=ids.feature, uom_id=ids.u_emp, unit_rate="93",
        tier_fees=[{"tier_id": ids.t1, "fixed_fee": "168800"}],
    ))
    assert res.status_code == 200, res.text
    feat = _rows(env, feature_id=ids.feature)
    pack = _rows(env, pack_version_id=ids.pack_ver)
    assert set(feat) == {ids.t1} and feat[ids.t1].uom_id == ids.u_emp
    assert {r.uom_id for r in pack.values()} == {ids.u_cand}  # different products, different UOMs


def test_subscription_rate_may_be_left_blank_while_editing(env):
    res = env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids, unit_rate=None))
    assert res.status_code == 200, res.text
    assert {r.unit_rate for r in _rows(env, pack_version_id=env.ids.pack_ver).values()} == {None}


@pytest.mark.parametrize(
    "overrides, status, fragment",
    [
        ({"unit_rate": "-1"}, 422, "greater than or equal"),
        ({"tier_fees": [{"tier_id": 1, "fixed_fee": "-5"}]}, 422, "greater than or equal"),
        ({"tier_fees": [{"tier_id": 1, "fixed_fee": None}]}, 400, "at least one customer tier"),
        ({"pack_version_id": None}, 422, "Exactly one"),
    ],
)
def test_invalid_payloads_are_rejected(env, overrides, status, fragment):
    res = env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids, **overrides))
    assert res.status_code == status, res.text
    assert fragment in res.text
    assert _rows(env) == {}


def test_uom_not_mapped_to_pricing_model_is_rejected(env):
    ids = env.ids
    res = env.client.put("/api/rates/rate-cards/target",
                         json=_payload(ids, pricing_model_id=ids.restricted, uom_id=ids.u_gb))
    assert res.status_code == 400
    assert "not allowed" in res.json()["detail"]
    ok = env.client.put("/api/rates/rate-cards/target",
                        json=_payload(ids, pricing_model_id=ids.restricted, uom_id=ids.u_cand))
    assert ok.status_code == 200, ok.text


def test_inactive_uom_is_rejected(env):
    res = env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids, uom_id=env.ids.u_old))
    assert res.status_code == 400
    assert "not active" in res.json()["detail"]


def test_fixed_fee_is_rejected_for_a_model_without_a_fixed_component(env):
    res = env.client.put("/api/rates/rate-cards/target",
                         json=_payload(env.ids, pricing_model_id=env.ids.pepm, uom_id=env.ids.u_emp))
    assert res.status_code == 400
    assert "has no fixed fee" in res.json()["detail"]


def test_unit_only_model_saves_per_tier_rates(env):
    ids = env.ids
    res = env.client.put("/api/rates/rate-cards/target", json=_payload(
        ids, pricing_model_id=ids.pepm, uom_id=ids.u_emp, unit_rate=None,
        tier_fees=[{"tier_id": ids.t1, "unit_rate": "3"}, {"tier_id": ids.t2, "unit_rate": "4"},
                   {"tier_id": ids.t3, "unit_rate": None}]))
    assert res.status_code == 200, res.text
    rows = _rows(env, pricing_model_id=ids.pepm)
    assert {t: r.unit_rate for t, r in rows.items()} == {ids.t1: Decimal("3"), ids.t2: Decimal("4")}
    assert {r.fixed_fee for r in rows.values()} == {None}


def test_retired_version_is_read_only(env):
    s = env.Session()
    s.get(RateCardVersion, env.ids.rcv).status = "retired"
    s.commit()
    s.close()
    res = env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids))
    assert res.status_code == 409


def test_per_tier_upsert_also_enforces_allowed_uoms(env):
    ids = env.ids
    res = env.client.post("/api/rates/rate-cards", json={
        "rate_card_version_id": ids.rcv, "country_id": ids.india, "deployment_model_id": ids.shared,
        "pricing_model_id": ids.restricted, "tier_id": ids.t1, "uom_id": ids.u_gb,
        "pack_version_id": ids.pack_ver, "fixed_fee": "1", "unit_rate": "1",
    })
    assert res.status_code == 400
    assert "not allowed" in res.json()["detail"]


def test_pricing_model_exposes_unit_rate_basis(env):
    pms = env.client.get("/api/masters/pricing-models").json()
    by_code = {p["code"]: p for p in pms}
    assert by_code["platform_subscription"]["unit_rate_basis"] == "monthly"
    assert by_code["platform_subscription"]["fixed_fee_basis"] == "annual"
    upd = env.client.patch(f"/api/masters/pricing-models/{env.ids.restricted}", json={"unit_rate_basis": "annual"})
    assert upd.status_code == 200, upd.text
    assert upd.json()["unit_rate_basis"] == "annual"
    bad = env.client.patch(f"/api/masters/pricing-models/{env.ids.restricted}", json={"unit_rate_basis": "weekly"})
    assert bad.status_code == 422


# ---------------------------------------------------------------------------
# Pricing engine
# ---------------------------------------------------------------------------
def _proposal(env, tier_id, quantity, uom_id=None):
    ids, db = env.ids, env.db
    user = db.execute(select(User)).scalars().first()
    if user is None:
        user = User(email="t@example.test", full_name="Tester", password_hash="!", is_active=True)
        db.add(user)
        db.flush()
    n = db.execute(select(func.count(Customer.id))).scalar() + 1
    cust = Customer(code=f"C{n}", name=f"Customer {n}", country_id=ids.india, customer_tier_id=tier_id, status="active")
    db.add(cust)
    db.flush()
    deal = Deal(code=f"D{n}", name="Deal", customer_id=cust.id, owner_user_id=user.id, status="open")
    db.add(deal)
    db.flush()
    prop = Proposal(code=f"P{n}", deal_id=deal.id, customer_id=cust.id, currency_id=ids.inr,
                    status="draft", created_by_user_id=user.id)
    db.add(prop)
    db.flush()
    db.add(ProposalCountry(proposal_id=prop.id, country_id=ids.india, deployment_model_id=ids.shared,
                           pricing_model_id=ids.platform, is_primary_deployment=True))
    ver = ProposalVersion(proposal_id=prop.id, version_no=1, rate_card_version_id=ids.rcv,
                          status="draft", created_by_user_id=user.id)
    db.add(ver)
    db.flush()
    line = ProposalLineItem(proposal_version_id=ver.id, line_number=1, pack_version_id=ids.pack_ver,
                            uom_id=uom_id or ids.u_cand, quantity=Decimal(quantity), list_unit_price=Decimal("0"),
                            net_unit_price=Decimal("0"), extended_amount=Decimal("0"), currency_id=ids.inr,
                            discount_pct=Decimal("0"))
    db.add(line)
    db.commit()
    return prop, line


def _line(result):
    return result["snapshot_payload"]["all_subscription_line_items"][0]


def test_engine_uses_the_customers_tier_fee_and_keeps_components_separate(env):
    env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids))
    prop, _ = _proposal(env, env.ids.t2, "1000")
    li = _line(PricingCalculationEngine(env.db).calculate_proposal(prop.id, contract_term_months=24))

    assert li["tier_id"] == env.ids.t2 and li["tier_name"] == "Tier B"
    assert li["uom_name"] == "Candidate Inflow"
    assert li["unit_rate_basis"] == "monthly" and li["fixed_fee_basis"] == "annual"
    assert li["platform_fee"] == 375000.0                       # Tier B annual platform fee
    assert li["contract_platform_fee"] == 750000.0              # x 2 contract years
    assert li["annual_consumption_fee"] == 960000.0             # 80 x 1000 x 12
    assert li["contract_consumption_fee"] == 1920000.0          # 80 x 1000 x 24 months
    assert li["contract_subscription_before_discount"] == 2670000.0


def test_changing_quantity_changes_only_the_subscription_component(env):
    env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids))
    prop, line = _proposal(env, env.ids.t1, "1000")
    engine = PricingCalculationEngine(env.db)
    first = _line(engine.calculate_proposal(prop.id, contract_term_months=12))
    line.quantity = Decimal("1500")
    env.db.commit()
    second = _line(engine.calculate_proposal(prop.id, contract_term_months=12))

    assert first["contract_platform_fee"] == second["contract_platform_fee"] == 562500.0
    assert first["contract_consumption_fee"] == 960000.0
    assert second["contract_consumption_fee"] == 1440000.0


def test_annual_unit_rate_basis_bills_per_year(env):
    s = env.Session()
    s.get(PricingModel, env.ids.platform).unit_rate_basis = "annual"
    s.commit()
    s.close()
    env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids))
    prop, _ = _proposal(env, env.ids.t1, "1000")
    li = _line(PricingCalculationEngine(env.db).calculate_proposal(prop.id, contract_term_months=36))
    assert li["unit_rate_basis"] == "annual"
    assert li["annual_consumption_fee"] == 80000.0      # 80 x 1000 x 1
    assert li["contract_consumption_fee"] == 240000.0   # x 3 years
    assert li["contract_platform_fee"] == 1687500.0     # 562500 x 3


def test_one_time_platform_fee_is_charged_once(env):
    s = env.Session()
    s.get(PricingModel, env.ids.platform).fixed_fee_basis = "one_time"
    s.commit()
    s.close()
    env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids))
    prop, _ = _proposal(env, env.ids.t1, "10")
    li = _line(PricingCalculationEngine(env.db).calculate_proposal(prop.id, contract_term_months=36))
    assert li["contract_platform_fee"] == 562500.0


def test_missing_subscription_rate_blocks_calculation(env):
    env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids, unit_rate=None))
    prop, _ = _proposal(env, env.ids.t1, "10")
    with pytest.raises(MissingRateCardMatchError, match="no unit rate"):
        PricingCalculationEngine(env.db).calculate_proposal(prop.id, contract_term_months=12)


def test_tier_without_platform_fee_has_no_rate(env):
    ids = env.ids
    env.client.put("/api/rates/rate-cards/target", json=_payload(
        ids, tier_fees=[{"tier_id": ids.t1, "fixed_fee": "562500"}, {"tier_id": ids.t3, "fixed_fee": None}]))
    prop, _ = _proposal(env, ids.t3, "10")
    with pytest.raises(MissingRateCardMatchError, match="Tier C"):
        PricingCalculationEngine(env.db).calculate_proposal(prop.id, contract_term_months=12)


def test_line_with_a_different_uom_is_not_priced_with_the_wrong_rate(env):
    env.client.put("/api/rates/rate-cards/target", json=_payload(env.ids))  # rate is per candidate
    prop, _ = _proposal(env, env.ids.t1, "10", uom_id=env.ids.u_gb)
    with pytest.raises(MissingRateCardMatchError):
        PricingCalculationEngine(env.db).calculate_proposal(prop.id, contract_term_months=12)


def test_resolve_returns_uom_and_billing_bases_for_the_configurator(env):
    ids = env.ids
    env.client.put("/api/rates/rate-cards/target", json=_payload(ids, uom_id=ids.u_gb))
    res = env.client.post("/api/rates/resolve", json={
        "country_id": ids.india, "deployment_model_id": ids.shared, "pricing_model_id": ids.platform,
        "tier_id": ids.t2, "pack_version_id": ids.pack_ver,
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["uom_id"] == ids.u_gb and body["uom_name"] == "GB of Data"
    assert body["fixed_fee_basis"] == "annual" and body["unit_rate_basis"] == "monthly"
    assert Decimal(str(body["fixed_fee"])) == Decimal("375000")
