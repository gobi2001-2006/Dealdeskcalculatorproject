"""Pydantic schemas for Governance, Users & Security (Wave 4).

Defines request and response schemas for:
1. Role
2. User
3. UserRole (association junction)
4. ApprovalThreshold
5. AuditLog (append-only immutable audit trail)
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

# =============================================================================
# Constrained Types / Literals
# =============================================================================

RoleCodeLiteral = Literal[
    "admin",
    "pricing_desk",
    "presales",
    "sales_lead",
    "business_head",
    "cfo",
]

ThresholdTypeLiteral = Literal[
    "gm_floor",
    "line_discount",
    "overall_discount",
    "service_discount",
]

GovernanceStatus = Literal["active", "inactive", "retired"]


# =============================================================================
# 1. Role Schemas
# =============================================================================

class RoleBase(BaseModel):
    """Base fields for Role."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: RoleCodeLiteral = Field(
        ...,
        description="Unique role code (one of 6 canonical roles)",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Human-readable role title (e.g. 'Chief Financial Officer')",
    )


class RoleCreate(RoleBase):
    """Payload for creating a role."""

    pass


class RoleUpdate(BaseModel):
    """Payload for updating a role."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[RoleCodeLiteral] = None
    name: Optional[str] = Field(None, min_length=1, max_length=100)

    @field_validator("code", "name", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class RoleResponse(RoleBase):
    """API response schema for a role."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 2. User Schemas
# =============================================================================

class UserBase(BaseModel):
    """Base fields for User."""

    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="User email address",
    )
    full_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="User full display name",
    )
    is_active: bool = Field(
        default=True,
        description="Active account status",
    )
    region: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Assigned territory/region",
    )
    hubspot_owner_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="CRM owner identifier",
    )

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_address(cls, v: Any) -> Any:
        if isinstance(v, str):
            v_clean = v.strip().lower()
            if "@" not in v_clean or "." not in v_clean.split("@")[-1]:
                raise ValueError("Invalid email format")
            return v_clean
        return v


class UserCreate(UserBase):
    """Payload for registering/creating a new user."""

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Plaintext password to be hashed before persistence",
    )


class UserUpdate(BaseModel):
    """Payload for updating an existing user."""

    model_config = ConfigDict(str_strip_whitespace=True)

    email: Optional[str] = Field(None, min_length=3, max_length=255)
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    is_active: Optional[bool] = None
    region: Optional[str] = Field(None, max_length=100)
    hubspot_owner_id: Optional[str] = Field(None, max_length=100)
    last_login_at: Optional[datetime] = None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email_address(cls, v: Any) -> Any:
        if v is not None and isinstance(v, str):
            v_clean = v.strip().lower()
            if "@" not in v_clean or "." not in v_clean.split("@")[-1]:
                raise ValueError("Invalid email format")
            return v_clean
        return v

    @field_validator("email", "full_name", "password", "is_active", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class UserResponse(UserBase):
    """API response schema for a user (password_hash is strictly excluded)."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    last_login_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 3. UserRole Schemas (Association-only)
# =============================================================================

class UserRoleBase(BaseModel):
    """Base fields for UserRole junction."""

    model_config = ConfigDict(str_strip_whitespace=True)

    user_id: int = Field(
        ...,
        gt=0,
        description="User ID referencing users.id",
    )
    role_id: int = Field(
        ...,
        gt=0,
        description="Role ID referencing roles.id",
    )
    granted_by: Optional[int] = Field(
        default=None,
        gt=0,
        description="Admin user who granted this role",
    )


class UserRoleCreate(UserRoleBase):
    """Payload for granting a role to a user."""

    pass


class UserRoleResponse(UserRoleBase):
    """API response schema for a user-role assignment."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    granted_at: datetime


class UserRoleDetailResponse(UserRoleResponse):
    """UserRole response with populated User and Role entities."""

    role: Optional[RoleResponse] = None
    user: Optional[UserResponse] = None


# Nested Role/User Detail responses
class RoleDetailResponse(RoleResponse):
    """Role response with associated user assignments."""

    user_assignments: list[UserRoleResponse] = Field(default_factory=list)


class UserDetailResponse(UserResponse):
    """User response with assigned roles."""

    role_assignments: list[UserRoleResponse] = Field(default_factory=list)


# =============================================================================
# 4. ApprovalThreshold Schemas
# =============================================================================

class ApprovalThresholdBase(BaseModel):
    """Base fields for ApprovalThreshold rule."""

    model_config = ConfigDict(str_strip_whitespace=True)

    threshold_type: ThresholdTypeLiteral = Field(
        ...,
        description="Threshold rule category ('gm_floor', 'line_discount', etc.)",
    )
    value_pct: Decimal = Field(
        ...,
        ge=Decimal("0.0000"),
        le=Decimal("100.0000"),
        max_digits=7,
        decimal_places=4,
        description="Trigger percentage (0.0000 to 100.0000%)",
    )
    approver_role_id: int = Field(
        ...,
        gt=0,
        description="Role required to approve proposals reaching/breaching threshold",
    )
    escalation_role_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="Role to which approval escalates upon timeout",
    )
    timeout_hours: Optional[int] = Field(
        default=None,
        gt=0,
        description="Maximum hours pending before escalation triggers",
    )
    region: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Optional regional scope (None = global)",
    )
    valid_from: date = Field(
        ...,
        description="Effective start date",
    )
    valid_to: Optional[date] = Field(
        default=None,
        description="Effective end date (None = indefinitely active)",
    )
    status: GovernanceStatus = Field(
        default="active",
        description="Lifecycle status: 'active', 'inactive', 'retired'",
    )


