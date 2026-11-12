"""Comprehensive isolated unit test suite for Deal Desk Commercial Calculator.

Covers gaps across:
1. Pricing Calculation Engine (PEPM, Platform+Sub, License+AMC, Annual Sub, Services)
2. Discounts & Edge Cases (0%, 100%, <0%, >100%, line+overall sequence, unknown keys)
3. FX Currency Conversion & Rounding (direct, inverse, effective dates, missing, schema <=0, HALF_UP)
4. Snapshot Validation, Immutability, & Malformed Payload Handling
5. Export Service Unit Helpers (formatting, formula details, split-run XML placeholder, PDF wrap)
6. Security / RBAC / Tier Band Validation Services & Pydantic Schema Bounds

All tests run strictly in-memory (SQLite / pure Python) and never connect to Neon PostgreSQL.
"""

from __future__ import annotations

import io
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import docx
import pymupdf as fitz
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.catalogue import Feature, Product, ProductFamily
from app.models.governance import User
from app.models.master_data import (
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    FxRate,
    PricingModel,
    UnitOfMeasure,
)
from app.models.proposals import (
    CalculationSnapshot,
    Customer,
    Deal,
    Proposal,
    ProposalCountry,
    ProposalLineItem,
    ProposalServiceLine,
    ProposalVersion,
    SnapshotImmutableError,
)
from app.models.rate_card import RateCard, RateCardVersion, ServiceRate
from app.schemas.master_data import FxRateCreate
from app.schemas.proposals import (
    CalculationRequest,
    ProposalLineItemCreate,
    ProposalServiceLineCreate,
)
from app.schemas.rate_card import RateCardCreate
from app.services.authentication import (
    create_access_token,
    decode_access_token,
    hash_password,
    normalize_email,
    redact_sensitive_data,
    verify_password,
)
from app.services.authorization import RoleCode, check_permission, check_regional_access
from app.services.pricing_engine import (
    CurrencyMismatchError,
    InvalidDiscountError,
    MissingConfigurationError,
    MissingFxRateError,
    MissingRateCardMatchError,
    MissingServiceRateError,
    PricingCalculationEngine,
    ProposalNotFoundError,
    quantize_currency,
    quantize_rate,
)
from app.services.proposal_export_service import (
    IncompleteCommercialError,
    NoCalculationSnapshotError,
    ProposalExportError,
    StaleCalculationSnapshotError,
    _build_product_calculation_details,
    _format_fx_rate,
    _infer_pricing_model_label,
    _replace_placeholder_in_paragraph_el,
    _signed_discount_docx,
    _signed_discount_pdf,
    _signed_money,
    _wrap_pdf_lines,
    extract_proposal_export_data,
    format_contract_duration,
    format_money,
    format_money_pdf,
    generate_proposal_docx,
    generate_proposal_pdf,
)
from app.services.tier_validation import (
    TierBandOverlapError,
    validate_customer_tier_bands,
    validate_tier_range,
)


