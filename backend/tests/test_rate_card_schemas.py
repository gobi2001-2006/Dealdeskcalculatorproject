"""Unit tests for Pydantic v2 Rate Card schemas (Wave 3).

Validates:
1. RateCardVersion schemas (version_no, name, status, date order valid_to >= valid_from, ORM serialization).
2. RateCard schemas (6 dimensions, target exclusive pack_version_id XOR feature_id, fee component required).
3. ServiceRate schemas (role_name, country_id, hours_per_day range 0-24, non-negative rates, date order).
4. Monetary Decimal precision (18, 4) without floats.
5. Update schemas rejecting explicit null for non-nullable database columns while allowing omitted fields.
6. Detail nested response schemas serialization with ORM-like objects.
7. Schema exports from app.schemas.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.rate_card import (
    RateCardCreate,
    RateCardDetailResponse,
    RateCardResponse,
    RateCardUpdate,
    RateCardVersionCreate,
    RateCardVersionDetailResponse,
    RateCardVersionResponse,
    RateCardVersionUpdate,
    ServiceRateCreate,
    ServiceRateDetailResponse,
    ServiceRateResponse,
    ServiceRateUpdate,
)


class MockORMObject:
    """Simulates SQLAlchemy ORM model instances for testing from_attributes."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


# =============================================================================
# 1. RateCardVersion Tests
# =============================================================================

def test_rate_card_version_create_valid():
    rcv = RateCardVersionCreate(
        version_no="RC-2026.1",
        name="FY26 Q1 Global Rate Card",
        status="draft",
        valid_from=date(2026, 1, 1),
        valid_to=date(2026, 12, 31),
        created_by="pricing.admin@adrenalin.com",
    )
    assert rcv.version_no == "RC-2026.1"
    assert rcv.status == "draft"
    assert rcv.valid_to == date(2026, 12, 31)


def test_rate_card_version_create_indefinite():
    rcv = RateCardVersionCreate(
        version_no="RC-2026.2",
        name="FY26 Q2 Open-ended",
        valid_from=date(2026, 4, 1),
    )
    assert rcv.valid_to is None
    assert rcv.status == "draft"


def test_rate_card_version_create_equal_dates_valid():
    # valid_to >= valid_from allows equal single-day effective dates
    rcv = RateCardVersionCreate(
        version_no="RC-SPECIAL",
        name="Single Day Pilot",
        valid_from=date(2026, 6, 1),
        valid_to=date(2026, 6, 1),
    )
    assert rcv.valid_to == rcv.valid_from


def test_rate_card_version_create_invalid_date_order():
    with pytest.raises(ValidationError) as exc:
        RateCardVersionCreate(
            version_no="RC-INV",
            name="Invalid Dates",
            valid_from=date(2026, 7, 1),
            valid_to=date(2026, 6, 30),
        )
    assert "valid_to must be greater than or equal to valid_from" in str(exc.value)


def test_rate_card_version_create_invalid_status():
    with pytest.raises(ValidationError):
        RateCardVersionCreate(
            version_no="RC-INV-STATUS",
            name="Invalid Status",
            status="archived",  # only draft, active, retired
            valid_from=date(2026, 1, 1),
        )


def test_rate_card_version_update_null_guards():
    # version_no is non-nullable; explicit None rejected
    with pytest.raises(ValidationError) as exc:
        RateCardVersionUpdate(version_no=None)
    assert "version_no cannot be null" in str(exc.value)

    # valid_to is nullable; explicit None allowed
    up = RateCardVersionUpdate(valid_to=None)
    assert up.valid_to is None
    assert "valid_to" in up.model_dump(exclude_unset=True)

    # Omitted fields are not in model_dump(exclude_unset=True)
    up_omitted = RateCardVersionUpdate(name="Renamed Rate Card")
    assert "version_no" not in up_omitted.model_dump(exclude_unset=True)


def test_rate_card_version_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=1,
        version_no="RC-2026.1",
        name="FY26 Rate Card",
        status="active",
        valid_from=date(2026, 1, 1),
        valid_to=None,
        created_by="admin@test.com",
        activated_by="approver@test.com",
        activated_at=now,
        created_at=now,
        updated_at=now,
    )
    resp = RateCardVersionResponse.model_validate(orm)
    assert resp.id == 1
    assert resp.version_no == "RC-2026.1"
    assert resp.activated_at == now


