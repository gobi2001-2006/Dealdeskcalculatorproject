"""Comprehensive tests for Proposal Export Functionality.

Covers:
1. All 6 Commercial Scenarios:
   - Scenario 1: Platform + Subscription, Shared Cloud, ESS
   - Scenario 2: Platform + Subscription, Private Cloud, Non-ESS
   - Scenario 3: License + AMC, On-Premise, ESS
   - Scenario 4: License + AMC, On-Premise, Non-ESS (India)
   - Scenario 5: PEPM, Shared Cloud, ESS
   - Scenario 6: PEPM, Private Cloud, ESS
2. Validation & Safety Rules:
   - No calculation snapshot -> HTTP 404
   - Stale calculation snapshot (proposal inputs modified after calculation) -> HTTP 409 Conflict
   - License + AMC missing AMC % -> HTTP 422 Unprocessable
3. Multi-country proposals with foreign exchange (FX) conversion.
4. Line-item and overall product/service discounts.
5. Word document (.docx) and PDF report (.pdf) generation and binary integrity.
"""

import io
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import docx
import pymupdf as fitz
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
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    DeploymentPricingOption,
    FxRate,
    Feature,
    Pack,
    PackItem,
    PackVersion,
    PricingModel,
    PricingModelUom,
    Product,
    ProductFamily,
    RateCardVersion,
    ServiceRate,
    UnitOfMeasure,
    User,
)


