"""
Unit tests for Dynamic UOM functionality, PricingModelUom mappings,
and License Fee + AMC pricing calculations.
"""

from datetime import date
from decimal import Decimal
import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models import (
    Customer,
    CustomerTier,
    Country,
    Currency,
    Deal,
    DeploymentModel,
    PricingModel,
    PricingModelUom,
    ProposalCountry,
    UnitOfMeasure,
    User,
    Feature,
    Product,
    ProductFamily,
    Proposal,
    ProposalLineItem,
    ProposalVersion,
    RateCard,
    RateCardVersion,
)
from app.services.master_service import (
    create_unit_of_measure,
    get_unit_of_measure,
    list_allowed_uoms_for_pricing_model,
    list_units_of_measure,
    update_unit_of_measure,
)
from app.services.pricing_engine import PricingCalculationEngine
from app.schemas.master_data import UnitOfMeasureCreate, UnitOfMeasureUpdate


@pytest.fixture(scope="function")
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()

    @event.listens_for(session, "before_flush")
    def auto_assign_ids(sess, flush_ctx, insts):
        id_counters = {}
        for instance in sess.new:
            if hasattr(instance, "id") and getattr(instance, "id", None) is None:
                cls = type(instance)
                if cls not in id_counters:
                    max_id = sess.execute(select(func.coalesce(func.max(cls.id), 0))).scalar() or 0
                    id_counters[cls] = max_id
                id_counters[cls] += 1
                setattr(instance, "id", id_counters[cls])

    try:
        yield session
    finally:
        session.close()


def test_uom_crud_and_categories(test_db):
    """Verify UOM creation with uom1 and uom2 categories and listing."""
    uom1 = create_unit_of_measure(
        test_db,
        UnitOfMeasureCreate(
            code="active_emp_ess",
            name="Active Employees (with ESS)",
            category="uom1",
            status="active",
        ),
    )
    assert uom1.id is not None
    assert uom1.category == "uom1"
    assert uom1.code == "active_emp_ess"

    uom2 = create_unit_of_measure(
        test_db,
        UnitOfMeasureCreate(
            code="candidate_inflow",
            name="Candidate Inflow",
            category="uom2",
            status="active",
        ),
    )
    assert uom2.id is not None
    assert uom2.category == "uom2"

    # List all
    all_uoms = list_units_of_measure(test_db)
    assert len(all_uoms) == 2

    # Filter by category
    uom1_list = list_units_of_measure(test_db, category="uom1")
    assert len(uom1_list) == 1
    assert uom1_list[0].code == "active_emp_ess"

    uom2_list = list_units_of_measure(test_db, category="uom2")
    assert len(uom2_list) == 1
    assert uom2_list[0].code == "candidate_inflow"

    # Update UOM
    updated = update_unit_of_measure(
        test_db,
        uom1.id,
        UnitOfMeasureUpdate(name="Active Employees with Self Service"),
    )
    assert updated.name == "Active Employees with Self Service"


def test_pricing_model_allowed_uoms(test_db):
    """Verify allowed UOMs resolution for pricing models."""
    uom1 = UnitOfMeasure(code="emp_ess", name="Active Employees (with ESS)", category="uom1", status="active")
    uom1_non = UnitOfMeasure(code="emp_non_ess", name="Active Employees (non-ESS)", category="uom1", status="active")
    uom2_cand = UnitOfMeasure(code="candidate", name="Candidate Inflow", category="uom2", status="active")
    test_db.add_all([uom1, uom1_non, uom2_cand])
    test_db.flush()

    # PEPM with locked UOM
    pm_pepm = PricingModel(
        code="pepm",
        name="PEPM",
        uom_locked_id=uom1.id,
        status="active",
    )
    test_db.add(pm_pepm)
    test_db.flush()

    pepm_uoms = list_allowed_uoms_for_pricing_model(test_db, pm_pepm.id)
    assert len(pepm_uoms) == 1
    assert pepm_uoms[0].id == uom1.id

    # License + AMC with explicit allowed UOMs via PricingModelUom
    pm_license = PricingModel(
        code="license_amc",
        name="License Fee + AMC",
        status="active",
    )
    test_db.add(pm_license)
    test_db.flush()

    assoc1 = PricingModelUom(pricing_model_id=pm_license.id, uom_id=uom1.id, is_default=True)
    assoc2 = PricingModelUom(pricing_model_id=pm_license.id, uom_id=uom1_non.id, is_default=False)
    test_db.add_all([assoc1, assoc2])
    test_db.flush()

    license_uoms = list_allowed_uoms_for_pricing_model(test_db, pm_license.id)
    assert len(license_uoms) == 2
    uom_codes = {u.code for u in license_uoms}
    assert uom_codes == {"emp_ess", "emp_non_ess"}