class ApprovalThresholdCreate(ApprovalThresholdBase):
    """Payload for creating an approval threshold."""

    @model_validator(mode="after")
    def validate_date_order(self) -> "ApprovalThresholdCreate":
        if self.valid_to is not None and self.valid_to < self.valid_from:
            raise ValueError("valid_to must be greater than or equal to valid_from")
        return self


class ApprovalThresholdUpdate(BaseModel):
    """Payload for updating an approval threshold."""

    model_config = ConfigDict(str_strip_whitespace=True)

    threshold_type: Optional[ThresholdTypeLiteral] = None
    value_pct: Optional[Decimal] = Field(
        None,
        ge=Decimal("0.0000"),
        le=Decimal("100.0000"),
        max_digits=7,
        decimal_places=4,
    )
    approver_role_id: Optional[int] = Field(None, gt=0)
    escalation_role_id: Optional[int] = Field(None, gt=0)
    timeout_hours: Optional[int] = Field(None, gt=0)
    region: Optional[str] = Field(None, max_length=100)
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    status: Optional[GovernanceStatus] = None

    @field_validator(
        "threshold_type",
        "value_pct",
        "approver_role_id",
        "valid_from",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v

    @model_validator(mode="after")
    def validate_date_order(self) -> "ApprovalThresholdUpdate":
        if (
            self.valid_from is not None
            and self.valid_to is not None
            and self.valid_to < self.valid_from
        ):
            raise ValueError("valid_to must be greater than or equal to valid_from")
        return self


class ApprovalThresholdResponse(ApprovalThresholdBase):
    """API response schema for an approval threshold."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


class ApprovalThresholdDetailResponse(ApprovalThresholdResponse):
    """ApprovalThreshold response with populated approver and escalation roles."""

    approver_role: Optional[RoleResponse] = None
    escalation_role: Optional[RoleResponse] = None


# =============================================================================
# 5. AuditLog Schemas (Append-only / Immutable)
# =============================================================================

class AuditLogBase(BaseModel):
    """Base fields for AuditLog."""

    model_config = ConfigDict(str_strip_whitespace=True)

    actor_user_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="User ID who executed action; None indicates system automated action",
    )
    action: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Operation name (e.g. 'USER_LOGIN', 'THRESHOLD_UPDATE')",
    )
    entity_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Target domain entity name (e.g. 'rate_cards', 'users')",
    )
    entity_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Primary identifier of target entity as string",
    )
    before: Optional[dict[str, Any]] = Field(
        default=None,
        description="Entity state prior to modification with secrets redacted",
    )
    after: Optional[dict[str, Any]] = Field(
        default=None,
        description="Entity state after modification with secrets redacted",
    )
    request_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Correlation request ID for distributed tracing",
    )
    ip: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Client IP address",
    )


class AuditLogCreate(AuditLogBase):
    """Payload for recording an audit log event."""

    occurred_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp of event occurrence (defaults to current time if omitted)",
    )


class AuditLogResponse(AuditLogBase):
    """API response schema for an audit log record."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    occurred_at: datetime


class AuditLogDetailResponse(AuditLogResponse):
    """AuditLog response with populated actor User."""

    actor: Optional[UserResponse] = None