@pytest.fixture
def export_env():
    """Sets up an in-memory database with master data for commercial scenarios."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    @event.listens_for(Session, "before_flush")
    def _assign_ids(sess, ctx, inst):
        counters = {}
        for obj in sess.new:
            if hasattr(obj, "id") and getattr(obj, "id", None) is None:
                cls = type(obj)
                if cls not in counters:
                    counters[cls] = sess.execute(select(func.coalesce(func.max(cls.id), 0))).scalar() or 0
                counters[cls] += 1
                obj.id = counters[cls]

    db = Session()

    # Currencies
    inr = Currency(code="INR", name="Indian Rupee", symbol="₹", decimal_places=2, status="active")
    usd = Currency(code="USD", name="US Dollar", symbol="$", decimal_places=2, status="active")
    aed = Currency(code="AED", name="UAE Dirham", symbol="AED ", decimal_places=2, status="active")
    db.add_all([inr, usd, aed])
    db.flush()

    # Exchange Rates (to USD)
    db.add_all([
        FxRate(from_currency_id=inr.id, to_currency_id=usd.id, rate=Decimal("0.012"), effective_date=date(2026, 1, 1)),
        FxRate(from_currency_id=aed.id, to_currency_id=usd.id, rate=Decimal("0.272"), effective_date=date(2026, 1, 1)),
    ])

    # Countries
    india = Country(iso_code="IN", name="India", currency_id=inr.id, valid_from=date(2026, 1, 1), status="active")
    us = Country(iso_code="US", name="United States", currency_id=usd.id, valid_from=date(2026, 1, 1), status="active")
    uae = Country(iso_code="AE", name="United Arab Emirates", currency_id=aed.id, valid_from=date(2026, 1, 1), status="active")
    db.add_all([india, us, uae])

    # Tiers
    tiers = [
        CustomerTier(name=f"Tier {i}", employee_min=(i - 1) * 1000 + 1, employee_max=i * 1000, valid_from=date(2026, 1, 1))
        for i in (1, 2, 3)
    ]
    db.add_all(tiers)

    # Deployment Models
    deps = {
        code: DeploymentModel(code=code, name=code.replace("_", " ").title(), status="active")
        for code in ("shared_cloud", "private_cloud", "on_premise")
    }
    db.add_all(deps.values())

    # Units of Measure
    ess = UnitOfMeasure(code="employee", name="Active Employees (with ESS)", category="uom1", status="active")
    non = UnitOfMeasure(code="active_employees_non_ess", name="Active Employees (non-ESS)", category="uom1", status="active")
    db.add_all([ess, non])

    user = User(email="export_tester@example.com", full_name="Export Tester", password_hash="hash", is_active=True)
    db.add(user)
    db.flush()

    # Pricing Models
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

    # Permitted Deployment-Pricing Options
    db.add_all([
        DeploymentPricingOption(deployment_model_id=deps["shared_cloud"].id, pricing_model_id=pms["platform"].id),
        DeploymentPricingOption(deployment_model_id=deps["private_cloud"].id, pricing_model_id=pms["platform"].id),
        DeploymentPricingOption(deployment_model_id=deps["shared_cloud"].id, pricing_model_id=pms["pepm"].id),
        DeploymentPricingOption(deployment_model_id=deps["private_cloud"].id, pricing_model_id=pms["pepm"].id),
        DeploymentPricingOption(deployment_model_id=deps["on_premise"].id, pricing_model_id=pms["license"].id),
        PricingModelUom(pricing_model_id=pms["license"].id, uom_id=ess.id, is_default=True),
        PricingModelUom(pricing_model_id=pms["license"].id, uom_id=non.id),
    ])

    # Rate Card Version
    rcv = RateCardVersion(version_no="RC-EXP", name="Export Rate Card", status="active", valid_from=date(2026, 1, 1))
    db.add(rcv)

    # Catalogue: Family, Product, Pack, PackVersion, Feature
    fam = ProductFamily(code="HR", name="Human Resources")
    db.add(fam)
    db.flush()

    prod = Product(code="HR_CORE", name="HR Core", product_family_id=fam.id)
    pack = Pack(code="HR_ESSENTIALS", name="HR Essentials", variant="standard", product_family_id=fam.id)
    db.add_all([prod, pack])
    db.flush()

    feat = Feature(code="HR_LEAVE", name="Leave Management", product_id=prod.id, classification="native")
    pv = PackVersion(pack_id=pack.id, version_no=1, status="active")
    db.add_all([feat, pv])
    db.flush()
    db.add(PackItem(pack_version_id=pv.id, feature_id=feat.id))

    # Service Rates
    sr_in = ServiceRate(role_name="Implementation Consultant", country_id=india.id, currency_id=inr.id, hourly_rate=Decimal("1500"), hours_per_day=Decimal("8"), daily_rate=Decimal("12000"), valid_from=date(2026, 1, 1), status="active")
    sr_us = ServiceRate(role_name="Solutions Architect", country_id=us.id, currency_id=usd.id, hourly_rate=Decimal("200"), hours_per_day=Decimal("8"), daily_rate=Decimal("1600"), valid_from=date(2026, 1, 1), status="active")
    db.add_all([sr_in, sr_us])
    db.commit()

    def db_override():
        sess = Session()
        try:
            yield sess
        finally:
            sess.close()

    app.dependency_overrides[get_db] = db_override
    ids = SimpleNamespace(
        inr=inr.id, usd=usd.id, aed=aed.id,
        india=india.id, us=us.id, uae=uae.id,
        tiers=[t.id for t in tiers],
        deps={k: v.id for k, v in deps.items()},
        pms={k: v.id for k, v in pms.items()},
        uoms={"ess": ess.id, "non": non.id},
        rcv=rcv.id,
        pv=pv.id,
        user=user.id,
        sr_in=sr_in.id,
        sr_us=sr_us.id,
    )

    try:
        yield SimpleNamespace(client=TestClient(app), ids=ids, Session=Session)
    finally:
        app.dependency_overrides.pop(get_db, None)
        db.close()


def set_rate(env, country_id, dep_key, pm_key, uom_key, unit_rate=None, tier_fees=None):
    """Helper to save rate card row via PUT /api/rates/rate-cards/target."""
    if isinstance(tier_fees, dict):
        tier_list = [{"tier_id": int(k), **v} for k, v in tier_fees.items()]
    else:
        tier_list = tier_fees or []
    body = {
        "rate_card_version_id": env.ids.rcv,
        "country_id": country_id,
        "deployment_model_id": env.ids.deps[dep_key],
        "pricing_model_id": env.ids.pms[pm_key],
        "pack_version_id": env.ids.pv,
        "uom_id": env.ids.uoms[uom_key],
        "unit_rate": str(unit_rate) if unit_rate is not None else None,
        "tier_fees": tier_list,
    }
    res = env.client.put("/api/rates/rate-cards/target", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def create_and_calc_proposal(env, country_id, dep_key, pm_key, uom_key, headcount, term_months=12, discounts=None, services=None, curr_id=None):
    """Creates customer, deal, proposal, line items, service lines, and runs calculation."""
    c, ids = env.client, env.ids
    cust_code = f"CUST-{country_id}-{dep_key}-{pm_key}-{headcount}"
    cust_res = c.post("/api/customers/", json={
        "code": cust_code,
        "name": f"Acme {cust_code}",
        "country_id": country_id,
        "customer_tier_id": ids.tiers[0],
    })
    assert cust_res.status_code in (200, 201), cust_res.text
    cust = cust_res.json()

    deal_res = c.post("/api/deals/", json={
        "code": f"DEAL-{cust_code}",
        "name": f"Deal {cust_code}",
        "customer_id": cust["id"],
        "owner_user_id": ids.user,
    })
    assert deal_res.status_code in (200, 201), deal_res.text
    deal = deal_res.json()

    presentation_curr = curr_id or ids.usd
    prop_res = c.post("/api/proposals/", json={
        "code": f"PROP-{cust_code}",
        "deal_id": deal["id"],
        "customer_id": cust["id"],
        "currency_id": presentation_curr,
        "created_by_user_id": ids.user,
        "rate_card_version_id": ids.rcv,
    })
    assert prop_res.status_code in (200, 201), prop_res.text
    prop = prop_res.json()

    prop_id = prop["id"]

    # Country block
    p_country = c.post(f"/api/proposals/{prop_id}/countries", json={
        "country_id": country_id,
        "deployment_model_id": ids.deps[dep_key],
        "pricing_model_id": ids.pms[pm_key],
        "user_headcount": headcount,
        "is_primary_deployment": True,
    }).json()

    # Subscription line
    c.post(f"/api/proposals/{prop_id}/line-items", json={
        "pack_version_id": ids.pv,
        "uom_id": ids.uoms[uom_key],
        "quantity": headcount,
        "proposal_country_id": p_country["id"],
    })

    # Optional services
    if services:
        for s in services:
            c.post(f"/api/proposals/{prop_id}/service-lines", json={
                "role_name": s.get("role_name", "Consultant"),
                "service_rate_id": s.get("service_rate_id", ids.sr_in),
                "days_or_hours": s.get("days", 5),
                "proposal_country_id": p_country["id"],
            })

    # Run calculation to generate immutable snapshot
    calc_payload = {
        "contract_term_months": term_months,
        "calculated_by_user_id": ids.user,
    }
    if discounts:
        calc_payload.update(discounts)

    calc_res = c.post(f"/api/proposals/{prop_id}/calculate", json=calc_payload)
    assert calc_res.status_code == 200, calc_res.text
    return prop_id, calc_res.json()


# =============================================================================
# SCENARIOS 1 to 6
# =============================================================================

def test_scenario_1_platform_subscription_shared_cloud_ess(export_env):
    """Scenario 1: Platform Fee + Subscription, Shared Cloud, ESS."""
    env = export_env
    # Rate: 100,000 annual platform fee, 30 per unit per month
    tier_fee = {str(env.ids.tiers[0]): {"fixed_fee": "100000", "unit_rate": "30"}}
    set_rate(env, env.ids.india, "shared_cloud", "platform", "ess", tier_fees=tier_fee)

    # 1,000 employees, 24 months
    # Annual platform = 100,000 -> 24 mo = 200,000
    # Monthly subscription = 30 * 1000 = 30,000/mo -> 24 mo = 720,000
    # Contract Total (INR) = 920,000
    prop_id, calc = create_and_calc_proposal(
        env, env.ids.india, "shared_cloud", "platform", "ess", headcount=1000, term_months=24, curr_id=env.ids.inr
    )
    assert calc["total_proposal_contract_reporting_currency"] == 920000.0

    # 1. Commercials API matches snapshot exactly
    res_comm = env.client.get(f"/api/proposals/{prop_id}/export/commercials")
    assert res_comm.status_code == 200
    data = res_comm.json()
    assert data["fcv"] == 920000.0
    assert data["reporting_currency"] == "INR"
    assert data["contract_term_months"] == 24
    assert data["has_platform_subscription"] is True
    assert data["total_platform_reporting"] == 200000.0
    assert data["total_sub_recurring_reporting"] == 720000.0

    # 2. Word (.docx) Export
    res_docx = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200
    assert res_docx.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    doc = docx.Document(io.BytesIO(res_docx.content))
    doc_text = "\n".join(p.text for p in doc.paragraphs)
    assert "Commercials" in doc_text
    assert "FINAL CALCULATED CONTRACT VALUE" in "\n".join(" ".join(c.text for c in row.cells) for tbl in doc.tables for row in tbl.rows)

    # 3. PDF (.pdf) Export
    res_pdf = env.client.get(f"/api/proposals/{prop_id}/export?format=pdf")
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    pdf = fitz.open(stream=res_pdf.content, filetype="pdf")
    pdf_text = pdf[0].get_text()
    assert "FINAL COMMERCIAL SUMMARY" in pdf_text
    assert "920,000.00" in pdf_text


def test_scenario_2_platform_subscription_private_cloud_non_ess(export_env):
    """Scenario 2: Platform Fee + Subscription, Private Cloud, Non-ESS."""
    env = export_env
    tier_fee = {str(env.ids.tiers[0]): {"fixed_fee": "25000", "unit_rate": "15"}}
    set_rate(env, env.ids.india, "private_cloud", "platform", "non", tier_fees=tier_fee)

    prop_id, calc = create_and_calc_proposal(
        env, env.ids.india, "private_cloud", "platform", "non", headcount=500, term_months=12, curr_id=env.ids.inr
    )
    # Annual: Platform 25,000 + Sub 15 * 500 * 12 = 90,000 -> Total = 115,000
    assert calc["total_proposal_contract_reporting_currency"] == 115000.0

    res = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res.status_code == 200
    assert len(res.content) > 10000


def test_scenario_3_license_amc_on_premise_ess(export_env):
    """Scenario 3: License Fee + AMC, On-Premise, ESS."""
    env = export_env
    # One-time unit rate 500, AMC 15%
    tier_fee = {str(env.ids.tiers[0]): {"unit_rate": "500", "amc_percentage": "15"}}
    set_rate(env, env.ids.india, "on_premise", "license", "ess", tier_fees=tier_fee)

    # 200 users, 36 months (3 years)
    # License Fee = 500 * 200 = 100,000 (one-time)
    # Annual AMC = 100,000 * 15% = 15,000/year
    # 3 years Total AMC = 45,000
    # FCV = 100,000 + 45,000 = 145,000
    prop_id, calc = create_and_calc_proposal(
        env, env.ids.india, "on_premise", "license", "ess", headcount=200, term_months=36, curr_id=env.ids.inr
    )
    assert calc["total_proposal_contract_reporting_currency"] == 145000.0

    comm = env.client.get(f"/api/proposals/{prop_id}/export/commercials").json()
    assert comm["has_license_amc"] is True
    assert comm["total_license_reporting"] == 100000.0
    assert comm["total_amc_reporting"] == 45000.0
    assert comm["fcv"] == 145000.0

    # Ensure docx renders Model B section
    res_docx = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200


def test_scenario_4_license_amc_india_validation_missing_amc(export_env):
    """Scenario 4: License + AMC India validation — missing AMC % is prevented, not assumed zero."""
    env = export_env
    # Rate with missing AMC % (rate_card.amc_percentage = None)
    # Note: Backend pricing engine raises error when calculating if AMC % is None for one-time basis.
    # We verify that if an unpriced or incomplete calculation is attempted or exported, it is blocked.
    tier_fee_no_amc = [{"tier_id": env.ids.tiers[0], "unit_rate": "400", "amc_percentage": None}]
    res_set = env.client.put("/api/rates/rate-cards/target", json={
        "rate_card_version_id": env.ids.rcv,
        "country_id": env.ids.india,
        "deployment_model_id": env.ids.deps["on_premise"],
        "pricing_model_id": env.ids.pms["license"],
        "pack_version_id": env.ids.pv,
        "uom_id": env.ids.uoms["non"],
        "tier_fees": tier_fee_no_amc,
    })
    assert res_set.status_code == 200

    # If calculation fails due to missing AMC %, no snapshot is created
    c = env.client
    cust = c.post("/api/customers/", json={"code": "CUST-NO-AMC", "name": "No AMC Client", "country_id": env.ids.india, "customer_tier_id": env.ids.tiers[0]}).json()
    deal = c.post("/api/deals/", json={"code": "DEAL-NO-AMC", "name": "No AMC Deal", "customer_id": cust["id"], "owner_user_id": env.ids.user}).json()
    prop = c.post("/api/proposals/", json={"code": "PROP-NO-AMC", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": env.ids.inr, "created_by_user_id": env.ids.user, "rate_card_version_id": env.ids.rcv}).json()
    prop_id = prop["id"]
    p_country = c.post(f"/api/proposals/{prop_id}/countries", json={"country_id": env.ids.india, "deployment_model_id": env.ids.deps["on_premise"], "pricing_model_id": env.ids.pms["license"], "user_headcount": 100, "is_primary_deployment": True}).json()
    c.post(f"/api/proposals/{prop_id}/line-items", json={"pack_version_id": env.ids.pv, "uom_id": env.ids.uoms["non"], "quantity": 100, "proposal_country_id": p_country["id"]})

    # Calculation must reject missing AMC % (status 422)
    calc_err = c.post(f"/api/proposals/{prop_id}/calculate", json={"contract_term_months": 12, "calculated_by_user_id": env.ids.user})
    assert calc_err.status_code == 422
    assert "AMC %" in calc_err.json()["detail"]

    # Export must block uncalculated proposal with 404
    export_blocked = c.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert export_blocked.status_code == 404
    assert "No calculation snapshot found" in export_blocked.json()["detail"]


def test_scenario_5_pepm_shared_cloud_ess_uae(export_env):
    """Scenario 5: PEPM, Shared Cloud, ESS, UAE."""
    env = export_env
    # UAE: PEPM rate AED 20 per employee per month
    tier_fee = {str(env.ids.tiers[0]): {"unit_rate": "20"}}
    set_rate(env, env.ids.uae, "shared_cloud", "pepm", "ess", unit_rate="20", tier_fees=tier_fee)

    # 150 employees, 12 months in AED
    # 20 * 150 * 12 = 36,000 AED
    prop_id, calc = create_and_calc_proposal(
        env, env.ids.uae, "shared_cloud", "pepm", "ess", headcount=150, term_months=12, curr_id=env.ids.aed
    )
    assert calc["total_proposal_contract_reporting_currency"] == 36000.0

    comm = env.client.get(f"/api/proposals/{prop_id}/export/commercials").json()
    assert comm["has_pepm"] is True
    assert comm["reporting_currency"] == "AED"
    assert comm["fcv"] == 36000.0

    res_pdf = env.client.get(f"/api/proposals/{prop_id}/export?format=pdf")
    assert res_pdf.status_code == 200
    pdf_text = fitz.open(stream=res_pdf.content, filetype="pdf")[0].get_text()
    assert "36,000.00" in pdf_text


def test_scenario_6_pepm_private_cloud_ess_us(export_env):
    """Scenario 6: PEPM, Private Cloud, ESS, US."""
    env = export_env
    tier_fee = {str(env.ids.tiers[0]): {"unit_rate": "8"}}
    set_rate(env, env.ids.us, "private_cloud", "pepm", "ess", unit_rate="8", tier_fees=tier_fee)

    prop_id, calc = create_and_calc_proposal(
        env, env.ids.us, "private_cloud", "pepm", "ess", headcount=1000, term_months=24, curr_id=env.ids.usd
    )
    # 8 * 1000 * 24 = 192,000 USD
    assert calc["total_proposal_contract_reporting_currency"] == 192000.0

    res_docx = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200
    assert len(res_docx.content) > 10000


# =============================================================================
# ADDITIONAL TESTS: Services, Discounts, Multi-Country, Stale Snapshot
# =============================================================================

def test_export_with_professional_services_and_discounts(export_env):
    """Test exporting a proposal with professional services and multi-level discounts."""
    env = export_env
    tier_fee = {str(env.ids.tiers[0]): {"fixed_fee": "100000", "unit_rate": "20"}}
    set_rate(env, env.ids.india, "shared_cloud", "platform", "ess", tier_fees=tier_fee)

    # 500 headcount, 12 months
    # Sub gross: 100,000 + 20*500*12 = 220,000
    # Service: 10 man-days @ 12,000 = 120,000
    # Discounts: 10% on subscription, 5% on services
    services = [{"role_name": "Implementation Consultant", "service_rate_id": env.ids.sr_in, "days": 10}]
    discounts = {
        "product_subscription_discounts": {"HR_CORE": 10},
        "product_service_discounts": {"HR_CORE": 5},
    }

    prop_id, calc = create_and_calc_proposal(
        env, env.ids.india, "shared_cloud", "platform", "ess",
        headcount=500, term_months=12, discounts=discounts, services=services, curr_id=env.ids.inr
    )

    # Sub Net: 220,000 - 10% (22,000) = 198,000
    # Serv Net: 120,000 - 5% (6,000) = 114,000
    # Total FCV = 312,000 INR
    assert calc["total_proposal_contract_reporting_currency"] == 312000.0

    comm = env.client.get(f"/api/proposals/{prop_id}/export/commercials").json()
    assert comm["fcv"] == 312000.0
    assert comm["total_services"] == 114000.0
    assert comm["total_services_gross_reporting"] == 120000.0
    assert comm["total_discounts_reporting"] == 28000.0  # 22,000 + 6,000
    assert (
        comm["total_platform_reporting"]
        + comm["total_sub_recurring_reporting"]
        + comm["total_services_gross_reporting"]
        - comm["total_discounts_reporting"]
    ) == comm["fcv"]

    res_docx = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200
    doc = docx.Document(io.BytesIO(res_docx.content))
    full_doc_text = "\n".join(p.text for p in doc.paragraphs)
    assert "T&C for above Commercials" in full_doc_text
    assert "Payment Terms" in full_doc_text
    assert "Terms of Proposal" in full_doc_text

    res_pdf = env.client.get(f"/api/proposals/{prop_id}/export?format=pdf")
    assert res_pdf.status_code == 200
    pdf_text = fitz.open(stream=res_pdf.content, filetype="pdf")[0].get_text()
    assert "312,000.00" in pdf_text
    assert "Implementation Consultant" in pdf_text


def test_export_stale_snapshot_prevention_returns_409(export_env):
    """If proposal inputs change after calculation, export must prevent stale export with HTTP 409."""
    env = export_env
    tier_fee = {str(env.ids.tiers[0]): {"unit_rate": "10"}}
    set_rate(env, env.ids.us, "shared_cloud", "pepm", "ess", unit_rate="10", tier_fees=tier_fee)

    prop_id, _ = create_and_calc_proposal(
        env, env.ids.us, "shared_cloud", "pepm", "ess", headcount=100, term_months=12, curr_id=env.ids.usd
    )

    # Export immediately succeeds
    res_ok = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_ok.status_code == 200

    # Modify proposal (e.g. change line item quantity)
    prop_detail = env.client.get(f"/api/proposals/{prop_id}").json()
    line_id = prop_detail["versions"][0]["line_items"][0]["id"]
    env.client.patch(f"/api/proposals/{prop_id}/line-items/{line_id}", json={"quantity": 250})

    # Now snapshot is stale: export MUST return 409 Conflict
    res_stale = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_stale.status_code == 409
    assert "recalculate" in res_stale.json()["detail"].lower()


def test_export_uncalculated_proposal_returns_404(export_env):
    """Proposal with no calculation snapshot returns 404."""
    env = export_env
    c, ids = env.client, env.ids
    cust = c.post("/api/customers/", json={"code": "CUST-UNPRICED", "name": "Unpriced", "country_id": ids.us, "customer_tier_id": ids.tiers[0]}).json()
    deal = c.post("/api/deals/", json={"code": "DEAL-UNPRICED", "name": "Unpriced Deal", "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    prop = c.post("/api/proposals/", json={"code": "PROP-UNPRICED", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.usd, "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}).json()

    res = c.get(f"/api/proposals/{prop['id']}/export?format=docx")
    assert res.status_code == 404
    assert "No calculation snapshot found" in res.json()["detail"]


def test_multi_country_proposal_currency_conversion(export_env):
    """Test multi-country proposal where each country's native amounts are converted with FX snapshot."""
    env = export_env
    # India rate: INR 100/mo per user
    set_rate(env, env.ids.india, "shared_cloud", "pepm", "ess", unit_rate="100", tier_fees={str(env.ids.tiers[0]): {"unit_rate": "100"}})
    # US rate: USD 5/mo per user
    set_rate(env, env.ids.us, "shared_cloud", "pepm", "ess", unit_rate="5", tier_fees={str(env.ids.tiers[0]): {"unit_rate": "5"}})

    c, ids = env.client, env.ids
    cust = c.post("/api/customers/", json={"code": "CUST-MULTI", "name": "Global Retail", "country_id": ids.us, "customer_tier_id": ids.tiers[0]}).json()
    deal = c.post("/api/deals/", json={"code": "DEAL-MULTI", "name": "Multi Deal", "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    prop = c.post("/api/proposals/", json={"code": "PROP-MULTI", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.usd, "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}).json()
    prop_id = prop["id"]

    # Block 1: US (100 users, USD 5 * 100 * 12 = 6,000 USD)
    b_us = c.post(f"/api/proposals/{prop_id}/countries", json={"country_id": ids.us, "deployment_model_id": ids.deps["shared_cloud"], "pricing_model_id": ids.pms["pepm"], "user_headcount": 100, "is_primary_deployment": True}).json()
    c.post(f"/api/proposals/{prop_id}/line-items", json={"pack_version_id": ids.pv, "uom_id": ids.uoms["ess"], "quantity": 100, "proposal_country_id": b_us["id"]})

    # Block 2: India (1,000 users, INR 100 * 1000 * 12 = 1,200,000 INR @ FX 0.012 = 14,400 USD)
    b_in = c.post(f"/api/proposals/{prop_id}/countries", json={"country_id": ids.india, "deployment_model_id": ids.deps["shared_cloud"], "pricing_model_id": ids.pms["pepm"], "user_headcount": 1000, "is_primary_deployment": False}).json()
    c.post(f"/api/proposals/{prop_id}/line-items", json={"pack_version_id": ids.pv, "uom_id": ids.uoms["ess"], "quantity": 1000, "proposal_country_id": b_in["id"]})

    calc = c.post(f"/api/proposals/{prop_id}/calculate", json={"contract_term_months": 12, "calculated_by_user_id": ids.user}).json()
    # Total USD = 6,000 + 14,400 = 20,400 USD
    assert calc["total_proposal_contract_reporting_currency"] == 20400.0

    comm = c.get(f"/api/proposals/{prop_id}/export/commercials").json()
    assert comm["fcv"] == 20400.0
    assert comm["reporting_currency"] == "USD"
    assert len(comm["countries_grouped"]) == 2

    # Verify both currencies appear in docx
    res_docx = c.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200
    doc = docx.Document(io.BytesIO(res_docx.content))
    table_texts = "\n".join(" ".join(cell.text for cell in row.cells) for tbl in doc.tables for row in tbl.rows)
    assert "20,400.00" in table_texts
    assert "India" in table_texts
    assert "United States" in table_texts


