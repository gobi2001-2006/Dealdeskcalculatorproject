"""Unit tests for Pydantic v2 Proposal & Deal Management schemas (Wave 5).

Validates:
1. Customer schemas (status literals, string limits, update null guards, detail response).
2. Deal schemas (status literals, string limits, update null guards, detail response).
3. Proposal schemas (status literals, currency/deal/customer references, update null guards, detail response).
4. ProposalContact schemas (email validation/normalization, phone/role, update null guards, detail response).
5. ProposalVersion schemas (version_no > 0, status literals, update null guards, detail response).
6. ProposalCountry schemas (headcount >= 0, update null guards, detail response).
7. ProposalLineItem schemas (pack_version_id XOR feature_id exclusivity, non-negative amounts, discount_pct 0-100, update null guards, detail response).
8. ProposalServiceLine schemas (days_or_hours >= 0, rate >= 0, discount_pct 0-100, update null guards, detail response).
9. CalculationSnapshot schemas (immutable/append-only audit record, valid payload dict, no update schema, detail response).
10. ProposalContent schemas (section_key, content_text, update null guards, detail response).
11. Approval schemas (status literals, decision tracking, update null guards, detail response).
12. Schema exports from app.schemas.proposals and app.schemas.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.proposals import (
    ApprovalBase,
    ApprovalCreate,
    ApprovalDetailResponse,
    ApprovalResponse,
    ApprovalStatus,
    ApprovalUpdate,
    CalculationSnapshotBase,
    CalculationSnapshotCreate,
    CalculationSnapshotDetailResponse,
    CalculationSnapshotResponse,
    CustomerBase,
    CustomerCreate,
    CustomerDetailResponse,
    CustomerResponse,
    CustomerStatus,
    CustomerUpdate,
    DealBase,
    DealCreate,
    DealDetailResponse,
    DealResponse,
    DealStatus,
    DealUpdate,
    ProposalBase,
    ProposalContactBase,
    ProposalContactCreate,
    ProposalContactDetailResponse,
    ProposalContactResponse,
    ProposalContactUpdate,
    ProposalContentBase,
    ProposalContentCreate,
    ProposalContentDetailResponse,
    ProposalContentResponse,
    ProposalContentUpdate,
    ProposalCountryBase,
    ProposalCountryCreate,
    ProposalCountryDetailResponse,
    ProposalCountryResponse,
    ProposalCountryUpdate,
    ProposalCreate,
    ProposalDetailResponse,
    ProposalLineItemBase,
    ProposalLineItemCreate,
    ProposalLineItemDetailResponse,
    ProposalLineItemResponse,
    ProposalLineItemUpdate,
    ProposalResponse,
    ProposalServiceLineBase,
    ProposalServiceLineCreate,
    ProposalServiceLineDetailResponse,
    ProposalServiceLineResponse,
    ProposalServiceLineUpdate,
    ProposalStatus,
    ProposalUpdate,
    ProposalVersionBase,
    ProposalVersionCreate,
    ProposalVersionDetailResponse,
    ProposalVersionResponse,
    ProposalVersionStatus,
    ProposalVersionUpdate,
)


class MockORMObject:
    """Simulates SQLAlchemy ORM model instances for testing from_attributes."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


# =============================================================================
# 1. Customer Schema Tests
# =============================================================================

def test_customer_create_valid():
    cust = CustomerCreate(
        code="CUST-001",
        name="Acme Corporation",
        country_id=1,
        customer_tier_id=2,
        industry="Technology",
        status="active",
    )
    assert cust.code == "CUST-001"
    assert cust.name == "Acme Corporation"
    assert cust.country_id == 1
    assert cust.customer_tier_id == 2
    assert cust.industry == "Technology"
    assert cust.status == "active"


@pytest.mark.parametrize("status", ["active", "inactive", "prospect"])
def test_customer_valid_statuses(status):
    cust = CustomerCreate(
        code="CUST-002",
        name="Global Corp",
        country_id=1,
        status=status,
    )
    assert cust.status == status


def test_customer_invalid_status():
    with pytest.raises(ValidationError):
        CustomerCreate(
            code="CUST-003",
            name="Invalid Corp",
            country_id=1,
            status="pending_approval",  # invalid literal
        )


def test_customer_missing_required():
    with pytest.raises(ValidationError):
        CustomerCreate(code="CUST-004")  # missing name, country_id


