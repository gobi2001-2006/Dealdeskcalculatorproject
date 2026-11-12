"""Unit tests for Pydantic v2 Master schemas (matching app.models.master).

Validates all 9 master models imported/re-exported from app.models.master:
1. Currency schemas (code, name, decimal_places, status, ORM serialization).
2. Country schemas (ISO code, positive price multiplier, date ordering valid_to > valid_from, detail).
3. FxRate schemas (distinct from/to currencies, positive rate, decimal precision, detail).
4. DeploymentModel schemas (cost_basis_flag, code length, status, ORM serialization, detail).
5. UnitOfMeasure schemas (code, name, conversion_rule, ORM serialization).
6. PricingModel schemas (fixed_fee_basis, uom_locked_id, ORM serialization, detail).
7. DeploymentPricingOption schemas (composite key validation, positive IDs, association-only detail).
8. CustomerTier schemas (employee bounds, date ordering, multiplier, ORM serialization).
9. ContractTerm schemas (term_months > 0, escalation_pct_per_renewal_year 0-100, ORM serialization).
10. Update schema distinction between omitted fields vs explicit null for non-nullable DB columns.
11. Re-exports and schema registry integrity in app.schemas.master and app.schemas.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.master import (
    ContractTermCreate,
    ContractTermResponse,
    ContractTermUpdate,
    CountryCreate,
    CountryDetailResponse,
    CountryResponse,
    CountryUpdate,
    CurrencyCreate,
    CurrencyResponse,
    CurrencyUpdate,
    CustomerTierCreate,
    CustomerTierResponse,
    CustomerTierUpdate,
    DeploymentModelCreate,
    DeploymentModelDetailResponse,
    DeploymentModelResponse,
    DeploymentModelUpdate,
    DeploymentPricingOptionCreate,
    DeploymentPricingOptionDetailResponse,
    DeploymentPricingOptionResponse,
    DeploymentPricingOptionUpdate,
    FixedFeeBasis,
    FxRateCreate,
    FxRateDetailResponse,
    FxRateResponse,
    FxRateUpdate,
    MasterDataStatus,
    MasterStatus,
    PricingModelCreate,
    PricingModelDetailResponse,
    PricingModelResponse,
    PricingModelUpdate,
    UnitOfMeasureCreate,
    UnitOfMeasureResponse,
    UnitOfMeasureUpdate,
)


class MockORMObject:
    """Simulates SQLAlchemy ORM model instances for testing from_attributes."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


# =============================================================================
# 1. Currency Schema Tests
# =============================================================================

def test_currency_create_valid():
    curr = CurrencyCreate(
        code="USD",
        name="United States Dollar",
        symbol="$",
        decimal_places=2,
        status="active",
    )
    assert curr.code == "USD"
    assert curr.decimal_places == 2


def test_currency_missing_required():
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USD")


def test_currency_invalid_code_or_decimal_places():
    with pytest.raises(ValidationError):
        CurrencyCreate(code="US", name="Too Short")
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USD", name="US Dollar", decimal_places=-1)
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USD", name="US Dollar", decimal_places=7)


def test_currency_update_null_guards():
    up = CurrencyUpdate(name="Renamed Currency")
    assert up.name == "Renamed Currency"

    with pytest.raises(ValidationError) as exc:
        CurrencyUpdate(code=None)
    assert "code cannot be null" in str(exc.value)


def test_currency_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=1,
        code="USD",
        name="US Dollar",
        symbol="$",
        decimal_places=2,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = CurrencyResponse.model_validate(orm)
    assert resp.id == 1
    assert resp.code == "USD"


# =============================================================================
# 2. Country Schema Tests
# =============================================================================

def test_country_create_valid():
    country = CountryCreate(
        iso_code="IN",
        name="India",
        currency_id=3,
        price_multiplier=Decimal("0.850000"),
        valid_from=date(2025, 1, 1),
        valid_to=date(2030, 12, 31),
        status="active",
    )
    assert country.iso_code == "IN"
    assert country.price_multiplier == Decimal("0.850000")