# =============================================================================
# POLISH & REGRESSION TESTS (DEFECTS 1-6)
# =============================================================================

def test_defect_1_no_xxx_placeholder_remains_in_docx_tables_or_paragraphs(export_env):
    """DEFECT 1: Verify 'XXX' placeholder is replaced in paragraphs, tables, and TOC/SDT without leaving leftovers."""
    env = export_env
    tier_fee = {str(env.ids.tiers[0]): {"unit_rate": "12"}}
    set_rate(env, env.ids.us, "shared_cloud", "pepm", "ess", unit_rate="12", tier_fees=tier_fee)

    prop_id, _ = create_and_calc_proposal(
        env, env.ids.us, "shared_cloud", "pepm", "ess", headcount=100, term_months=23, curr_id=env.ids.usd
    )
    res_docx = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200

    doc = docx.Document(io.BytesIO(res_docx.content))
    # Scan every w:t element inside body XML (covers paragraphs, TOC/SDT, textboxes, all tables & nested tables)
    from docx.oxml.ns import qn
    all_xml_texts = [t.text for t in doc.element.body.iter(qn("w:t")) if t.text]
    leftovers = [txt for txt in all_xml_texts if "XXX" in txt]
    assert leftovers == [], f"Found unreplaced XXX placeholders: {leftovers}"
    combined = " ".join(all_xml_texts)
    assert "Acme CUST-" in combined