def test_customer_length_bounds():
    with pytest.raises(ValidationError):
        CustomerCreate(code="C" * 51, name="Name", country_id=1)
    with pytest.raises(ValidationError):
        CustomerCreate(code="CUST-005", name="N" * 201, country_id=1)


def test_customer_update_partial_and_null_guards():
    up = CustomerUpdate(name="Acme Inc.")
    assert up.name == "Acme Inc."
    assert "code" not in up.model_dump(exclude_unset=True)

    # Nullable fields can be cleared
    up_clear = CustomerUpdate(customer_tier_id=None, industry=None)
    assert up_clear.customer_tier_id is None
    assert up_clear.industry is None

    # Non-nullable fields cannot be cleared
    for field in ["code", "name", "country_id", "status"]:
        with pytest.raises(ValidationError) as exc:
            CustomerUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)


def test_customer_response_and_detail_from_orm():
    now = datetime.now(timezone.utc)
    mock_country = MockORMObject(
        id=1,
        iso_code="US",
        name="United States",
        currency_id=2,
        price_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
        valid_to=None,
        created_at=now,
        updated_at=now,
    )
    mock_tier = MockORMObject(
        id=2,
        name="Enterprise",
        employee_min=1000,
        employee_max=5000,
        default_multiplier=Decimal("1.000000"),
        status="active",
        valid_from=date(2026, 1, 1),
        valid_to=None,
        created_at=now,
        updated_at=now,
    )
    mock_cust = MockORMObject(
        id=10,
        code="CUST-010",
        name="Beta Corp",
        country_id=1,
        customer_tier_id=2,
        industry="Retail",
        status="active",
        created_at=now,
        updated_at=now,
        country=mock_country,
        customer_tier=mock_tier,
    )
    resp = CustomerResponse.model_validate(mock_cust)
    assert resp.id == 10
    assert resp.code == "CUST-010"

    detail = CustomerDetailResponse.model_validate(mock_cust)
    assert detail.country is not None
    assert detail.country.iso_code == "US"
    assert detail.customer_tier is not None
    assert detail.customer_tier.name == "Enterprise"


# =============================================================================
# 2. Deal Schema Tests
# =============================================================================

def test_deal_create_valid():
    deal = DealCreate(
        code="DEAL-2026-001",
        name="Global ERP Upgrade",
        customer_id=10,
        owner_user_id=5,
        status="open",
        target_close_date=date(2026, 12, 31),
    )
    assert deal.code == "DEAL-2026-001"
    assert deal.name == "Global ERP Upgrade"
    assert deal.target_close_date == date(2026, 12, 31)


@pytest.mark.parametrize("status", ["open", "won", "lost", "abandoned"])
def test_deal_valid_statuses(status):
    deal = DealCreate(
        code="DEAL-002",
        name="Deal Title",
        customer_id=10,
        owner_user_id=5,
        status=status,
    )
    assert deal.status == status


def test_deal_invalid_status():
    with pytest.raises(ValidationError):
        DealCreate(
            code="DEAL-003",
            name="Invalid Deal",
            customer_id=10,
            owner_user_id=5,
            status="negotiating",  # invalid
        )


def test_deal_update_null_guards():
    for field in ["code", "name", "customer_id", "owner_user_id", "status"]:
        with pytest.raises(ValidationError) as exc:
            DealUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)

    # target_close_date is optional and can be cleared
    up = DealUpdate(target_close_date=None)
    assert up.target_close_date is None


# =============================================================================
# 3. Proposal Schema Tests
# =============================================================================

def test_proposal_create_valid():
    prop = ProposalCreate(
        code="PROP-2026-0001",
        deal_id=1,
        customer_id=10,
        currency_id=2,
        status="draft",
        created_by_user_id=5,
    )
    assert prop.code == "PROP-2026-0001"
    assert prop.deal_id == 1
    assert prop.status == "draft"


@pytest.mark.parametrize("status", ["draft", "submitted", "approved", "rejected", "superseded"])
def test_proposal_valid_statuses(status):
    prop = ProposalCreate(
        code="PROP-002",
        deal_id=1,
        customer_id=10,
        currency_id=2,
        status=status,
        created_by_user_id=5,
    )
    assert prop.status == status


