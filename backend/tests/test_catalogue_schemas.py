"""Unit tests for Pydantic v2 Catalogue & Packs schemas.

Validates:
1. ProductFamily schemas (create, update, response, detail, status constraints).
2. Product schemas (create, update, response, detail, ID validation).
3. Feature schemas (classification, partner_name requirement, update).
4. ProductDescription schemas (date order constraint valid_to > valid_from, language, version).
5. Pack schemas (variant constraint standard/premium, product_family_id optionality).
6. PackVersion schemas (version_no >= 1, status constraint, Decimal monetary validation).
7. PackItem schemas (positive IDs, composite key response without extra fields).
8. Nested relationship response serialization and ORM attribute serialization (from_attributes=True).
9. Schema import integrity and circular-import prevention.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import NamedTuple

import pytest
from pydantic import ValidationError

from app.schemas.catalogue import (
    CatalogueStatus,
    FeatureClassification,
    FeatureCreate,
    FeatureDetailResponse,
    FeatureResponse,
    FeatureUpdate,
    PackCreate,
    PackDetailResponse,
    PackItemCreate,
    PackItemDetailResponse,
    PackItemResponse,
    PackItemUpdate,
    PackResponse,
    PackUpdate,
    PackVariant,
    PackVersionCreate,
    PackVersionDetailResponse,
    PackVersionResponse,
    PackVersionUpdate,
    ProductCreate,
    ProductDescriptionCreate,
    ProductDescriptionResponse,
    ProductDescriptionUpdate,
    ProductDetailResponse,
    ProductFamilyCreate,
    ProductFamilyDetailResponse,
    ProductFamilyResponse,
    ProductFamilyUpdate,
    ProductResponse,
    ProductUpdate,
)


# =============================================================================
# Mock ORM Helper (no DB connection required)
# =============================================================================

class MockORMObject:
    """Generic object to simulate SQLAlchemy ORM model instances for testing from_attributes."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


# =============================================================================
# 1. ProductFamily Schema Tests
# =============================================================================

def test_product_family_create_valid():
    payload = {
        "code": "HRM",
        "name": "Human Resource Management",
        "sort_order": 1,
        "status": "active",
    }
    schema = ProductFamilyCreate(**payload)
    assert schema.code == "HRM"
    assert schema.name == "Human Resource Management"
    assert schema.sort_order == 1
    assert schema.status == "active"


def test_product_family_create_default_status():
    payload = {"code": "PAY", "name": "Payroll"}
    schema = ProductFamilyCreate(**payload)
    assert schema.status == "active"
    assert schema.sort_order is None


def test_product_family_create_whitespace_stripped():
    payload = {"code": "  WFM  ", "name": "  Workforce  "}
    schema = ProductFamilyCreate(**payload)
    assert schema.code == "WFM"
    assert schema.name == "Workforce"


def test_product_family_create_missing_required():
    with pytest.raises(ValidationError) as exc:
        ProductFamilyCreate(name="Missing Code")
    assert "code" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ProductFamilyCreate(code="CODE")
    assert "name" in str(exc.value)


def test_product_family_create_invalid_status():
    with pytest.raises(ValidationError):
        ProductFamilyCreate(code="FIN", name="Finance", status="archived")


def test_product_family_update_partial():
    update = ProductFamilyUpdate(name="Updated Name", status="inactive")
    assert update.name == "Updated Name"
    assert update.status == "inactive"
    assert update.code is None
    assert update.sort_order is None