def test_defect_2_legacy_snapshot_resolves_country_without_reg_fallback(export_env):
    """DEFECT 2: Legacy snapshots missing country_iso resolve from proposal country instead of showing (REG)."""
    from app.models.proposals import CalculationSnapshot, Proposal, ProposalVersion

    env = export_env
    tier_fee = {str(env.ids.tiers[0]): {"unit_rate": "10"}}
    set_rate(env, env.ids.india, "shared_cloud", "pepm", "ess", unit_rate="10", tier_fees=tier_fee)

    prop_id, _ = create_and_calc_proposal(
        env, env.ids.india, "shared_cloud", "pepm", "ess",
        headcount=100, term_months=12,
        discounts={"product_subscription_discounts": {"HR_CORE": 10}},
        curr_id=env.ids.usd,
    )

    # Simulate legacy snapshot payload by inserting a snapshot without country_iso/country_name/proposal_country_id
    with env.Session() as sess:
        snap = sess.execute(select(CalculationSnapshot).order_by(CalculationSnapshot.id.desc())).scalars().first()
        pay = dict(snap.snapshot_payload)
        prods = []
        for p in pay["products"]:
            p_copy = dict(p)
            p_copy.pop("country_iso", None)
            p_copy.pop("country_name", None)
            p_copy.pop("proposal_country_id", None)
            p_copy["line_items"] = [
                {k: v for k, v in li.items() if k not in ("country_iso", "country_name", "proposal_country_id")}
                for li in p.get("line_items", [])
            ]
            prods.append(p_copy)
        pay["products"] = prods
        legacy_snap = CalculationSnapshot(
            proposal_version_id=snap.proposal_version_id,
            snapshot_payload=pay,
            calculated_by_user_id=env.ids.user,
        )
        sess.add(legacy_snap)
        sess.commit()

    comm = env.client.get(f"/api/proposals/{prop_id}/export/commercials").json()
    assert comm["products_commercials"][0]["country_iso"] == "IN"
    assert comm["products_commercials"][0]["country_name"] == "India"

    res_docx = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200
    doc = docx.Document(io.BytesIO(res_docx.content))
    table_text = "\n".join(" ".join(c.text for c in r.cells) for tbl in doc.tables for r in tbl.rows)
    assert "(REG)" not in table_text
    assert "HR Core (IN)" in table_text


