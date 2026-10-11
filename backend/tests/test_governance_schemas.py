"""Unit tests for Pydantic v2 Governance schemas (Wave 4).

Validates:
1. Role schemas (canonical roles, code uniqueness, update null guards, detail response).
2. User schemas (email normalization, password rules, password_hash exclusion, update null guards, detail response).
3. UserRole schemas (composite key validation, positive IDs, association-only detail response).
4. ApprovalThreshold schemas (threshold types, percentage bounds 0-100, timeout hours > 0, date ordering valid_to >= valid_from, detail response).
5. AuditLog schemas (immutable audit log, system vs user actors, JSON payloads, detail response).
6. Schema exports from app.schemas.governance and app.schemas.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.governance import (
    ApprovalThresholdCreate,
    ApprovalThresholdDetailResponse,
    ApprovalThresholdResponse,
    ApprovalThresholdUpdate,
    AuditLogCreate,
    AuditLogDetailResponse,
    AuditLogResponse,
    GovernanceStatus,
    RoleCodeLiteral,
    RoleCreate,
    RoleDetailResponse,
    RoleResponse,
    RoleUpdate,
    ThresholdTypeLiteral,
    UserCreate,
    UserDetailResponse,
    UserResponse,
    UserRoleCreate,
    UserRoleDetailResponse,
    UserRoleResponse,
    UserUpdate,
)


class MockORMObject:
    """Simulates SQLAlchemy ORM model instances for testing from_attributes."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


# =============================================================================
# 1. Role Schema Tests
# =============================================================================

@pytest.mark.parametrize("code", [
    "admin",
    "pricing_desk",
    "presales",
    "sales_lead",
    "business_head",
    "cfo",
])
def test_role_create_valid_canonical_roles(code):
    role = RoleCreate(code=code, name=f"Title for {code}")
    assert role.code == code
    assert role.name == f"Title for {code}"


def test_role_create_invalid_code():
    with pytest.raises(ValidationError):
        RoleCreate(code="superadmin", name="Super Admin")


def test_role_create_missing_required():
    with pytest.raises(ValidationError):
        RoleCreate(code="admin")
    with pytest.raises(ValidationError):
        RoleCreate(name="Administrator")


def test_role_string_length_limits():
    with pytest.raises(ValidationError):
        RoleCreate(code="admin", name="A" * 101)


def test_role_update_partial_and_null_guards():
    up = RoleUpdate(name="Chief Financial Officer")
    assert up.name == "Chief Financial Officer"
    assert "code" not in up.model_dump(exclude_unset=True)

    with pytest.raises(ValidationError) as exc:
        RoleUpdate(code=None)
    assert "code cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        RoleUpdate(name=None)
    assert "name cannot be null" in str(exc.value)


def test_role_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=1,
        code="cfo",
        name="Chief Financial Officer",
        created_at=now,
        updated_at=now,
    )
    resp = RoleResponse.model_validate(orm)
    assert resp.id == 1
    assert resp.code == "cfo"


def test_role_detail_response_nested():
    now = datetime.now(timezone.utc)
    assignment = MockORMObject(user_id=10, role_id=1, granted_by=2, granted_at=now)
    role_orm = MockORMObject(
        id=1,
        code="cfo",
        name="Chief Financial Officer",
        created_at=now,
        updated_at=now,
        user_assignments=[assignment],
    )
    detail = RoleDetailResponse.model_validate(role_orm)
    assert detail.id == 1
    assert len(detail.user_assignments) == 1
    assert detail.user_assignments[0].user_id == 10


# =============================================================================
# 2. User Schema Tests
# =============================================================================

def test_user_create_valid_and_email_normalization():
    user = UserCreate(
        email="  John.Doe@Adrenalin.COM  ",
        full_name="John Doe",
        password="SecurePassword123!",
        region="APAC",
        hubspot_owner_id="hs_12345",
    )
    assert user.email == "john.doe@adrenalin.com"
    assert user.full_name == "John Doe"
    assert user.password == "SecurePassword123!"
    assert user.is_active is True
    assert user.region == "APAC"


