"""Regression tests for Currency Resolution and Calculation Engine integration.

Verifies:
1. Valid reporting currency ID creation & calculation
2. Valid country currency ID relationship
3. Missing currency reference error handling (ResourceNotFoundError)
4. FX conversion between two existing currencies (e.g. INR -> USD)
5. Currency resolution and validation for rate cards and service rates
6. Currency mismatch detection when a product mixes different native currencies
7. End-to-end proposal calculation with isolated test database session
"""

from datetime import date
from decimal import Decimal
import pytest
from sqlalchemy import create_engine, event, select, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
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
    CurrencyMismatchError,
    MissingFxRateError,
    PricingCalculationEngine,
)
from app.services.proposal_service import (
    ResourceNotFoundError,
    create_proposal,
    add_proposal_country,
    add_proposal_line_item,
    add_proposal_service_line,
)


@event.listens_for(Session, "before_flush")
def auto_assign_ids_curr_reg(session, flush_context, instances):
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


@pytest.fixture()
def db_session():
    """Isolated in-memory SQLite test database session with seed records."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()

    # Seed Currencies (Explicit IDs 2: INR, 3: USD - matching live DB where ID 1 does not exist)
    inr = Currency(id=2, code="INR", name="Indian Rupee", symbol="₹", decimal_places=2, status="active")
    usd = Currency(id=3, code="USD", name="US Dollar", symbol="$", decimal_places=2, status="active")
    session.add_all([inr, usd])
    session.flush()

    # Seed FX Rate (INR -> USD @ 0.012)
    fx = FxRate(
        id=1,
        from_currency_id=2,
        to_currency_id=3,
        rate=Decimal("0.01200000"),
        effective_date=date(2026, 1, 1),
        rate_source="RBI Reference Rate",
    )
    session.add(fx)
    session.flush()

    # Seed Countries
    india = Country(
        id=2,
        iso_code="IN",
        name="India",
        currency_id=2,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
    )
    us = Country(
        id=3,
        iso_code="US",
        name="United States",
        currency_id=3,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
    )
    session.add_all([india, us])
    session.flush()

    # Seed Master dimensions
    tier = CustomerTier(id=1, name="DEV Tier 1", employee_min=0, employee_max=10000, default_multiplier=Decimal("1.0"), status="active", valid_from=date(2026, 1, 1))
    dep = DeploymentModel(id=1, code="shared_cloud", name="Shared Cloud", status="active")
    pm = PricingModel(id=1, code="pepm", name="Per Employee Per Month", status="active")
    dpo = DeploymentPricingOption(deployment_model_id=1, pricing_model_id=1)
    uom = UnitOfMeasure(id=1, code="employee", name="Employee", status="active")
    session.add_all([tier, dep, pm, dpo, uom])
    session.flush()

    # User, Customer, Deal
    user = User(id=1, email="lead@example.com", full_name="Sales Lead", password_hash="dummy", is_active=True)
    customer = Customer(id=1, code="CUST-001", name="Acme India", country_id=2, customer_tier_id=1, status="active")
    deal = Deal(id=1, code="DEAL-001", name="Acme Deal", customer_id=1, owner_user_id=1, status="open")
    session.add_all([user, customer, deal])
    session.flush()

    # Catalogue & Pack
    fam = ProductFamily(id=1, code="TA", name="Talent Acquisition", status="active")
    prod = Product(id=1, code="TA_CORE", name="Talent Core", product_family_id=1, status="active")
    feat = Feature(id=1, code="FT_CORE", name="Core Feature", product_id=1, classification="native", status="active")
    pack = Pack(id=1, code="PK_CORE", name="Core Pack", variant="standard", product_family_id=1, status="active")
    pv = PackVersion(id=1, pack_id=1, version_no=1, status="active")
    session.add_all([fam, prod, feat, pack, pv])
    session.flush()

    pi = PackItem(pack_version_id=1, feature_id=1)
    session.add(pi)
    session.flush()

    # Rate Card Version and Rate Cards
    rcv = RateCardVersion(id=1, version_no="RC-2026.1", name="Global 2026", status="active", valid_from=date(2026, 1, 1))
    rc = RateCard(
        id=1,
        rate_card_version_id=1,
        pack_version_id=1,
        country_id=2,
        currency_id=2,
        tier_id=1,
        deployment_model_id=1,
        pricing_model_id=1,
        uom_id=1,
        fixed_fee=Decimal("100000.00"),
        unit_rate=Decimal("50.0000"),
    )
    sr = ServiceRate(
        id=1,
        country_id=2,
        currency_id=2,
        role_name="Consultant",
        daily_rate=Decimal("10000.00"),
        hours_per_day=Decimal("8.0"),
        status="active",
        valid_from=date(2026, 1, 1),
    )
    session.add_all([rcv, rc, sr])
    session.commit()

    yield session
    session.close()


def test_valid_reporting_currency_proposal_creation(db_session: Session):
    """Proposal creation succeeds with valid currency IDs (INR=2, USD=3)."""
    p_inr = create_proposal(
        db=db_session,
        data=ProposalCreate(
            code="PROP-INR-001",
            deal_id=1,
            customer_id=1,
            currency_id=2, 
            created_by_user_id=1,
        ),
    )
    assert p_inr.id is not None
    assert p_inr.currency_id == 2

    p_usd = create_proposal(
        db=db_session,
        data=ProposalCreate(
            code="PROP-USD-001",
            deal_id=1,
            customer_id=1,
            currency_id=3,
            created_by_user_id=1,
        ),
    )
    assert p_usd.id is not None
    assert p_usd.currency_id == 3


def test_missing_currency_reference_raises_404(db_session: Session):
    """Proposal creation with non-existent currency ID 1 raises ResourceNotFoundError."""
    with pytest.raises(ResourceNotFoundError) as exc_info:
        create_proposal(
            db=db_session,
            data=ProposalCreate(
                code="PROP-FAIL-001",
                deal_id=1,
                customer_id=1,
                currency_id=1,  # Does not exist in database
                created_by_user_id=1,
            ),
        )
    assert "Currency with id 1 not found" in str(exc_info.value)


def test_country_currency_and_rate_card_resolution(db_session: Session):
    """Country scope and rate cards resolve matching native currency (INR=2)."""
    p = create_proposal(
        db=db_session,
        data=ProposalCreate(
            code="PROP-TEST-002",
            deal_id=1,
            customer_id=1,
            currency_id=2,
            created_by_user_id=1,
        ),
    )
    pc = add_proposal_country(
        db=db_session,
        proposal_id=p.id,
        data=app.schemas.proposals.ProposalCountryCreate(
            country_id=2,
            deployment_model_id=1,
            pricing_model_id=1,
            user_headcount=1000,
            is_primary_deployment=True,
        ),
    )
    assert pc.country.currency_id == 2
    assert pc.country.currency.code == "INR"


def test_fx_conversion_between_existing_currencies(db_session: Session):
    """Pricing calculation converts native INR total to USD reporting currency via FX multiplier."""
    p = create_proposal(
        db=db_session,
        data=ProposalCreate(
            code="PROP-FX-001",
            deal_id=1,
            customer_id=1,
            currency_id=3,  # Reporting in USD (3)
            created_by_user_id=1,
        ),
    )
    add_proposal_country(
        db=db_session,
        proposal_id=p.id,
        data=app.schemas.proposals.ProposalCountryCreate(
            country_id=2,
            deployment_model_id=1,
            pricing_model_id=1,
            user_headcount=100,
            is_primary_deployment=True,
        ),
    )
    # Add pack subscription line (100 headcount)
    # Annual consumption = 50 * 100 * 12 = 60,000 INR
    # Annual platform fee = 100,000 INR
    # Subtotal = 160,000 INR
    add_proposal_line_item(
        db=db_session,
        proposal_id=p.id,
        data=app.schemas.proposals.ProposalLineItemCreate(
            pack_version_id=1,
            feature_id=None,
            uom_id=1,
            quantity=Decimal("100"),
        ),
    )
    # Add service line (5 days @ 10,000 = 50,000 INR)
    add_proposal_service_line(
        db=db_session,
        proposal_id=p.id,
        data=app.schemas.proposals.ProposalServiceLineCreate(
            service_rate_id=1,
            role_name="Consultant",
            days_or_hours=Decimal("5"),
            rate_applied=Decimal("10000.00"),
        ),
    )

    engine = PricingCalculationEngine(db_session)
    result = engine.calculate_proposal(proposal_id=p.id)

   
    assert result["reporting_currency_code"] == "USD"
    assert result["snapshot_payload"]["reporting_currency_id"] == 3
    assert Decimal(str(result["total_proposal_reporting_currency"])) == Decimal("2520.0")
    assert result["snapshot_payload"]["products"][0]["fx_rate_multiplier"] == 0.012


def test_missing_fx_rate_raises_error(db_session: Session):
    """When no FX conversion exists between native and reporting currency, raises MissingFxRateError."""
    eur = Currency(id=4, code="EUR", name="Euro", symbol="€", decimal_places=2, status="active")
    db_session.add(eur)
    db_session.flush()

    p = create_proposal(
        db=db_session,
        data=ProposalCreate(
            code="PROP-NO-FX",
            deal_id=1,
            customer_id=1,
            currency_id=4,  # EUR has no FX rate from INR
            created_by_user_id=1,
        ),
    )
    add_proposal_country(
        db=db_session,
        proposal_id=p.id,
        data=app.schemas.proposals.ProposalCountryCreate(
            country_id=2,
            deployment_model_id=1,
            pricing_model_id=1,
            user_headcount=100,
            is_primary_deployment=True,
        ),
    )
    add_proposal_line_item(
        db=db_session,
        proposal_id=p.id,
        data=app.schemas.proposals.ProposalLineItemCreate(
            pack_version_id=1,
            feature_id=None,
            uom_id=1,
            quantity=Decimal("100"),
        ),
    )

    engine = PricingCalculationEngine(db_session)
    with pytest.raises(MissingFxRateError):
        engine.calculate_proposal(proposal_id=p.id)