def test_defect_3_contract_duration_formatting_docx_and_pdf(export_env):
    """DEFECT 3: Non-whole contract terms (e.g., 23 months) round to <=2 decimals with no trailing zeroes."""
    env = export_env
    tier_fee = {str(env.ids.tiers[0]): {"unit_rate": "10"}}
    set_rate(env, env.ids.us, "shared_cloud", "pepm", "ess", unit_rate="10", tier_fees=tier_fee)

    prop_id, _ = create_and_calc_proposal(
        env, env.ids.us, "shared_cloud", "pepm", "ess", headcount=100, term_months=23, curr_id=env.ids.usd
    )

    comm = env.client.get(f"/api/proposals/{prop_id}/export/commercials").json()
    assert comm["contract_duration_display"] == "23 Months (1.92 Years)"

    res_docx = env.client.get(f"/api/proposals/{prop_id}/export?format=docx")
    doc = docx.Document(io.BytesIO(res_docx.content))
    table_text = "\n".join(" ".join(c.text for c in r.cells) for tbl in doc.tables for r in tbl.rows)
    assert "23 Months (1.92 Years)" in table_text
    assert "1.91667" not in table_text

    res_pdf = env.client.get(f"/api/proposals/{prop_id}/export?format=pdf")
    pdf_text = fitz.open(stream=res_pdf.content, filetype="pdf")[0].get_text()
    assert "23 Months (1.92 Years)" in pdf_text
    assert "1.91667" not in pdf_text


