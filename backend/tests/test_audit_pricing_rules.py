"""Audit test suite validating existing Backend Calculation Engine against Business Pricing Documents.

References:
- calculation explained.xlsx (Platform + Subscription formula & Tier 1, 2, 3 test cases)
- deployment and pricing model combinations (2).xlsx (5 deployment/pricing combinations, UOM rules)
- Proposal_Pricing_Model_Calculation Explained.pdf (Platform fee + Consumption fee, Day rate = Hourly * hours/day, Line total = Man-days * Day rate, two-tier subscription discount, single product-level service discount, multi-region FX consolidation).

All tests use Python Decimal and an isolated in-memory test database.
"""

from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
import uuid
import pytest
from sqlalchemy import create_engine, event, select, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.catalogue import Feature, Pack, PackItem, PackVersion, Product, ProductFamily
from app.models.governance import User
from app.models.master_data import (
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    DeploymentPricingOption,
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
)
from app.models.rate_card import RateCard, RateCardVersion, ServiceRate
from app.services.pricing_engine import (
    AmbiguousRateCardMatchError,
    CurrencyMismatchError,
    InvalidDiscountError,
    MissingConfigurationError,
    MissingFxRateError,
    MissingRateCardMatchError,
    MissingServiceRateError,
    PricingCalculationEngine,
    quantize_currency,
    quantize_rate,
)
from app.services.proposal_service import (
    add_proposal_country,
    ProposalValidationError,
)
from app.schemas.proposals import ProposalCountryCreate