def test_user_create_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(
            email="invalid-email-no-at",
            full_name="John Doe",
            password="SecurePassword123!",
        )
    with pytest.raises(ValidationError):
        UserCreate(
            email="invalid@nodot",
            full_name="John Doe",
            password="SecurePassword123!",
        )


def test_user_password_length_limits():
    # Password too short (<8)
    with pytest.raises(ValidationError):
        UserCreate(
            email="user@test.com",
            full_name="User",
            password="short",
        )
    # Password too long (>128)
    with pytest.raises(ValidationError):
        UserCreate(
            email="user@test.com",
            full_name="User",
            password="A" * 129,
        )


def test_user_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        UserUpdate(email=None)
    assert "email cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        UserUpdate(full_name=None)
    assert "full_name cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        UserUpdate(is_active=None)
    assert "is_active cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        UserUpdate(password=None)
    assert "password cannot be null" in str(exc.value)

    # Legitimate nullable fields
    up = UserUpdate(region=None, hubspot_owner_id=None, last_login_at=None)
    assert up.region is None
    assert up.hubspot_owner_id is None
    assert up.last_login_at is None


def test_user_response_excludes_password_hash():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=5,
        email="user@test.com",
        full_name="Test User",
        password_hash="$2b$12$e8Y7zFakeHashNotLeakedToApiSchemas",
        is_active=True,
        region="EMEA",
        hubspot_owner_id="hs_555",
        last_login_at=now,
        created_at=now,
        updated_at=now,
    )
    resp = UserResponse.model_validate(orm)
    assert resp.id == 5
    assert resp.email == "user@test.com"
    # Ensure password_hash is not present in schema dump
    dump = resp.model_dump()
    assert "password_hash" not in dump
    assert "password" not in dump


def test_user_detail_response_nested():
    now = datetime.now(timezone.utc)
    assignment = MockORMObject(user_id=5, role_id=2, granted_by=1, granted_at=now)
    user_orm = MockORMObject(
        id=5,
        email="user@test.com",
        full_name="Test User",
        is_active=True,
        region="EMEA",
        hubspot_owner_id=None,
        last_login_at=None,
        created_at=now,
        updated_at=now,
        role_assignments=[assignment],
    )
    detail = UserDetailResponse.model_validate(user_orm)
    assert detail.id == 5
    assert len(detail.role_assignments) == 1
    assert detail.role_assignments[0].role_id == 2


# =============================================================================
# 3. UserRole Schema Tests (Association-only)
# =============================================================================

def test_user_role_create_valid():
    ur = UserRoleCreate(user_id=10, role_id=2, granted_by=1)
    assert ur.user_id == 10
    assert ur.role_id == 2
    assert ur.granted_by == 1


def test_user_role_invalid_ids():
    with pytest.raises(ValidationError):
        UserRoleCreate(user_id=0, role_id=2)
    with pytest.raises(ValidationError):
        UserRoleCreate(user_id=1, role_id=-1)
    with pytest.raises(ValidationError):
        UserRoleCreate(user_id=1, role_id=2, granted_by=0)


def test_user_role_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        user_id=10,
        role_id=2,
        granted_by=1,
        granted_at=now,
    )
    resp = UserRoleResponse.model_validate(orm)
    assert resp.user_id == 10
    assert resp.role_id == 2
    assert resp.granted_at == now


def test_user_role_detail_response_nested():
    now = datetime.now(timezone.utc)
    role_orm = MockORMObject(id=2, code="pricing_desk", name="Pricing Desk", created_at=now, updated_at=now)
    user_orm = MockORMObject(id=10, email="desk@test.com", full_name="Desk User", is_active=True, region=None, hubspot_owner_id=None, last_login_at=None, created_at=now, updated_at=now)
    ur_orm = MockORMObject(
        user_id=10,
        role_id=2,
        granted_by=1,
        granted_at=now,
        role=role_orm,
        user=user_orm,
    )
    detail = UserRoleDetailResponse.model_validate(ur_orm)
    assert detail.user_id == 10
    assert detail.role.code == "pricing_desk"
    assert detail.user.email == "desk@test.com"


# =============================================================================
# 4. ApprovalThreshold Schema Tests
# =============================================================================