# =============================================================================
# 2. RateCard Tests
# =============================================================================

def test_rate_card_create_valid_pack_pricing():
    rc = RateCardCreate(
        rate_card_version_id=1,
        country_id=10,
        deployment_model_id=2,
        pricing_model_id=3,
        tier_id=4,
        uom_id=5,
        pack_version_id=100,
        feature_id=None,
        currency_id=1,
        fixed_fee=Decimal("15000.0000"),
        unit_rate=Decimal("12.5000"),
        floor_price=Decimal("10.0000"),
    )
    assert rc.pack_version_id == 100
    assert rc.feature_id is None
    assert rc.fixed_fee == Decimal("15000.0000")
    assert rc.unit_rate == Decimal("12.5000")


def test_rate_card_create_valid_feature_pricing():
    rc = RateCardCreate(
        rate_card_version_id=1,
        country_id=10,
        deployment_model_id=2,
        pricing_model_id=3,
        tier_id=4,
        uom_id=5,
        pack_version_id=None,
        feature_id=200,
        currency_id=1,
        fixed_fee=None,
        unit_rate=Decimal("2.5000"),
    )
    assert rc.pack_version_id is None
    assert rc.feature_id == 200
    assert rc.unit_rate == Decimal("2.5000")


def test_rate_card_create_both_targets_rejected():
    with pytest.raises(ValidationError) as exc:
        RateCardCreate(
            rate_card_version_id=1,
            country_id=10,
            deployment_model_id=2,
            pricing_model_id=3,
            tier_id=4,
            uom_id=5,
            pack_version_id=100,
            feature_id=200,
            currency_id=1,
            unit_rate=Decimal("5.0000"),
        )
    assert "Exactly one target must be provided" in str(exc.value)


def test_rate_card_create_neither_target_rejected():
    with pytest.raises(ValidationError) as exc:
        RateCardCreate(
            rate_card_version_id=1,
            country_id=10,
            deployment_model_id=2,
            pricing_model_id=3,
            tier_id=4,
            uom_id=5,
            pack_version_id=None,
            feature_id=None,
            currency_id=1,
            unit_rate=Decimal("5.0000"),
        )
    assert "Exactly one target must be provided" in str(exc.value)


def test_rate_card_create_fee_component_required():
    # Neither fixed_fee nor unit_rate provided -> rejected
    with pytest.raises(ValidationError) as exc:
        RateCardCreate(
            rate_card_version_id=1,
            country_id=10,
            deployment_model_id=2,
            pricing_model_id=3,
            tier_id=4,
            uom_id=5,
            pack_version_id=100,
            currency_id=1,
            fixed_fee=None,
            unit_rate=None,
        )
    assert "At least one fee component" in str(exc.value)


def test_rate_card_create_negative_monetary_rejected():
    with pytest.raises(ValidationError):
        RateCardCreate(
            rate_card_version_id=1,
            country_id=10,
            deployment_model_id=2,
            pricing_model_id=3,
            tier_id=4,
            uom_id=5,
            pack_version_id=100,
            currency_id=1,
            fixed_fee=Decimal("-100.0000"),
        )
    with pytest.raises(ValidationError):
        RateCardCreate(
            rate_card_version_id=1,
            country_id=10,
            deployment_model_id=2,
            pricing_model_id=3,
            tier_id=4,
            uom_id=5,
            pack_version_id=100,
            currency_id=1,
            unit_rate=Decimal("-0.0100"),
        )


def test_rate_card_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        RateCardUpdate(country_id=None)
    assert "country_id cannot be null" in str(exc.value)

    # fixed_fee is nullable; explicit None allowed
    up = RateCardUpdate(fixed_fee=None)
    assert up.fixed_fee is None


def test_rate_card_update_both_targets_rejected():
    with pytest.raises(ValidationError) as exc:
        RateCardUpdate(pack_version_id=10, feature_id=20)
    assert "Cannot set both pack_version_id and feature_id" in str(exc.value)


def test_rate_card_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=50,
        rate_card_version_id=1,
        country_id=10,
        deployment_model_id=2,
        pricing_model_id=3,
        tier_id=4,
        uom_id=5,
        pack_version_id=100,
        feature_id=None,
        currency_id=1,
        fixed_fee=Decimal("20000.0000"),
        unit_rate=Decimal("15.0000"),
        floor_price=Decimal("12.0000"),
        cost_fixed=Decimal("5000.0000"),
        cost_unit=Decimal("4.0000"),
        created_at=now,
        updated_at=now,
    )
    resp = RateCardResponse.model_validate(orm)
    assert resp.id == 50
    assert resp.fixed_fee == Decimal("20000.0000")
    assert resp.pack_version_id == 100