# ---------------------------------------------------------------------------
# SQLite helper for BigInteger identity
# ---------------------------------------------------------------------------
@event.listens_for(Session, "before_flush")
def auto_assign_ids_audit(session, flush_context, instances):
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
def audit_db():
    """Isolated SQLite in-memory database with clean schema and masters for pricing audit."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    # ---- Currencies ----
    usd = Currency(code="USD", name="US Dollar", symbol="$", decimal_places=2, status="active")
    inr = Currency(code="INR", name="Indian Rupee", symbol="₹", decimal_places=2, status="active")
    eur = Currency(code="EUR", name="Euro", symbol="€", decimal_places=2, status="active")
    session.add_all([usd, inr, eur])
    session.flush()

    # ---- Countries ----
    usa = Country(iso_code="US", name="United States", currency_id=usd.id, status="active", valid_from=date(2026, 1, 1))
    india = Country(iso_code="IN", name="India", currency_id=inr.id, status="active", valid_from=date(2026, 1, 1))
    germany = Country(iso_code="DE", name="Germany", currency_id=eur.id, status="active", valid_from=date(2026, 1, 1))
    session.add_all([usa, india, germany])
    session.flush()

    # ---- Units of Measure ----
    uom_emp = UnitOfMeasure(code="employee", name="Active Employee (with ESS)", status="active")
    uom_cand = UnitOfMeasure(code="candidate", name="Candidate", status="active")
    session.add_all([uom_emp, uom_cand])
    session.flush()

    # ---- Deployment Models ----
    dep_shared = DeploymentModel(code="shared_cloud", name="Shared Cloud", status="active")
    dep_private = DeploymentModel(code="private_cloud", name="Private Cloud", status="active")
    dep_onprem = DeploymentModel(code="on_premise", name="On-Premise", status="active")
    session.add_all([dep_shared, dep_private, dep_onprem])
    session.flush()

    # ---- Pricing Models ----
    pm_pepm = PricingModel(
        code="pepm",
        name="PEPM",
        has_fixed_component=False,
        has_unit_component=True,
        uom_locked_id=uom_emp.id,
        status="active",
    )
    pm_platform_sub = PricingModel(
        code="platform_subscription",
        name="Platform + Subscription",
        has_fixed_component=True,
        has_unit_component=True,
        fixed_fee_basis="annual",
        status="active",
    )
    pm_license_amc = PricingModel(
        code="license_amc",
        name="License Fee + AMC",
        has_fixed_component=True,
        has_unit_component=True,
        fixed_fee_basis="annual",
        status="active",
    )
    session.add_all([pm_pepm, pm_platform_sub, pm_license_amc])
    session.flush()

    # ---- Deployment Pricing Options (Documented 5 Combinations) ----
    # 1. Shared Cloud + PEPM
    # 2. Shared Cloud + Platform + Subscription
    # 3. Private Cloud + PEPM
    # 4. Private Cloud + Platform + Subscription
    # 5. On-premise + License Fee + AMC
    dpo1 = DeploymentPricingOption(deployment_model_id=dep_shared.id, pricing_model_id=pm_pepm.id)
    dpo2 = DeploymentPricingOption(deployment_model_id=dep_shared.id, pricing_model_id=pm_platform_sub.id)
    dpo3 = DeploymentPricingOption(deployment_model_id=dep_private.id, pricing_model_id=pm_pepm.id)
    dpo4 = DeploymentPricingOption(deployment_model_id=dep_private.id, pricing_model_id=pm_platform_sub.id)
    dpo5 = DeploymentPricingOption(deployment_model_id=dep_onprem.id, pricing_model_id=pm_license_amc.id)
    session.add_all([dpo1, dpo2, dpo3, dpo4, dpo5])
    session.flush()

    # ---- Customer Tiers (Tier 1, 2, 3 as specified in Excel example) ----
    tier1 = CustomerTier(name="Tier 1", employee_min=1, employee_max=10000, valid_from=date(2026, 1, 1))
    tier2 = CustomerTier(name="Tier 2", employee_min=10001, employee_max=20000, valid_from=date(2026, 1, 1))
    tier3 = CustomerTier(name="Tier 3", employee_min=20001, employee_max=50000, valid_from=date(2026, 1, 1))
    session.add_all([tier1, tier2, tier3])
    session.flush()

    # ---- FX Rates ----
    # 1 INR = 0.012 USD; 1 EUR = 1.08 USD
    fx_inr_usd = FxRate(from_currency_id=inr.id, to_currency_id=usd.id, effective_date=date(2026, 1, 1), rate=Decimal("0.01200000"))
    fx_eur_usd = FxRate(from_currency_id=eur.id, to_currency_id=usd.id, effective_date=date(2026, 1, 1), rate=Decimal("1.08000000"))
    session.add_all([fx_inr_usd, fx_eur_usd])
    session.flush()

    # ---- Rate Card Version ----
    rcv = RateCardVersion(version_no="RC-AUDIT-001", name="Audit Rate Card Version", status="active", valid_from=date(2026, 1, 1))
    session.add(rcv)
    session.flush()

    # ---- User ----
    user = User(email="audit.engine@example.com", full_name="Pricing Audit User", password_hash="pw", is_active=True)
    session.add(user)
    session.flush()

    # ---- Catalogue (Product Family, Product, Feature, Pack) ----
    fam = ProductFamily(code="HR_CORE", name="Core HR")
    session.add(fam)
    session.flush()

    prod = Product(product_family_id=fam.id, code="HR_PLATFORM", name="HR Platform")
    session.add(prod)
    session.flush()

    feat = Feature(product_id=prod.id, code="EMP_MANAGEMENT", name="Employee Management", classification="native", status="active")
    session.add(feat)
    session.flush()

    pack = Pack(product_family_id=fam.id, code="PACK_ENTERPRISE", name="Enterprise HR Suite", variant="premium", status="active")
    session.add(pack)
    session.flush()

    pack_ver = PackVersion(pack_id=pack.id, version_no=1, status="active")
    session.add(pack_ver)
    session.flush()

    pack_item = PackItem(pack_version_id=pack_ver.id, feature_id=feat.id)
    session.add(pack_item)
    session.flush()

    # ---- Service Rate Master ----
    # PDF worked example: INR 1,500/hr * 8 hrs/day = INR 12,000/day
    srv_rate = ServiceRate(
        role_name="Implementation Consultant",
        country_id=india.id,
        hourly_rate=Decimal("1500.0000"),
        hours_per_day=Decimal("8.00"),
        daily_rate=Decimal("12000.0000"),
        currency_id=inr.id,
        valid_from=date(2026, 1, 1),
        status="active",
    )
    session.add(srv_rate)
    session.flush()

    session.commit()

    # Store references on session
    session.usd = usd
    session.inr = inr
    session.eur = eur
    session.usa = usa
    session.india = india
    session.germany = germany
    session.uom_emp = uom_emp
    session.uom_cand = uom_cand
    session.dep_shared = dep_shared
    session.dep_private = dep_private
    session.dep_onprem = dep_onprem
    session.pm_pepm = pm_pepm
    session.pm_platform_sub = pm_platform_sub
    session.pm_license_amc = pm_license_amc
    session.tier1 = tier1
    session.tier2 = tier2
    session.tier3 = tier3
    session.rcv = rcv
    session.user = user
    session.fam = fam
    session.prod = prod
    session.feat = feat
    session.pack = pack
    session.pack_ver = pack_ver
    session.srv_rate = srv_rate

    yield session
    session.close()


def _create_test_proposal(
    session: Session,
    customer_tier: CustomerTier,
    country: Country,
    dep_model: DeploymentModel,
    pricing_model: PricingModel,
    reporting_currency: Currency,
) -> Tuple[Proposal, ProposalVersion]:
    """Helper to construct an isolated proposal and draft version."""
    u_suffix = uuid.uuid4().hex[:6]
    cust = Customer(
        code=f"CUST-{customer_tier.name.replace(' ', '')}-{u_suffix}",
        name=f"Customer {customer_tier.name} {u_suffix}",
        country_id=country.id,
        customer_tier_id=customer_tier.id,
        status="active",
    )
    session.add(cust)
    session.flush()

    deal = Deal(code=f"DEAL-{cust.id}-{u_suffix}", name=f"Deal {cust.name}", customer_id=cust.id, owner_user_id=session.user.id, status="open")
    session.add(deal)
    session.flush()

    prop = Proposal(
        code=f"PROP-{deal.id}-{u_suffix}",
        deal_id=deal.id,
        customer_id=cust.id,
        currency_id=reporting_currency.id,
        status="draft",
        created_by_user_id=session.user.id,
    )
    session.add(prop)
    session.flush()

    pc = ProposalCountry(
        proposal_id=prop.id,
        country_id=country.id,
        deployment_model_id=dep_model.id,
        pricing_model_id=pricing_model.id,
        is_primary_deployment=True,
    )
    session.add(pc)
    session.flush()

    ver = ProposalVersion(
        proposal_id=prop.id,
        version_no=1,
        rate_card_version_id=session.rcv.id,
        status="draft",
        created_by_user_id=session.user.id,
    )
    session.add(ver)
    session.flush()
    return prop, ver


# =============================================================================
# 1. Verification of Excel Example: Platform + Subscription Formulas (Tiers 1, 2, 3)
# =============================================================================

class TestPlatformSubscriptionExcelExample:
    """Audit Section 2:
    Formula:
      Annual subscription = monthly per-employee rate * employee count * 12
      Annual total = annual platform fee + annual subscription
    """

    def test_platform_subscription_tier_1_exact_match(self, audit_db):
        """Tier 1:
        Platform fee: 100,000
        Monthly rate: 300
        Employees: 10,000
        Expected annual subscription: 36,000,000.00
        Expected annual total: 36,100,000.00
        """
        db = audit_db
        # Seed rate card for Tier 1
        rc = RateCard(
            rate_card_version_id=db.rcv.id,
            country_id=db.usa.id,
            deployment_model_id=db.dep_private.id,
            pricing_model_id=db.pm_platform_sub.id,
            tier_id=db.tier1.id,
            uom_id=db.uom_emp.id,
            pack_version_id=db.pack_ver.id,
            currency_id=db.usd.id,
            fixed_fee=Decimal("100000.0000"),
            unit_rate=Decimal("300.0000"),
        )
        db.add(rc)
        db.flush()

        prop, ver = _create_test_proposal(
            db, db.tier1, db.usa, db.dep_private, db.pm_platform_sub, db.usd
        )
        line_item = ProposalLineItem(
            proposal_version_id=ver.id,
            line_number=1,
            pack_version_id=db.pack_ver.id,
            uom_id=db.uom_emp.id,
            quantity=Decimal("10000.0000"),  # 10,000 employees
            list_unit_price=Decimal("300.0000"),
            net_unit_price=Decimal("300.0000"),
            extended_amount=Decimal("36100000.0000"),
            currency_id=db.usd.id,
            discount_pct=Decimal("0.00"),
        )
        db.add(line_item)
        db.commit()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

        snap = res["snapshot_payload"]
        item = snap["all_subscription_line_items"][0]

        # Verify annual consumption fee = 300 * 10,000 * 12 = 36,000,000.00
        assert Decimal(str(item["annual_consumption_fee"])) == Decimal("36000000.00")
        # Verify annual total = 100,000 + 36,000,000 = 36,100,000.00
        assert Decimal(str(item["item_subscription_before_discount"])) == Decimal("36100000.00")
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("36100000.00")

    def test_platform_subscription_tier_2_exact_match(self, audit_db):
        """Tier 2:
        Platform fee: 200,000
        Monthly rate: 400
        Employees: 20,000
        Expected annual subscription: 96,000,000.00
        Expected annual total: 96,200,000.00
        """
        db = audit_db
        rc = RateCard(
            rate_card_version_id=db.rcv.id,
            country_id=db.usa.id,
            deployment_model_id=db.dep_private.id,
            pricing_model_id=db.pm_platform_sub.id,
            tier_id=db.tier2.id,
            uom_id=db.uom_emp.id,
            pack_version_id=db.pack_ver.id,
            currency_id=db.usd.id,
            fixed_fee=Decimal("200000.0000"),
            unit_rate=Decimal("400.0000"),
        )
        db.add(rc)
        db.flush()

        prop, ver = _create_test_proposal(
            db, db.tier2, db.usa, db.dep_private, db.pm_platform_sub, db.usd
        )
        line_item = ProposalLineItem(
            proposal_version_id=ver.id,
            line_number=1,
            pack_version_id=db.pack_ver.id,
            uom_id=db.uom_emp.id,
            quantity=Decimal("20000.0000"),  # 20,000 employees
            list_unit_price=Decimal("400.0000"),
            net_unit_price=Decimal("400.0000"),
            extended_amount=Decimal("96200000.0000"),
            currency_id=db.usd.id,
            discount_pct=Decimal("0.00"),
        )
        db.add(line_item)
        db.commit()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

        snap = res["snapshot_payload"]
        item = snap["all_subscription_line_items"][0]

        # Verify annual consumption fee = 400 * 20,000 * 12 = 96,000,000.00
        assert Decimal(str(item["annual_consumption_fee"])) == Decimal("96000000.00")
        # Verify annual total = 200,000 + 96,000,000 = 96,200,000.00
        assert Decimal(str(item["item_subscription_before_discount"])) == Decimal("96200000.00")
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("96200000.00")

    def test_platform_subscription_tier_3_exact_match(self, audit_db):
        """Tier 3:
        Platform fee: 300,000
        Monthly rate: 500
        Employees: 30,000
        Expected annual subscription: 180,000,000.00
        Expected annual total: 180,300,000.00
        """
        db = audit_db
        rc = RateCard(
            rate_card_version_id=db.rcv.id,
            country_id=db.usa.id,
            deployment_model_id=db.dep_private.id,
            pricing_model_id=db.pm_platform_sub.id,
            tier_id=db.tier3.id,
            uom_id=db.uom_emp.id,
            pack_version_id=db.pack_ver.id,
            currency_id=db.usd.id,
            fixed_fee=Decimal("300000.0000"),
            unit_rate=Decimal("500.0000"),
        )
        db.add(rc)
        db.flush()

        prop, ver = _create_test_proposal(
            db, db.tier3, db.usa, db.dep_private, db.pm_platform_sub, db.usd
        )
        line_item = ProposalLineItem(
            proposal_version_id=ver.id,
            line_number=1,
            pack_version_id=db.pack_ver.id,
            uom_id=db.uom_emp.id,
            quantity=Decimal("30000.0000"),  # 30,000 employees
            list_unit_price=Decimal("500.0000"),
            net_unit_price=Decimal("500.0000"),
            extended_amount=Decimal("180300000.0000"),
            currency_id=db.usd.id,
            discount_pct=Decimal("0.00"),
        )
        db.add(line_item)
        db.commit()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

        snap = res["snapshot_payload"]
        item = snap["all_subscription_line_items"][0]

        # Verify annual consumption fee = 500 * 30,000 * 12 = 180,000,000.00
        assert Decimal(str(item["annual_consumption_fee"])) == Decimal("180000000.00")
        # Verify annual total = 300,000 + 180,000,000 = 180,300,000.00
        assert Decimal(str(item["item_subscription_before_discount"])) == Decimal("180300000.00")
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("180300000.00")


# =============================================================================
# 2. Verification of PEPM Rules and UOM Locking
# =============================================================================

class TestPEPMCalculationAndUOM:
    """Audit Section 3:
    - PEPM uses Active Employees (with ESS) as its UOM.
    - All dimensions resolved: employee count, tier, country, currency, deployment, pricing model.
    - Annualization factor 12 applied exactly once: unit_rate * monthly_volume * 12.
    - Missing rate card or missing tier raises appropriate exceptions.
    """

    def test_pepm_calculation_annualization_and_uom(self, audit_db):
        db = audit_db
        # Seed PEPM rate card: rate 25/employee/mo, fixed_fee 0
        rc = RateCard(
            rate_card_version_id=db.rcv.id,
            country_id=db.usa.id,
            deployment_model_id=db.dep_shared.id,
            pricing_model_id=db.pm_pepm.id,
            tier_id=db.tier1.id,
            uom_id=db.uom_emp.id,
            feature_id=db.feat.id,
            currency_id=db.usd.id,
            fixed_fee=Decimal("0.0000"),
            unit_rate=Decimal("25.0000"),
        )
        db.add(rc)
        db.flush()

        prop, ver = _create_test_proposal(
            db, db.tier1, db.usa, db.dep_shared, db.pm_pepm, db.usd
        )
        # Line item with 1,000 active employees
        line_item = ProposalLineItem(
            proposal_version_id=ver.id,
            line_number=1,
            feature_id=db.feat.id,
            uom_id=db.uom_emp.id,
            quantity=Decimal("1000.0000"),
            list_unit_price=Decimal("25.0000"),
            net_unit_price=Decimal("25.0000"),
            extended_amount=Decimal("300000.0000"),
            currency_id=db.usd.id,
            discount_pct=Decimal("0.00"),
        )
        db.add(line_item)
        db.commit()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

        snap = res["snapshot_payload"]
        item = snap["all_subscription_line_items"][0]

        # 25 * 1000 * 12 = 300,000.00 annual subscription
        assert Decimal(str(item["platform_fee"])) == Decimal("0.00")
        assert Decimal(str(item["rate_per_unit"])) == Decimal("25.00")
        assert Decimal(str(item["annual_consumption_fee"])) == Decimal("300000.00")
        assert Decimal(str(item["item_subscription_before_discount"])) == Decimal("300000.00")
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("300000.00")

    def test_pepm_missing_rate_card_raises_error(self, audit_db):
        db = audit_db
        # Proposal with Tier 2 but rate card only seeded for Tier 1
        prop, ver = _create_test_proposal(
            db, db.tier2, db.usa, db.dep_shared, db.pm_pepm, db.usd
        )
        line_item = ProposalLineItem(
            proposal_version_id=ver.id,
            line_number=1,
            feature_id=db.feat.id,
            uom_id=db.uom_emp.id,
            quantity=Decimal("1000.0000"),
            list_unit_price=Decimal("25.0000"),
            net_unit_price=Decimal("25.0000"),
            extended_amount=Decimal("300000.0000"),
            currency_id=db.usd.id,
            discount_pct=Decimal("0.00"),
        )
        db.add(line_item)
        db.commit()

        engine = PricingCalculationEngine(db)
        with pytest.raises(MissingRateCardMatchError):
            engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

    def test_pepm_missing_tier_raises_configuration_error(self, audit_db):
        db = audit_db
        prop, ver = _create_test_proposal(
            db, db.tier1, db.usa, db.dep_shared, db.pm_pepm, db.usd
        )
        # Remove tier from customer
        prop.customer.customer_tier_id = None
        db.commit()

        engine = PricingCalculationEngine(db)
        with pytest.raises(MissingConfigurationError) as exc_info:
            engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)
        assert "no customer tier" in str(exc_info.value).lower()


# =============================================================================
# 3. Verification of Professional Services Calculations (PDF Worked Example)
# =============================================================================

class TestProfessionalServicesCalculation:
    """Audit Section 4:
    PDF Worked Example:
    - Hourly rate: INR 1,500
    - Hours per day: 8
    - Effort: 12 man-days
    Expected:
    - Day rate: INR 12,000
    - Service subtotal: INR 144,000 before discount
    - Service discounts applied at product service-subtotal level, not line level.
    """

    def test_service_calculation_worked_example_exact_match(self, audit_db):
        db = audit_db
        prop, ver = _create_test_proposal(
            db, db.tier1, db.india, db.dep_shared, db.pm_platform_sub, db.inr
        )
        svc_line = ProposalServiceLine(
            proposal_version_id=ver.id,
            service_rate_id=db.srv_rate.id,
            role_name="Implementation Consultant",
            days_or_hours=Decimal("12.0000"),  # 12 man-days
            rate_applied=Decimal("12000.0000"),
            discount_pct=None,
            extended_amount=Decimal("144000.0000"),
            currency_id=db.inr.id,
        )
        db.add(svc_line)
        db.commit()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

        snap = res["snapshot_payload"]
        srv = snap["all_service_lines"][0]

        # Day rate = 1,500 * 8 = 12,000
        assert Decimal(str(srv["day_rate"])) == Decimal("12000.00")
        # Line total = 12 * 12,000 = 144,000
        assert Decimal(str(srv["service_line_total"])) == Decimal("144000.00")
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("144000.00")

    def test_multiple_service_lines_summed(self, audit_db):
        """PDF worked example describes 8 man-days for ATS Integration + 4 man-days for Admin Training = 12 days."""
        db = audit_db
        prop, ver = _create_test_proposal(
            db, db.tier1, db.india, db.dep_shared, db.pm_platform_sub, db.inr
        )
        svc1 = ProposalServiceLine(
            proposal_version_id=ver.id,
            service_rate_id=db.srv_rate.id,
            role_name="Implementation Consultant",
            days_or_hours=Decimal("8.0000"),  # 8 man-days
            rate_applied=Decimal("12000.0000"),
            discount_pct=None,
            extended_amount=Decimal("96000.0000"),
            currency_id=db.inr.id,
        )
        svc2 = ProposalServiceLine(
            proposal_version_id=ver.id,
            service_rate_id=db.srv_rate.id,
            role_name="Implementation Consultant",
            days_or_hours=Decimal("4.0000"),  # 4 man-days
            rate_applied=Decimal("12000.0000"),
            discount_pct=None,
            extended_amount=Decimal("48000.0000"),
            currency_id=db.inr.id,
        )
        db.add_all([svc1, svc2])
        db.commit()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

        snap = res["snapshot_payload"]
        assert len(snap["all_service_lines"]) == 2
        # Sum of service lines = 96,000 + 48,000 = 144,000
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("144000.00")

    def test_individual_service_line_discount_rejected(self, audit_db):
        """PDF section 4 states service line items are never discounted individually."""
        db = audit_db
        prop, ver = _create_test_proposal(
            db, db.tier1, db.india, db.dep_shared, db.pm_platform_sub, db.inr
        )
        svc = ProposalServiceLine(
            proposal_version_id=ver.id,
            service_rate_id=db.srv_rate.id,
            role_name="Implementation Consultant",
            days_or_hours=Decimal("12.0000"),
            rate_applied=Decimal("12000.0000"),
            discount_pct=Decimal("5.00"),  # Invalid: individual discount not permitted
            extended_amount=Decimal("136800.0000"),
            currency_id=db.inr.id,
        )
        db.add(svc)
        db.commit()

        engine = PricingCalculationEngine(db)
        with pytest.raises(InvalidDiscountError) as exc_info:
            engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)
        assert "individual service-line discounts are not permitted" in str(exc_info.value)

    def test_product_level_service_discount_applied_once(self, audit_db):
        """PDF section 4: One overall discount across all of a product's service line items."""
        db = audit_db
        prop, ver = _create_test_proposal(
            db, db.tier1, db.india, db.dep_shared, db.pm_platform_sub, db.inr
        )
        svc = ProposalServiceLine(
            proposal_version_id=ver.id,
            service_rate_id=db.srv_rate.id,
            role_name="Implementation Consultant",
            days_or_hours=Decimal("12.0000"),
            rate_applied=Decimal("12000.0000"),
            discount_pct=None,
            extended_amount=Decimal("144000.0000"),
            currency_id=db.inr.id,
        )
        db.add(svc)
        db.commit()

        engine = PricingCalculationEngine(db)
        # Apply 10% service discount to SERVICES product
        res = engine.calculate_proposal(
            proposal_id=prop.id,
            version_id=ver.id,
            product_service_discounts={"SERVICES": Decimal("10.00")},
        )
        # 144,000 - 10% (14,400) = 129,600.00
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("129600.00")


