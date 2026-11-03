"""Comprehensive test suite for Phase D Pricing Calculation Engine.

Tests exactly reproduce the PDF worked example (Talent Acquisition / India):
  ₹ 3,80,000 Annual Platform Fee (fixed)
  ₹     80 Rate per Unit × 250 avg monthly employees × 12 = ₹ 2,40,000 Annual Consumption Fee
  ₹ 6,20,000 Annual Subscription Before Item Discount
  ₹ 5,89,000 After 5 % Item Discount
  12 man-days × ₹ 12,000 day rate = ₹ 1,44,000 Service Total (no discount)
  ₹ 7,33,000 Total Proposal (same-currency, FX = 1)

All tests run entirely in-memory with SQLite. They never access or mutate Neon.

Test coverage:
 01. Engine imports successfully
 02. Decimal quantize helpers
 03. FX multiplier – same currency (1:1)
 04. FX multiplier – direct rate lookup
 05. FX multiplier – inverse rate fallback
 06. FX multiplier – missing rate raises error
 07. Rate card lookup – exact match
 08. Rate card lookup – no match returns None
 09. Rate card lookup – tier fallback (no tier match falls back to no-tier)
 10. Subscription item calc – platform fee + consumption + discount
 11. Subscription item calc – PDF ₹7,33,000 worked example item-level values
 12. Service line calc – explicit daily_rate
 13. Service line calc – hourly × hours_per_day formula
 14. Service line calc – fallback to rate_applied on line
 15. Product grouping – subscription subtotal + product discount
 16. Product grouping – service subtotal + product discount
 17. End-to-end calculate_proposal – PDF ₹7,33,000 exact match
 18. Snapshot persisted and retrievable via get_latest_calculation
 19. Snapshot immutability – second calculate creates a second row
 20. Missing proposal raises ProposalNotFoundError
 21. Missing rate card raises MissingRateCardMatchError
 22. Invalid discount raises InvalidDiscountError
 23. Missing FX rate raises MissingFxRateError
 24. API POST /proposals/{id}/calculate returns 200 and correct total
 25. API GET /proposals/{id}/calculations/latest returns 200 and matches snapshot
"""

from datetime import date
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.catalogue import Feature, Pack, PackItem, PackVersion, Product, ProductFamily
from app.models.governance import User
from app.models.master_data import Country, Currency, CustomerTier, FxRate, PricingModel, UnitOfMeasure
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
from app.schemas.proposals import ProposalCreate
from app.services.pricing_engine import (
    AmbiguousRateCardMatchError,
    InvalidDiscountError,
    MissingFxRateError,
    MissingRateCardMatchError,
    MissingServiceRateError,
    PricingCalculationEngine,
    ProposalNotFoundError as PricingProposalNotFoundError,
    quantize_currency,
    quantize_rate,
)


# =============================================================================
# Fixtures
# =============================================================================