def test_defect_5_empty_scope_blocked_with_422_but_zero_priced_valid_item_allowed(export_env):
    """DEFECT 5: 0-item proposal export returns 422, while zero-priced valid item exports 200."""
    from app.models.proposals import CalculationSnapshot, Proposal, ProposalVersion

    env = export_env
    c, ids = env.client, env.ids

    # 1. Create empty-scope proposal + empty calculated snapshot (simulating proposal #35)
    cust = c.post("/api/customers/", json={"code": "CUST-EMPTY", "name": "Empty Co", "country_id": ids.us, "customer_tier_id": ids.tiers[0]}).json()
    deal = c.post("/api/deals/", json={"code": "DEAL-EMPTY", "name": "Empty Deal", "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    prop = c.post("/api/proposals/", json={"code": "PROP-EMPTY", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.usd, "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}).json()
    empty_prop_id = prop["id"]
    c.post(f"/api/proposals/{empty_prop_id}/countries", json={"country_id": ids.us, "deployment_model_id": ids.deps["shared_cloud"], "pricing_model_id": ids.pms["pepm"], "user_headcount": 100, "is_primary_deployment": True})
    empty_calc = c.post(f"/api/proposals/{empty_prop_id}/calculate", json={"contract_term_months": 12, "calculated_by_user_id": ids.user})
    assert empty_calc.status_code == 200

    for ep in [
        f"/api/proposals/{empty_prop_id}/export/commercials",
        f"/api/proposals/{empty_prop_id}/export?format=docx",
        f"/api/proposals/{empty_prop_id}/export?format=pdf",
    ]:
        r = c.get(ep)
        assert r.status_code == 422, f"{ep} returned {r.status_code}: {r.text}"
        assert "at least one valid commercial item" in r.json()["detail"].lower()

    # 2. Valid zero-priced commercial item (rate = 0) MUST still be allowed
    set_rate(env, ids.us, "shared_cloud", "pepm", "ess", unit_rate="0", tier_fees={str(ids.tiers[0]): {"unit_rate": "0"}})
    zero_prop_id, zero_calc = create_and_calc_proposal(
        env, ids.us, "shared_cloud", "pepm", "ess", headcount=50, term_months=12, curr_id=ids.usd
    )
    assert zero_calc["total_proposal_contract_reporting_currency"] == 0.0
    assert c.get(f"/api/proposals/{zero_prop_id}/export/commercials").status_code == 200
    assert c.get(f"/api/proposals/{zero_prop_id}/export?format=docx").status_code == 200
    assert c.get(f"/api/proposals/{zero_prop_id}/export?format=pdf").status_code == 200


def test_defect_6_fx_rounding_difference_reconciled_in_presentation_without_altering_fcv(export_env):
    """DEFECT 6: Verify $0.01 FX rounding delta preserves snapshot FCV and adds a presentation adjustment row."""
    env = export_env
    c, ids = env.client, env.ids

    # Replicate Proposal #24's INR -> USD (0.012) FX rounding case
    set_rate(env, ids.india, "shared_cloud", "pepm", "ess", unit_rate="3000", tier_fees={str(ids.tiers[0]): {"unit_rate": "3000"}})
    # Create INR service rate 1500.03/hr * 8h = 12000.24/day
    with env.Session() as sess:
        sr = ServiceRate(
            role_name="Lead Architect INR", country_id=ids.india, currency_id=ids.inr,
            hourly_rate=Decimal("1500.03"), hours_per_day=Decimal("8"), daily_rate=Decimal("12000.24"),
            valid_from=date(2026, 1, 1), status="active",
        )
        sess.add(sr)
        sess.commit()
        sr_id = sr.id

    cust = c.post("/api/customers/", json={"code": "CUST-FX24", "name": "FX Co", "country_id": ids.india, "customer_tier_id": ids.tiers[0]}).json()
    deal = c.post("/api/deals/", json={"code": "DEAL-FX24", "name": "FX Deal", "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    prop = c.post("/api/proposals/", json={"code": "PROP-FX24", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.usd, "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}).json()
    prop_id = prop["id"]

    blk = c.post(f"/api/proposals/{prop_id}/countries", json={"country_id": ids.india, "deployment_model_id": ids.deps["shared_cloud"], "pricing_model_id": ids.pms["pepm"], "user_headcount": 1200, "is_primary_deployment": True}).json()
    c.post(f"/api/proposals/{prop_id}/line-items", json={"pack_version_id": ids.pv, "uom_id": ids.uoms["ess"], "quantity": 1200, "discount_pct": 5, "proposal_country_id": blk["id"]})
    c.post(f"/api/proposals/{prop_id}/service-lines", json={"role_name": "Lead Architect INR", "service_rate_id": sr_id, "days_or_hours": 40, "proposal_country_id": blk["id"]})

    calc = c.post(f"/api/proposals/{prop_id}/calculate", json={
        "contract_term_months": 36,
        "calculated_by_user_id": ids.user,
        "product_subscription_discounts": {"HR_CORE": 6},
        "product_service_discounts": {"HR_CORE": 2},
    }).json()
    assert calc["total_proposal_contract_reporting_currency"] == 1394438.51

    comm = c.get(f"/api/proposals/{prop_id}/export/commercials").json()
    assert comm["fcv"] == 1394438.51
    assert comm["fx_rounding_adjustment"] == -0.01

    res_docx = c.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200
    doc = docx.Document(io.BytesIO(res_docx.content))
    table_text = "\n".join(" ".join(cell.text for cell in r.cells) for tbl in doc.tables for r in tbl.rows)
    assert "FX Conversion Rounding Adjustment*" in table_text
    assert "$1,394,438.51" in table_text

    res_pdf = c.get(f"/api/proposals/{prop_id}/export?format=pdf")
    assert res_pdf.status_code == 200
    pdf_text = fitz.open(stream=res_pdf.content, filetype="pdf")[0].get_text()
    assert "FX Rounding Adjustment*" in pdf_text
    assert "1,394,438.51" in pdf_text