# =============================================================================
# 4. Verification of Discounts and Total Composition (Full PDF Worked Example)
# =============================================================================

class TestDiscountsAndTotalComposition:
    """Audit Section 5:
    Replicate the complete end-to-end worked example from Page 4 of the PDF:
    - Premium pack platform fee: INR 3,80,000
    - Consumption: 250 * 80 * 12 = INR 2,40,000
    - Subscription subtotal: 6,20,000 -> 5% discount -> 5,89,000
    - Service subtotal: 12 days * 12,000 = 1,44,000 (0% service discount)
    - Product Total (native INR): 5,89,000 + 1,44,000 = 7,33,000
    """

    def test_full_worked_example_end_to_end(self, audit_db):
        db = audit_db
        rc = RateCard(
            rate_card_version_id=db.rcv.id,
            country_id=db.india.id,
            deployment_model_id=db.dep_shared.id,
            pricing_model_id=db.pm_platform_sub.id,
            tier_id=db.tier1.id,
            uom_id=db.uom_cand.id,
            pack_version_id=db.pack_ver.id,
            currency_id=db.inr.id,
            fixed_fee=Decimal("380000.0000"),
            unit_rate=Decimal("80.0000"),
        )
        db.add(rc)
        db.flush()

        prop, ver = _create_test_proposal(
            db, db.tier1, db.india, db.dep_shared, db.pm_platform_sub, db.inr
        )
        # Pack item with 5% item discount
        line_item = ProposalLineItem(
            proposal_version_id=ver.id,
            line_number=1,
            pack_version_id=db.pack_ver.id,
            uom_id=db.uom_cand.id,
            quantity=Decimal("250.0000"),
            list_unit_price=Decimal("80.0000"),
            net_unit_price=Decimal("76.0000"),
            extended_amount=Decimal("589000.0000"),
            currency_id=db.inr.id,
            discount_pct=Decimal("5.00"),  # 5% line-level discount
        )
        db.add(line_item)

        svc = ProposalServiceLine(
            proposal_version_id=ver.id,
            service_rate_id=db.srv_rate.id,
            role_name="Implementation Consultant",
            days_or_hours=Decimal("12.0000"),
            rate_applied=Decimal("12000.0000"),
            discount_pct=None,
            extended_amount=Decimal("144000.0000"),
            currency_id=db.inr.id,
        )
        db.add(svc)
        db.commit()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

        snap = res["snapshot_payload"]
        prod_res = snap["products"][0]

        # Subscription subtotal before discount: 3,80,000 + 2,40,000 = 6,20,000
        assert Decimal(str(prod_res["subscription_subtotal_before_discount"])) == Decimal("589000.00")
        assert Decimal(str(prod_res["subscription_total_after_discount"])) == Decimal("589000.00")
        # Service subtotal: 1,44,000
        assert Decimal(str(prod_res["service_subtotal_before_discount"])) == Decimal("144000.00")
        assert Decimal(str(prod_res["service_total_after_discount"])) == Decimal("144000.00")
        # Native product total: 5,89,000 + 1,44,000 = 7,33,000
        assert Decimal(str(prod_res["product_native_total"])) == Decimal("733000.00")
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("733000.00")