def test_proposal_update_null_guards():
    for field in ["code", "deal_id", "customer_id", "currency_id", "status", "created_by_user_id"]:
        with pytest.raises(ValidationError) as exc:
            ProposalUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)


# =============================================================================
# 4. ProposalContact Schema Tests
# =============================================================================

def test_proposal_contact_create_valid():
    contact = ProposalContactCreate(
        proposal_id=1,
        name="Jane Doe",
        email="jane.doe@example.com",
        phone="+1-555-0199",
        role_title="VP Procurement",
        is_primary=True,
    )
    assert contact.name == "Jane Doe"
    assert contact.email == "jane.doe@example.com"
    assert contact.is_primary is True


def test_proposal_contact_email_normalization():
    contact = ProposalContactCreate(
        proposal_id=1,
        name="Jane Doe",
        email="  JANE.DOE@Example.COM  ",
    )
    assert contact.email == "jane.doe@example.com"


def test_proposal_contact_invalid_email():
    with pytest.raises(ValidationError):
        ProposalContactCreate(
            proposal_id=1,
            name="Jane Doe",
            email="invalid-email-address",
        )


def test_proposal_contact_update_null_guards():
    for field in ["proposal_id", "name", "email", "is_primary"]:
        with pytest.raises(ValidationError) as exc:
            ProposalContactUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)

    # phone and role_title can be cleared
    up = ProposalContactUpdate(phone=None, role_title=None)
    assert up.phone is None
    assert up.role_title is None


# =============================================================================
# 5. ProposalVersion Schema Tests
# =============================================================================

def test_proposal_version_create_valid():
    ver = ProposalVersionCreate(
        proposal_id=1,
        version_no=1,
        rate_card_version_id=100,
        status="draft",
        created_by_user_id=5,
        notes="Initial proposal draft",
    )
    assert ver.version_no == 1
    assert ver.status == "draft"


def test_proposal_version_positive_version_no():
    with pytest.raises(ValidationError):
        ProposalVersionCreate(
            proposal_id=1,
            version_no=0,  # must be gt 0
            rate_card_version_id=100,
            status="draft",
            created_by_user_id=5,
        )


@pytest.mark.parametrize("status", ["draft", "under_review", "approved", "rejected", "locked", "superseded"])
def test_proposal_version_valid_statuses(status):
    ver = ProposalVersionCreate(
        proposal_id=1,
        version_no=1,
        rate_card_version_id=100,
        status=status,
        created_by_user_id=5,
    )
    assert ver.status == status


def test_proposal_version_update_null_guards():
    for field in ["proposal_id", "version_no", "rate_card_version_id", "status", "created_by_user_id"]:
        with pytest.raises(ValidationError) as exc:
            ProposalVersionUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)


# =============================================================================
# 6. ProposalCountry Schema Tests
# =============================================================================

def test_proposal_country_create_valid():
    country = ProposalCountryCreate(
        proposal_id=1,
        country_id=2,
        user_headcount=2500,
        is_primary_deployment=True,
    )
    assert country.user_headcount == 2500
    assert country.is_primary_deployment is True


def test_proposal_country_negative_headcount():
    with pytest.raises(ValidationError):
        ProposalCountryCreate(
            proposal_id=1,
            country_id=2,
            user_headcount=-1,  # must be ge 0
        )


def test_proposal_country_update_null_guards():
    for field in ["proposal_id", "country_id", "is_primary_deployment"]:
        with pytest.raises(ValidationError) as exc:
            ProposalCountryUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)

    # user_headcount can be None
    up = ProposalCountryUpdate(user_headcount=None)
    assert up.user_headcount is None


# =============================================================================
# 7. ProposalLineItem Schema Tests
# =============================================================================

def test_proposal_line_item_create_pack_target():
    item = ProposalLineItemCreate(
        proposal_version_id=1,
        line_number=1,
        pack_version_id=10,
        feature_id=None,
        uom_id=3,
        quantity=Decimal("500"),
        list_unit_price=Decimal("12.5000"),
        discount_pct=Decimal("10.0000"),
        net_unit_price=Decimal("11.2500"),
        extended_amount=Decimal("5625.0000"),
        currency_id=2,
    )
    assert item.pack_version_id == 10
    assert item.feature_id is None
    assert item.quantity == Decimal("500")


