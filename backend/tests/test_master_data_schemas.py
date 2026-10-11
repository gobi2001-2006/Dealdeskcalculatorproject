"""Unit tests for Pydantic v2 Master Data schemas (Wave 1).

Validates:
1. Currency schemas (ISO code length, decimal_places range 0-6, status, ORM serialization).
2. Country schemas (ISO code, positive price multiplier, date ordering valid_to > valid_from).
3. FxRate schemas (distinct from/to currencies, positive rate, decimal precision, immutability).
4. DeploymentModel schemas (cost_basis_flag, code, status, ORM serialization).
5. UnitOfMeasure schemas (code, name, conversion_rule, ORM serialization).
6. PricingModel schemas (fixed_fee_basis validation, uom_locked_id, ORM serialization).
7. DeploymentPricingOption schemas (composite key validation, positive IDs).
8. CustomerTier schemas (employee_min >= 0, employee_max >= employee_min, date order, multiplier).
9. ContractTerm schemas (term_months > 0, escalation_pct 0-100 range, Decimal precision).
10. Update schema distinction between omitted fields vs explicit null for non-nullable DB columns.
11. Schema import integrity and re-exports from app.schemas.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.master_data import (
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
    FxRateCreate,
    FxRateDetailResponse,
    FxRateResponse,
    FxRateUpdate,
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
# 1. Currency Tests
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
    assert curr.status == "active"


def test_currency_create_defaults():
    curr = CurrencyCreate(code="JPY", name="Japanese Yen")
    assert curr.decimal_places == 2
    assert curr.symbol is None
    assert curr.status == "active"


def test_currency_create_invalid_code_length():
    with pytest.raises(ValidationError):
        CurrencyCreate(code="US", name="Too Short")
    with pytest.raises(ValidationError):
        CurrencyCreate(code="USDT", name="Too Long")


def test_currency_create_invalid_decimal_places():
    with pytest.raises(ValidationError):
        CurrencyCreate(code="BTC", name="Bitcoin", decimal_places=-1)
    with pytest.raises(ValidationError):
        CurrencyCreate(code="BTC", name="Bitcoin", decimal_places=7)


def test_currency_update_rejects_null_on_non_nullable():
    # 'code' is non-nullable; passing explicit None must raise
    with pytest.raises(ValidationError) as exc:
        CurrencyUpdate(code=None)
    assert "code cannot be null" in str(exc.value)

    # 'symbol' is nullable in DB; passing explicit None is valid
    up = CurrencyUpdate(symbol=None)
    assert up.symbol is None
    assert "symbol" in up.model_dump(exclude_unset=True)

    # Omitted fields are not in dump
    up_omitted = CurrencyUpdate(name="Renamed")
    assert "code" not in up_omitted.model_dump(exclude_unset=True)


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
# 2. Country Tests
# =============================================================================

def test_country_create_valid():
    c = CountryCreate(
        iso_code="US",
        name="United States",
        currency_id=1,
        price_multiplier=Decimal("1.250000"),
        valid_from=date(2025, 1, 1),
        valid_to=date(2025, 12, 31),
    )
    assert c.iso_code == "US"
    assert c.price_multiplier == Decimal("1.250000")


def test_country_create_invalid_date_order():
    with pytest.raises(ValidationError) as exc:
        CountryCreate(
            iso_code="IN",
            name="India",
            currency_id=2,
            valid_from=date(2025, 6, 1),
            valid_to=date(2025, 5, 1),
        )
    assert "valid_to must be strictly greater than valid_from" in str(exc.value)


def test_country_create_invalid_multiplier():
    with pytest.raises(ValidationError):
        CountryCreate(
            iso_code="GB",
            name="United Kingdom",
            currency_id=3,
            price_multiplier=Decimal("0.000000"),  # must be > 0
            valid_from=date(2025, 1, 1),
        )


def test_country_update_rejects_null_on_non_nullable():
    with pytest.raises(ValidationError) as exc:
        CountryUpdate(price_multiplier=None)
    assert "price_multiplier cannot be null" in str(exc.value)

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
# 3. FX Rate Tests
# =============================================================================

def test_fx_rate_create_valid():
    fx = FxRateCreate(
        from_currency_id=1,
        to_currency_id=2,
        rate=Decimal("83.25000000"),
        rate_source="OANDA",
        effective_date=date(2025, 1, 15),
    )
    assert fx.rate == Decimal("83.25000000")
    assert fx.from_currency_id == 1


def test_fx_rate_create_identical_currencies_rejected():
    with pytest.raises(ValidationError) as exc:
        FxRateCreate(
            from_currency_id=1,
            to_currency_id=1,
            rate=Decimal("1.00000000"),
            effective_date=date(2025, 1, 1),
        )
    assert "distinct currencies" in str(exc.value)


def test_fx_rate_create_invalid_negative_rate():
    with pytest.raises(ValidationError):
        FxRateCreate(
            from_currency_id=1,
            to_currency_id=2,
            rate=Decimal("-1.50000000"),
            effective_date=date(2025, 1, 1),
        )


def test_fx_rate_update_distinct_check():
    # Update modifying both to identical must fail
    with pytest.raises(ValidationError):
        FxRateUpdate(from_currency_id=2, to_currency_id=2)


def test_fx_rate_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=100,
        from_currency_id=1,
        to_currency_id=2,
        rate=Decimal("83.12345678"),
        rate_source="Central Bank",
        effective_date=date(2025, 2, 1),
        created_by=5,
        created_at=now,
    )
    resp = FxRateResponse.model_validate(orm)
    assert resp.id == 100
    assert resp.rate == Decimal("83.12345678")
    assert resp.created_by == 5


# =============================================================================
# 4. Deployment Model Tests
# =============================================================================

def test_deployment_model_create_valid():
    dm = DeploymentModelCreate(
        code="shared_cloud",
        name="Shared Cloud (Multi-Tenant)",
        cost_basis_flag=False,
    )
    assert dm.code == "shared_cloud"
    assert dm.cost_basis_flag is False


def test_deployment_model_update_rejects_null_on_non_nullable():
    with pytest.raises(ValidationError):
        DeploymentModelUpdate(name=None)

    # description is nullable
    up = DeploymentModelUpdate(description=None)
    assert up.description is None


def test_deployment_model_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=3,
        code="private_cloud",
        name="Dedicated Private Cloud",
        description="Single tenant hosting",
        cost_basis_flag=True,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = DeploymentModelResponse.model_validate(orm)
    assert resp.id == 3
    assert resp.cost_basis_flag is True


# =============================================================================
# 5. Unit of Measure Tests
# =============================================================================

def test_uom_create_valid():
    uom = UnitOfMeasureCreate(
        code="employee",
        name="Per Employee Per Month (PEPM)",
        conversion_rule="1 FTE = 1 headcount",
    )
    assert uom.code == "employee"


def test_uom_update():
    up = UnitOfMeasureUpdate(name="Per Active Employee")
    assert up.name == "Per Active Employee"
    assert "code" not in up.model_dump(exclude_unset=True)


def test_uom_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=4,
        code="candidate",
        name="Per Candidate",
        conversion_rule=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = UnitOfMeasureResponse.model_validate(orm)
    assert resp.id == 4
    assert resp.conversion_rule is None


# =============================================================================
# 6. Pricing Model Tests
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
            code="pm_test",
            name="Test",
            fixed_fee_basis="monthly",  # only 'annual' or 'one_time' allowed
        )


def test_pricing_model_update():
    up = PricingModelUpdate(fixed_fee_basis="one_time")
    assert up.fixed_fee_basis == "one_time"


def test_pricing_model_detail_response_nested():
    now = datetime.now(timezone.utc)
    uom_orm = MockORMObject(
        id=1,
        code="employee",
        name="Employee",
        conversion_rule=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    pm_orm = MockORMObject(
        id=10,
        code="pepm",
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
    assert resp.id == 10
    assert resp.uom_locked is not None
    assert resp.uom_locked.code == "employee"


# =============================================================================
# 7. Deployment Pricing Option Tests
# =============================================================================

def test_dpo_create_valid():
    dpo = DeploymentPricingOptionCreate(
        deployment_model_id=1,
        pricing_model_id=2,
    )
    assert dpo.deployment_model_id == 1
    assert dpo.pricing_model_id == 2


def test_dpo_create_invalid_id():
    with pytest.raises(ValidationError):
        DeploymentPricingOptionCreate(
            deployment_model_id=0,
            pricing_model_id=2,
        )


def test_dpo_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        deployment_model_id=1,
        pricing_model_id=2,
        created_at=now,
    )
    resp = DeploymentPricingOptionResponse.model_validate(orm)
    assert resp.deployment_model_id == 1
    assert resp.pricing_model_id == 2
    assert not hasattr(resp, "id")


# =============================================================================
# 8. Customer Tier Tests
# =============================================================================

def test_customer_tier_create_valid_closed_range():
    tier = CustomerTierCreate(
        name="Tier 1 (1 - 500)",
        employee_min=1,
        employee_max=500,
        default_multiplier=Decimal("1.000000"),
        valid_from=date(2025, 1, 1),
    )
    assert tier.employee_min == 1
    assert tier.employee_max == 500


def test_customer_tier_create_valid_open_ended():
    tier = CustomerTierCreate(
        name="Tier 5 (10,001+)",
        employee_min=10001,
        employee_max=None,
        default_multiplier=Decimal("0.750000"),
        valid_from=date(2025, 1, 1),
    )
    assert tier.employee_min == 10001
    assert tier.employee_max is None


def test_customer_tier_invalid_max_less_than_min():
    with pytest.raises(ValidationError) as exc:
        CustomerTierCreate(
            name="Invalid Range",
            employee_min=500,
            employee_max=200,
            valid_from=date(2025, 1, 1),
        )
    assert "employee_max must be greater than or equal to employee_min" in str(exc.value)


def test_customer_tier_invalid_dates():
    with pytest.raises(ValidationError) as exc:
        CustomerTierCreate(
            name="Invalid Dates",
            employee_min=1,
            employee_max=100,
            valid_from=date(2025, 6, 1),
            valid_to=date(2025, 4, 1),
        )
    assert "valid_to must be strictly greater than valid_from" in str(exc.value)


def test_customer_tier_update():
    up = CustomerTierUpdate(
        default_multiplier=Decimal("0.850000"),
        employee_max=800,
    )
    assert up.default_multiplier == Decimal("0.850000")
    assert up.employee_max == 800


def test_customer_tier_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=5,
        name="Tier 2 (501 - 1,500)",
        employee_min=501,
        employee_max=1500,
        default_multiplier=Decimal("0.900000"),
        status="active",
        valid_from=date(2025, 1, 1),
        valid_to=None,
        created_at=now,
        updated_at=now,
    )
    resp = CustomerTierResponse.model_validate(orm)
    assert resp.id == 5
    assert resp.employee_min == 501
    assert resp.employee_max == 1500
    assert resp.default_multiplier == Decimal("0.900000")


# =============================================================================
# 9. Contract Term Tests
# =============================================================================

def test_contract_term_create_valid():
    ct = ContractTermCreate(
        term_months=36,
        escalation_pct_per_renewal_year=Decimal("5.0000"),
    )
    assert ct.term_months == 36
    assert ct.escalation_pct_per_renewal_year == Decimal("5.0000")


def test_contract_term_create_invalid_months():
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=0)
    with pytest.raises(ValidationError):
        ContractTermCreate(term_months=-12)


def test_contract_term_create_invalid_escalation_pct():
    with pytest.raises(ValidationError):
        ContractTermCreate(
            term_months=12,
            escalation_pct_per_renewal_year=Decimal("-1.0000"),
        )
    with pytest.raises(ValidationError):
        ContractTermCreate(
            term_months=12,
            escalation_pct_per_renewal_year=Decimal("101.0000"),
        )


def test_contract_term_update():
    up = ContractTermUpdate(escalation_pct_per_renewal_year=Decimal("7.5000"))
    assert up.escalation_pct_per_renewal_year == Decimal("7.5000")


def test_contract_term_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=3,
        term_months=24,
        escalation_pct_per_renewal_year=Decimal("3.5000"),
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = ContractTermResponse.model_validate(orm)
    assert resp.id == 3
    assert resp.term_months == 24
    assert resp.escalation_pct_per_renewal_year == Decimal("3.5000")


# =============================================================================
# 10. Schema Registry Exports Test
# =============================================================================

def test_master_data_schemas_exported_from_schemas_root():
    import app.schemas as schemas

    # Verify Master Data exports
    assert hasattr(schemas, "CurrencyCreate")
    assert hasattr(schemas, "CountryCreate")
    assert hasattr(schemas, "FxRateCreate")
    assert hasattr(schemas, "DeploymentModelCreate")
    assert hasattr(schemas, "UnitOfMeasureCreate")
    assert hasattr(schemas, "PricingModelCreate")
    assert hasattr(schemas, "DeploymentPricingOptionCreate")
    assert hasattr(schemas, "CustomerTierCreate")
    assert hasattr(schemas, "ContractTermCreate")

    # Verify Catalogue exports are preserved
    assert hasattr(schemas, "ProductFamilyCreate")
    assert hasattr(schemas, "ProductCreate")
    assert hasattr(schemas, "FeatureCreate")
    assert hasattr(schemas, "PackCreate")
    assert hasattr(schemas, "PackVersionCreate")
    assert hasattr(schemas, "PackItemCreate")