# ---------------------------------------------------------------------------
# Isolated In-Memory SQLite Fixture & Builder Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def unit_db():
    """Fresh isolated SQLite DB seeded with pricing models, currencies, countries, and catalogue."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    class IsolatedSession(Session):
        pass

    @event.listens_for(IsolatedSession, "before_flush")
    def _auto_id(session, _ctx, _inst):
        counters = {}
        for instance in session.new:
            if hasattr(instance, "id") and getattr(instance, "id", None) is None:
                cls = type(instance)
                if cls not in counters:
                    counters[cls] = (
                        session.execute(select(func.coalesce(func.max(cls.id), 0))).scalar() or 0
                    )
                counters[cls] += 1
                setattr(instance, "id", counters[cls])

    LocalSession = sessionmaker(
        class_=IsolatedSession, autocommit=False, autoflush=False, bind=engine
    )
    db = LocalSession()

    inr = Currency(code="INR", name="Indian Rupee", symbol="₹", decimal_places=2, status="active")
    usd = Currency(code="USD", name="US Dollar", symbol="$", decimal_places=2, status="active")
    aed = Currency(code="AED", name="UAE Dirham", symbol="AED ", decimal_places=2, status="active")
    eur = Currency(code="EUR", name="Euro", symbol="€", decimal_places=2, status="active")
    db.add_all([inr, usd, aed, eur])
    db.flush()

    india = Country(
        iso_code="IN", name="India", currency_id=inr.id,
        price_multiplier=Decimal("1.000000"), status="active", valid_from=date(2026, 1, 1),
    )
    usa = Country(
        iso_code="US", name="United States", currency_id=usd.id,
        price_multiplier=Decimal("1.000000"), status="active", valid_from=date(2026, 1, 1),
    )
    uae = Country(
        iso_code="AE", name="United Arab Emirates", currency_id=aed.id,
        price_multiplier=Decimal("1.000000"), status="active", valid_from=date(2026, 1, 1),
    )
    db.add_all([india, usa, uae])
    db.flush()

    # 1 USD = 83 INR, 1 AED = 0.272 USD
    db.add_all([
        FxRate(
            from_currency_id=usd.id, to_currency_id=inr.id,
            rate=Decimal("83.00000000"), effective_date=date(2026, 1, 1),
        ),
        FxRate(
            from_currency_id=aed.id, to_currency_id=usd.id,
            rate=Decimal("0.27200000"), effective_date=date(2026, 1, 1),
        ),
    ])
    db.flush()

    tier1 = CustomerTier(name="Tier 1", employee_min=0, valid_from=date(2026, 1, 1))
    uom_emp = UnitOfMeasure(code="EMP", name="Employees", status="active")
    uom_lic = UnitOfMeasure(code="LIC", name="Licenses", status="active")
    user = User(
        email="qa.unit@adrenalin.com", full_name="QA Unit User",
        password_hash="hash", is_active=True,
    )
    dep_shared = DeploymentModel(code="SHARED_CLOUD", name="Shared Cloud", status="active")
    dep_onprem = DeploymentModel(code="ON_PREMISE", name="On-Premise", status="active")

    pm_pepm = PricingModel(
        code="PEPM", name="Per Employee Per Month",
        has_fixed_component=False, fixed_fee_basis="annual",
        has_unit_component=True, unit_rate_basis="monthly", status="active",
    )
    pm_platform_sub = PricingModel(
        code="PLAT_SUB", name="Platform + Subscription",
        has_fixed_component=True, fixed_fee_basis="annual",
        has_unit_component=True, unit_rate_basis="monthly", status="active",
    )
    pm_onetime_plat_sub = PricingModel(
        code="PLAT_OT_SUB", name="One-Time Platform + Subscription",
        has_fixed_component=True, fixed_fee_basis="one_time",
        has_unit_component=True, unit_rate_basis="monthly", status="active",
    )
    pm_license_amc = PricingModel(
        code="LIC_AMC", name="License Fee + AMC",
        has_fixed_component=False, fixed_fee_basis="one_time",
        has_unit_component=True, unit_rate_basis="one_time", status="active",
    )
    pm_annual_sub = PricingModel(
        code="ANNUAL_SUB", name="Annual Subscription",
        has_fixed_component=False, fixed_fee_basis="annual",
        has_unit_component=True, unit_rate_basis="annual", status="active",
    )
    db.add_all([
        tier1, uom_emp, uom_lic, user, dep_shared, dep_onprem,
        pm_pepm, pm_platform_sub, pm_onetime_plat_sub, pm_license_amc, pm_annual_sub,
    ])
    db.flush()

    rcv = RateCardVersion(
        version_no="RC-UNIT-2026", name="Unit RC", status="active", valid_from=date(2026, 1, 1),
    )
    fam = ProductFamily(code="HRMS", name="Core HRMS")
    db.add_all([rcv, fam])
    db.flush()

    prod_core = Product(product_family_id=fam.id, code="CORE", name="Core HR")
    prod_payroll = Product(product_family_id=fam.id, code="PAY", name="Payroll")
    db.add_all([prod_core, prod_payroll])
    db.flush()

    feat_core = Feature(
        product_id=prod_core.id, code="CORE_MOD", name="Core Module",
        classification="native", status="active",
    )
    feat_pay = Feature(
        product_id=prod_payroll.id, code="PAY_MOD", name="Payroll Module",
        classification="native", status="active",
    )
    db.add_all([feat_core, feat_pay])
    db.flush()

    cust = Customer(
        code="CUST-UNIT", name="Unit Acme Corp",
        customer_tier_id=tier1.id, country_id=india.id, status="active",
    )
    db.add(cust)
    db.flush()

    deal = Deal(
        code="DEAL-UNIT-1", name="Unit QA Deal",
        customer_id=cust.id, owner_user_id=user.id, status="open",
    )
    db.add(deal)
    db.commit()

    ctx: dict[str, Any] = {
        "db": db,
        "inr": inr,
        "usd": usd,
        "aed": aed,
        "eur": eur,
        "india": india,
        "usa": usa,
        "uae": uae,
        "tier1": tier1,
        "uom_emp": uom_emp,
        "uom_lic": uom_lic,
        "user": user,
        "dep_shared": dep_shared,
        "dep_onprem": dep_onprem,
        "pm_pepm": pm_pepm,
        "pm_platform_sub": pm_platform_sub,
        "pm_onetime_plat_sub": pm_onetime_plat_sub,
        "pm_license_amc": pm_license_amc,
        "pm_annual_sub": pm_annual_sub,
        "rcv": rcv,
        "prod_core": prod_core,
        "prod_payroll": prod_payroll,
        "feat_core": feat_core,
        "feat_pay": feat_pay,
        "cust": cust,
        "deal": deal,
    }
    try:
        yield ctx
    finally:
        db.close()
        engine.dispose()


def _make_proposal(
    ctx: dict[str, Any],
    *,
    number: str,
    country=None,
    currency=None,
    deployment=None,
    pricing_model=None,
    contract_months: int = 12,
    headcount: int = 200,
):
    db = ctx["db"]
    country = country or ctx["india"]
    currency = currency or ctx["inr"]
    deployment = deployment or ctx["dep_shared"]
    pricing_model = pricing_model or ctx["pm_pepm"]

    proposal = Proposal(
        code=number,
        deal_id=ctx["deal"].id,
        customer_id=ctx["cust"].id,
        currency_id=currency.id,
        status="draft",
        created_by_user_id=ctx["user"].id,
    )
    db.add(proposal)
    db.flush()

    pc = ProposalCountry(
        proposal_id=proposal.id,
        country_id=country.id,
        deployment_model_id=deployment.id,
        pricing_model_id=pricing_model.id,
        user_headcount=headcount,
        is_primary_deployment=True,
    )
    db.add(pc)
    db.flush()

    ver = ProposalVersion(
        proposal_id=proposal.id,
        version_no=1,
        rate_card_version_id=ctx["rcv"].id,
        status="draft",
        created_by_user_id=ctx["user"].id,
    )
    db.add(ver)
    db.flush()
    return proposal, pc, ver


# ===========================================================================
# 1. Pricing Calculation Engine — All 5 Models & Edge Cases
# ===========================================================================


class TestPricingModelsUnit:
    def test_pepm_56_months_with_line_and_overall_discounts(self, unit_db):
        """Reproduces 890/emp/mo * 200 * 56mo -> 5.88% line -> 9% overall subscription discount."""
        db = unit_db["db"]
        db.add(
            RateCard(
                rate_card_version_id=unit_db["rcv"].id,
                feature_id=unit_db["feat_core"].id,
                country_id=unit_db["india"].id,
                tier_id=unit_db["tier1"].id,
                uom_id=unit_db["uom_emp"].id,
                deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_pepm"].id,
                currency_id=unit_db["inr"].id,
                fixed_fee=Decimal("0.00"),
                unit_rate=Decimal("890.0000"),
            )
        )
        prop, pc, ver = _make_proposal(
            unit_db, number="PROP-PEPM-56", contract_months=56, headcount=200
        )
        db.add(
            ProposalLineItem(
                proposal_version_id=ver.id,
                proposal_country_id=pc.id,
                line_number=1,
                feature_id=unit_db["feat_core"].id,
                uom_id=unit_db["uom_emp"].id,
                quantity=Decimal("200"),
                list_unit_price=Decimal("890.00"),
                discount_pct=Decimal("5.88"),
                net_unit_price=Decimal("0.00"),
                extended_amount=Decimal("0.00"),
                currency_id=unit_db["inr"].id,
            )
        )
        db.flush()

        res = PricingCalculationEngine(db).calculate_proposal(
            proposal_id=prop.id,
            version_id=ver.id,
            contract_term_months=56,
            product_discounts={"CORE": Decimal("9.00")},
            user_id=unit_db["user"].id,
        )
        payload = res["snapshot_payload"]
        line = payload["all_subscription_line_items"][0]
        assert line["annual_consumption_fee"] == pytest.approx(2136000.00)
        assert line["contract_subscription_before_discount"] == pytest.approx(9968000.00)
        assert line["contract_discount_amount"] == pytest.approx(586118.40)
        assert line["contract_subscription_after_discount"] == pytest.approx(9381881.60)

        prod = payload["products"][0]
        assert prod["contract_subscription_discount_amount"] == pytest.approx(844369.34)
        assert prod["contract_subscription_total_after_discount"] == pytest.approx(8537512.26)
        assert res["total_proposal_contract_reporting_currency"] == pytest.approx(8537512.26)

    def test_pepm_zero_employees_and_zero_rate_produce_zero(self, unit_db):
        db = unit_db["db"]
        db.add(
            RateCard(
                rate_card_version_id=unit_db["rcv"].id,
                feature_id=unit_db["feat_core"].id,
                country_id=unit_db["india"].id,
                tier_id=unit_db["tier1"].id,
                uom_id=unit_db["uom_emp"].id,
                deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_pepm"].id,
                currency_id=unit_db["inr"].id,
                fixed_fee=Decimal("0.00"),
                unit_rate=Decimal("0.0000"),
            )
        )
        prop, pc, ver = _make_proposal(unit_db, number="PROP-PEPM-ZERO", contract_months=12, headcount=0)
        db.add(
            ProposalLineItem(
                proposal_version_id=ver.id,
                proposal_country_id=pc.id,
                line_number=1,
                feature_id=unit_db["feat_core"].id,
                uom_id=unit_db["uom_emp"].id,
                quantity=Decimal("0"),
                list_unit_price=Decimal("0.00"),
                discount_pct=Decimal("0.00"),
                net_unit_price=Decimal("0.00"),
                extended_amount=Decimal("0.00"),
                currency_id=unit_db["inr"].id,
            )
        )
        db.flush()

        res = PricingCalculationEngine(db).calculate_proposal(prop.id, user_id=unit_db["user"].id)
        assert res["total_proposal_reporting_currency"] == 0.0
        assert res["total_proposal_contract_reporting_currency"] == 0.0

    def test_platform_plus_subscription_partial_durations_and_one_time_platform(self, unit_db):
        db = unit_db["db"]
        db.add_all([
            RateCard(
                rate_card_version_id=unit_db["rcv"].id,
                feature_id=unit_db["feat_core"].id,
                country_id=unit_db["india"].id,
                tier_id=unit_db["tier1"].id,
                uom_id=unit_db["uom_emp"].id,
                deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_platform_sub"].id,
                currency_id=unit_db["inr"].id,
                fixed_fee=Decimal("380000.00"),
                unit_rate=Decimal("80.00"),
            ),
            RateCard(
                rate_card_version_id=unit_db["rcv"].id,
                feature_id=unit_db["feat_pay"].id,
                country_id=unit_db["india"].id,
                tier_id=unit_db["tier1"].id,
                uom_id=unit_db["uom_emp"].id,
                deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_onetime_plat_sub"].id,
                currency_id=unit_db["inr"].id,
                fixed_fee=Decimal("100000.00"),
                unit_rate=Decimal("50.00"),
            ),
        ])
        prop, pc, ver = _make_proposal(
            unit_db, number="PROP-PLAT-18",
            pricing_model=unit_db["pm_platform_sub"], contract_months=18, headcount=250,
        )
        db.add(
            ProposalLineItem(
                proposal_version_id=ver.id,
                proposal_country_id=pc.id,
                line_number=1,
                feature_id=unit_db["feat_core"].id,
                uom_id=unit_db["uom_emp"].id,
                quantity=Decimal("250"),
                list_unit_price=Decimal("80.00"),
                discount_pct=Decimal("0.00"),
                net_unit_price=Decimal("0.00"),
                extended_amount=Decimal("0.00"),
                currency_id=unit_db["inr"].id,
            )
        )
        db.flush()

        engine = PricingCalculationEngine(db)
        # 6 months partial: 190,000 + 120,000 = 310,000
        r6 = engine.calculate_proposal(prop.id, contract_term_months=6, user_id=unit_db["user"].id)
        assert r6["total_proposal_contract_reporting_currency"] == pytest.approx(310000.00)
        # 23 months non-integer years: 380000*23/12 (728333.33) + 80*250*23 (460000) = 1,188,333.33
        r23 = engine.calculate_proposal(prop.id, contract_term_months=23, user_id=unit_db["user"].id)
        assert r23["total_proposal_contract_reporting_currency"] == pytest.approx(1188333.33)

        # One-time platform fee over 24 months: fixed charged ONCE (100k), consumption 50*100*24 (120k)
        prop_ot, pc_ot, ver_ot = _make_proposal(
            unit_db, number="PROP-PLAT-OT",
            pricing_model=unit_db["pm_onetime_plat_sub"], contract_months=24, headcount=100,
        )
        db.add(
            ProposalLineItem(
                proposal_version_id=ver_ot.id,
                proposal_country_id=pc_ot.id,
                line_number=1,
                feature_id=unit_db["feat_pay"].id,
                uom_id=unit_db["uom_emp"].id,
                quantity=Decimal("100"),
                list_unit_price=Decimal("50.00"),
                discount_pct=Decimal("0.00"),
                net_unit_price=Decimal("0.00"),
                extended_amount=Decimal("0.00"),
                currency_id=unit_db["inr"].id,
            )
        )
        db.flush()
        rot = engine.calculate_proposal(prop_ot.id, contract_term_months=24, user_id=unit_db["user"].id)
        line_ot = rot["snapshot_payload"]["all_subscription_line_items"][0]
        assert line_ot["contract_platform_fee"] == pytest.approx(100000.00)
        assert line_ot["contract_consumption_fee"] == pytest.approx(120000.00)
        assert rot["total_proposal_contract_reporting_currency"] == pytest.approx(220000.00)

    def test_platform_missing_fixed_fee_raises_error(self, unit_db):
        db = unit_db["db"]
        db.add(
            RateCard(
                rate_card_version_id=unit_db["rcv"].id,
                feature_id=unit_db["feat_core"].id,
                country_id=unit_db["india"].id,
                tier_id=unit_db["tier1"].id,
                uom_id=unit_db["uom_emp"].id,
                deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_platform_sub"].id,
                currency_id=unit_db["inr"].id,
                fixed_fee=None,
                unit_rate=Decimal("80.00"),
            )
        )
        prop, pc, ver = _make_proposal(
            unit_db, number="PROP-NO-FIXED", pricing_model=unit_db["pm_platform_sub"]
        )
        db.add(
            ProposalLineItem(
                proposal_version_id=ver.id, proposal_country_id=pc.id, line_number=1,
                feature_id=unit_db["feat_core"].id, uom_id=unit_db["uom_emp"].id,
                quantity=Decimal("100"), list_unit_price=Decimal("80.00"), discount_pct=Decimal("0"),
                net_unit_price=Decimal("0"), extended_amount=Decimal("0"), currency_id=unit_db["inr"].id,
            )
        )
        db.flush()
        with pytest.raises(MissingRateCardMatchError, match="fixed"):
            PricingCalculationEngine(db).calculate_proposal(prop.id)

    def test_license_amc_partial_year_zero_amc_and_missing_amc_rejection(self, unit_db):
        db = unit_db["db"]
        rc = RateCard(
            rate_card_version_id=unit_db["rcv"].id,
            feature_id=unit_db["feat_core"].id,
            country_id=unit_db["india"].id,
            tier_id=unit_db["tier1"].id,
            uom_id=unit_db["uom_lic"].id,
            deployment_model_id=unit_db["dep_onprem"].id,
            pricing_model_id=unit_db["pm_license_amc"].id,
            currency_id=unit_db["inr"].id,
            fixed_fee=Decimal("0.00"),
            unit_rate=Decimal("2000.00"),
            amc_percentage=Decimal("20.0000"),
        )
        db.add(rc)
        prop, pc, ver = _make_proposal(
            unit_db, number="PROP-LIC-AMC",
            deployment=unit_db["dep_onprem"], pricing_model=unit_db["pm_license_amc"], contract_months=18,
        )
        db.add(
            ProposalLineItem(
                proposal_version_id=ver.id, proposal_country_id=pc.id, line_number=1,
                feature_id=unit_db["feat_core"].id, uom_id=unit_db["uom_lic"].id,
                quantity=Decimal("100"), list_unit_price=Decimal("2000.00"), discount_pct=Decimal("0"),
                net_unit_price=Decimal("0"), extended_amount=Decimal("0"), currency_id=unit_db["inr"].id,
            )
        )
        db.flush()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(prop.id, contract_term_months=18)
        line = res["snapshot_payload"]["all_subscription_line_items"][0]
        assert line["contract_platform_fee"] == pytest.approx(200000.00)  # One-time license
        assert line["annual_consumption_fee"] == pytest.approx(40000.00)  # Annual AMC
        assert line["contract_consumption_fee"] == pytest.approx(60000.00)  # 18mo prorated AMC
        assert res["total_proposal_annual_reporting_currency"] == pytest.approx(240000.00)
        assert res["total_proposal_contract_reporting_currency"] == pytest.approx(260000.00)

        # Explicit 0% AMC is permitted
        rc.amc_percentage = Decimal("0.0000")
        db.flush()
        res_zero = engine.calculate_proposal(prop.id, contract_term_months=18)
        assert res_zero["total_proposal_contract_reporting_currency"] == pytest.approx(200000.00)

        # Missing AMC % (None) is rejected
        rc.amc_percentage = None
        db.flush()
        with pytest.raises(MissingRateCardMatchError, match="AMC %"):
            engine.calculate_proposal(prop.id, contract_term_months=18)

    def test_annual_subscription_proration_and_zero_rate(self, unit_db):
        db = unit_db["db"]
        rc = RateCard(
            rate_card_version_id=unit_db["rcv"].id,
            feature_id=unit_db["feat_core"].id,
            country_id=unit_db["india"].id,
            tier_id=unit_db["tier1"].id,
            uom_id=unit_db["uom_emp"].id,
            deployment_model_id=unit_db["dep_shared"].id,
            pricing_model_id=unit_db["pm_annual_sub"].id,
            currency_id=unit_db["inr"].id,
            fixed_fee=Decimal("0.00"),
            unit_rate=Decimal("1200.00"),
        )
        db.add(rc)
        prop, pc, ver = _make_proposal(
            unit_db, number="PROP-ANN-SUB", pricing_model=unit_db["pm_annual_sub"], contract_months=18,
        )
        db.add(
            ProposalLineItem(
                proposal_version_id=ver.id, proposal_country_id=pc.id, line_number=1,
                feature_id=unit_db["feat_core"].id, uom_id=unit_db["uom_emp"].id,
                quantity=Decimal("100"), list_unit_price=Decimal("1200.00"), discount_pct=Decimal("0"),
                net_unit_price=Decimal("0"), extended_amount=Decimal("0"), currency_id=unit_db["inr"].id,
            )
        )
        db.flush()

        engine = PricingCalculationEngine(db)
        r6 = engine.calculate_proposal(prop.id, contract_term_months=6)
        assert r6["total_proposal_annual_reporting_currency"] == pytest.approx(120000.00)
        assert r6["total_proposal_contract_reporting_currency"] == pytest.approx(60000.00)

        r18 = engine.calculate_proposal(prop.id, contract_term_months=18)
        assert r18["total_proposal_contract_reporting_currency"] == pytest.approx(180000.00)

        rc.unit_rate = Decimal("0.00")
        db.flush()
        r0 = engine.calculate_proposal(prop.id, contract_term_months=18)
        assert r0["total_proposal_contract_reporting_currency"] == 0.0

    def test_professional_services_formulas_and_validation(self, unit_db):
        db = unit_db["db"]
        sr_hourly = ServiceRate(
            country_id=unit_db["india"].id, role_name="Implementation Consultant",
            hourly_rate=Decimal("1500.00"), hours_per_day=Decimal("8.00"),
            daily_rate=None, currency_id=unit_db["inr"].id,
            status="active", valid_from=date(2026, 1, 1),
        )
        sr_daily = ServiceRate(
            country_id=unit_db["india"].id, role_name="Project Manager",
            hourly_rate=Decimal("999.00"), hours_per_day=Decimal("8.00"),
            daily_rate=Decimal("10000.00"), currency_id=unit_db["inr"].id,
            status="active", valid_from=date(2026, 1, 1),
        )
        sr_zero_day = ServiceRate(
            country_id=unit_db["india"].id, role_name="Invalid Zero Role",
            hourly_rate=None, hours_per_day=Decimal("8.00"),
            daily_rate=Decimal("0.00"), currency_id=unit_db["inr"].id,
            status="active", valid_from=date(2026, 1, 1),
        )
        db.add_all([sr_hourly, sr_daily, sr_zero_day])
        prop, pc, ver = _make_proposal(unit_db, number="PROP-SRV")
        sl1 = ProposalServiceLine(
            proposal_version_id=ver.id, proposal_country_id=pc.id,
            service_rate_id=sr_hourly.id, role_name="Implementation Consultant",
            days_or_hours=Decimal("10.0"), rate_applied=Decimal("0"),
            discount_pct=Decimal("0"), extended_amount=Decimal("0"), currency_id=unit_db["inr"].id,
        )
        sl2 = ProposalServiceLine(
            proposal_version_id=ver.id, proposal_country_id=pc.id,
            service_rate_id=sr_daily.id, role_name="Project Manager",
            days_or_hours=Decimal("5.0"), rate_applied=Decimal("0"),
            discount_pct=Decimal("0"), extended_amount=Decimal("0"), currency_id=unit_db["inr"].id,
        )
        db.add_all([sl1, sl2])
        db.flush()

        engine = PricingCalculationEngine(db)
        # 10 * (1500*8=12000) + 5 * 10000 = 120,000 + 50,000 = 170,000; 10% svc discount -> 153,000
        res = engine.calculate_proposal(prop.id, product_service_discounts={"SERVICES": Decimal("10.00")})
        assert res["snapshot_payload"]["products"][0]["service_subtotal_before_discount"] == pytest.approx(170000.00)
        assert res["snapshot_payload"]["products"][0]["service_discount_amount"] == pytest.approx(170000.00 * 0.10)
        assert res["total_proposal_contract_reporting_currency"] == pytest.approx(153000.00)

        # Individual service-line discount must be rejected
        sl1.discount_pct = Decimal("5.00")
        db.flush()
        with pytest.raises(InvalidDiscountError, match="individual service-line discounts"):
            engine.calculate_proposal(prop.id)

        # Zero day rate must raise MissingServiceRateError
        sl1.discount_pct = Decimal("0.00")
        sl1.service_rate_id = sr_zero_day.id
        sl1.role_name = sr_zero_day.role_name
        db.flush()
        with pytest.raises(MissingServiceRateError, match="invalid"):
            engine.calculate_proposal(prop.id)


# ===========================================================================
# 2. Discount Edge Cases & Pydantic Schema Bounds
# ===========================================================================


class TestDiscountsAndSchemasUnit:
    def test_100_percent_and_invalid_discounts(self, unit_db):
        db = unit_db["db"]
        db.add(
            RateCard(
                rate_card_version_id=unit_db["rcv"].id,
                feature_id=unit_db["feat_core"].id,
                country_id=unit_db["india"].id,
                tier_id=unit_db["tier1"].id,
                uom_id=unit_db["uom_emp"].id,
                deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_pepm"].id,
                currency_id=unit_db["inr"].id,
                fixed_fee=Decimal("0.00"),
                unit_rate=Decimal("100.00"),
            )
        )
        prop, pc, ver = _make_proposal(unit_db, number="PROP-DISC-EDGE")
        line = ProposalLineItem(
            proposal_version_id=ver.id, proposal_country_id=pc.id, line_number=1,
            feature_id=unit_db["feat_core"].id, uom_id=unit_db["uom_emp"].id,
            quantity=Decimal("10"), list_unit_price=Decimal("100.00"), discount_pct=Decimal("0"),
            net_unit_price=Decimal("0"), extended_amount=Decimal("0"), currency_id=unit_db["inr"].id,
        )
        db.add(line)
        db.flush()
        engine = PricingCalculationEngine(db)

        # 100% discount results in 0 net
        res100 = engine.calculate_proposal(prop.id, product_discounts={"CORE": Decimal("100")})
        assert res100["total_proposal_contract_reporting_currency"] == 0.0

        # Negative overall discount rejected
        with pytest.raises(InvalidDiscountError, match="between 0 and 100"):
            engine.calculate_proposal(prop.id, product_discounts={"CORE": Decimal("-0.01")})

        # Over-100% overall discount rejected
        with pytest.raises(InvalidDiscountError, match="between 0 and 100"):
            engine.calculate_proposal(prop.id, product_discounts={"CORE": Decimal("100.01")})

        # Unknown product code discount rejected
        with pytest.raises(InvalidDiscountError, match="not on this proposal"):
            engine.calculate_proposal(prop.id, product_discounts={"GHOST": Decimal("10")})

        # Negative item discount rejected directly by engine guard
        from types import SimpleNamespace
        bad_item = SimpleNamespace(
            id=999, line_number=1, pack_version_id=None, feature_id=unit_db["feat_core"].id,
            uom_id=unit_db["uom_emp"].id, quantity=Decimal("10"), discount_pct=Decimal("-5.00"),
            pack_version=None, feature=unit_db["feat_core"],
        )
        with pytest.raises(InvalidDiscountError, match="between 0 and 100"):
            engine._calculate_subscription_item(
                item=bad_item,
                rate_card_version_id=unit_db["rcv"].id,
                default_country_id=unit_db["india"].id,
                default_tier_id=unit_db["tier1"].id,
                deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_pepm"].id,
                persist_amounts=False,
                contract_term_months=12,
            )

    def test_pydantic_schema_rejects_invalid_numeric_inputs(self):
        # Negative / zero contract_term_months
        with pytest.raises(ValidationError):
            CalculationRequest(contract_term_months=0)
        with pytest.raises(ValidationError):
            CalculationRequest(contract_term_months=-12)
        with pytest.raises(ValidationError):
            CalculationRequest(contract_term_months=121)

        # Negative line quantity & invalid discount
        with pytest.raises(ValidationError):
            ProposalLineItemCreate(
                proposal_version_id=1, line_number=1, feature_id=1, uom_id=1,
                quantity=Decimal("-1"), list_unit_price=Decimal("10"),
                net_unit_price=Decimal("10"), extended_amount=Decimal("10"), currency_id=1,
            )
        with pytest.raises(ValidationError):
            ProposalLineItemCreate(
                proposal_version_id=1, line_number=1, feature_id=1, uom_id=1,
                quantity=Decimal("10"), list_unit_price=Decimal("10"), discount_pct="not-a-number",
                net_unit_price=Decimal("10"), extended_amount=Decimal("10"), currency_id=1,
            )

        # Negative service man-days
        with pytest.raises(ValidationError):
            ProposalServiceLineCreate(
                proposal_version_id=1, role_name="PM", days_or_hours=Decimal("-2"),
                rate_applied=Decimal("100"), extended_amount=Decimal("0"), currency_id=1,
            )

        # Out-of-range AMC % on RateCardCreate
        with pytest.raises(ValidationError):
            RateCardCreate(
                rate_card_version_id=1, feature_id=1, country_id=1, tier_id=1,
                uom_id=1, deployment_model_id=1, pricing_model_id=1, currency_id=1,
                unit_rate=Decimal("100"), amc_percentage=Decimal("-1"),
                valid_from=date(2026, 1, 1),
            )
        with pytest.raises(ValidationError):
            RateCardCreate(
                rate_card_version_id=1, feature_id=1, country_id=1, tier_id=1,
                uom_id=1, deployment_model_id=1, pricing_model_id=1, currency_id=1,
                unit_rate=Decimal("100"), amc_percentage=Decimal("101"),
                valid_from=date(2026, 1, 1),
            )

        # FX rate <= 0 and same-currency rejection
        with pytest.raises(ValidationError):
            FxRateCreate(
                from_currency_id=1, to_currency_id=2, rate=Decimal("0"), effective_date=date(2026, 1, 1)
            )
        with pytest.raises(ValidationError):
            FxRateCreate(
                from_currency_id=1, to_currency_id=1, rate=Decimal("1.5"), effective_date=date(2026, 1, 1)
            )


# ===========================================================================
# 3. FX Conversion & Rounding Precision
# ===========================================================================


class TestFxAndRoundingUnit:
    def test_quantize_half_up_rules(self):
        assert quantize_currency(Decimal("10.005")) == Decimal("10.01")
        assert quantize_currency(Decimal("10.004")) == Decimal("10.00")
        assert quantize_rate(Decimal("1.23455")) == Decimal("1.2346")
        assert quantize_rate(Decimal("1.23454")) == Decimal("1.2345")

    def test_fx_resolution_direct_inverse_effective_date_and_missing(self, unit_db):
        db = unit_db["db"]
        inr, usd, eur = unit_db["inr"], unit_db["usd"], unit_db["eur"]
        # Add an older rate and a future rate for USD->INR
        db.add_all([
            FxRate(from_currency_id=usd.id, to_currency_id=inr.id, rate=Decimal("80.00"), effective_date=date(2025, 1, 1)),
            FxRate(from_currency_id=usd.id, to_currency_id=inr.id, rate=Decimal("90.00"), effective_date=date(2099, 1, 1)),
        ])
        db.flush()

        engine = PricingCalculationEngine(db)
        # Same currency
        same = engine._resolve_fx(inr.id, inr.id)
        assert same["multiplier"] == Decimal("1.00000000")
        assert same["pair"] == "1:1"

        # Picks newest <= today (83, not 80 and not future 90)
        direct = engine._resolve_fx(usd.id, inr.id, as_of=date(2026, 6, 1))
        assert direct["multiplier"] == Decimal("83.00000000")
        assert direct["inverted"] is False

        # Historical as_of=2025-06-01 picks 80
        hist = engine._resolve_fx(usd.id, inr.id, as_of=date(2025, 6, 1))
        assert hist["multiplier"] == Decimal("80.00000000")

        # Inverse INR -> USD = 1 / 83 rounded to 8 decimals
        inv = engine._resolve_fx(inr.id, usd.id, as_of=date(2026, 6, 1))
        assert inv["inverted"] is True
        assert inv["multiplier"] == Decimal("0.01204819")

        # Missing EUR -> USD
        with pytest.raises(MissingFxRateError, match="EUR"):
            engine._resolve_fx(eur.id, usd.id)

    def test_fx_reporting_currency_split_reconciles_exactly(self, unit_db):
        """Ensures subscription_reporting_total + service_reporting_total == product_reporting_total."""
        db = unit_db["db"]
        # Create odd native amounts with INR -> USD inverse FX so rounding remainder logic is exercised
        db.add(
            RateCard(
                rate_card_version_id=unit_db["rcv"].id, feature_id=unit_db["feat_core"].id,
                country_id=unit_db["india"].id, tier_id=unit_db["tier1"].id,
                uom_id=unit_db["uom_emp"].id, deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_pepm"].id, currency_id=unit_db["inr"].id,
                fixed_fee=Decimal("0"), unit_rate=Decimal("101.00"),
            )
        )
        sr = ServiceRate(
            country_id=unit_db["india"].id, role_name="Lead",
            hourly_rate=Decimal("101.00"), hours_per_day=Decimal("8.00"),
            daily_rate=Decimal("1013.00"), currency_id=unit_db["inr"].id,
            status="active", valid_from=date(2026, 1, 1),
        )
        db.add(sr)
        prop, pc, ver = _make_proposal(unit_db, number="PROP-FX-REC", currency=unit_db["usd"])
        db.add_all([
            ProposalLineItem(
                proposal_version_id=ver.id, proposal_country_id=pc.id, line_number=1,
                feature_id=unit_db["feat_core"].id, uom_id=unit_db["uom_emp"].id,
                quantity=Decimal("17"), list_unit_price=Decimal("101.00"), discount_pct=Decimal("0"),
                net_unit_price=Decimal("0"), extended_amount=Decimal("0"), currency_id=unit_db["inr"].id,
            ),
            ProposalServiceLine(
                proposal_version_id=ver.id, proposal_country_id=pc.id,
                service_rate_id=sr.id, role_name="Lead", days_or_hours=Decimal("7"),
                rate_applied=Decimal("0"), discount_pct=Decimal("0"), extended_amount=Decimal("0"),
                currency_id=unit_db["inr"].id,
            ),
        ])
        db.flush()

        res = PricingCalculationEngine(db).calculate_proposal(prop.id)
        p = res["snapshot_payload"]["products"][0]
        assert round(p["subscription_reporting_total"] + p["service_reporting_total"], 2) == p["product_reporting_total"]
        assert res["total_proposal_contract_reporting_currency"] == p["contract_product_reporting_total"]


# ===========================================================================
# 4. Snapshot Validation, Immutability & Export Helpers
# ===========================================================================


class TestExportHelpersAndSnapshotValidationUnit:
    def test_formatting_and_label_helpers(self):
        assert format_money(1234.5, "USD") == "$1,234.50"
        assert format_money(1234.5, "INR") == "₹1,234.50"
        assert format_money(None, "USD") == "—"
        assert format_money("bad", "USD") == "—"

        assert format_money_pdf(1234.5, "INR") == "INR 1,234.50"
        assert format_money_pdf(-99.5, "USD") == "-USD 99.50"
        assert format_money_pdf("", "USD") == "-"

        assert format_contract_duration(1) == "1 Month (0.08 Years)"
        assert format_contract_duration(12) == "12 Months (1 Year)"
        assert format_contract_duration(18) == "18 Months (1.5 Years)"
        assert format_contract_duration(36) == "36 Months (3 Years)"
        assert format_contract_duration(56) == "56 Months (4.67 Years)"

        assert _format_fx_rate(1.0) == "1"
        assert _format_fx_rate(0.0120481900) == "0.01204819"
        assert _format_fx_rate("invalid") == "1"

        assert _signed_money(-50, "USD") == "−$50.00"
        assert _signed_discount_docx(25, "USD") == "−$25.00"
        assert _signed_discount_docx(0, "USD") == "$0.00"
        assert _signed_discount_pdf(25, "USD") == "-USD 25.00"
        assert _signed_discount_pdf(0, "USD") == "USD 0.00"

        assert _infer_pricing_model_label({}, [], [{"role_name": "PM"}]) == "Professional Services"
        assert _infer_pricing_model_label({"pricing_model_name": "Custom PM"}, [{}], []) == "Custom PM"
        assert _infer_pricing_model_label({}, [{"unit_rate_basis": "one_time"}], []) == "License Fee + AMC"
        assert _infer_pricing_model_label({}, [{"platform_fee": 100}], []) == "Platform + Subscription"
        assert _infer_pricing_model_label({}, [{"unit_rate_basis": "annual"}], []) == "Annual Subscription"
        assert _infer_pricing_model_label({}, [{"unit_rate_basis": "monthly"}], []) == "Per Employee Per Month (PEPM)"

    def test_build_product_calculation_details_all_models(self):
        prod_entry = {
            "product_name": "Core HR",
            "product_code": "CORE",
            "country_name": "India",
            "country_iso": "IN",
            "native_currency": "INR",
            "fx_multiplier": 0.012,
            "pricing_model_name": "",
            "line_items": [
                {
                    "target_name": "Core Module",
                    "unit_rate_basis": "monthly",
                    "fixed_fee_basis": "annual",
                    "average_monthly_volume": 200,
                    "rate_per_unit": 890,
                    "platform_fee": 0,
                    "contract_platform_fee": 0,
                    "contract_consumption_fee": 9968000,
                    "contract_subscription_before_discount": 9968000,
                    "item_discount_pct": 5.88,
                    "contract_discount_amount": 586118.40,
                    "contract_subscription_after_discount": 9381881.60,
                    "uom_name": "Employees",
                }
            ],
            "service_lines": [],
            "sub_discount_pct": 9.0,
            "sub_discount_amt": 844369.34,
            "contract_sub_total": 8537512.26,
            "serv_discount_pct": 0.0,
            "serv_subtotal": 0.0,
            "serv_discount_amt": 0.0,
            "serv_total": 0.0,
            "contract_native_total": 8537512.26,
            "contract_reporting_total": 102450.15,
        }
        details = _build_product_calculation_details(
            prod_entry, {"product_reporting_total": 18500.0}, 56, "USD"
        )
        assert details["pricing_model"] == "Per Employee Per Month (PEPM)"
        assert details["fx_applied"] is True
        assert any("Reporting Currency Amount (USD)" in s["label"] for s in details["steps"])
        assert any("First-Year Value (USD)" in s["label"] for s in details["steps"])

    def test_replace_placeholder_across_split_xml_runs(self):
        doc = docx.Document()
        p = doc.add_paragraph()
        p.add_run("Client: X")
        p.add_run("X")
        p.add_run("X Limited")
        _replace_placeholder_in_paragraph_el(p._p, "XXX", "Acme Global")
        assert p.text == "Client: Acme Global Limited"

    def test_wrap_pdf_lines_respects_max_width(self):
        text = "Adrenalin Deal Desk Commercial Proposal Detailed Calculation Breakdown"
        wrapped = _wrap_pdf_lines(fitz, text, max_width=120.0, fontsize=8.0)
        assert len(wrapped) > 1
        for line in wrapped:
            assert fitz.get_text_length(line, fontname="helv", fontsize=8.0) <= 125.0
        assert _wrap_pdf_lines(fitz, "", max_width=100.0) == [""]

    def test_extract_validation_empty_malformed_stale_missing_and_immutability(self, unit_db):
        db = unit_db["db"]
        prop_none, _, _ = _make_proposal(unit_db, number="PROP-VAL-NONE")

        # 1. No snapshot -> NoCalculationSnapshotError
        with pytest.raises(NoCalculationSnapshotError):
            extract_proposal_export_data(prop_none.id, db)

        # 2. Malformed/empty payload snapshot -> IncompleteCommercialError
        prop_empty, _, ver_empty = _make_proposal(unit_db, number="PROP-VAL-EMPTY")
        snap_empty = CalculationSnapshot(
            proposal_version_id=ver_empty.id,
            calculated_by_user_id=unit_db["user"].id,
            snapshot_payload={},
        )
        db.add(snap_empty)
        db.flush()
        with pytest.raises(IncompleteCommercialError, match="no commercial items"):
            extract_proposal_export_data(prop_empty.id, db)

        # Immutability guard: direct update/delete raises SnapshotImmutableError
        snap_empty.snapshot_payload = {"tampered": True}
        with pytest.raises(SnapshotImmutableError):
            db.flush()
        db.rollback()

        # 3. License + AMC missing amc_percentage in snapshot -> IncompleteCommercialError
        prop_noamc, _, ver_noamc = _make_proposal(unit_db, number="PROP-VAL-NOAMC")
        snap_noamc = CalculationSnapshot(
            proposal_version_id=ver_noamc.id,
            calculated_by_user_id=unit_db["user"].id,
            snapshot_payload={
                "reporting_currency_code": "INR",
                "contract_term_months": 12,
                "all_subscription_line_items": [
                    {"target_name": "Core Lic", "unit_rate_basis": "one_time", "amc_percentage": None}
                ],
                "all_service_lines": [],
                "products": [],
            },
        )
        db.add(snap_noamc)
        db.flush()
        with pytest.raises(IncompleteCommercialError, match="AMC percentage"):
            extract_proposal_export_data(prop_noamc.id, db)

        # 4. Valid zero-priced calculation stays exportable and immutable
        prop, pc, ver = _make_proposal(unit_db, number="PROP-VAL-OK")
        db.add(
            RateCard(
                rate_card_version_id=unit_db["rcv"].id, feature_id=unit_db["feat_core"].id,
                country_id=unit_db["india"].id, tier_id=unit_db["tier1"].id,
                uom_id=unit_db["uom_emp"].id, deployment_model_id=unit_db["dep_shared"].id,
                pricing_model_id=unit_db["pm_pepm"].id, currency_id=unit_db["inr"].id,
                fixed_fee=Decimal("0"), unit_rate=Decimal("0"),
            )
        )
        line = ProposalLineItem(
            proposal_version_id=ver.id, proposal_country_id=pc.id, line_number=1,
            feature_id=unit_db["feat_core"].id, uom_id=unit_db["uom_emp"].id,
            quantity=Decimal("10"), list_unit_price=Decimal("0"), discount_pct=Decimal("0"),
            net_unit_price=Decimal("0"), extended_amount=Decimal("0"), currency_id=unit_db["inr"].id,
        )
        db.add(line)
        db.flush()

        PricingCalculationEngine(db).calculate_proposal(prop.id)
        before_count = db.execute(
            select(func.count(CalculationSnapshot.id)).where(
                CalculationSnapshot.proposal_version_id == ver.id
            )
        ).scalar()
        data = extract_proposal_export_data(prop.id, db)
        docx_buf = generate_proposal_docx(prop.id, db, _preloaded_data=data)
        pdf_buf = generate_proposal_pdf(prop.id, db, _preloaded_data=data)
        after_count = db.execute(
            select(func.count(CalculationSnapshot.id)).where(
                CalculationSnapshot.proposal_version_id == ver.id
            )
        ).scalar()

        assert before_count == after_count == 1
        assert isinstance(docx_buf, io.BytesIO) and len(docx_buf.getvalue()) > 1000
        assert isinstance(pdf_buf, io.BytesIO) and pdf_buf.getvalue().startswith(b"%PDF")

        # 5. Stale calculation -> StaleCalculationSnapshotError
        line.quantity = Decimal("25")
        db.flush()
        with pytest.raises(StaleCalculationSnapshotError):
            extract_proposal_export_data(prop.id, db)


# ===========================================================================
# 5. Authorization, Authentication & Tier Validation Services
# ===========================================================================


class TestSecurityAndTierServicesUnit:
    def test_authorization_permissions_and_regional_scoping(self):
        assert check_permission(["admin"], "rate_cards:publish") is True
        assert check_permission(["presales"], "rate_cards:publish") is False
        assert check_permission(["unknown_role", "sales_lead"], "proposals:submit_approval") is True
        assert check_permission([], "proposals:read") is False

        assert check_regional_access(["admin"], "APAC", "MEA") is True
        assert check_regional_access(["cfo"], "APAC", "MEA") is True
        assert check_regional_access(["business_head"], "APAC", "apac") is True
        assert check_regional_access(["business_head"], "APAC", "MEA") is False
        assert check_regional_access(["business_head"], None, "APAC") is False
        assert check_regional_access(["sales_lead"], "APAC", "MEA") is True

    def test_authentication_hashing_jwt_and_redaction(self):
        assert normalize_email("  Alice.Admin@Adrenalin.COM ") == "alice.admin@adrenalin.com"
        with pytest.raises(ValueError):
            normalize_email("")

        hashed = hash_password("S3cur3!Pass")
        assert verify_password("S3cur3!Pass", hashed) is True
        assert verify_password("WrongPass", hashed) is False
        assert verify_password("", hashed) is False
        with pytest.raises(ValueError):
            hash_password("   ")

        tok = create_access_token({"sub": "42", "role": "admin"}, expires_delta=timedelta(minutes=5))
        decoded = decode_access_token(tok)
        assert decoded["sub"] == "42"

        expired_tok = create_access_token({"sub": "42"}, expires_delta=timedelta(seconds=-10))
        with pytest.raises(ValueError, match="Invalid or expired"):
            decode_access_token(expired_tok)

        redacted = redact_sensitive_data(
            {"user": "bob", "password": "secret", "nested": {"api_key": "xyz", "ok": 1}}
        )
        assert redacted == {"user": "bob", "password": "[REDACTED]", "nested": {"api_key": "[REDACTED]", "ok": 1}}

    def test_tier_validation_overlaps_and_retired_skip(self):
        validate_tier_range(0, 500)
        with pytest.raises(ValueError):
            validate_tier_range(-1, 100)
        with pytest.raises(ValueError):
            validate_tier_range(500, 100)

        validate_customer_tier_bands([
            {"name": "T1", "employee_min": 0, "employee_max": 499},
            {"name": "T2", "employee_min": 500, "employee_max": None},
            {"name": "Legacy", "employee_min": 100, "employee_max": 999, "status": "retired"},
        ])
        with pytest.raises(TierBandOverlapError):
            validate_customer_tier_bands([
                {"name": "T1", "employee_min": 0, "employee_max": 500},
                {"name": "T2", "employee_min": 500, "employee_max": 1000},
            ])
        with pytest.raises(TierBandOverlapError):
            validate_customer_tier_bands([
                {"name": "OpenFirst", "employee_min": 0, "employee_max": None},
                {"name": "Second", "employee_min": 500, "employee_max": 1000},
            ])