def test_proposal_line_item_create_feature_target():
    item = ProposalLineItemCreate(
        proposal_version_id=1,
        line_number=2,
        pack_version_id=None,
        feature_id=45,
        uom_id=3,
        quantity=Decimal("500"),
        list_unit_price=Decimal("4.0000"),
        discount_pct=None,
        net_unit_price=Decimal("4.0000"),
        extended_amount=Decimal("2000.0000"),
        currency_id=2,
    )
    assert item.pack_version_id is None
    assert item.feature_id == 45


def test_proposal_line_item_target_exclusivity_both_set():
    with pytest.raises(ValidationError) as exc:
        ProposalLineItemCreate(
            proposal_version_id=1,
            line_number=1,
            pack_version_id=10,
            feature_id=45,  # cannot have both!
            uom_id=3,
            quantity=Decimal("500"),
            list_unit_price=Decimal("10.0000"),
            net_unit_price=Decimal("10.0000"),
            extended_amount=Decimal("5000.0000"),
            currency_id=2,
        )
    assert "Exactly one target" in str(exc.value)


def test_proposal_line_item_target_exclusivity_neither_set():
    with pytest.raises(ValidationError) as exc:
        ProposalLineItemCreate(
            proposal_version_id=1,
            line_number=1,
            pack_version_id=None,
            feature_id=None,  # cannot have neither!
            uom_id=3,
            quantity=Decimal("500"),
            list_unit_price=Decimal("10.0000"),
            net_unit_price=Decimal("10.0000"),
            extended_amount=Decimal("5000.0000"),
            currency_id=2,
        )
    assert "Exactly one target" in str(exc.value)


def test_proposal_line_item_numeric_bounds():
    # Negative quantity
    with pytest.raises(ValidationError):
        ProposalLineItemCreate(
            proposal_version_id=1,
            line_number=1,
            pack_version_id=10,
            uom_id=3,
            quantity=Decimal("-1"),
            list_unit_price=Decimal("10.0000"),
            net_unit_price=Decimal("10.0000"),
            extended_amount=Decimal("5000.0000"),
            currency_id=2,
        )
    # Discount > 100%
    with pytest.raises(ValidationError):
        ProposalLineItemCreate(
            proposal_version_id=1,
            line_number=1,
            pack_version_id=10,
            uom_id=3,
            quantity=Decimal("10"),
            list_unit_price=Decimal("10.0000"),
            discount_pct=Decimal("101.0000"),
            net_unit_price=Decimal("10.0000"),
            extended_amount=Decimal("5000.0000"),
            currency_id=2,
        )


def test_proposal_line_item_update_null_guards():
    for field in [
        "proposal_version_id",
        "line_number",
        "uom_id",
        "quantity",
        "list_unit_price",
        "net_unit_price",
        "extended_amount",
        "currency_id",
    ]:
        with pytest.raises(ValidationError) as exc:
            ProposalLineItemUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)


def test_proposal_line_item_update_target_conflict():
    with pytest.raises(ValidationError) as exc:
        ProposalLineItemUpdate(pack_version_id=10, feature_id=20)
    assert "Cannot set both pack_version_id and feature_id" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ProposalLineItemUpdate(pack_version_id=None, feature_id=None)
    assert "Cannot clear both pack_version_id and feature_id" in str(exc.value)


# =============================================================================
# 8. ProposalServiceLine Schema Tests
# =============================================================================

def test_proposal_service_line_create_valid():
    svc = ProposalServiceLineCreate(
        proposal_version_id=1,
        service_rate_id=5,
        role_name="Lead Solution Architect",
        days_or_hours=Decimal("40.0000"),
        rate_applied=Decimal("150.0000"),
        discount_pct=Decimal("5.0000"),
        extended_amount=Decimal("5700.0000"),
        currency_id=2,
    )
    assert svc.role_name == "Lead Solution Architect"
    assert svc.days_or_hours == Decimal("40.0000")
    assert svc.extended_amount == Decimal("5700.0000")


def test_proposal_service_line_numeric_bounds():
    with pytest.raises(ValidationError):
        ProposalServiceLineCreate(
            proposal_version_id=1,
            role_name="Consultant",
            days_or_hours=Decimal("-5"),
            rate_applied=Decimal("100"),
            extended_amount=Decimal("0"),
            currency_id=2,
        )
    with pytest.raises(ValidationError):
        ProposalServiceLineCreate(
            proposal_version_id=1,
            role_name="Consultant",
            days_or_hours=Decimal("5"),
            rate_applied=Decimal("100"),
            discount_pct=Decimal("120"),  # > 100%
            extended_amount=Decimal("0"),
            currency_id=2,
        )