def test_rate_card_detail_response_nested():
    now = datetime.now(timezone.utc)
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
    )
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
    rc_orm = MockORMObject(
        id=50,
        rate_card_version_id=1,
        country_id=10,
        deployment_model_id=2,
        pricing_model_id=3,
        tier_id=4,
        uom_id=5,
        pack_version_id=100,
        feature_id=None,
        currency_id=1,
        fixed_fee=Decimal("1000.0000"),
        unit_rate=None,
        floor_price=None,
        cost_fixed=None,
        cost_unit=None,
        created_at=now,
        updated_at=now,
        country=country_orm,
        currency=curr_orm,
        deployment_model=None,
        pricing_model=None,
        tier=None,
        uom=None,
        pack_version=None,
        feature=None,
    )
    detail = RateCardDetailResponse.model_validate(rc_orm)
    assert detail.id == 50
    assert detail.country is not None
    assert detail.country.iso_code == "US"
    assert detail.currency is not None
    assert detail.currency.code == "USD"


# =============================================================================
# 3. ServiceRate Tests
# =============================================================================

def test_service_rate_create_valid():
    sr = ServiceRateCreate(
        role_name="Solution Architect",
        country_id=10,
        hourly_rate=Decimal("150.0000"),
        hours_per_day=Decimal("8.00"),
        daily_rate=Decimal("1200.0000"),
        cost_rate=Decimal("80.0000"),
        currency_id=1,
        valid_from=date(2026, 1, 1),
        valid_to=date(2026, 12, 31),
        status="active",
    )
    assert sr.role_name == "Solution Architect"
    assert sr.hours_per_day == Decimal("8.00")
    assert sr.daily_rate == Decimal("1200.0000")


def test_service_rate_create_default_hours_per_day():
    sr = ServiceRateCreate(
        role_name="Technical Consultant",
        country_id=10,
        currency_id=1,
        valid_from=date(2026, 1, 1),
    )
    assert sr.hours_per_day == Decimal("8.00")
    assert sr.status == "active"


def test_service_rate_invalid_hours_per_day():
    with pytest.raises(ValidationError):
        ServiceRateCreate(
            role_name="PM",
            country_id=10,
            currency_id=1,
            valid_from=date(2026, 1, 1),
            hours_per_day=Decimal("0.00"),  # must be > 0
        )
    with pytest.raises(ValidationError):
        ServiceRateCreate(
            role_name="PM",
            country_id=10,
            currency_id=1,
            valid_from=date(2026, 1, 1),
            hours_per_day=Decimal("24.50"),  # must be <= 24
        )


def test_service_rate_invalid_date_order():
    with pytest.raises(ValidationError) as exc:
        ServiceRateCreate(
            role_name="PM",
            country_id=10,
            currency_id=1,
            valid_from=date(2026, 6, 1),
            valid_to=date(2026, 5, 31),
        )
    assert "valid_to must be greater than or equal to valid_from" in str(exc.value)


def test_service_rate_negative_rates_rejected():
    with pytest.raises(ValidationError):
        ServiceRateCreate(
            role_name="PM",
            country_id=10,
            currency_id=1,
            valid_from=date(2026, 1, 1),
            hourly_rate=Decimal("-10.0000"),
        )
    with pytest.raises(ValidationError):
        ServiceRateCreate(
            role_name="PM",
            country_id=10,
            currency_id=1,
            valid_from=date(2026, 1, 1),
            daily_rate=Decimal("-50.0000"),
        )


def test_service_rate_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        ServiceRateUpdate(role_name=None)
    assert "role_name cannot be null" in str(exc.value)

    # hourly_rate is nullable in DB
    up = ServiceRateUpdate(hourly_rate=None)
    assert up.hourly_rate is None


def test_service_rate_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=70,
        role_name="Engagement Manager",
        country_id=10,
        hourly_rate=Decimal("175.0000"),
        hours_per_day=Decimal("8.00"),
        daily_rate=Decimal("1400.0000"),
        cost_rate=Decimal("100.0000"),
        currency_id=1,
        valid_from=date(2026, 1, 1),
        valid_to=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = ServiceRateResponse.model_validate(orm)
    assert resp.id == 70
    assert resp.role_name == "Engagement Manager"
    assert resp.daily_rate == Decimal("1400.0000")


