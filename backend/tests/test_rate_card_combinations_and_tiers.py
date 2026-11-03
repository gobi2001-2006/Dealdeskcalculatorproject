"""Tests covering deployment-based pricing, combinations, PEPM UOM enforcement, and tier independence."""

from datetime import date
from decimal import Decimal
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalogue import Feature, Pack, PackVersion, Product, ProductFamily
from app.models.master_data import (
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    DeploymentPricingOption,
    PricingModel,
    UnitOfMeasure,
)
from app.models.rate_card import RateCard, RateCardVersion
from app.services.pricing_engine import (
    MissingRateCardMatchError,
    PricingCalculationEngine,
    resolve_rate_card,
)
from app.services.proposal_service import ProposalValidationError
from app.services.rate_service import upsert_rate_card


from tests.test_audit_pricing_rules import audit_db, auto_assign_ids_audit


@pytest.fixture
def test_data(audit_db: Session):
    """Clean rate cards before test and return database session."""
    audit_db.query(RateCard).delete()
    audit_db.flush()
    return audit_db


def test_invalid_deployment_pricing_combination_rejected(test_data: Session):
    """Ensure backend rejects invalid deployment + pricing model combinations."""
    db = test_data
    # Look up On-Premise (dep_onprem) and PEPM (pm_pepm)
    onprem = db.dep_onprem
    pepm = db.pm_pepm
    uom = db.uom_emp
    tier = db.tier1
    country = db.usa
    curr = db.usd
    ver = db.rcv
    feat = db.feat

    with pytest.raises(ProposalValidationError) as exc:
        upsert_rate_card(
            db,
            rate_card_version_id=db.rcv.id,
            country_id=country.id,
            deployment_model_id=onprem.id,
            pricing_model_id=pepm.id,
            tier_id=tier.id,
            uom_id=uom.id,
            currency_id=curr.id,
            feature_id=feat.id,
            unit_rate=Decimal("15.00"),
        )
    assert "Invalid combination" in str(exc.value)
    assert onprem.name in str(exc.value)
    assert pepm.name in str(exc.value)


def test_pepm_uom_validation_rejects_incompatible_uom(test_data: Session):
    """PEPM is locked to Active Employees (with ESS) through pricing_models.uom_locked_id (master data)."""
    db = test_data
    shared = db.dep_shared
    pepm = db.pm_pepm
    tier = db.tier1
    country = db.usa
    curr = db.usd
    ver = db.rcv
    feat = db.feat

    # Use db.uom_cand (candidate UOM) which is already seeded
    candidate_uom = db.uom_cand

    with pytest.raises(ProposalValidationError) as exc:
        upsert_rate_card(
            db,
            rate_card_version_id=db.rcv.id,
            country_id=country.id,
            deployment_model_id=shared.id,
            pricing_model_id=pepm.id,
            tier_id=tier.id,
            uom_id=candidate_uom.id,
            currency_id=curr.id,
            feature_id=feat.id,
            unit_rate=Decimal("15.00"),
        )
    assert "is locked to unit of measure" in str(exc.value)


def test_independent_tier_rates(test_data: Session):
    """Ensure editing Tier 1 rate does not modify Tier 2 or Tier 3."""
    db = test_data
    shared = db.dep_shared
    pepm = db.pm_pepm
    uom = db.uom_emp
    country = db.usa
    curr = db.usd
    ver = db.rcv
    feat = db.feat

    # 1. Upsert Tier 1, 2, 3 rates
    rc1 = upsert_rate_card(
        db,
        rate_card_version_id=db.rcv.id,
        country_id=country.id,
        deployment_model_id=shared.id,
        pricing_model_id=pepm.id,
        tier_id=db.tier1.id,
        uom_id=uom.id,
        currency_id=curr.id,
        feature_id=feat.id,
        unit_rate=Decimal("10.00"),
    )
    rc2 = upsert_rate_card(
        db,
        rate_card_version_id=db.rcv.id,
        country_id=country.id,
        deployment_model_id=shared.id,
        pricing_model_id=pepm.id,
        tier_id=db.tier2.id,
        uom_id=uom.id,
        currency_id=curr.id,
        feature_id=feat.id,
        unit_rate=Decimal("20.00"),
    )
    rc3 = upsert_rate_card(
        db,
        rate_card_version_id=db.rcv.id,
        country_id=country.id,
        deployment_model_id=shared.id,
        pricing_model_id=pepm.id,
        tier_id=db.tier3.id,
        uom_id=uom.id,
        currency_id=curr.id,
        feature_id=feat.id,
        unit_rate=Decimal("30.00"),
    )

    assert rc1.unit_rate == Decimal("10.00")
    assert rc2.unit_rate == Decimal("20.00")
    assert rc3.unit_rate == Decimal("30.00")

    # 2. Update Tier 1
    rc1_updated = upsert_rate_card(
        db,
        rate_card_version_id=db.rcv.id,
        country_id=country.id,
        deployment_model_id=shared.id,
        pricing_model_id=pepm.id,
        tier_id=db.tier1.id,
        uom_id=uom.id,
        currency_id=curr.id,
        feature_id=feat.id,
        unit_rate=Decimal("15.50"),
    )

    # 3. Reload rc2 and rc3 from database and verify they remain unchanged
    db.refresh(rc2)
    db.refresh(rc3)
    assert rc1_updated.unit_rate == Decimal("15.50")
    assert rc2.unit_rate == Decimal("20.00")
    assert rc3.unit_rate == Decimal("30.00")


def test_missing_rate_card_descriptive_error(test_data: Session):
    """Ensure missing rate card error contains dynamic descriptive message."""
    db = test_data
    with pytest.raises(MissingRateCardMatchError) as exc:
        resolve_rate_card(
            db,
            rate_card_version_id=db.rcv.id,
            country_id=db.usa.id,
            deployment_model_id=db.dep_private.id,
            pricing_model_id=db.pm_pepm.id,
            tier_id=db.tier2.id,
            uom_id=db.uom_emp.id,
            feature_id=db.feat.id,
        )
    err_msg = str(exc.value)
    assert "No saved rate card exists for" in err_msg
    assert db.dep_private.name in err_msg
    assert db.pm_pepm.name in err_msg
    assert db.usa.name in err_msg
    assert db.tier2.name in err_msg