def test_proposal_service_line_update_null_guards():
    for field in ["proposal_version_id", "role_name", "days_or_hours", "rate_applied", "extended_amount", "currency_id"]:
        with pytest.raises(ValidationError) as exc:
            ProposalServiceLineUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)


# =============================================================================
# 9. CalculationSnapshot Schema Tests (Immutable / Append-only)
# =============================================================================

def test_calculation_snapshot_create_valid():
    snap = CalculationSnapshotCreate(
        proposal_version_id=1,
        snapshot_payload={
            "arr": 120000.0,
            "tcv": 360000.0,
            "gm_pct": 72.5,
            "currency": "USD",
        },
        calculated_by_user_id=5,
    )
    assert snap.proposal_version_id == 1
    assert snap.snapshot_payload["arr"] == 120000.0


def test_calculation_snapshot_is_append_only():
    """Verify CalculationSnapshot does NOT have an Update schema."""
    import app.schemas.proposals as proposals_mod
    assert not hasattr(proposals_mod, "CalculationSnapshotUpdate")


def test_calculation_snapshot_response_from_orm():
    now = datetime.now(timezone.utc)
    mock_user = MockORMObject(id=5, email="calculator@example.com", full_name="Calc Bot", is_active=True, created_at=now, updated_at=now)
    mock_snap = MockORMObject(
        id=77,
        proposal_version_id=1,
        snapshot_payload={"total": 50000},
        calculated_at=now,
        calculated_by_user_id=5,
        calculated_by_user=mock_user,
    )
    resp = CalculationSnapshotResponse.model_validate(mock_snap)
    assert resp.id == 77
    assert resp.snapshot_payload == {"total": 50000}

    detail = CalculationSnapshotDetailResponse.model_validate(mock_snap)
    assert detail.calculated_by_user is not None
    assert detail.calculated_by_user.email == "calculator@example.com"


# =============================================================================
# 10. ProposalContent Schema Tests
# =============================================================================

def test_proposal_content_create_valid():
    content = ProposalContentCreate(
        proposal_version_id=1,
        section_key="executive_summary",
        content_text="# Executive Summary\n\nThis commercial proposal delivers cloud HR transformation.",
    )
    assert content.section_key == "executive_summary"
    assert "Executive Summary" in content.content_text


def test_proposal_content_update_null_guards():
    for field in ["proposal_version_id", "section_key", "content_text"]:
        with pytest.raises(ValidationError) as exc:
            ProposalContentUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)


# =============================================================================
# 11. Approval Schema Tests
# =============================================================================

def test_approval_create_valid():
    appr = ApprovalCreate(
        proposal_version_id=1,
        threshold_id=12,
        assigned_role_id=3,
        status="pending",
    )
    assert appr.status == "pending"
    assert appr.threshold_id == 12


@pytest.mark.parametrize("status", ["pending", "approved", "rejected", "escalated", "cancelled"])
def test_approval_valid_statuses(status):
    appr = ApprovalCreate(
        proposal_version_id=1,
        assigned_role_id=3,
        status=status,
    )
    assert appr.status == status


def test_approval_update_decision():
    now = datetime.now(timezone.utc)
    up = ApprovalUpdate(
        status="approved",
        decided_by_user_id=8,
        decision_notes="Commercial discount approved by CFO",
        decided_at=now,
    )
    assert up.status == "approved"
    assert up.decided_by_user_id == 8
    assert up.decision_notes == "Commercial discount approved by CFO"


def test_approval_update_null_guards():
    for field in ["proposal_version_id", "assigned_role_id", "status"]:
        with pytest.raises(ValidationError) as exc:
            ApprovalUpdate(**{field: None})
        assert f"{field} cannot be null" in str(exc.value)


# =============================================================================
# 12. Schema Exports & Detail Nesting Verification
# =============================================================================