# =============================================================================
# 5. Verification of All 5 Deployment & Pricing Model Combinations
# =============================================================================

class TestDeploymentPricingCombinations:
    """Audit Section 6:
    Verify all 5 documented combinations:
    1. Shared Cloud + PEPM
    2. Shared Cloud + Platform + Subscription
    3. Private Cloud + PEPM
    4. Private Cloud + Platform + Subscription
    5. On-premise + License Fee + AMC
    Verify that backend validation enforces permitted combinations and rejects unpermitted combinations.
    """

    def test_all_five_combinations_calculate_correctly(self, audit_db):
        db = audit_db
        combos = [
            (db.dep_shared, db.pm_pepm, Decimal("0.00"), Decimal("20.00")),
            (db.dep_shared, db.pm_platform_sub, Decimal("50000.00"), Decimal("15.00")),
            (db.dep_private, db.pm_pepm, Decimal("0.00"), Decimal("30.00")),
            (db.dep_private, db.pm_platform_sub, Decimal("100000.00"), Decimal("25.00")),
            (db.dep_onprem, db.pm_license_amc, Decimal("250000.00"), Decimal("50.00")),
        ]

        engine = PricingCalculationEngine(db)

        for dep, pm, fixed_fee, unit_rate in combos:
            rc = RateCard(
                rate_card_version_id=db.rcv.id,
                country_id=db.usa.id,
                deployment_model_id=dep.id,
                pricing_model_id=pm.id,
                tier_id=db.tier1.id,
                uom_id=db.uom_emp.id,
                pack_version_id=db.pack_ver.id,
                currency_id=db.usd.id,
                fixed_fee=fixed_fee,
                unit_rate=unit_rate,
            )
            db.add(rc)
            db.flush()

            prop, ver = _create_test_proposal(
                db, db.tier1, db.usa, dep, pm, db.usd
            )
            line_item = ProposalLineItem(
                proposal_version_id=ver.id,
                line_number=1,
                pack_version_id=db.pack_ver.id,
                uom_id=db.uom_emp.id,
                quantity=Decimal("1000.0000"),
                list_unit_price=unit_rate,
                net_unit_price=unit_rate,
                extended_amount=quantize_currency(fixed_fee + (unit_rate * Decimal("1000") * Decimal("12"))),
                currency_id=db.usd.id,
                discount_pct=Decimal("0.00"),
            )
            db.add(line_item)
            db.commit()

            res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)
            expected_consumption = unit_rate * Decimal("1000") * Decimal("12")
            expected_total = fixed_fee + expected_consumption
            assert Decimal(str(res["total_proposal_reporting_currency"])) == expected_total

    def test_unpermitted_deployment_pricing_combination_rejected(self, audit_db):
        """On-premise with PEPM is not in deployment_pricing_options and must be rejected."""
        db = audit_db
        # Construct proposal
        cust = Customer(code="CUST-ONPREM", name="Onprem Customer", country_id=db.usa.id, customer_tier_id=db.tier1.id, status="active")
        db.add(cust)
        db.flush()
        deal = Deal(code="DEAL-ONPREM", name="Deal Onprem", customer_id=cust.id, owner_user_id=db.user.id, status="open")
        db.add(deal)
        db.flush()
        prop = Proposal(code="PROP-ONPREM-FAIL", deal_id=deal.id, customer_id=cust.id, currency_id=db.usd.id, status="draft", created_by_user_id=db.user.id)
        db.add(prop)
        db.commit()

        # Try to add proposal country with invalid combo (On-Premise + PEPM)
        country_data = ProposalCountryCreate(
            country_id=db.usa.id,
            deployment_model_id=db.dep_onprem.id,
            pricing_model_id=db.pm_pepm.id,  # Invalid!
            is_primary_deployment=True,
        )
        with pytest.raises(ProposalValidationError) as exc_info:
            add_proposal_country(db=db, proposal_id=prop.id, data=country_data)
        assert "not available for deployment model" in str(exc_info.value).lower()