def test_license_amc_calculation_excel_tier1(test_db):
    """
    Verify License Fee + AMC calculation against calculation explained.xlsx:
    Tier 1 Self Service Users:
    - License Fees (per user): 100,000
    - Users: 10,000
    - Total License Fees = 100,000 * 10,000 = 1,000,000,000
    - AMC% on license: 5% (0.05)
    - AMC annual = 5% * 1,000,000,000 = 50,000,000
    - Deal duration: 5 years (60 months)
    - Total Deal value = 1,000,000,000 + (50,000,000 * 5) = 1,250,000,000
    """
    currency = Currency(code="INR", name="Indian Rupee", symbol="₹", decimal_places=2, status="active")
    test_db.add(currency)
    test_db.flush()

    user = User(email="test@example.com", full_name="Tester", password_hash="hash", is_active=True)
    test_db.add(user)
    test_db.flush()

    india = Country(
        iso_code="IN",
        name="India",
        currency_id=currency.id,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
    )
    test_db.add(india)
    test_db.flush()

    tier = CustomerTier(name="Tier 1", employee_min=0, valid_from=date(2026, 1, 1))
    test_db.add(tier)
    test_db.flush()

    deploy = DeploymentModel(code="on_premise", name="On Premise", status="active")
    test_db.add(deploy)
    test_db.flush()

    pm = PricingModel(
        code="license_amc", name="License Fee + AMC", status="active",
        has_unit_component=True, unit_rate_basis="one_time",
    )
    test_db.add(pm)
    test_db.flush()

    uom = UnitOfMeasure(code="emp_ess", name="Active Employees (with ESS)", category="uom1", status="active")
    test_db.add(uom)
    test_db.flush()

    rc_ver = RateCardVersion(version_no="RC-LIC-2026", name="License RC", status="active", valid_from=date(2026, 1, 1))
    test_db.add(rc_ver)
    test_db.flush()

    family = ProductFamily(code="HR", name="Core HR")
    test_db.add(family)
    test_db.flush()

    product = Product(code="ADR_HR", name="Adrenalin HR", product_family_id=family.id)
    test_db.add(product)
    test_db.flush()

    feature = Feature(code="EMP_CORE", name="Employee Core", product_id=product.id, classification="native", status="active")
    test_db.add(feature)
    test_db.flush()

    # Rate card: unit_rate = 100000, amc_percentage = 5.0
    rc = RateCard(
        rate_card_version_id=rc_ver.id,
        country_id=india.id,
        deployment_model_id=deploy.id,
        pricing_model_id=pm.id,
        tier_id=tier.id,
        uom_id=uom.id,
        feature_id=feature.id,
        currency_id=currency.id,
        unit_rate=Decimal("100000.0000"),
        fixed_fee=Decimal("0.00"),
        amc_percentage=Decimal("5.0000"),
    )
    test_db.add(rc)
    test_db.flush()

    cust = Customer(code="CUST-LIC", name="Lic Corp", country_id=india.id, customer_tier_id=tier.id, status="active")
    test_db.add(cust)
    test_db.flush()

    deal = Deal(code="DEAL-LIC-01", name="Lic Deal", customer_id=cust.id, owner_user_id=user.id, status="open")
    test_db.add(deal)
    test_db.flush()

    proposal = Proposal(
        code="PROP-LIC-01",
        deal_id=deal.id,
        customer_id=cust.id,
        currency_id=currency.id,
        status="draft",
        created_by_user_id=user.id,
    )
    test_db.add(proposal)
    test_db.flush()

    prop_country = ProposalCountry(
        proposal_id=proposal.id,
        country_id=india.id,
        deployment_model_id=deploy.id,
        pricing_model_id=pm.id,
        is_primary_deployment=True,
    )
    test_db.add(prop_country)
    test_db.flush()

    p_ver = ProposalVersion(
        proposal_id=proposal.id,
        version_no=1,
        rate_card_version_id=rc_ver.id,
        status="draft",
        created_by_user_id=user.id,
    )
    test_db.add(p_ver)
    test_db.flush()

    line = ProposalLineItem(
        proposal_version_id=p_ver.id,
        line_number=1,
        feature_id=feature.id,
        quantity=Decimal("10000"),  # 10,000 users
        uom_id=uom.id,
        list_unit_price=Decimal("100000.0000"),
        discount_pct=Decimal("0.00"),
        net_unit_price=Decimal("100000.0000"),
        extended_amount=Decimal("1000000000.0000"),
        currency_id=currency.id,
    )
    test_db.add(line)
    test_db.commit()

    # Run pricing engine with contract_term_months=60 (5 years)
    engine = PricingCalculationEngine(test_db)
    result = engine.calculate_proposal(proposal_id=proposal.id, contract_term_months=60)

    p_res = result["snapshot_payload"]["products"][0]
    # Check contract total
    # Total Deal value (License + AMC) = 1,250,000,000
    assert p_res["contract_product_native_total"] == 1250000000.0
    # Annual figures: Year 1 = License (1,000,000,000) + Annual AMC (50,000,000) = 1,050,000,000
    assert p_res["product_native_total"] == 1050000000.0