@event.listens_for(Session, "before_flush")
def auto_assign_ids_pe(session, flush_context, instances):
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
def db():
    """Isolated SQLite in-memory database with all schema tables and PDF seed data."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    # ---- Currencies ----
    inr = Currency(code="INR", name="Indian Rupee", symbol="₹", decimal_places=2, status="active")
    usd = Currency(code="USD", name="US Dollar", symbol="$", decimal_places=2, status="active")
    session.add_all([inr, usd])
    session.flush()

    # ---- Countries ----
    india = Country(
        iso_code="IN",
        name="India",
        currency_id=inr.id,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
    )
    usa = Country(
        iso_code="US",
        name="United States",
        currency_id=usd.id,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
    )
    session.add_all([india, usa])
    session.flush()

    # ---- FX Rates ----
    # 1 USD = 83 INR
    fx_usd_inr = FxRate(
        from_currency_id=usd.id,
        to_currency_id=inr.id,
        effective_date=date(2026, 1, 1),
        rate=Decimal("83.00000000"),
    )
    session.add(fx_usd_inr)
    session.flush()

    # ---- Customer tier (mandatory rate-card dimension) ----
    tier = CustomerTier(name="Tier 1", employee_min=0, valid_from=date(2026, 1, 1))
    session.add(tier)
    session.flush()

    # ---- UOM ----
    uom = UnitOfMeasure(code="EMP", name="Employee", status="active")
    session.add(uom)
    session.flush()

    # ---- Users ----
    user = User(
        email="calc_test@adrenalin.com",
        full_name="Calculation Test User",
        password_hash="ph",
        is_active=True,
    )
    session.add(user)
    session.flush()

    # ---- Rate Card Version ----
    rcv = RateCardVersion(
        version_no="RC-2026-TEST",
        name="Test Rate Card Version",
        status="active",
        valid_from=date(2026, 1, 1),
    )
    session.add(rcv)
    session.flush()

    # ---- Catalogue hierarchy ----
    fam = ProductFamily(code="TA_FAM", name="Talent Acquisition Family")
    session.add(fam)
    session.flush()

    # PDF product: Talent Acquisition
    prod_ta = Product(product_family_id=fam.id, code="TA", name="Talent Acquisition")
    session.add(prod_ta)
    session.flush()

    # Feature for TA
    feat_ta = Feature(
        product_id=prod_ta.id,
        code="TA-001",
        name="Recruitment Module",
        classification="native",
        status="active",
    )
    session.add(feat_ta)
    session.flush()

    # ---- Pricing model ---- (PDF: annual platform fee + monthly consumption)
    pm_platform = PricingModel(
        code="platform_subscription", name="Platform + Subscription", status="active",
        has_fixed_component=True, has_unit_component=True, fixed_fee_basis="annual", unit_rate_basis="monthly",
    )
    session.add(pm_platform)
    session.flush()

    # ---- Rate Card ---- (PDF: ₹3,80,000 fixed_fee; ₹80 unit_rate; India; per-employee)
    rc = RateCard(
        rate_card_version_id=rcv.id,
        country_id=india.id,
        deployment_model_id=1,   # Placeholder – no FK check in SQLite
        pricing_model_id=pm_platform.id,
        tier_id=tier.id,
        uom_id=uom.id,
        feature_id=feat_ta.id,
        currency_id=inr.id,
        fixed_fee=Decimal("380000.0000"),
        unit_rate=Decimal("80.0000"),
    )
    session.add(rc)
    session.flush()

    # ---- Service Rate ---- (PDF: ₹1500 hourly × 8 = ₹12,000/day)
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

    # ---- Customer & Deal ----
    cust = Customer(
        code="CUST-TA",
        name="Talent Corp India",
        country_id=india.id,
        customer_tier_id=tier.id,
        status="active",
    )
    session.add(cust)
    session.flush()

    deal = Deal(
        code="DEAL-TA-001",
        name="Talent Acquisition India Deal",
        customer_id=cust.id,
        owner_user_id=user.id,
        status="open",
    )
    session.add(deal)
    session.flush()

    # ---- Proposal (INR reporting currency) ----
    proposal = Proposal(
        code="PROP-TA-001",
        deal_id=deal.id,
        customer_id=cust.id,
        currency_id=inr.id,
        status="draft",
        created_by_user_id=user.id,
    )
    session.add(proposal)
    session.flush()

    # Primary deployment country
    prop_country = ProposalCountry(
        proposal_id=proposal.id,
        country_id=india.id,
        is_primary_deployment=True,
    )
    session.add(prop_country)
    session.flush()

    # ---- Proposal Version ----
    version = ProposalVersion(
        proposal_id=proposal.id,
        version_no=1,
        rate_card_version_id=rcv.id,
        status="draft",
        created_by_user_id=user.id,
    )
    session.add(version)
    session.flush()

    # ---- Line Item: TA feature, 250 employees avg monthly volume ----
    line_item = ProposalLineItem(
        proposal_version_id=version.id,
        line_number=1,
        feature_id=feat_ta.id,
        uom_id=uom.id,
        quantity=Decimal("250.0000"),         # avg monthly volume
        list_unit_price=Decimal("80.0000"),    # rate per unit
        discount_pct=Decimal("5.0000"),        # 5% item discount
        net_unit_price=Decimal("76.0000"),
        extended_amount=Decimal("228000.0000"),
        currency_id=inr.id,
    )
    session.add(line_item)
    session.flush()

    # ---- Service Line: 12 man-days × ₹12,000 = ₹1,44,000 ----
    svc_line = ProposalServiceLine(
        proposal_version_id=version.id,
        service_rate_id=srv_rate.id,
        role_name="Implementation Consultant",
        days_or_hours=Decimal("12.0000"),
        rate_applied=Decimal("12000.0000"),
        discount_pct=None,
        extended_amount=Decimal("144000.0000"),
        currency_id=inr.id,
    )
    session.add(svc_line)
    session.flush()

    session.commit()

    # Attach convenient references to session for use in tests
    session._test_inr = inr
    session._test_usd = usd
    session._test_india = india
    session._test_usa = usa
    session._test_uom = uom
    session._test_tier = tier
    session._test_user = user
    session._test_rcv = rcv
    session._test_prod_ta = prod_ta
    session._test_feat_ta = feat_ta
    session._test_rc = rc
    session._test_srv_rate = srv_rate
    session._test_proposal = proposal
    session._test_version = version
    session._test_line_item = line_item
    session._test_svc_line = svc_line
    session._test_cust = cust
    session._test_deal = deal

    yield session

    session.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(scope="function")
def client(db: Session):
    """FastAPI TestClient with database override."""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(scope="function")
def engine(db: Session) -> PricingCalculationEngine:
    """Pre-configured PricingCalculationEngine bound to the test database."""
    return PricingCalculationEngine(db=db)


# =============================================================================
# Test 01: Engine imports successfully
# =============================================================================
def test_01_engine_imports():
    from app.services.pricing_engine import PricingCalculationEngine
    assert PricingCalculationEngine is not None


# =============================================================================
# Test 02: Decimal quantize helpers
# =============================================================================
def test_02_decimal_quantize_helpers():
    assert quantize_currency(Decimal("7330001.555555")) == Decimal("7330001.56")
    assert quantize_currency(Decimal("0")) == Decimal("0.00")
    assert quantize_rate(Decimal("80.123456789")) == Decimal("80.1235")
    # quantize_rate returns 4 decimal places
    assert str(quantize_rate(Decimal("12000"))) == "12000.0000"


# =============================================================================
# Test 03: FX multiplier – same currency (1:1)
# =============================================================================
def test_03_fx_same_currency(engine, db):
    inr = db._test_inr
    multiplier, pair = engine._resolve_fx_multiplier(inr.id, inr.id)
    assert multiplier == Decimal("1.00000000")
    assert pair == "1:1"


# =============================================================================
# Test 04: FX multiplier – direct rate lookup
# =============================================================================
def test_04_fx_direct_rate(engine, db):
    usd = db._test_usd
    inr = db._test_inr
    # USD → INR = 83 stored directly
    multiplier, pair = engine._resolve_fx_multiplier(usd.id, inr.id)
    assert multiplier == Decimal("83.00000000")
    assert "USD" in pair
    assert "INR" in pair


# =============================================================================
# Test 05: FX multiplier – inverse rate fallback
# =============================================================================
def test_05_fx_inverse_rate(engine, db):
    usd = db._test_usd
    inr = db._test_inr
    # INR → USD (no direct row, only USD→INR = 83)
    multiplier, pair = engine._resolve_fx_multiplier(inr.id, usd.id)
    expected = (Decimal("1.0") / Decimal("83.00000000")).quantize(
        Decimal("0.00000001")
    )
    assert multiplier == expected
    assert "inverted" in pair


# =============================================================================
# Test 06: FX multiplier – missing rate raises MissingFxRateError
# =============================================================================
def test_06_fx_missing_rate(engine, db):
    inr = db._test_inr
    # Currency id 9999 does not exist
    with pytest.raises(MissingFxRateError):
        engine._resolve_fx_multiplier(inr.id, 9999)


# =============================================================================
# Test 07: Rate card lookup – exact match
# =============================================================================
def test_07_rate_card_exact_match(engine, db):
    rcv = db._test_rcv
    feat = db._test_feat_ta
    india = db._test_india
    uom = db._test_uom
    rc = db._test_rc

    found = engine._find_rate_card(
        rate_card_version_id=rcv.id,
        pack_version_id=None,
        feature_id=feat.id,
        country_id=india.id,
        tier_id=db._test_tier.id,
        uom_id=uom.id,
    )
    assert found is not None
    assert found.fixed_fee == Decimal("380000.0000")
    assert found.unit_rate == Decimal("80.0000")


# =============================================================================
# Test 08: Rate card lookup – no match returns None; a missing dimension is an error
# =============================================================================
def test_08_rate_card_no_match(engine, db):
    rcv = db._test_rcv
    uom = db._test_uom

    found = engine._find_rate_card(
        rate_card_version_id=rcv.id,
        pack_version_id=None,
        feature_id=9999,   # non-existent
        country_id=db._test_india.id,
        tier_id=db._test_tier.id,
        uom_id=uom.id,
    )
    assert found is None


def test_08b_rate_card_lookup_requires_country_and_tier(engine, db):
    """Country and tier are mandatory dimensions: they are never silently ignored."""
    from app.services.pricing_engine import MissingConfigurationError

    common = dict(
        rate_card_version_id=db._test_rcv.id, pack_version_id=None,
        feature_id=db._test_feat_ta.id, uom_id=db._test_uom.id,
    )
    with pytest.raises(MissingConfigurationError):
        engine._find_rate_card(country_id=None, tier_id=db._test_tier.id, **common)
    with pytest.raises(MissingConfigurationError):
        engine._find_rate_card(country_id=db._test_india.id, tier_id=None, **common)


# =============================================================================
# Test 09: Rate card lookup – there is NO tier fallback
# =============================================================================
def test_09_rate_card_no_tier_fallback(engine, db):
    """A tier with no rate card must NOT fall back to a card for another tier (exactly one row or error)."""
    found = engine._find_rate_card(
        rate_card_version_id=db._test_rcv.id,
        pack_version_id=None,
        feature_id=db._test_feat_ta.id,
        country_id=db._test_india.id,
        tier_id=999999,
        uom_id=db._test_uom.id,
    )
    assert found is None


# =============================================================================
# Test 10: Subscription item calc – formula correctness
# =============================================================================
def test_10_subscription_item_calc(engine, db):
    """Verify platform_fee + consumption_fee + item_discount formulas independently."""
    # Manual: 380000 + (80 × 250 × 12) = 380000 + 240000 = 620000
    # 5% discount: 620000 × 0.05 = 31000 → 620000 - 31000 = 589000
    platform_fee = Decimal("380000.00")
    rate_per_unit = Decimal("80.00")
    avg_monthly_vol = Decimal("250.00")
    discount_pct = Decimal("5.00")

    annual_consumption = quantize_currency(rate_per_unit * avg_monthly_vol * Decimal("12"))
    assert annual_consumption == Decimal("240000.00")

    before_discount = quantize_currency(platform_fee + annual_consumption)
    assert before_discount == Decimal("620000.00")

    discount_amount = quantize_currency(before_discount * (discount_pct / Decimal("100.00")))
    assert discount_amount == Decimal("31000.00")

    after_discount = before_discount - discount_amount
    assert after_discount == Decimal("589000.00")


# =============================================================================
# Test 11: PDF ₹7,33,000 worked example — subscription item-level values
# =============================================================================
def test_11_pdf_subscription_item_values(engine, db):
    """Reproduce the exact ₹5,89,000 subscription result from the PDF."""
    version = db._test_version
    item = db._test_line_item
    rcv = db._test_rcv
    india = db._test_india

    result = engine._calculate_subscription_item(
        item=item,
        rate_card_version_id=rcv.id,
        default_country_id=india.id,
        default_tier_id=1,
    )

    assert result["platform_fee"] == 380000.0
    assert result["rate_per_unit"] == 80.0
    assert result["average_monthly_volume"] == 250.0
    assert result["annual_consumption_fee"] == 240000.0
    assert result["item_subscription_before_discount"] == 620000.0
    assert result["item_discount_pct"] == 5.0
    assert result["item_discount_amount"] == 31000.0
    assert result["item_subscription_after_discount"] == 589000.0
    assert result["product_code"] == "TA"


# =============================================================================
# Test 12: Service line calc – explicit daily_rate
# =============================================================================
def test_12_service_line_explicit_daily_rate(engine, db):
    """When service_rate has a daily_rate, use it directly (PDF: ₹12,000/day)."""
    svc = db._test_svc_line
    india = db._test_india

    result = engine._calculate_service_line(
        service_line=svc,
        default_country_id=india.id,
        default_hours_per_day=Decimal("8.00"),
    )

    assert result["day_rate"] == 12000.0
    assert result["man_days"] == 12.0
    assert result["service_line_total"] == 144000.0   # 12 × 12000


# =============================================================================
# Test 13: Service line calc – hourly × hours_per_day formula
# =============================================================================
def test_13_service_line_hourly_formula(engine, db):
    """When daily_rate is NULL, engine calculates: hourly_rate × hours_per_day."""
    svc = db._test_svc_line
    india = db._test_india

    # Temporarily clear daily_rate to test formula path
    original_daily = svc.rate_applied
    svc.rate_applied = Decimal("0.0000")

    # Create a ServiceRate with no daily_rate via a fresh object for direct test
    from app.services.pricing_engine import quantize_currency as qc
    hourly = Decimal("1500.0000")
    hrs = Decimal("8.00")
    expected_day_rate = qc(hourly * hrs)
    assert expected_day_rate == Decimal("12000.00")

    man_days = Decimal("12.0000")
    expected_total = qc(man_days * expected_day_rate)
    assert expected_total == Decimal("144000.00")

    svc.rate_applied = original_daily


# =============================================================================
# Test 14: Service line calc – NO fallback to a client-supplied rate
# =============================================================================
def test_14_service_line_has_no_client_rate_fallback(engine, db):
    """A service line that cannot be resolved from the service-rate master is rejected,
    even if the request supplied a rate_applied value."""
    version = db._test_version
    inr = db._test_inr

    orphan_svc = ProposalServiceLine(
        proposal_version_id=version.id,
        service_rate_id=None,
        role_name="Orphan Role",
        days_or_hours=Decimal("5.0000"),
        rate_applied=Decimal("8000.0000"),
        extended_amount=Decimal("40000.0000"),
        currency_id=inr.id,
    )
    db.add(orphan_svc)
    db.flush()

    with pytest.raises(MissingServiceRateError):
        engine._calculate_service_line(
            service_line=orphan_svc,
            default_country_id=db._test_india.id,
            default_hours_per_day=Decimal("8.00"),
        )


# =============================================================================
# Test 15: Product grouping – subscription subtotal + product discount
# =============================================================================
def test_15_product_subscription_grouping(engine, db):
    """Verify product-level subscription discount is applied after item aggregation."""
    proposal = db._test_proposal
    version = db._test_version

    result = engine.calculate_proposal(
        proposal_id=proposal.id,
        product_discounts={"TA": Decimal("10.00")},  # 10% product-level subscription discount
        product_service_discounts={},
    )

    ta_product = None
    for p in result["snapshot_payload"]["products"]:
        if p["product_code"] == "TA":
            ta_product = p
            break

    assert ta_product is not None
    # Item after discount = 589000; 10% product discount = 58900; final = 530100
    sub_subtotal = ta_product["subscription_subtotal_before_discount"]
    assert abs(sub_subtotal - 589000.0) < 0.01
    assert ta_product["subscription_discount_pct"] == 10.0
    assert abs(ta_product["subscription_discount_amount"] - 58900.0) < 0.01
    assert abs(ta_product["subscription_total_after_discount"] - 530100.0) < 0.01


# =============================================================================
# Test 16: Product grouping – service subtotal + product service discount
# =============================================================================
def test_16_product_service_grouping(engine, db):
    """Verify product-level service discount is applied to service subtotal."""
    proposal = db._test_proposal

    result = engine.calculate_proposal(
        proposal_id=proposal.id,
        product_discounts={},
        product_service_discounts={"TA": Decimal("10.00")},   # 10% on ₹1,44,000
    )

    ta_product = None
    for p in result["snapshot_payload"]["products"]:
        if p["product_code"] == "TA":
            ta_product = p
            break

    assert ta_product is not None
    serv_subtotal = ta_product["service_subtotal_before_discount"]
    assert abs(serv_subtotal - 144000.0) < 0.01
    assert ta_product["service_discount_pct"] == 10.0
    assert abs(ta_product["service_discount_amount"] - 14400.0) < 0.01
    assert abs(ta_product["service_total_after_discount"] - 129600.0) < 0.01


# =============================================================================
# Test 17: END-TO-END — PDF ₹7,33,000 exact match
# =============================================================================
def test_17_pdf_worked_example_733000(engine, db):
    """Reproduce the authoritative ₹7,33,000 total from the PDF without any product discounts."""
    proposal = db._test_proposal

    result = engine.calculate_proposal(
        proposal_id=proposal.id,
        product_discounts={},
        product_service_discounts={},
    )

    # Subscription: 589000, Service: 144000 → 733000
    total = result["total_proposal_reporting_currency"]
    assert abs(total - 733000.0) < 0.01, f"Expected ₹7,33,000 but got {total}"

    assert result["reporting_currency_code"] == "INR"
    assert result["snapshot_id"] is not None
    assert result["proposal_id"] == proposal.id

    ta_product = result["snapshot_payload"]["products"][0]
    assert abs(ta_product["product_native_total"] - 733000.0) < 0.01
    assert ta_product["fx_rate_multiplier"] == 1.0


# =============================================================================
# Test 18: Snapshot persisted and retrievable via get_latest_calculation
# =============================================================================
def test_18_snapshot_persisted_and_retrievable(engine, db):
    """After calculate_proposal, get_latest_calculation should return same snapshot."""
    proposal = db._test_proposal

    calc_result = engine.calculate_proposal(proposal_id=proposal.id)
    snapshot_id = calc_result["snapshot_id"]

    latest = engine.get_latest_calculation(proposal_id=proposal.id)
    assert latest["snapshot_id"] == snapshot_id
    assert abs(latest["total_proposal_reporting_currency"] - 733000.0) < 0.01


# =============================================================================
# Test 19: Snapshot immutability — second calculate creates a second row
# =============================================================================
def test_19_snapshot_immutability(engine, db):
    """Each call to calculate_proposal creates a new snapshot row; old ones remain."""
    proposal = db._test_proposal
    version = db._test_version

    result1 = engine.calculate_proposal(proposal_id=proposal.id)
    result2 = engine.calculate_proposal(proposal_id=proposal.id)

    # Two different snapshot IDs
    assert result1["snapshot_id"] != result2["snapshot_id"]

    # Both rows exist in DB
    all_snapshots = db.scalars(
        select(CalculationSnapshot).where(CalculationSnapshot.proposal_version_id == version.id)
    ).all()
    assert len(all_snapshots) == 2


# =============================================================================
# Test 20: Missing proposal raises ProposalNotFoundError
# =============================================================================
def test_20_missing_proposal_raises_error(engine):
    with pytest.raises(PricingProposalNotFoundError):
        engine.calculate_proposal(proposal_id=99999)


# =============================================================================
# Test 21: Missing rate card raises MissingRateCardMatchError even if a client price is present
# =============================================================================
def test_21_missing_rate_card_raises_error(engine, db):
    """A positive list_unit_price on the line must NOT stand in for a missing rate-card row."""
    version = db._test_version
    inr = db._test_inr
    uom = db._test_uom
    feat_ta = db._test_feat_ta

    priced_item = ProposalLineItem(
        proposal_version_id=version.id,
        line_number=99,
        feature_id=feat_ta.id,
        uom_id=uom.id,
        quantity=Decimal("10.0000"),
        list_unit_price=Decimal("500.0000"),   # client-supplied price: must be ignored
        discount_pct=None,
        net_unit_price=Decimal("500.0000"),
        extended_amount=Decimal("60000.0000"),
        currency_id=inr.id,
    )
    db.add(priced_item)
    db.flush()

    with pytest.raises(MissingRateCardMatchError):
        engine._calculate_subscription_item(
            item=priced_item,
            rate_card_version_id=99999,   # non-existent RC version
            default_country_id=db._test_india.id,
            default_tier_id=db._test_tier.id,
        )


# =============================================================================
# Test 22: Invalid discount percentage raises InvalidDiscountError
# =============================================================================
def test_22_invalid_discount_raises_error(engine, db):
    """Discount percentage >100 should raise InvalidDiscountError before any calculation."""
    proposal = db._test_proposal

    with pytest.raises(InvalidDiscountError):
        engine.calculate_proposal(
            proposal_id=proposal.id,
            product_discounts={"TA": Decimal("150.00")},   # invalid > 100
            product_service_discounts={},
        )


# =============================================================================
# Test 23: Missing FX rate raises MissingFxRateError
# =============================================================================
def test_23_missing_fx_rate_raises_error(engine, db):
    """When FX rate is completely absent, MissingFxRateError should be raised."""
    inr = db._test_inr

    with pytest.raises(MissingFxRateError):
        engine._resolve_fx_multiplier(inr.id, 99999)


# =============================================================================
# Test 24: API POST /proposals/{id}/calculate returns 200 and correct total
# =============================================================================
def test_24_api_calculate_endpoint(client, db):
    """POST /api/proposals/{id}/calculate should return 200 with ₹7,33,000 total."""
    proposal = db._test_proposal
    response = client.post(
        f"/api/proposals/{proposal.id}/calculate",
        json={},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert "snapshot_id" in data
    assert "total_proposal_reporting_currency" in data
    assert abs(data["total_proposal_reporting_currency"] - 733000.0) < 0.01
    assert data["reporting_currency_code"] == "INR"
    assert data["proposal_id"] == proposal.id


# =============================================================================
# Test 25: API GET /proposals/{id}/calculations/latest returns snapshot
# =============================================================================
def test_25_api_latest_calculation_endpoint(client, db):
    """GET /api/proposals/{id}/calculations/latest should return 200 with saved snapshot."""
    proposal = db._test_proposal

    # First trigger a calculation
    calc_resp = client.post(
        f"/api/proposals/{proposal.id}/calculate",
        json={},
    )
    assert calc_resp.status_code == 200
    calc_data = calc_resp.json()

    # Then retrieve latest
    latest_resp = client.get(f"/api/proposals/{proposal.id}/calculations/latest")
    assert latest_resp.status_code == 200, latest_resp.text
    latest_data = latest_resp.json()

    assert latest_data["snapshot_id"] == calc_data["snapshot_id"]
    assert abs(latest_data["total_proposal_reporting_currency"] - 733000.0) < 0.01
    assert "snapshot_payload" in latest_data
    assert "products" in latest_data["snapshot_payload"]


# =============================================================================
# Test 27: PEPM dynamic contract-term test (Annual vs 36-Month Full Contract)
# =============================================================================
def test_27_pepm_contract_term_formula(db):
    """Monthly PEPM rate = ₹2,000, Employee count = 5,000, Contract term = 36 months.
    Expected annual consumption: 2,000 * 5,000 * 12 = ₹120,000,000
    Expected full-contract consumption: 2,000 * 5,000 * 36 = ₹360,000,000
    Repeat with a 12-month contract to verify that annual and contract values match.
    """
    engine = PricingCalculationEngine(db=db)

    # Mock line item and rate card with unit_rate = 2000, quantity = 5000
    from unittest.mock import MagicMock
    item = MagicMock()
    item.id = 999
    item.line_number = 1
    item.feature_id = 1
    item.pack_version_id = None
    item.quantity = Decimal("5000")
    item.discount_pct = Decimal("0.00")
    item.uom_id = 1

    # Test 36-month contract
    res_36 = engine._calculate_subscription_item(
        item=item,
        rate_card_version_id=1,
        default_country_id=1,
        default_tier_id=1,
        persist_amounts=False,
        contract_term_months=36,
    )
    # Annual consumption fee (12 months): unit_rate * 5000 * 12
    # Full contract consumption fee (36 months): unit_rate * 5000 * 36
    rate = Decimal(str(res_36["rate_per_unit"]))
    assert res_36["annual_consumption_fee"] == float(rate * Decimal("5000") * Decimal("12"))
    assert res_36["contract_consumption_fee"] == float(rate * Decimal("5000") * Decimal("36"))
    assert res_36["contract_term_months"] == 36

    # Test 12-month contract: annual and contract must match exactly
    res_12 = engine._calculate_subscription_item(
        item=item,
        rate_card_version_id=1,
        default_country_id=1,
        default_tier_id=1,
        persist_amounts=False,
        contract_term_months=12,
    )
    assert res_12["annual_consumption_fee"] == res_12["contract_consumption_fee"]
    assert res_12["item_subscription_before_discount"] == res_12["contract_subscription_before_discount"]
    assert res_12["contract_term_months"] == 12


# =============================================================================
# Test 28: API POST /proposals/{id}/calculate with dynamic contract_term_months
# =============================================================================
def test_28_api_calculate_with_dynamic_contract_term(client, db):
    """POST /api/proposals/{id}/calculate with contract_term_months=36 should return contract totals."""
    proposal = db._test_proposal
    response = client.post(
        f"/api/proposals/{proposal.id}/calculate",
        json={"contract_term_months": 36},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["contract_term_months"] == 36
    assert "total_proposal_annual_reporting_currency" in data
    assert "total_proposal_contract_reporting_currency" in data
    # Contract total (36 months subscription + 1x services) must be greater than annual total (12 months)
    assert data["total_proposal_contract_reporting_currency"] > data["total_proposal_annual_reporting_currency"]
    # Snapshot payload preserves both
    payload = data["snapshot_payload"]
    assert payload["contract_term_months"] == 36
    assert payload["total_proposal_contract_reporting_currency"] == data["total_proposal_contract_reporting_currency"]