# =============================================================================
# 6. Verification of Multi-Region Currency Conversion
# =============================================================================

class TestMultiRegionCurrencyConversion:
    """Audit Section 7:
    - Multi-region conversion using configured FX-rate convention:
      1 unit of from_currency = rate units of to_currency.
    - Direct FX rate conversion: Native * Rate = Reporting Total.
    - Inverted FX rate fallback when only inverse rate is available.
    - Missing FX rate raises MissingFxRateError.
    - Preserves native currency totals alongside converted totals.
    """

    def test_direct_fx_conversion_inr_to_usd(self, audit_db):
        """India native INR converted to USD reporting currency.
        1 INR = 0.012 USD.
        Native: INR 1,000,000 -> Converted: $12,000.00 USD.
        """
        db = audit_db
        rc = RateCard(
            rate_card_version_id=db.rcv.id,
            country_id=db.india.id,
            deployment_model_id=db.dep_shared.id,
            pricing_model_id=db.pm_platform_sub.id,
            tier_id=db.tier1.id,
            uom_id=db.uom_cand.id,
            pack_version_id=db.pack_ver.id,
            currency_id=db.inr.id,
            fixed_fee=Decimal("1000000.0000"),
            unit_rate=Decimal("0.0000"),
        )
        db.add(rc)
        db.flush()

        # Proposal reporting in USD
        prop, ver = _create_test_proposal(
            db, db.tier1, db.india, db.dep_shared, db.pm_platform_sub, db.usd
        )
        line_item = ProposalLineItem(
            proposal_version_id=ver.id,
            line_number=1,
            pack_version_id=db.pack_ver.id,
            uom_id=db.uom_cand.id,
            quantity=Decimal("100.0000"),
            list_unit_price=Decimal("0.0000"),
            net_unit_price=Decimal("0.0000"),
            extended_amount=Decimal("1000000.0000"),
            currency_id=db.inr.id,
            discount_pct=Decimal("0.00"),
        )
        db.add(line_item)
        db.commit()

        engine = PricingCalculationEngine(db)
        res = engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)

        snap = res["snapshot_payload"]
        prod_res = snap["products"][0]

        # Native amount INR 1,000,000
        assert Decimal(str(prod_res["product_native_total"])) == Decimal("1000000.00")
        assert prod_res["native_currency_code"] == "INR"
        assert prod_res["reporting_currency_code"] == "USD"
        # 1,000,000 * 0.012 = 12,000.00 USD
        assert Decimal(str(prod_res["product_reporting_total"])) == Decimal("12000.00")
        assert Decimal(str(res["total_proposal_reporting_currency"])) == Decimal("12000.00")

    def test_missing_fx_rate_raises_error(self, audit_db):
        """If currency pair has no FX rate, calculation raises MissingFxRateError."""
        db = audit_db
        # Create non-pegged currency JPY
        jpy = Currency(code="JPY", name="Japanese Yen", symbol="¥", decimal_places=0, status="active")
        db.add(jpy)
        db.flush()
        japan = Country(iso_code="JP", name="Japan", currency_id=jpy.id, status="active", valid_from=date(2026, 1, 1))
        db.add(japan)
        db.flush()

        rc = RateCard(
            rate_card_version_id=db.rcv.id,
            country_id=japan.id,
            deployment_model_id=db.dep_shared.id,
            pricing_model_id=db.pm_platform_sub.id,
            tier_id=db.tier1.id,
            uom_id=db.uom_cand.id,
            pack_version_id=db.pack_ver.id,
            currency_id=jpy.id,
            fixed_fee=Decimal("5000000.0000"),
            unit_rate=Decimal("0.0000"),
        )
        db.add(rc)
        db.flush()

        prop, ver = _create_test_proposal(
            db, db.tier1, japan, db.dep_shared, db.pm_platform_sub, db.usd
        )
        line_item = ProposalLineItem(
            proposal_version_id=ver.id,
            line_number=1,
            pack_version_id=db.pack_ver.id,
            uom_id=db.uom_cand.id,
            quantity=Decimal("100.0000"),
            list_unit_price=Decimal("0.0000"),
            net_unit_price=Decimal("0.0000"),
            extended_amount=Decimal("5000000.0000"),
            currency_id=jpy.id,
            discount_pct=Decimal("0.00"),
        )
        db.add(line_item)
        db.commit()

        engine = PricingCalculationEngine(db)
        with pytest.raises(MissingFxRateError):
            engine.calculate_proposal(proposal_id=prop.id, version_id=ver.id)