@pytest.mark.parametrize("t_type", [
    "gm_floor",
    "line_discount",
    "overall_discount",
    "service_discount",
])
def test_approval_threshold_create_valid(t_type):
    thresh = ApprovalThresholdCreate(
        threshold_type=t_type,
        value_pct=Decimal("25.5000"),
        approver_role_id=5,
        escalation_role_id=6,
        timeout_hours=48,
        region="North America",
        valid_from=date(2026, 1, 1),
        valid_to=date(2026, 12, 31),
        status="active",
    )
    assert thresh.threshold_type == t_type
    assert thresh.value_pct == Decimal("25.5000")
    assert thresh.timeout_hours == 48


def test_approval_threshold_invalid_type():
    with pytest.raises(ValidationError):
        ApprovalThresholdCreate(
            threshold_type="custom_trigger",
            value_pct=Decimal("10.0000"),
            approver_role_id=1,
            valid_from=date(2026, 1, 1),
        )


def test_approval_threshold_percentage_bounds():
    with pytest.raises(ValidationError):
        ApprovalThresholdCreate(
            threshold_type="gm_floor",
            value_pct=Decimal("-0.0001"),
            approver_role_id=1,
            valid_from=date(2026, 1, 1),
        )
    with pytest.raises(ValidationError):
        ApprovalThresholdCreate(
            threshold_type="gm_floor",
            value_pct=Decimal("100.0001"),
            approver_role_id=1,
            valid_from=date(2026, 1, 1),
        )


def test_approval_threshold_timeout_hours_bounds():
    # timeout_hours must be > 0 if provided
    with pytest.raises(ValidationError):
        ApprovalThresholdCreate(
            threshold_type="gm_floor",
            value_pct=Decimal("10.0000"),
            approver_role_id=1,
            timeout_hours=0,
            valid_from=date(2026, 1, 1),
        )


def test_approval_threshold_date_order_validation():
    # valid_to >= valid_from allows equal single-day dates
    t_equal = ApprovalThresholdCreate(
        threshold_type="gm_floor",
        value_pct=Decimal("10.0000"),
        approver_role_id=1,
        valid_from=date(2026, 6, 1),
        valid_to=date(2026, 6, 1),
    )
    assert t_equal.valid_to == t_equal.valid_from

    with pytest.raises(ValidationError) as exc:
        ApprovalThresholdCreate(
            threshold_type="gm_floor",
            value_pct=Decimal("10.0000"),
            approver_role_id=1,
            valid_from=date(2026, 6, 2),
            valid_to=date(2026, 6, 1),
        )
    assert "valid_to must be greater than or equal to valid_from" in str(exc.value)


def test_approval_threshold_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        ApprovalThresholdUpdate(threshold_type=None)
    assert "threshold_type cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ApprovalThresholdUpdate(value_pct=None)
    assert "value_pct cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ApprovalThresholdUpdate(approver_role_id=None)
    assert "approver_role_id cannot be null" in str(exc.value)

    # Legitimate nullable fields
    up = ApprovalThresholdUpdate(
        valid_to=None,
        timeout_hours=None,
        region=None,
        escalation_role_id=None,
    )
    assert up.valid_to is None
    assert up.timeout_hours is None


def test_approval_threshold_update_date_order():
    with pytest.raises(ValidationError) as exc:
        ApprovalThresholdUpdate(
            valid_from=date(2026, 8, 1),
            valid_to=date(2026, 7, 31),
        )
    assert "valid_to must be greater than or equal to valid_from" in str(exc.value)


def test_approval_threshold_detail_response_nested():
    now = datetime.now(timezone.utc)
    approver = MockORMObject(id=5, code="business_head", name="Business Head", created_at=now, updated_at=now)
    escalation = MockORMObject(id=6, code="cfo", name="Chief Financial Officer", created_at=now, updated_at=now)
    thresh_orm = MockORMObject(
        id=1,
        threshold_type="overall_discount",
        value_pct=Decimal("30.0000"),
        approver_role_id=5,
        escalation_role_id=6,
        timeout_hours=24,
        region="Global",
        valid_from=date(2026, 1, 1),
        valid_to=None,
        status="active",
        created_at=now,
        updated_at=now,
        approver_role=approver,
        escalation_role=escalation,
    )
    detail = ApprovalThresholdDetailResponse.model_validate(thresh_orm)
    assert detail.id == 1
    assert detail.approver_role.code == "business_head"
    assert detail.escalation_role.code == "cfo"