def _extract_docx_linear_text(doc: docx.document.Document) -> str:
    """Extract all paragraphs and tables in exact XML body order for section-ordering assertions."""
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    chunks = []
    for child in doc.element.body.iterchildren():
        if isinstance(child, CT_P):
            txt = Paragraph(child, doc).text.strip()
            if txt:
                chunks.append(txt)
        elif isinstance(child, CT_Tbl):
            tbl = Table(child, doc)
            for row in tbl.rows:
                chunks.append(" | ".join(cell.text.strip() for cell in row.cells))
    return "\n".join(chunks)


def test_calculation_details_pepm_exact_section4_validation(export_env):
    """Verify exact Section 4 PEPM example (200 * 890 * 56, 5.88%, 9%, FX 0.012 -> USD 102,450.15) & section order."""
    env = export_env
    c, ids = env.client, env.ids

    # PEPM Rate = INR 200 for Tier 1 India Shared Cloud
    set_rate(env, ids.india, "shared_cloud", "pepm", "ess", unit_rate="200", tier_fees={str(ids.tiers[0]): {"unit_rate": "200"}})

    cust = c.post("/api/customers/", json={"code": "CUST-S4", "name": "Section Four Corp", "country_id": ids.india, "customer_tier_id": ids.tiers[0]}).json()
    deal = c.post("/api/deals/", json={"code": "DEAL-S4", "name": "Section Four Deal", "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    prop = c.post("/api/proposals/", json={"code": "PROP-S4", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.usd, "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}).json()
    prop_id = prop["id"]

    blk = c.post(f"/api/proposals/{prop_id}/countries", json={"country_id": ids.india, "deployment_model_id": ids.deps["shared_cloud"], "pricing_model_id": ids.pms["pepm"], "user_headcount": 890, "is_primary_deployment": True}).json()
    c.post(f"/api/proposals/{prop_id}/line-items", json={"pack_version_id": ids.pv, "uom_id": ids.uoms["ess"], "quantity": 890, "discount_pct": 5.88, "proposal_country_id": blk["id"]})

    calc = c.post(f"/api/proposals/{prop_id}/calculate", json={
        "contract_term_months": 56,
        "calculated_by_user_id": ids.user,
        "product_subscription_discounts": {"HR_CORE": 9},
    }).json()
    assert calc["total_proposal_contract_reporting_currency"] == 102450.15
    assert calc["total_proposal_annual_reporting_currency"] == 21953.60

    # 1. Verify /export/commercials payload
    comm = c.get(f"/api/proposals/{prop_id}/export/commercials").json()
    assert len(comm["calculation_details"]) == 1
    det = comm["calculation_details"][0]
    assert det["pricing_model"] in ("PEPM", "Per Employee Per Month")
    assert det["country_name"] == "India"
    assert det["native_currency"] == "INR"
    assert det["reporting_currency"] == "USD"
    assert det["fx_rate"] == pytest.approx(0.012, rel=1e-6)
    steps_text = "\n".join(f"{s['label']} | {s['formula_docx']} | {s['result_docx']}" for s in det["steps"])
    for expected in ["9,968,000.00", "5.88%", "586,118.40", "9,381,881.60", "9%", "844,369.34", "8,537,512.26", "0.012", "102,450.15", "21,953.60"]:
        assert expected in steps_text

    # 2. Verify DOCX content and strict ordering (Commercial Calculation Details BEFORE Final Commercial Summary)
    res_docx = c.get(f"/api/proposals/{prop_id}/export?format=docx")
    assert res_docx.status_code == 200
    doc = docx.Document(io.BytesIO(res_docx.content))
    linear_docx = _extract_docx_linear_text(doc)

    idx_details = linear_docx.find("Commercial Calculation Details")
    idx_summary = linear_docx.find("Final Commercial Summary")
    assert idx_details != -1 and idx_summary != -1
    assert idx_details < idx_summary
    # Legal sections from template must remain intact after commercials
    assert "T&C for above Commercials" in linear_docx
    assert "Payment Terms" in linear_docx
    assert "Terms of Proposal" in linear_docx
    for expected in ["200.00", "890", "56 months", "9,968,000.00", "586,118.40", "9,381,881.60", "844,369.34", "8,537,512.26", "0.012", "$102,450.15", "$21,953.60"]:
        assert expected in linear_docx

    # 3. Verify PDF content and strict ordering
    res_pdf = c.get(f"/api/proposals/{prop_id}/export?format=pdf")
    assert res_pdf.status_code == 200
    pdf_doc = fitz.open(stream=res_pdf.content, filetype="pdf")
    pdf_text = "\n".join(p.get_text() for p in pdf_doc)
    idx_pdf_details = pdf_text.find("COMMERCIAL CALCULATION DETAILS")
    idx_pdf_summary = pdf_text.find("FINAL COMMERCIAL SUMMARY")
    assert idx_pdf_details != -1 and idx_pdf_summary != -1
    assert idx_pdf_details < idx_pdf_summary
    for expected in ["9,968,000.00", "586,118.40", "9,381,881.60", "844,369.34", "8,537,512.26", "0.012", "102,450.15", "21,953.60"]:
        assert expected in pdf_text