def test_product_family_response_from_orm():
    now = datetime.now(timezone.utc)
    orm_obj = MockORMObject(
        id=10,
        code="HRM",
        name="Human Resources",
        sort_order=5,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = ProductFamilyResponse.model_validate(orm_obj)
    assert resp.id == 10
    assert resp.code == "HRM"
    assert resp.created_at == now


# =============================================================================
# 2. Product Schema Tests
# =============================================================================

def test_product_create_valid():
    payload = {
        "product_family_id": 1,
        "code": "HRM-CORE",
        "name": "Core HR",
        "status": "active",
    }
    schema = ProductCreate(**payload)
    assert schema.product_family_id == 1
    assert schema.code == "HRM-CORE"


def test_product_create_invalid_family_id():
    with pytest.raises(ValidationError):
        ProductCreate(
            product_family_id=0,
            code="HRM-CORE",
            name="Core HR",
        )
    with pytest.raises(ValidationError):
        ProductCreate(
            product_family_id=-5,
            code="HRM-CORE",
            name="Core HR",
        )


def test_product_update():
    update = ProductUpdate(name="Renamed Core HR")
    assert update.name == "Renamed Core HR"
    assert update.code is None
    assert update.product_family_id is None


def test_product_response_from_orm():
    now = datetime.now(timezone.utc)
    orm_obj = MockORMObject(
        id=20,
        product_family_id=1,
        code="CORE",
        name="Core Module",
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = ProductResponse.model_validate(orm_obj)
    assert resp.id == 20
    assert resp.product_family_id == 1


# =============================================================================
# 3. Feature Schema Tests
# =============================================================================

def test_feature_create_native_valid():
    payload = {
        "product_id": 20,
        "code": "CORE-001",
        "name": "Employee Profile",
        "classification": "native",
        "partner_name": None,
    }
    feat = FeatureCreate(**payload)
    assert feat.classification == "native"
    assert feat.partner_name is None


def test_feature_create_partner_valid():
    payload = {
        "product_id": 20,
        "code": "CORE-002",
        "name": "Background Verification",
        "classification": "partner",
        "partner_name": "AuthBridge",
    }
    feat = FeatureCreate(**payload)
    assert feat.classification == "partner"
    assert feat.partner_name == "AuthBridge"


def test_feature_create_partner_missing_partner_name():
    payload = {
        "product_id": 20,
        "code": "CORE-002",
        "name": "Background Verification",
        "classification": "partner",
        "partner_name": None,
    }
    with pytest.raises(ValidationError) as exc:
        FeatureCreate(**payload)
    assert "partner_name is required when classification is 'partner'" in str(exc.value)


def test_feature_create_partner_whitespace_partner_name():
    payload = {
        "product_id": 20,
        "code": "CORE-002",
        "name": "Background Verification",
        "classification": "partner",
        "partner_name": "   ",
    }
    with pytest.raises(ValidationError) as exc:
        FeatureCreate(**payload)
    assert "partner_name is required when classification is 'partner'" in str(exc.value)


def test_feature_create_invalid_classification():
    with pytest.raises(ValidationError):
        FeatureCreate(
            product_id=20,
            code="CORE-003",
            name="Something",
            classification="third_party",
        )


def test_feature_update_partner_validation():
    # Valid partner update
    up = FeatureUpdate(classification="partner", partner_name="Checkr")
    assert up.partner_name == "Checkr"

    # Invalid partner update without partner_name
    with pytest.raises(ValidationError):
        FeatureUpdate(classification="partner", partner_name=None)


def test_feature_response_from_orm():
    now = datetime.now(timezone.utc)
    orm_obj = MockORMObject(
        id=100,
        product_id=20,
        code="CORE-001",
        name="Employee Profile",
        classification="native",
        partner_name=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = FeatureResponse.model_validate(orm_obj)
    assert resp.id == 100
    assert resp.code == "CORE-001"


# =============================================================================
# 4. ProductDescription Schema Tests
# =============================================================================

def test_product_description_create_valid():
    desc = ProductDescriptionCreate(
        feature_id=100,
        language="en",
        scope_text="Standard employee onboarding workflow.",
        feature_narrative="Comprehensive step-by-step narrative.",
        version_no=1,
        valid_from=date(2025, 1, 1),
        valid_to=date(2025, 12, 31),
        status="active",
    )
    assert desc.version_no == 1
    assert desc.valid_to > desc.valid_from


def test_product_description_date_order_rejected():
    with pytest.raises(ValidationError) as exc:
        ProductDescriptionCreate(
            feature_id=100,
            language="en",
            scope_text="Invalid dates",
            valid_from=date(2025, 6, 1),
            valid_to=date(2025, 5, 1),
        )
    assert "valid_to must be strictly greater than valid_from" in str(exc.value)


def test_product_description_equal_dates_rejected():
    with pytest.raises(ValidationError) as exc:
        ProductDescriptionCreate(
            feature_id=100,
            language="en",
            scope_text="Equal dates",
            valid_from=date(2025, 6, 1),
            valid_to=date(2025, 6, 1),
        )
    assert "valid_to must be strictly greater than valid_from" in str(exc.value)


def test_product_description_single_date_allowed():
    # Only valid_from (no expiry)
    desc1 = ProductDescriptionCreate(
        feature_id=100,
        scope_text="Effective from today",
        valid_from=date(2025, 1, 1),
    )
    assert desc1.valid_to is None

    # Only valid_to (effective immediately until expiry)
    desc2 = ProductDescriptionCreate(
        feature_id=100,
        scope_text="Effective until end of year",
        valid_to=date(2025, 12, 31),
    )
    assert desc2.valid_from is None


def test_product_description_update_date_order():
    # Valid update
    up = ProductDescriptionUpdate(
        valid_from=date(2025, 1, 1),
        valid_to=date(2025, 6, 1),
    )
    assert up.valid_to > up.valid_from

    # Invalid update
    with pytest.raises(ValidationError):
        ProductDescriptionUpdate(
            valid_from=date(2025, 7, 1),
            valid_to=date(2025, 6, 1),
        )


def test_product_description_response_from_orm():
    now = datetime.now(timezone.utc)
    orm_obj = MockORMObject(
        id=500,
        feature_id=100,
        language="en",
        scope_text="Approved scope",
        feature_narrative=None,
        version_no=1,
        valid_from=None,
        valid_to=None,
        status="draft",
        created_at=now,
        updated_at=now,
    )
    resp = ProductDescriptionResponse.model_validate(orm_obj)
    assert resp.id == 500
    assert resp.status == "draft"


# =============================================================================
# 5. Pack Schema Tests
# =============================================================================

def test_pack_create_valid():
    pack = PackCreate(
        code="PACK-ENTERPRISE",
        name="Enterprise Bundle",
        variant="premium",
        product_family_id=1,
        status="active",
    )
    assert pack.variant == "premium"
    assert pack.product_family_id == 1


def test_pack_create_spans_multiple_families():
    pack = PackCreate(
        code="PACK-CROSS",
        name="Cross-Family Pack",
        variant="standard",
        product_family_id=None,
    )
    assert pack.product_family_id is None


def test_pack_create_invalid_variant():
    with pytest.raises(ValidationError):
        PackCreate(
            code="PACK-INV",
            name="Invalid Tier",
            variant="custom_tier",
        )


def test_pack_update():
    up = PackUpdate(variant="standard", name="Renamed Pack")
    assert up.variant == "standard"
    assert up.name == "Renamed Pack"


def test_pack_response_from_orm():
    now = datetime.now(timezone.utc)
    orm_obj = MockORMObject(
        id=300,
        code="PACK-STD",
        name="Standard Pack",
        variant="standard",
        product_family_id=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = PackResponse.model_validate(orm_obj)
    assert resp.id == 300
    assert resp.variant == "standard"


# =============================================================================
# 6. PackVersion Schema Tests
# =============================================================================

def test_pack_version_create_valid_with_decimal_price():
    pv = PackVersionCreate(
        pack_id=300,
        version_no=1,
        status="draft",
        list_price_ref=Decimal("15000.5000"),
    )
    assert pv.version_no == 1
    assert pv.list_price_ref == Decimal("15000.5000")
    assert isinstance(pv.list_price_ref, Decimal)


def test_pack_version_create_invalid_version_no():
    with pytest.raises(ValidationError):
        PackVersionCreate(
            pack_id=300,
            version_no=0,
        )


def test_pack_version_create_invalid_negative_price():
    with pytest.raises(ValidationError):
        PackVersionCreate(
            pack_id=300,
            version_no=1,
            list_price_ref=Decimal("-10.00"),
        )


def test_pack_version_create_invalid_status():
    with pytest.raises(ValidationError):
        PackVersionCreate(
            pack_id=300,
            version_no=1,
            status="archived",
        )


def test_pack_version_update():
    now = datetime.now(timezone.utc)
    up = PackVersionUpdate(
        status="locked",
        locked_at=now,
        list_price_ref=Decimal("18000.0000"),
    )
    assert up.status == "locked"
    assert up.locked_at == now
    assert up.list_price_ref == Decimal("18000.0000")


def test_pack_version_response_from_orm():
    now = datetime.now(timezone.utc)
    orm_obj = MockORMObject(
        id=400,
        pack_id=300,
        version_no=1,
        status="locked",
        locked_at=now,
        list_price_ref=Decimal("25000.0000"),
        created_at=now,
        updated_at=now,
    )
    resp = PackVersionResponse.model_validate(orm_obj)
    assert resp.id == 400
    assert resp.list_price_ref == Decimal("25000.0000")
    assert resp.locked_at == now


# =============================================================================
# 7. PackItem Schema Tests
# =============================================================================

def test_pack_item_create_valid():
    item = PackItemCreate(pack_version_id=400, feature_id=100)
    assert item.pack_version_id == 400
    assert item.feature_id == 100


def test_pack_item_create_invalid_ids():
    with pytest.raises(ValidationError):
        PackItemCreate(pack_version_id=0, feature_id=100)
    with pytest.raises(ValidationError):
        PackItemCreate(pack_version_id=400, feature_id=-1)


def test_pack_item_update():
    up = PackItemUpdate(feature_id=105)
    assert up.feature_id == 105
    assert up.pack_version_id is None


def test_pack_item_response_from_orm():
    orm_obj = MockORMObject(
        pack_version_id=400,
        feature_id=100,
    )
    resp = PackItemResponse.model_validate(orm_obj)
    assert resp.pack_version_id == 400
    assert resp.feature_id == 100
    # PackItem should not have id or created_at
    assert not hasattr(resp, "id")
    assert not hasattr(resp, "created_at")


# =============================================================================
# 8. Nested / Detail Schemas Tests
# =============================================================================

def test_pack_item_detail_response_nested():
    now = datetime.now(timezone.utc)
    feature_orm = MockORMObject(
        id=100,
        product_id=20,
        code="CORE-001",
        name="Employee Profile",
        classification="native",
        partner_name=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    item_orm = MockORMObject(
        pack_version_id=400,
        feature_id=100,
        feature=feature_orm,
    )
    detail = PackItemDetailResponse.model_validate(item_orm)
    assert detail.pack_version_id == 400
    assert detail.feature is not None
    assert detail.feature.code == "CORE-001"


def test_pack_version_detail_response_nested():
    now = datetime.now(timezone.utc)
    pv_orm = MockORMObject(
        id=400,
        pack_id=300,
        version_no=1,
        status="active",
        locked_at=None,
        list_price_ref=Decimal("500.0000"),
        created_at=now,
        updated_at=now,
        pack_items=[
            MockORMObject(pack_version_id=400, feature_id=101, feature=None),
            MockORMObject(pack_version_id=400, feature_id=102, feature=None),
        ],
    )
    detail = PackVersionDetailResponse.model_validate(pv_orm)
    assert len(detail.pack_items) == 2
    assert detail.pack_items[0].feature_id == 101


def test_product_detail_response_nested():
    now = datetime.now(timezone.utc)
    prod_orm = MockORMObject(
        id=20,
        product_family_id=1,
        code="CORE",
        name="Core Module",
        status="active",
        created_at=now,
        updated_at=now,
        features=[
            MockORMObject(
                id=101,
                product_id=20,
                code="CORE-001",
                name="Feature 1",
                classification="native",
                partner_name=None,
                status="active",
                created_at=now,
                updated_at=now,
            )
        ],
    )
    detail = ProductDetailResponse.model_validate(prod_orm)
    assert len(detail.features) == 1
    assert detail.features[0].code == "CORE-001"


def test_product_family_detail_response_nested():
    now = datetime.now(timezone.utc)
    fam_orm = MockORMObject(
        id=1,
        code="HRM",
        name="Human Resources",
        sort_order=1,
        status="active",
        created_at=now,
        updated_at=now,
        products=[],
        packs=[],
    )
    detail = ProductFamilyDetailResponse.model_validate(fam_orm)
    assert detail.products == []
    assert detail.packs == []


# =============================================================================
# 9. Schema Import Integrity (No Circular Imports)
# =============================================================================

def test_schemas_imported_from_schemas_root():
    import app.schemas as schemas

    assert hasattr(schemas, "ProductFamilyCreate")
    assert hasattr(schemas, "ProductFamilyResponse")
    assert hasattr(schemas, "ProductCreate")
    assert hasattr(schemas, "ProductResponse")
    assert hasattr(schemas, "FeatureCreate")
    assert hasattr(schemas, "FeatureResponse")
    assert hasattr(schemas, "ProductDescriptionCreate")
    assert hasattr(schemas, "ProductDescriptionResponse")
    assert hasattr(schemas, "PackCreate")
    assert hasattr(schemas, "PackResponse")
    assert hasattr(schemas, "PackVersionCreate")
    assert hasattr(schemas, "PackVersionResponse")
    assert hasattr(schemas, "PackItemCreate")
    assert hasattr(schemas, "PackItemResponse")