def test_country_invalid_ids_and_multiplier():
    with pytest.raises(ValidationError):
        CountryCreate(iso_code="IN", name="India", currency_id=0, valid_from=date(2025, 1, 1))
    with pytest.raises(ValidationError):
        CountryCreate(iso_code="IN", name="India", currency_id=1, price_multiplier=Decimal("0"), valid_from=date(2025, 1, 1))


def test_country_date_ordering():
    with pytest.raises(ValidationError) as exc:
        CountryCreate(
            iso_code="IN",
            name="India",
            currency_id=1,
            valid_from=date(2026, 1, 1),
            valid_to=date(2026, 1, 1),  # strictly >
        )
    assert "strictly greater than valid_from" in str(exc.value)


def test_country_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        CountryUpdate(iso_code=None)
    assert "iso_code cannot be null" in str(exc.value)


def test_country_detail_response_nested():
    now = datetime.now(timezone.utc)
    curr_orm = MockORMObject(id=1, code="USD", name="US Dollar", symbol="$", decimal_places=2, status="active", created_at=now, updated_at=now)
    c_orm = MockORMObject(
        id=10,
        iso_code="US",
        name="United States",
        currency_id=1,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2025, 1, 1),
        valid_to=None,
        created_at=now,
        updated_at=now,
        currency=curr_orm,
    )
    detail = CountryDetailResponse.model_validate(c_orm)
    assert detail.id == 10
    assert detail.currency.code == "USD"


# =============================================================================
# 3. FxRate Schema Tests
# =============================================================================

def test_fx_rate_create_valid():
    fx = FxRateCreate(
        from_currency_id=1,
        to_currency_id=2,
        rate=Decimal("1.08500000"),
        rate_source="ECB",
        effective_date=date(2026, 1, 1),
    )
    assert fx.from_currency_id == 1
    assert fx.rate == Decimal("1.08500000")


def test_fx_rate_identical_currencies():
    with pytest.raises(ValidationError) as exc:
        FxRateCreate(
            from_currency_id=1,
            to_currency_id=1,
            rate=Decimal("1.00000000"),
            effective_date=date(2026, 1, 1),
        )
    assert "distinct currencies" in str(exc.value)


def test_fx_rate_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        FxRateUpdate(rate=None)
    assert "rate cannot be null" in str(exc.value)


def test_fx_rate_detail_response_nested():
    now = datetime.now(timezone.utc)
    c1 = MockORMObject(id=1, code="USD", name="Dollar", decimal_places=2, status="active", created_at=now, updated_at=now)
    c2 = MockORMObject(id=2, code="EUR", name="Euro", decimal_places=2, status="active", created_at=now, updated_at=now)
    fx_orm = MockORMObject(
        id=5,
        from_currency_id=1,
        to_currency_id=2,
        rate=Decimal("0.92000000"),
        rate_source=None,
        effective_date=date(2026, 1, 1),
        created_by=None,
        created_at=now,
        from_currency=c1,
        to_currency=c2,
    )
    detail = FxRateDetailResponse.model_validate(fx_orm)
    assert detail.id == 5
    assert detail.from_currency.code == "USD"
    assert detail.to_currency.code == "EUR"


# =============================================================================
# 4. DeploymentModel Schema Tests
# =============================================================================

def test_deployment_model_create_valid():
    dm = DeploymentModelCreate(
        code="saas_multi",
        name="SaaS Multi-tenant",
        cost_basis_flag=False,
    )
    assert dm.code == "saas_multi"
    assert dm.cost_basis_flag is False


def test_deployment_model_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        DeploymentModelUpdate(name=None)
    assert "name cannot be null" in str(exc.value)


def test_deployment_model_detail_response_nested():
    now = datetime.now(timezone.utc)
    opt = MockORMObject(deployment_model_id=1, pricing_model_id=2, created_at=now)
    dm_orm = MockORMObject(
        id=1,
        code="saas",
        name="SaaS",
        description=None,
        cost_basis_flag=False,
        status="active",
        created_at=now,
        updated_at=now,
        pricing_options=[opt],
    )
    detail = DeploymentModelDetailResponse.model_validate(dm_orm)
    assert detail.id == 1
    assert len(detail.pricing_options) == 1


