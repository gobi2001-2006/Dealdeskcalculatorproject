"""Unit tests for Pydantic v2 Foundation schemas (Wave 1 Master Data).

Validates all 9 foundational models imported/re-exported from app.models.foundation:
1. Currency schemas (ISO code length, decimal_places range 0-6, status, ORM serialization).
2. Country schemas (ISO code length, positive price multiplier, date ordering valid_to > valid_from, detail).
3. FxRate schemas (distinct from/to currencies, positive rate, decimal precision, detail).
4. DeploymentModel schemas (cost_basis_flag, code length, status, ORM serialization, detail).
5. UnitOfMeasure schemas (code, name, conversion_rule, ORM serialization).
6. PricingModel schemas (fixed_fee_basis validation, uom_locked_id, ORM serialization, detail).
7. DeploymentPricingOption schemas (composite key validation, positive IDs, association-only detail).
8. CustomerTier schemas (employee_min >= 0, employee_max >= employee_min, date order, multiplier).
9. ContractTerm schemas (term_months 1-120 range, discount/escalation 0-100 range, Decimal precision).
10. Update schema distinction between omitted fields vs explicit null for non-nullable DB columns.
11. Re-exports and schema registry integrity in app.schemas.foundation and app.schemas.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.foundation import (
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
    FoundationStatus,
    FxRateCreate,
    FxRateDetailResponse,
    FxRateResponse,
    FxRateUpdate,
    MasterDataStatus,
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
    assert curr.name == "United States Dollar"
    assert curr.symbol == "$"
    assert curr.decimal_places == 2
    assert curr.status == "active"


def test_currency_create_defaults():
    curr = CurrencyCreate(code="JPY", name="Japanese Yen")
    assert curr.symbol is None
    assert curr.decimal_places == 2
    assert curr.status == "active"


def test_currency_create_missing_required():
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USD")  # missing name
    with pytest.raises(ValidationError):
        CurrencyCreate(name="US Dollar")  # missing code


def test_currency_code_length_validation():
    with pytest.raises(ValidationError):
        CurrencyCreate(code="US", name="Too Short")
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USDT", name="Too Long")


def test_currency_decimal_places_bounds():
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USD", name="US Dollar", decimal_places=-1)
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USD", name="US Dollar", decimal_places=7)


def test_currency_status_validation():
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USD", name="US Dollar", status="unknown")


def test_currency_update_partial_and_null_guards():
    # Valid partial update
    up = CurrencyUpdate(name="Renamed Currency")
    assert up.name == "Renamed Currency"
    assert "code" not in up.model_dump(exclude_unset=True)

    # Explicit null on non-nullable field rejected
    with pytest.raises(ValidationError) as exc:
        CurrencyUpdate(code=None)
    assert "code cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        CurrencyUpdate(decimal_places=None)
    assert "decimal_places cannot be null" in str(exc.value)

    # Legitimate nullable field allowed
    up_nullable = CurrencyUpdate(symbol=None)
    assert up_nullable.symbol is None
    assert "symbol" in up_nullable.model_dump(exclude_unset=True)


def test_currency_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=1,
        code="EUR",
        name="Euro",
        symbol="€",
        decimal_places=2,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = CurrencyResponse.model_validate(orm)
    assert resp.id == 1
    assert resp.code == "EUR"
    assert resp.symbol == "€"


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
    assert country.valid_to == date(2030, 12, 31)


def test_country_invalid_ids_and_iso_code():
    # Non-positive ID
    with pytest.raises(ValidationError):
        CountryCreate(
            iso_code="US",
            name="United States",
            currency_id=0,
            valid_from=date(2025, 1, 1),
        )
    # Invalid ISO code length
    with pytest.raises(ValidationError):
        CountryCreate(
            iso_code="USA",
            name="United States",
            currency_id=1,
            valid_from=date(2025, 1, 1),
        )


def test_country_price_multiplier_positive():
    with pytest.raises(ValidationError):
        CountryCreate(
            iso_code="US",
            name="US",
            currency_id=1,
            price_multiplier=Decimal("0"),  # must be > 0
            valid_from=date(2025, 1, 1),
        )
    with pytest.raises(ValidationError):
        CountryCreate(
            iso_code="US",
            name="US",
            currency_id=1,
            price_multiplier=Decimal("-1.5"),
            valid_from=date(2025, 1, 1),
        )


def test_country_date_order_validation():
    # valid_to must be strictly > valid_from
    with pytest.raises(ValidationError) as exc:
        CountryCreate(
            iso_code="US",
            name="US",
            currency_id=1,
            valid_from=date(2026, 1, 1),
            valid_to=date(2026, 1, 1),  # equal rejected
        )
    assert "strictly greater than valid_from" in str(exc.value)

    with pytest.raises(ValidationError):
        CountryCreate(
            iso_code="US",
            name="US",
            currency_id=1,
            valid_from=date(2026, 1, 2),
            valid_to=date(2026, 1, 1),
        )


def test_country_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        CountryUpdate(iso_code=None)
    assert "iso_code cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        CountryUpdate(currency_id=None)
    assert "currency_id cannot be null" in str(exc.value)

    # valid_to is nullable
    up = CountryUpdate(valid_to=None)
    assert up.valid_to is None


def test_country_detail_response_nested():
    now = datetime.now(timezone.utc)
    curr_orm = MockORMObject(
        id=1,
        code="USD",
        name="US Dollar",
        symbol="$",
        decimal_places=2,
        status="active",
        created_at=now,
        updated_at=now,
    )
    country_orm = MockORMObject(
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
    resp = CountryDetailResponse.model_validate(country_orm)
    assert resp.id == 10
    assert resp.currency is not None
    assert resp.currency.code == "USD"


# =============================================================================
# 3. FxRate Schema Tests
# =============================================================================

def test_fx_rate_create_valid():
    fx = FxRateCreate(
        from_currency_id=1,
        to_currency_id=2,
        rate=Decimal("0.92000000"),
        rate_source="Reuters",
        effective_date=date(2026, 1, 15),
        created_by=5,
    )
    assert fx.from_currency_id == 1
    assert fx.to_currency_id == 2
    assert fx.rate == Decimal("0.92000000")


def test_fx_rate_distinct_currencies_validation():
    with pytest.raises(ValidationError) as exc:
        FxRateCreate(
            from_currency_id=1,
            to_currency_id=1,
            rate=Decimal("1.00000000"),
            effective_date=date(2026, 1, 15),
        )
    assert "distinct currencies" in str(exc.value)


def test_fx_rate_positive_rate_validation():
    with pytest.raises(ValidationError):
        FxRateCreate(
            from_currency_id=1,
            to_currency_id=2,
            rate=Decimal("0"),
            effective_date=date(2026, 1, 15),
        )


def test_fx_rate_update_and_null_guards():
    with pytest.raises(ValidationError) as exc:
        FxRateUpdate(rate=None)
    assert "rate cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        FxRateUpdate(from_currency_id=2, to_currency_id=2)
    assert "distinct currencies" in str(exc.value)

    # rate_source is nullable
    up = FxRateUpdate(rate_source=None)
    assert up.rate_source is None


def test_fx_rate_detail_response_nested():
    now = datetime.now(timezone.utc)
    c1 = MockORMObject(id=1, code="USD", name="Dollar", decimal_places=2, status="active", created_at=now, updated_at=now)
    c2 = MockORMObject(id=2, code="EUR", name="Euro", decimal_places=2, status="active", created_at=now, updated_at=now)
    fx_orm = MockORMObject(
        id=100,
        from_currency_id=1,
        to_currency_id=2,
        rate=Decimal("0.92000000"),
        rate_source="ECB",
        effective_date=date(2026, 1, 1),
        created_by=None,
        created_at=now,
        from_currency=c1,
        to_currency=c2,
    )
    resp = FxRateDetailResponse.model_validate(fx_orm)
    assert resp.id == 100
    assert resp.from_currency.code == "USD"
    assert resp.to_currency.code == "EUR"


# =============================================================================
# 4. DeploymentModel Schema Tests
# =============================================================================

def test_deployment_model_create_valid():
    dm = DeploymentModelCreate(
        code="dedicated_cloud",
        name="Dedicated Cloud",
        description="Single-tenant cloud instance",
        cost_basis_flag=True,
    )
    assert dm.code == "dedicated_cloud"
    assert dm.cost_basis_flag is True
    assert dm.status == "active"


def test_deployment_model_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        DeploymentModelUpdate(name=None)
    assert "name cannot be null" in str(exc.value)

    # description is nullable
    up = DeploymentModelUpdate(description=None)
    assert up.description is None


def test_deployment_model_detail_response_nested():
    now = datetime.now(timezone.utc)
    opt = MockORMObject(deployment_model_id=1, pricing_model_id=2, created_at=now)
    dm_orm = MockORMObject(
        id=1,
        code="saas_multi",
        name="Multi-tenant",
        description=None,
        cost_basis_flag=False,
        status="active",
        created_at=now,
        updated_at=now,
        pricing_options=[opt],
    )
    resp = DeploymentModelDetailResponse.model_validate(dm_orm)
    assert resp.id == 1
    assert len(resp.pricing_options) == 1
    assert resp.pricing_options[0].pricing_model_id == 2


# =============================================================================
# 5. UnitOfMeasure Schema Tests
# =============================================================================

def test_unit_of_measure_create_valid():
    uom = UnitOfMeasureCreate(
        code="pepm",
        name="Per Employee Per Month",
        conversion_rule="1 employee count per month",
        status="active",
    )
    assert uom.code == "pepm"
    assert uom.name == "Per Employee Per Month"


def test_unit_of_measure_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        UnitOfMeasureUpdate(code=None)
    assert "code cannot be null" in str(exc.value)

    up = UnitOfMeasureUpdate(conversion_rule=None)
    assert up.conversion_rule is None


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
        description="Fixed base plus recurring unit fee",
        has_fixed_component=True,
        has_unit_component=True,
        fixed_fee_basis="annual",
        uom_locked_id=1,
    )
    assert pm.has_fixed_component is True
    assert pm.fixed_fee_basis == "annual"
    assert pm.uom_locked_id == 1


def test_pricing_model_invalid_fixed_fee_basis():
    with pytest.raises(ValidationError):
        PricingModelCreate(
            code="pm_inv",
            name="Invalid Basis",
            fixed_fee_basis="monthly",  # only annual or one_time
        )


def test_pricing_model_invalid_uom_locked_id():
    with pytest.raises(ValidationError):
        PricingModelCreate(
            code="pm_inv",
            name="Invalid UOM",
            uom_locked_id=0,  # must be > 0
        )


def test_pricing_model_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        PricingModelUpdate(name=None)
    assert "name cannot be null" in str(exc.value)

    # fixed_fee_basis is nullable
    up = PricingModelUpdate(fixed_fee_basis=None)
    assert up.fixed_fee_basis is None


def test_pricing_model_detail_response_nested():
    now = datetime.now(timezone.utc)
    uom_orm = MockORMObject(id=1, code="pepm", name="Per Employee", conversion_rule=None, status="active", created_at=now, updated_at=now)
    pm_orm = MockORMObject(
        id=5,
        code="pepm_model",
        name="PEPM Model",
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
    resp = PricingModelDetailResponse.model_validate(pm_orm)
    assert resp.id == 5
    assert resp.uom_locked is not None
    assert resp.uom_locked.code == "pepm"


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


def test_deployment_pricing_option_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        DeploymentPricingOptionUpdate(deployment_model_id=None)
    assert "deployment_model_id cannot be null" in str(exc.value)


def test_deployment_pricing_option_detail_response():
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
    resp = DeploymentPricingOptionDetailResponse.model_validate(dpo_orm)
    assert resp.deployment_model_id == 1
    assert resp.deployment_model.code == "saas"
    assert resp.pricing_model.code == "flat"


# =============================================================================
# 8. CustomerTier Schema Tests
# =============================================================================

def test_customer_tier_create_valid():
    tier = CustomerTierCreate(
        name="Tier 1 - Startup",
        description="1 to 500 headcount",
        employee_min=1,
        employee_max=500,
        default_multiplier=Decimal("1.250000"),
        valid_from=date(2025, 1, 1),
        valid_to=date(2028, 12, 31),
        status="active",
    )
    assert tier.employee_min == 1
    assert tier.employee_max == 500
    assert tier.default_multiplier == Decimal("1.250000")


def test_customer_tier_employee_bounds_validation():
    # Negative employee_min
    with pytest.raises(ValidationError):
        CustomerTierCreate(
            name="Invalid",
            employee_min=-1,
            valid_from=date(2025, 1, 1),
        )
    # employee_max < employee_min
    with pytest.raises(ValidationError) as exc:
        CustomerTierCreate(
            name="Invalid Range",
            employee_min=500,
            employee_max=100,
            valid_from=date(2025, 1, 1),
        )
    assert "employee_max must be greater than or equal to employee_min" in str(exc.value)


def test_customer_tier_date_order_validation():
    with pytest.raises(ValidationError) as exc:
        CustomerTierCreate(
            name="Invalid Dates",
            employee_min=1,
            valid_from=date(2026, 1, 1),
            valid_to=date(2026, 1, 1),  # must be strictly >
        )
    assert "strictly greater than valid_from" in str(exc.value)


def test_customer_tier_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        CustomerTierUpdate(name=None)
    assert "name cannot be null" in str(exc.value)

    # employee_max is nullable (unbounded upper tier)
    up = CustomerTierUpdate(employee_max=None)
    assert up.employee_max is None


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
    assert ct.status == "active"


def test_contract_term_create_defaults():
    ct = ContractTermCreate(term_months=12)
    assert ct.term_months == 12
    assert ct.escalation_pct_per_renewal_year == Decimal("0.0000")
    assert ct.status == "active"


def test_contract_term_months_bounds():
    # term_months must be > 0
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=0)
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=-1)


def test_contract_term_percentages_bounds():
    # escalation_pct_per_renewal_year 0 - 100
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=12, escalation_pct_per_renewal_year=Decimal("-1.0"))
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=12, escalation_pct_per_renewal_year=Decimal("101.0"))


def test_contract_term_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        ContractTermUpdate(term_months=None)
    assert "term_months cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ContractTermUpdate(escalation_pct_per_renewal_year=None)
    assert "escalation_pct_per_renewal_year cannot be null" in str(exc.value)

    up = ContractTermUpdate(status="retired")
    assert up.status == "retired"


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
# 10. Schema Registry Exports & Alias Parity
# =============================================================================

def test_foundation_schemas_exported_from_foundation_module():
    import app.schemas.foundation as fnd_schemas

    assert fnd_schemas.FoundationStatus is fnd_schemas.MasterDataStatus
    assert hasattr(fnd_schemas, "CurrencyCreate")
    assert hasattr(fnd_schemas, "CountryCreate")
    assert hasattr(fnd_schemas, "CountryDetailResponse")
    assert hasattr(fnd_schemas, "FxRateCreate")
    assert hasattr(fnd_schemas, "DeploymentModelCreate")
    assert hasattr(fnd_schemas, "UnitOfMeasureCreate")
    assert hasattr(fnd_schemas, "PricingModelCreate")
    assert hasattr(fnd_schemas, "DeploymentPricingOptionCreate")
    assert hasattr(fnd_schemas, "CustomerTierCreate")
    assert hasattr(fnd_schemas, "ContractTermCreate")


def test_foundation_schemas_exported_from_schemas_root():
    import app.schemas as schemas

    assert hasattr(schemas, "FoundationStatus")
    assert hasattr(schemas, "CurrencyCreate")
    assert hasattr(schemas, "CountryCreate")
    assert hasattr(schemas, "FxRateCreate")
    assert hasattr(schemas, "DeploymentModelCreate")
    assert hasattr(schemas, "UnitOfMeasureCreate")
    assert hasattr(schemas, "PricingModelCreate")
    assert hasattr(schemas, "DeploymentPricingOptionCreate")
    assert hasattr(schemas, "CustomerTierCreate")
    assert hasattr(schemas, "ContractTermCreate")

    # Wave 2 & 3 schemas preserved
    assert hasattr(schemas, "PackCreate")
    assert hasattr(schemas, "RateCardCreate")