def test_module_and_package_exports():
    """Verify all Wave 5 proposal schemas are exported by package __all__."""
    import app.schemas as schemas_pkg
    import app.schemas.proposals as proposals_mod

    expected_exports = [
        "CustomerStatus",
        "DealStatus",
        "ProposalStatus",
        "ProposalVersionStatus",
        "ApprovalStatus",
        "CustomerBase",
        "CustomerCreate",
        "CustomerUpdate",
        "CustomerResponse",
        "CustomerDetailResponse",
        "DealBase",
        "DealCreate",
        "DealUpdate",
        "DealResponse",
        "DealDetailResponse",
        "ProposalBase",
        "ProposalCreate",
        "ProposalUpdate",
        "ProposalResponse",
        "ProposalDetailResponse",
        "ProposalContactBase",
        "ProposalContactCreate",
        "ProposalContactUpdate",
        "ProposalContactResponse",
        "ProposalContactDetailResponse",
        "ProposalVersionBase",
        "ProposalVersionCreate",
        "ProposalVersionUpdate",
        "ProposalVersionResponse",
        "ProposalVersionDetailResponse",
        "ProposalCountryBase",
        "ProposalCountryCreate",
        "ProposalCountryUpdate",
        "ProposalCountryResponse",
        "ProposalCountryDetailResponse",
        "ProposalLineItemBase",
        "ProposalLineItemCreate",
        "ProposalLineItemUpdate",
        "ProposalLineItemResponse",
        "ProposalLineItemDetailResponse",
        "ProposalServiceLineBase",
        "ProposalServiceLineCreate",
        "ProposalServiceLineUpdate",
        "ProposalServiceLineResponse",
        "ProposalServiceLineDetailResponse",
        "CalculationSnapshotBase",
        "CalculationSnapshotCreate",
        "CalculationSnapshotResponse",
        "CalculationSnapshotDetailResponse",
        "ProposalContentBase",
        "ProposalContentCreate",
        "ProposalContentUpdate",
        "ProposalContentResponse",
        "ProposalContentDetailResponse",
        "ApprovalBase",
        "ApprovalCreate",
        "ApprovalUpdate",
        "ApprovalResponse",
        "ApprovalDetailResponse",
    ]

    for export_name in expected_exports:
        assert hasattr(proposals_mod, export_name), f"Missing in proposals.py: {export_name}"
        assert hasattr(schemas_pkg, export_name), f"Missing in schemas/__init__.py: {export_name}"
        assert export_name in schemas_pkg.__all__, f"Missing in schemas.__all__: {export_name}"


def test_proposal_detail_response_nested_orm():
    """Test full hierarchical ORM serialization into ProposalDetailResponse."""
    now = datetime.now(timezone.utc)
    mock_currency = MockORMObject(id=2, code="USD", name="US Dollar", symbol="$", is_active=True, created_at=now, updated_at=now)
    mock_customer = MockORMObject(
        id=10,
        code="CUST-010",
        name="Acme Corp",
        country_id=1,
        customer_tier_id=None,
        industry="Tech",
        status="active",
        created_at=now,
        updated_at=now,
    )
    mock_deal = MockORMObject(
        id=1,
        code="DEAL-001",
        name="Acme Expansion",
        customer_id=10,
        owner_user_id=5,
        status="open",
        target_close_date=None,
        created_at=now,
        updated_at=now,
    )
    mock_contact = MockORMObject(
        id=20,
        proposal_id=100,
        name="Alice Smith",
        email="alice@acme.com",
        phone=None,
        role_title="CIO",
        is_primary=True,
        created_at=now,
    )
    mock_proposal = MockORMObject(
        id=100,
        code="PROP-100",
        deal_id=1,
        customer_id=10,
        currency_id=2,
        status="draft",
        created_by_user_id=5,
        created_at=now,
        updated_at=now,
        deal=mock_deal,
        customer=mock_customer,
        currency=mock_currency,
        created_by_user=None,
        contacts=[mock_contact],
        versions=[],
        countries=[],
    )

    detail = ProposalDetailResponse.model_validate(mock_proposal)
    assert detail.id == 100
    assert detail.code == "PROP-100"
    assert detail.deal is not None
    assert detail.deal.code == "DEAL-001"
    assert detail.customer is not None
    assert detail.customer.name == "Acme Corp"
    assert detail.currency is not None
    assert detail.currency.code == "USD"
    assert len(detail.contacts) == 1
    assert detail.contacts[0].email == "alice@acme.com"