# =============================================================================
# 4. Schema Registry Exports Test
# =============================================================================

def test_rate_card_schemas_exported_from_schemas_root():
    import app.schemas as schemas

    # Wave 3 Rate Card schemas
    assert hasattr(schemas, "RateCardVersionCreate")
    assert hasattr(schemas, "RateCardVersionResponse")
    assert hasattr(schemas, "RateCardVersionDetailResponse")
    assert hasattr(schemas, "RateCardCreate")
    assert hasattr(schemas, "RateCardResponse")
    assert hasattr(schemas, "RateCardDetailResponse")
    assert hasattr(schemas, "ServiceRateCreate")
    assert hasattr(schemas, "ServiceRateResponse")
    assert hasattr(schemas, "ServiceRateDetailResponse")

    # Wave 1 & 2 schemas preserved
    assert hasattr(schemas, "CurrencyCreate")
    assert hasattr(schemas, "CountryCreate")
    assert hasattr(schemas, "ProductFamilyCreate")
    assert hasattr(schemas, "ProductCreate")
    assert hasattr(schemas, "FeatureCreate")
    assert hasattr(schemas, "PackCreate")


# =============================================================================
# 5. Detail Schemas Nested Serialization Tests
# =============================================================================

def test_rate_card_version_detail_response_nested():
    now = datetime.now(timezone.utc)
    rc_orm = MockORMObject(
        id=101,
        rate_card_version_id=1,
        country_id=10,
        deployment_model_id=2,
        pricing_model_id=3,
        tier_id=4,
        uom_id=5,
        pack_version_id=100,
        feature_id=None,
        currency_id=1,
        fixed_fee=Decimal("12000.0000"),
        unit_rate=Decimal("10.0000"),
        floor_price=None,
        cost_fixed=None,
        cost_unit=None,
        created_at=now,
        updated_at=now,
    )
    rcv_orm = MockORMObject(
        id=1,
        version_no="RC-2026.1",
        name="FY26 Global",
        status="active",
        valid_from=date(2026, 1, 1),
        valid_to=date(2026, 12, 31),
        created_by="pricing@test.com",
        activated_by="approver@test.com",
        activated_at=now,
        created_at=now,
        updated_at=now,
        rate_cards=[rc_orm],
    )
    detail = RateCardVersionDetailResponse.model_validate(rcv_orm)
    assert detail.id == 1
    assert len(detail.rate_cards) == 1
    assert detail.rate_cards[0].id == 101
    assert detail.rate_cards[0].fixed_fee == Decimal("12000.0000")


def test_service_rate_detail_response_nested():
    now = datetime.now(timezone.utc)
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
    )
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
    sr_orm = MockORMObject(
        id=75,
        role_name="Senior Architect",
        country_id=10,
        hourly_rate=Decimal("200.0000"),
        hours_per_day=Decimal("8.00"),
        daily_rate=Decimal("1600.0000"),
        cost_rate=Decimal("120.0000"),
        currency_id=1,
        valid_from=date(2026, 1, 1),
        valid_to=None,
        status="active",
        created_at=now,
        updated_at=now,
        country=country_orm,
        currency=curr_orm,
    )
    detail = ServiceRateDetailResponse.model_validate(sr_orm)
    assert detail.id == 75
    assert detail.country is not None
    assert detail.country.iso_code == "US"
    assert detail.currency is not None
    assert detail.currency.code == "USD"


# =============================================================================
# 6. Additional Validation, Edge Cases & Constraints
# =============================================================================

def test_rate_card_version_update_invalid_date_order():
    with pytest.raises(ValidationError) as exc:
        RateCardVersionUpdate(
            valid_from=date(2026, 8, 1),
            valid_to=date(2026, 7, 31),
        )
    assert "valid_to must be greater than or equal to valid_from" in str(exc.value)


def test_service_rate_update_invalid_date_order():
    with pytest.raises(ValidationError) as exc:
        ServiceRateUpdate(
            valid_from=date(2026, 8, 1),
            valid_to=date(2026, 7, 31),
        )
    assert "valid_to must be greater than or equal to valid_from" in str(exc.value)