# =============================================================================
# 5. UnitOfMeasure Schema Tests
# =============================================================================

def test_unit_of_measure_create_valid():
    uom = UnitOfMeasureCreate(
        code="pepm",
        name="Per Employee Per Month",
    )
    assert uom.code == "pepm"


def test_unit_of_measure_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        UnitOfMeasureUpdate(code=None)
    assert "code cannot be null" in str(exc.value)


def test_unit_of_measure_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=1,
        code="flat",
        name="Flat Fee",
        conversion_rule=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = UnitOfMeasureResponse.model_validate(orm)
    assert resp.id == 1
    assert resp.code == "flat"


# =============================================================================
# 6. PricingModel Schema Tests
# =============================================================================

def test_pricing_model_create_valid():
    pm = PricingModelCreate(
        code="platform_subscription",
        name="Platform + Subscription",
        has_fixed_component=True,
        has_unit_component=True,
        fixed_fee_basis="annual",
        uom_locked_id=1,
    )
    assert pm.has_fixed_component is True
    assert pm.fixed_fee_basis == "annual"


def test_pricing_model_invalid_fixed_fee_basis():
    with pytest.raises(ValidationError):
        PricingModelCreate(
            code="pm_inv",
            name="Invalid",
            fixed_fee_basis="quarterly",  # only annual or one_time
        )


def test_pricing_model_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        PricingModelUpdate(name=None)
    assert "name cannot be null" in str(exc.value)


def test_pricing_model_detail_response_nested():
    now = datetime.now(timezone.utc)
    uom_orm = MockORMObject(id=1, code="pepm", name="Per Employee", conversion_rule=None, status="active", created_at=now, updated_at=now)
    pm_orm = MockORMObject(
        id=5,
        code="pepm_model",
        name="PEPM",
        description=None,
        has_fixed_component=False,
        has_unit_component=True,
        fixed_fee_basis=None,
        uom_locked_id=1,
        status="active",
        created_at=now,
        updated_at=now,
        uom_locked=uom_orm,
        deployment_options=[],
    )
    detail = PricingModelDetailResponse.model_validate(pm_orm)
    assert detail.id == 5
    assert detail.uom_locked.code == "pepm"


# =============================================================================
# 7. DeploymentPricingOption Schema Tests
# =============================================================================

def test_deployment_pricing_option_create_valid():
    dpo = DeploymentPricingOptionCreate(
        deployment_model_id=1,
        pricing_model_id=2,
    )
    assert dpo.deployment_model_id == 1
    assert dpo.pricing_model_id == 2


def test_deployment_pricing_option_invalid_ids():
    with pytest.raises(ValidationError):
        DeploymentPricingOptionCreate(deployment_model_id=0, pricing_model_id=2)
    with pytest.raises(ValidationError):
        DeploymentPricingOptionCreate(deployment_model_id=1, pricing_model_id=-1)


def test_deployment_pricing_option_detail_response_nested():
    now = datetime.now(timezone.utc)
    dm = MockORMObject(id=1, code="saas", name="SaaS", description=None, cost_basis_flag=False, status="active", created_at=now, updated_at=now)
    pm = MockORMObject(id=2, code="flat", name="Flat", description=None, has_fixed_component=True, has_unit_component=False, fixed_fee_basis="annual", uom_locked_id=None, status="active", created_at=now, updated_at=now)
    dpo_orm = MockORMObject(
        deployment_model_id=1,
        pricing_model_id=2,
        created_at=now,
        deployment_model=dm,
        pricing_model=pm,
    )
    detail = DeploymentPricingOptionDetailResponse.model_validate(dpo_orm)
    assert detail.deployment_model_id == 1
    assert detail.deployment_model.code == "saas"
    assert detail.pricing_model.code == "flat"


# =============================================================================
# 8. CustomerTier Schema Tests
# =============================================================================

def test_customer_tier_create_valid():
    tier = CustomerTierCreate(
        name="Tier 1 - Startup",
        employee_min=1,
        employee_max=500,
        default_multiplier=Decimal("1.250000"),
        valid_from=date(2025, 1, 1),
        valid_to=date(2028, 12, 31),
    )
    assert tier.employee_min == 1
    assert tier.employee_max == 500