def test_calculation_details_platform_subscription_and_license_amc_before_summary(export_env):
    """Verify Platform + Subscription and License + AMC formulas appear in Commercial Calculation Details before summary."""
    env = export_env
    c, ids = env.client, env.ids

    # Case A: Platform + Subscription (Shared Cloud, India -> INR to USD, 24 months)
    set_rate(env, ids.india, "shared_cloud", "platform", "ess", tier_fees={str(ids.tiers[0]): {"fixed_fee": "250000", "unit_rate": "45"}})
    prop_a, calc_a = create_and_calc_proposal(env, ids.india, "shared_cloud", "platform", "ess", headcount=500, term_months=24, curr_id=ids.usd)

    comm_a = c.get(f"/api/proposals/{prop_a}/export/commercials").json()
    assert comm_a["calculation_details"][0]["pricing_model"] == "Platform + Subscription"

    docx_a = _extract_docx_linear_text(docx.Document(io.BytesIO(c.get(f"/api/proposals/{prop_a}/export?format=docx").content)))
    assert docx_a.find("Commercial Calculation Details") < docx_a.find("Final Commercial Summary")
    assert "Platform" in docx_a and "500,000.00" in docx_a  # 250,000/yr * 2 yrs

    pdf_a = "\n".join(p.get_text() for p in fitz.open(stream=c.get(f"/api/proposals/{prop_a}/export?format=pdf").content, filetype="pdf"))
    assert pdf_a.find("COMMERCIAL CALCULATION DETAILS") < pdf_a.find("FINAL COMMERCIAL SUMMARY")
    assert "Platform + Subscription" in pdf_a

    # Case B: License + AMC (On-Premise, US -> USD, 36 months, 18% AMC)
    set_rate(env, ids.us, "on_premise", "license", "ess", tier_fees={str(ids.tiers[0]): {"unit_rate": "120", "amc_percentage": "18"}})
    prop_b, calc_b = create_and_calc_proposal(env, ids.us, "on_premise", "license", "ess", headcount=400, term_months=36, curr_id=ids.usd)

    comm_b = c.get(f"/api/proposals/{prop_b}/export/commercials").json()
    assert "License" in comm_b["calculation_details"][0]["pricing_model"] and "AMC" in comm_b["calculation_details"][0]["pricing_model"]

    docx_b = _extract_docx_linear_text(docx.Document(io.BytesIO(c.get(f"/api/proposals/{prop_b}/export?format=docx").content)))
    assert docx_b.find("Commercial Calculation Details") < docx_b.find("Final Commercial Summary")
    assert "License" in docx_b and "AMC" in docx_b and "18%" in docx_b

    pdf_b = "\n".join(p.get_text() for p in fitz.open(stream=c.get(f"/api/proposals/{prop_b}/export?format=pdf").content, filetype="pdf"))
    assert pdf_b.find("COMMERCIAL CALCULATION DETAILS") < pdf_b.find("FINAL COMMERCIAL SUMMARY")
    assert "License" in pdf_b and "AMC" in pdf_b


def test_calculation_details_multicountry_and_services_only_proposals(export_env):
    """Verify Multi-country FX details pagination & Services-Only calculation breakdown."""
    env = export_env
    c, ids = env.client, env.ids

    # 1. Multi-country (India PEPM INR + US Platform+Sub USD -> USD) + Services
    set_rate(env, ids.india, "shared_cloud", "pepm", "ess", unit_rate="150", tier_fees={str(ids.tiers[0]): {"unit_rate": "150"}})
    set_rate(env, ids.us, "shared_cloud", "platform", "ess", tier_fees={str(ids.tiers[0]): {"fixed_fee": "12000", "unit_rate": "8"}})

    cust = c.post("/api/customers/", json={"code": "CUST-MC-CALC", "name": "Global Multi Corp", "country_id": ids.us, "customer_tier_id": ids.tiers[0]}).json()
    deal = c.post("/api/deals/", json={"code": "DEAL-MC-CALC", "name": "Global Deal", "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    prop_mc = c.post("/api/proposals/", json={"code": "PROP-MC-CALC", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.usd, "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}).json()["id"]

    blk_in = c.post(f"/api/proposals/{prop_mc}/countries", json={"country_id": ids.india, "deployment_model_id": ids.deps["shared_cloud"], "pricing_model_id": ids.pms["pepm"], "user_headcount": 600, "is_primary_deployment": True}).json()
    blk_us = c.post(f"/api/proposals/{prop_mc}/countries", json={"country_id": ids.us, "deployment_model_id": ids.deps["shared_cloud"], "pricing_model_id": ids.pms["platform"], "user_headcount": 250, "is_primary_deployment": False}).json()

    c.post(f"/api/proposals/{prop_mc}/line-items", json={"pack_version_id": ids.pv, "uom_id": ids.uoms["ess"], "quantity": 600, "discount_pct": 5, "proposal_country_id": blk_in["id"]})
    c.post(f"/api/proposals/{prop_mc}/line-items", json={"pack_version_id": ids.pv, "uom_id": ids.uoms["ess"], "quantity": 250, "proposal_country_id": blk_us["id"]})
    c.post(f"/api/proposals/{prop_mc}/service-lines", json={"role_name": "Consultant", "service_rate_id": ids.sr_in, "days_or_hours": 10, "proposal_country_id": blk_in["id"]})

    calc_mc_res = c.post(f"/api/proposals/{prop_mc}/calculate", json={
        "contract_term_months": 36,
        "calculated_by_user_id": ids.user,
        "product_subscription_discounts": {"HR_CORE@IN": 4},
        "product_service_discounts": {"HR_CORE@IN": 10},
    })
    assert calc_mc_res.status_code == 200, calc_mc_res.text
    calc_mc = calc_mc_res.json()

    pdf_mc = fitz.open(stream=c.get(f"/api/proposals/{prop_mc}/export?format=pdf").content, filetype="pdf")
    mc_text = "\n".join(p.get_text() for p in pdf_mc)
    assert mc_text.find("COMMERCIAL CALCULATION DETAILS") < mc_text.find("FINAL COMMERCIAL SUMMARY")
    assert "India (INR)" in mc_text and "United States (USD)" in mc_text
    assert f"Page {len(pdf_mc)} of {len(pdf_mc)}" in mc_text
    assert f"{calc_mc['total_proposal_contract_reporting_currency']:,.2f}" in mc_text

    # 2. Services-Only proposal (no subscription line items, only service line + service discount)
    prop_so = c.post("/api/proposals/", json={"code": "PROP-SRV-ONLY", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.usd, "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}).json()["id"]
    blk_so = c.post(f"/api/proposals/{prop_so}/countries", json={"country_id": ids.us, "deployment_model_id": ids.deps["shared_cloud"], "pricing_model_id": ids.pms["pepm"], "user_headcount": 100, "is_primary_deployment": True}).json()
    c.post(f"/api/proposals/{prop_so}/service-lines", json={"role_name": "Architect", "service_rate_id": ids.sr_us, "days_or_hours": 10, "proposal_country_id": blk_so["id"]})
    so_res = c.post(f"/api/proposals/{prop_so}/calculate", json={"contract_term_months": 12, "calculated_by_user_id": ids.user})
    assert so_res.status_code == 200, so_res.text

    comm_so = c.get(f"/api/proposals/{prop_so}/export/commercials").json()
    assert comm_so["calculation_details"][0]["pricing_model"] == "Professional Services"
    docx_so = _extract_docx_linear_text(docx.Document(io.BytesIO(c.get(f"/api/proposals/{prop_so}/export?format=docx").content)))
    assert docx_so.find("Commercial Calculation Details") < docx_so.find("Final Commercial Summary")
    assert "Professional Services" in docx_so and "Architect" in docx_so
