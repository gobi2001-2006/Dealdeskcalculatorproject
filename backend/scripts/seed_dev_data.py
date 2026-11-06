"""Idempotent DEVELOPMENT / TEST seed data for Adrenalin Deal Desk.

This is NOT production data. Every business value below (rates, FX, tiers) is a
placeholder taken from the worked example in "Proposal_Pricing_Model_Calculation
Explained.pdf" so the Phase 1 workflow can be exercised and regression-tested.
The real rate cards, FX rates and tiers must come from the Pricing Desk.

Safety:
  * Refuses to run against a non-local database unless --allow-remote is given.
  * Never prints credentials (only host and database name).
  * Safe to run repeatedly: every record is looked up by its natural key first.

Usage (from the backend directory, with the venv active):
    python -m scripts.seed_dev_data
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Optional
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalogue import Feature, Pack, PackItem, PackVersion, Product, ProductFamily
from app.models.governance import User
from app.models.master_data import (
    ContractTerm,
    Country,
    Currency,
    CustomerTier,
    DeploymentModel,
    DeploymentPricingOption,
    FxRate,
    PricingModel,
    PricingModelUom,
    UnitOfMeasure,
)
from app.models.rate_card import RateCard, RateCardVersion, ServiceRate

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
DEV_VALID_FROM = date(2026, 1, 1)


@dataclass
class SeedIds:
    """Primary keys of the seeded records, for tests and manual API calls."""

    inr_id: int
    usd_id: int
    india_id: int
    usa_id: int
    uom_candidate_id: int
    uom_employee_id: int
    deployment_shared_id: int
    deployment_private_id: int
    pricing_platform_sub_id: int
    pricing_pepm_id: int
    tier_id: int
    term_id: int
    user_id: int
    rate_card_version_id: int
    family_id: int
    product_id: int
    feature_recruit_id: int
    feature_agent_id: int
    feature_standalone_id: int
    pack_id: int
    pack_version_id: int
    service_rate_id: int


def _get_or_create(db: Session, model: Any, lookup: dict[str, Any], values: Optional[dict[str, Any]] = None):
    """Return the existing row matching `lookup`, else create it with lookup+values."""
    stmt = select(model)
    for column, value in lookup.items():
        stmt = stmt.where(getattr(model, column) == value)
    existing = db.execute(stmt).scalars().first()
    if existing is not None:
        return existing
    row = model(**lookup, **(values or {}))
    db.add(row)
    db.flush()
    return row


def seed(db: Session) -> SeedIds:
    """Create (or reuse) the minimum reference data for the Phase 1 workflow."""
    inr = _get_or_create(db, Currency, {"code": "INR"}, {"name": "Indian Rupee", "symbol": "₹"})
    usd = _get_or_create(db, Currency, {"code": "USD"}, {"name": "US Dollar", "symbol": "$"})

    india = _get_or_create(
        db, Country, {"iso_code": "IN"},
        {"name": "India", "currency_id": inr.id, "valid_from": DEV_VALID_FROM},
    )
    usa = _get_or_create(
        db, Country, {"iso_code": "US"},
        {"name": "United States", "currency_id": usd.id, "valid_from": DEV_VALID_FROM},
    )

    # FX convention (project-wide): 1 unit of from_currency = `rate` units of to_currency.
    # DEV placeholder rate only - the Pricing Desk owns real FX rates.
    _get_or_create(
        db, FxRate,
        {"from_currency_id": inr.id, "to_currency_id": usd.id, "effective_date": DEV_VALID_FROM},
        {"rate": Decimal("0.01200000"), "rate_source": "DEV seed placeholder"},
    )

    uom_candidate = _get_or_create(db, UnitOfMeasure, {"code": "candidate"}, {"name": "Candidate Inflow", "category": "uom2"})
    uom_employee = _get_or_create(db, UnitOfMeasure, {"code": "employee"}, {"name": "Active Employees (with ESS)", "category": "uom1"})
    uom_non_ess = _get_or_create(db, UnitOfMeasure, {"code": "active_employees_non_ess"}, {"name": "Active Employees (non-ESS)", "category": "uom1"})
    _get_or_create(db, UnitOfMeasure, {"code": "gb_data"}, {"name": "GB of Data", "category": "uom2"})
    _get_or_create(db, UnitOfMeasure, {"code": "bgv"}, {"name": "BGV", "category": "uom2"})
    _get_or_create(db, UnitOfMeasure, {"code": "interviews"}, {"name": "Interviews", "category": "uom2"})
    _get_or_create(db, UnitOfMeasure, {"code": "navi_tokens"}, {"name": "Navi Tokens", "category": "uom2"})
    _get_or_create(db, UnitOfMeasure, {"code": "payslips"}, {"name": "Payslips", "category": "uom2"})
    _get_or_create(db, UnitOfMeasure, {"code": "api_calls"}, {"name": "API Calls", "category": "uom2"})

    shared = _get_or_create(db, DeploymentModel, {"code": "shared_cloud"}, {"name": "Shared Cloud"})
    private = _get_or_create(db, DeploymentModel, {"code": "private_cloud"}, {"name": "Private Cloud"})
    on_prem = _get_or_create(db, DeploymentModel, {"code": "on_premise"}, {"name": "On-Premise"})

    pepm = _get_or_create(
        db, PricingModel, {"code": "pepm"},
        {
            "name": "Per Employee Per Month",
            "has_fixed_component": False,
            "has_unit_component": True,
        },
    )
    # PEPM is charged per Active Employees (with ESS) or (non-ESS): not locked to one UOM; the two
    # allowed UOMs come from pricing_model_uoms below (business decision 2026-11-06).
    if pepm.uom_locked_id is not None:
        pepm.uom_locked_id = None
        db.flush()

    platform_sub = _get_or_create(
        db, PricingModel, {"code": "platform_subscription"},
        {
            "name": "Platform + Subscription",
            "has_fixed_component": True,
            "has_unit_component": True,
            "fixed_fee_basis": "annual",
        },
    )

    license_amc = _get_or_create(
        db, PricingModel, {"code": "license_amc"},
        {
            "name": "License Fee + AMC",
            "has_fixed_component": False,
            "has_unit_component": True,
            "unit_rate_basis": "one_time",
        },
    )

    for deployment, pricing in (
        (shared, pepm),
        (shared, platform_sub),
        (private, pepm),
        (private, platform_sub),
        (on_prem, license_amc),
    ):
        _get_or_create(
            db, DeploymentPricingOption,
            {"deployment_model_id": deployment.id, "pricing_model_id": pricing.id},
        )

    # Allowed UOM mappings
    _get_or_create(db, PricingModelUom, {"pricing_model_id": pepm.id, "uom_id": uom_employee.id}, {"is_default": True})
    _get_or_create(db, PricingModelUom, {"pricing_model_id": pepm.id, "uom_id": uom_non_ess.id}, {"is_default": False})

    _get_or_create(db, PricingModelUom, {"pricing_model_id": license_amc.id, "uom_id": uom_employee.id}, {"is_default": True})
    _get_or_create(db, PricingModelUom, {"pricing_model_id": license_amc.id, "uom_id": uom_non_ess.id}, {"is_default": False})

    # Platform + Subscription has no mapping rows: every active UOM is allowed (see migration c9d0e1f2a3b4).

    tier = _get_or_create(
        db, CustomerTier, {"name": "DEV Tier 1"},
        {"employee_min": 0, "employee_max": None, "valid_from": DEV_VALID_FROM},
    )
    term = _get_or_create(db, ContractTerm, {"term_months": 12})

    user = _get_or_create(
        db, User, {"email": "dev.user@example.test"},
        # Not a valid bcrypt hash on purpose: this account cannot log in.
        {"full_name": "DEV Seed User", "password_hash": "!DEV-SEED-NO-LOGIN", "is_active": True},
    )

    family = _get_or_create(db, ProductFamily, {"code": "DEV_TA"}, {"name": "DEV Talent Acquisition"})
    product = _get_or_create(
        db, Product, {"code": "DEV_TA_MAX"}, {"product_family_id": family.id, "name": "DEV Talent Acquisition Max"}
    )
    feat_recruit = _get_or_create(
        db, Feature, {"code": "DEV_TA_RECRUIT"},
        {"product_id": product.id, "name": "DEV Recruit", "classification": "native"},
    )
    feat_agent = _get_or_create(
        db, Feature, {"code": "DEV_TA_AGENT"},
        {"product_id": product.id, "name": "DEV AI Agent", "classification": "ai_enabled"},
    )
    feat_standalone = _get_or_create(
        db, Feature, {"code": "DEV_TA_SOLO"},
        {"product_id": product.id, "name": "DEV Standalone Add-on", "classification": "native"},
    )

    pack = _get_or_create(
        db, Pack, {"code": "DEV_TA_PREMIUM"},
        {"name": "DEV TA Premium", "variant": "premium", "product_family_id": family.id},
    )
    pack_version = _get_or_create(db, PackVersion, {"pack_id": pack.id, "version_no": 1}, {"status": "active"})
    for feature in (feat_recruit, feat_agent):
        _get_or_create(db, PackItem, {"pack_version_id": pack_version.id, "feature_id": feature.id})

    rc_version = _get_or_create(
        db, RateCardVersion, {"version_no": "RC-DEV-1"},
        {"name": "DEV rate card (worked-example values)", "status": "active", "valid_from": DEV_VALID_FROM},
    )

    # Worked example from the pricing PDF: Premium pack, India, platform fee 3,80,000
    # and 80 per candidate. DEV placeholder values, not a real rate card.
    common = {
        "rate_card_version_id": rc_version.id,
        "country_id": india.id,
        "deployment_model_id": shared.id,
        "pricing_model_id": platform_sub.id,
        "tier_id": tier.id,
        "uom_id": uom_candidate.id,
    }
    _get_or_create(
        db, RateCard, {**common, "pack_version_id": pack_version.id},
        {"currency_id": inr.id, "fixed_fee": Decimal("380000"), "unit_rate": Decimal("80")},
    )
    _get_or_create(
        db, RateCard, {**common, "feature_id": feat_standalone.id},
        {"currency_id": inr.id, "fixed_fee": Decimal("50000"), "unit_rate": Decimal("10")},
    )

    # Hourly 1,500 x 8 hours = 12,000 per day (PDF worked example).
    service_rate = _get_or_create(
        db, ServiceRate,
        {"role_name": "Implementation Consultant", "country_id": india.id, "valid_from": DEV_VALID_FROM},
        {"currency_id": inr.id, "hourly_rate": Decimal("1500"), "hours_per_day": Decimal("8")},
    )

    db.flush()
    return SeedIds(
        inr_id=inr.id, usd_id=usd.id, india_id=india.id, usa_id=usa.id,
        uom_candidate_id=uom_candidate.id, uom_employee_id=uom_employee.id,
        deployment_shared_id=shared.id, deployment_private_id=private.id,
        pricing_platform_sub_id=platform_sub.id, pricing_pepm_id=pepm.id,
        tier_id=tier.id, term_id=term.id, user_id=user.id,
        rate_card_version_id=rc_version.id, family_id=family.id, product_id=product.id,
        feature_recruit_id=feat_recruit.id, feature_agent_id=feat_agent.id,
        feature_standalone_id=feat_standalone.id, pack_id=pack.id, pack_version_id=pack_version.id,
        service_rate_id=service_rate.id,
    )


def assert_safe_target(url: str, allow_remote: bool) -> str:
    """Return a credential-free description of the target, or exit if it is remote."""
    parsed = urlparse(url.replace("postgresql+psycopg", "postgresql", 1))
    host = parsed.hostname or ""
    database = (parsed.path or "").lstrip("/")
    if host not in LOCAL_HOSTS and not allow_remote:
        sys.exit(
            f"Refusing to seed non-local database host '{host}'. "
            "This script writes DEV data. Re-run with --allow-remote only if you are sure."
        )
    return f"{host}/{database}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed idempotent DEV data.")
    parser.add_argument("--allow-remote", action="store_true", help="permit a non-local database (dangerous)")
    args = parser.parse_args()

    from app.db.session import get_database_url, get_sessionmaker

    target = assert_safe_target(get_database_url(), args.allow_remote)
    print(f"Seeding DEV data into: {target}")
    with get_sessionmaker()() as db:
        ids = seed(db)
        db.commit()
    print("Done. Seeded ids:", {k: v for k, v in ids.__dict__.items()})


if __name__ == "__main__":
    # Allow `python scripts/seed_dev_data.py` as well as `python -m scripts.seed_dev_data`.
    os.environ.setdefault("PYTHONPATH", os.getcwd())
    main()