def test_customer_tier_employee_bounds():
    with pytest.raises(ValidationError):
        CustomerTierCreate(name="T1", employee_min=-1, valid_from=date(2025, 1, 1))
    with pytest.raises(ValidationError):
        CustomerTierCreate(name="T1", employee_min=500, employee_max=100, valid_from=date(2025, 1, 1))


def test_customer_tier_date_ordering():
    with pytest.raises(ValidationError) as exc:
        CustomerTierCreate(
            name="Invalid",
            employee_min=1,
            valid_from=date(2026, 1, 1),
            valid_to=date(2026, 1, 1),  # strictly >
        )
    assert "strictly greater than valid_from" in str(exc.value)


def test_customer_tier_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=3,
        name="Tier 3",
        description=None,
        employee_min=501,
        employee_max=2000,
        default_multiplier=Decimal("1.000000"),
        valid_from=date(2025, 1, 1),
        valid_to=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = CustomerTierResponse.model_validate(orm)
    assert resp.id == 3
    assert resp.default_multiplier == Decimal("1.000000")


# =============================================================================
# 9. ContractTerm Schema Tests
# =============================================================================

def test_contract_term_create_valid():
    ct = ContractTermCreate(
        term_months=36,
        escalation_pct_per_renewal_year=Decimal("4.5000"),
        status="active",
    )
    assert ct.term_months == 36
    assert ct.escalation_pct_per_renewal_year == Decimal("4.5000")


def test_contract_term_months_bounds():
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=0)
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=-1)


def test_contract_term_percentages_bounds():
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=12, escalation_pct_per_renewal_year=Decimal("-0.0001"))
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=12, escalation_pct_per_renewal_year=Decimal("100.0001"))


def test_contract_term_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        ContractTermUpdate(term_months=None)
    assert "term_months cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ContractTermUpdate(escalation_pct_per_renewal_year=None)
    assert "escalation_pct_per_renewal_year cannot be null" in str(exc.value)


def test_contract_term_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=1,
        term_months=12,
        escalation_pct_per_renewal_year=Decimal("5.0000"),
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = ContractTermResponse.model_validate(orm)
    assert resp.id == 1
    assert resp.term_months == 12
    assert resp.escalation_pct_per_renewal_year == Decimal("5.0000")


# =============================================================================
# 10. Schema Registry Exports & Parity
# =============================================================================

def test_master_schemas_exported_from_module():
    import app.schemas.master as m

    assert m.MasterStatus is m.MasterDataStatus
    assert hasattr(m, "CurrencyCreate")
    assert hasattr(m, "CountryCreate")
    assert hasattr(m, "CountryDetailResponse")
    assert hasattr(m, "FxRateCreate")
    assert hasattr(m, "DeploymentModelCreate")
    assert hasattr(m, "PricingModelCreate")
    assert hasattr(m, "CustomerTierCreate")
    assert hasattr(m, "ContractTermCreate")
    assert hasattr(m, "UnitOfMeasureCreate")
    assert hasattr(m, "DeploymentPricingOptionCreate")


def test_master_schemas_exported_from_root():
    import app.schemas as schemas

    assert hasattr(schemas, "MasterStatus")
    assert hasattr(schemas, "CurrencyCreate")
    assert hasattr(schemas, "CountryCreate")
    assert hasattr(schemas, "FxRateCreate")
    assert hasattr(schemas, "DeploymentModelCreate")
    assert hasattr(schemas, "PricingModelCreate")
    assert hasattr(schemas, "CustomerTierCreate")
    assert hasattr(schemas, "ContractTermCreate")
    assert hasattr(schemas, "UnitOfMeasureCreate")
    assert hasattr(schemas, "DeploymentPricingOptionCreate")

    # Prior waves preserved
    assert hasattr(schemas, "PackCreate")
    assert hasattr(schemas, "RateCardCreate")
    assert hasattr(schemas, "RoleCreate")
    assert hasattr(schemas, "ClauseCreate")