@pytest.mark.parametrize("id_field", [
    "rate_card_version_id",
    "country_id",
    "deployment_model_id",
    "pricing_model_id",
    "tier_id",
    "uom_id",
    "currency_id",
])
def test_rate_card_positive_id_validation(id_field):
    payload = {
        "rate_card_version_id": 1,
        "country_id": 10,
        "deployment_model_id": 2,
        "pricing_model_id": 3,
        "tier_id": 4,
        "uom_id": 5,
        "pack_version_id": 100,
        "currency_id": 1,
        "unit_rate": Decimal("10.0000"),
    }
    payload[id_field] = 0  # non-positive ID
    with pytest.raises(ValidationError):
        RateCardCreate(**payload)

    payload[id_field] = -1
    with pytest.raises(ValidationError):
        RateCardCreate(**payload)


def test_rate_card_target_positive_ids():
    with pytest.raises(ValidationError):
        RateCardCreate(
            rate_card_version_id=1,
            country_id=10,
            deployment_model_id=2,
            pricing_model_id=3,
            tier_id=4,
            uom_id=5,
            pack_version_id=0,
            currency_id=1,
            unit_rate=Decimal("10.0000"),
        )
    with pytest.raises(ValidationError):
        RateCardCreate(
            rate_card_version_id=1,
            country_id=10,
            deployment_model_id=2,
            pricing_model_id=3,
            tier_id=4,
            uom_id=5,
            feature_id=-5,
            currency_id=1,
            unit_rate=Decimal("10.0000"),
        )


def test_rate_card_create_missing_required_fields():
    with pytest.raises(ValidationError):
        RateCardCreate(
            rate_card_version_id=1,
            # missing country_id
            deployment_model_id=2,
            pricing_model_id=3,
            tier_id=4,
            uom_id=5,
            pack_version_id=100,
            currency_id=1,
            unit_rate=Decimal("10.0000"),
        )


def test_rate_card_update_both_targets_cleared_rejected():
    with pytest.raises(ValidationError) as exc:
        RateCardUpdate(pack_version_id=None, feature_id=None)
    assert "Cannot clear both pack_version_id and feature_id" in str(exc.value)


def test_rate_card_update_both_fees_cleared_rejected():
    with pytest.raises(ValidationError) as exc:
        RateCardUpdate(fixed_fee=None, unit_rate=None)
    assert "At least one fee component" in str(exc.value)


def test_service_rate_invalid_status():
    with pytest.raises(ValidationError):
        ServiceRateCreate(
            role_name="PM",
            country_id=10,
            currency_id=1,
            valid_from=date(2026, 1, 1),
            status="deprecated",  # invalid
        )
    with pytest.raises(ValidationError):
        ServiceRateUpdate(status="deprecated")


def test_service_rate_hours_per_day_boundaries():
    # Boundary: 0.01 is valid
    sr1 = ServiceRateCreate(
        role_name="PM",
        country_id=10,
        currency_id=1,
        valid_from=date(2026, 1, 1),
        hours_per_day=Decimal("0.01"),
    )
    assert sr1.hours_per_day == Decimal("0.01")

    # Boundary: 24.00 is valid
    sr2 = ServiceRateCreate(
        role_name="PM",
        country_id=10,
        currency_id=1,
        valid_from=date(2026, 1, 1),
        hours_per_day=Decimal("24.00"),
    )
    assert sr2.hours_per_day == Decimal("24.00")

    # Boundary: 24.01 is invalid (> 24)
    with pytest.raises(ValidationError):
        ServiceRateCreate(
            role_name="PM",
            country_id=10,
            currency_id=1,
            valid_from=date(2026, 1, 1),
            hours_per_day=Decimal("24.01"),
        )


def test_rate_card_version_string_length_limits():
    # version_no > 50 chars
    with pytest.raises(ValidationError):
        RateCardVersionCreate(
            version_no="A" * 51,
            name="Valid Name",
            valid_from=date(2026, 1, 1),
        )

    # name > 200 chars
    with pytest.raises(ValidationError):
        RateCardVersionCreate(
            version_no="RC-1",
            name="A" * 201,
            valid_from=date(2026, 1, 1),
        )

    # created_by > 100 chars
    with pytest.raises(ValidationError):
        RateCardVersionCreate(
            version_no="RC-1",
            name="Valid Name",
            valid_from=date(2026, 1, 1),
            created_by="A" * 101,
        )