# =============================================================================
# 5. AuditLog Schema Tests (Append-only / Immutable)
# =============================================================================

def test_audit_log_create_valid():
    log = AuditLogCreate(
        actor_user_id=12,
        action="PROPOSAL_DISCOUNT_OVERRIDE",
        entity_type="proposals",
        entity_id="prop_999",
        before={"discount_pct": "10.00"},
        after={"discount_pct": "25.00"},
        request_id="req-abc-123",
        ip="192.168.1.1",
    )
    assert log.action == "PROPOSAL_DISCOUNT_OVERRIDE"
    assert log.actor_user_id == 12
    assert log.before["discount_pct"] == "10.00"
    assert log.after["discount_pct"] == "25.00"


def test_audit_log_create_system_automated():
    # Actor user ID is None for automated scheduled background jobs
    log = AuditLogCreate(
        actor_user_id=None,
        action="SCHEDULED_STATUS_RETIRE",
        entity_type="rate_card_versions",
        entity_id="rcv_42",
    )
    assert log.actor_user_id is None
    assert log.action == "SCHEDULED_STATUS_RETIRE"


def test_audit_log_missing_required():
    with pytest.raises(ValidationError):
        AuditLogCreate(action="SOME_ACTION")  # missing entity_type, entity_id


def test_audit_log_string_length_limits():
    with pytest.raises(ValidationError):
        AuditLogCreate(
            action="A" * 101,
            entity_type="entities",
            entity_id="1",
        )
    with pytest.raises(ValidationError):
        AuditLogCreate(
            action="ACTION",
            entity_type="entities",
            entity_id="1",
            ip="1" * 51,
        )


def test_audit_log_detail_response_nested():
    now = datetime.now(timezone.utc)
    actor_orm = MockORMObject(
        id=12,
        email="actor@test.com",
        full_name="Actor User",
        is_active=True,
        region=None,
        hubspot_owner_id=None,
        last_login_at=None,
        created_at=now,
        updated_at=now,
    )
    log_orm = MockORMObject(
        id=77,
        occurred_at=now,
        actor_user_id=12,
        action="ROLE_GRANT",
        entity_type="users",
        entity_id="10",
        before=None,
        after={"role": "cfo"},
        request_id=None,
        ip="10.0.0.1",
        actor=actor_orm,
    )
    detail = AuditLogDetailResponse.model_validate(log_orm)
    assert detail.id == 77
    assert detail.actor is not None
    assert detail.actor.email == "actor@test.com"


# =============================================================================
# 6. Schema Registry Exports
# =============================================================================

def test_governance_schemas_exported_from_module():
    import app.schemas.governance as gov

    assert hasattr(gov, "RoleCreate")
    assert hasattr(gov, "RoleResponse")
    assert hasattr(gov, "UserCreate")
    assert hasattr(gov, "UserResponse")
    assert hasattr(gov, "UserRoleCreate")
    assert hasattr(gov, "UserRoleResponse")
    assert hasattr(gov, "ApprovalThresholdCreate")
    assert hasattr(gov, "ApprovalThresholdResponse")
    assert hasattr(gov, "AuditLogCreate")
    assert hasattr(gov, "AuditLogResponse")


def test_governance_schemas_exported_from_root():
    import app.schemas as schemas

    assert hasattr(schemas, "RoleCreate")
    assert hasattr(schemas, "UserCreate")
    assert hasattr(schemas, "UserRoleCreate")
    assert hasattr(schemas, "ApprovalThresholdCreate")
    assert hasattr(schemas, "AuditLogCreate")

    # Prior waves preserved
    assert hasattr(schemas, "CurrencyCreate")
    assert hasattr(schemas, "PackCreate")
    assert hasattr(schemas, "RateCardCreate")
