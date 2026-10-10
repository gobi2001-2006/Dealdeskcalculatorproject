"""Governance, Authentication & Authorization Models for Adrenalin Deal Desk (Wave 4).

Defines the 5 core governance tables:
1. roles — The six fixed application business roles.
2. users — Application users with case-insensitive unique email and password hash.
3. user_roles — Junction table assigning roles to users (composite primary key).
4. approval_thresholds — Configurable governance rules (gm_floor, line_discount, etc.).
5. audit_logs — Append-only audit log with JSONB payloads protected by PostgreSQL triggers.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# =============================================================================
# 1. ROLES
# =============================================================================
class Role(Base):
    """Fixed business roles defined in the specification.

    The six canonical roles are:
      - admin
      - pricing_desk
      - presales
      - sales_lead
      - business_head
      - cfo
    """

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("code", name="uq_roles_code"),
        CheckConstraint(
            "code IN ('admin', 'pricing_desk', 'presales', 'sales_lead', 'business_head', 'cfo')",
            name="ck_roles_code_allowed",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Unique role code (e.g. 'admin', 'cfo')",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Human-readable role title (e.g. 'Chief Financial Officer')",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user_assignments: Mapped[list["UserRole"]] = relationship(
        "UserRole",
        back_populates="role",
        cascade="all, delete-orphan",
    )


# =============================================================================
# 2. USERS
# =============================================================================
class User(Base):
    """Application users with credentials and regional scope.

    Case-insensitive email uniqueness is guaranteed at the database level
    via unique index `uq_users_lower_email` on `lower(email)`.
    """

    __tablename__ = "users"
    __table_args__ = (
        Index(
            "uq_users_lower_email",
            func.lower(text("email")),
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="User email address (normalized lower-case in application layer)",
    )
    full_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="User full display name",
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Bcrypt or Argon2 password hash; never exposed in API schemas",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
        comment="Active account status; inactive users cannot log in",
    )
    region: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Assigned territory/region for scoping Business Head authorizations",
    )
    hubspot_owner_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="CRM owner identifier for quote syncing",
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp of most recent successful authentication",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    role_assignments: Mapped[list["UserRole"]] = relationship(
        "UserRole",
        back_populates="user",
        foreign_keys="UserRole.user_id",
        cascade="all, delete-orphan",
    )


# =============================================================================
# 3. USER ROLES
# =============================================================================
class UserRole(Base):
    """Junction table associating users with business roles.

    Composite primary key (user_id, role_id) prevents duplicate role grants.
    Foreign keys carry ON DELETE RESTRICT to preserve historical audit paths.
    """

    __tablename__ = "user_roles"
    __table_args__ = (
        # Composite primary key (user_id, role_id)
        {"comment": "User to Role assignment matrix with grant tracking"},
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    role_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("roles.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    granted_by: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Admin user who granted this role",
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="role_assignments",
    )
    role: Mapped["Role"] = relationship(
        "Role",
        foreign_keys=[role_id],
        back_populates="user_assignments",
    )
    granter: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[granted_by],
    )


# =============================================================================
# 4. APPROVAL THRESHOLDS
# =============================================================================
class ApprovalThreshold(Base):
    """Configurable governance approval triggers owned by Admin users.

    Defines when deal discounts or margin levels mandate approval escalations.
    Threshold values are not seeded; unconfigured rules must be handled in Python.
    """

    __tablename__ = "approval_thresholds"
    __table_args__ = (
        CheckConstraint(
            "threshold_type IN ('gm_floor', 'line_discount', 'overall_discount', 'service_discount')",
            name="ck_approval_thresholds_threshold_type",
        ),
        CheckConstraint(
            "value_pct >= 0 AND value_pct <= 100",
            name="ck_approval_thresholds_value_pct_range",
        ),
        CheckConstraint(
            "timeout_hours IS NULL OR timeout_hours > 0",
            name="ck_approval_thresholds_timeout_hours_positive",
        ),
        CheckConstraint(
            "valid_to IS NULL OR valid_to >= valid_from",
            name="ck_approval_thresholds_valid_date_order",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_approval_thresholds_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    threshold_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Threshold rule category ('gm_floor', 'line_discount', 'overall_discount', 'service_discount')",
    )
    value_pct: Mapped[Decimal] = mapped_column(
        Numeric(7, 4),
        nullable=False,
        comment="Trigger percentage (0.0000 to 100.0000%)",
    )
    approver_role_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Role required to approve proposals reaching or breaching this threshold",
    )
    escalation_role_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("roles.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="Role to which approval escalates upon timeout",
    )
    timeout_hours: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Maximum hours pending before escalation triggers",
    )
    region: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Optional region scope (NULL applies globally across all deals)",
    )
    valid_from: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Effective start date",
    )
    valid_to: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Effective end date (NULL means indefinitely active)",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
        comment="Lifecycle status: 'active', 'inactive', 'retired'",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    approver_role: Mapped["Role"] = relationship(
        "Role",
        foreign_keys=[approver_role_id],
    )
    escalation_role: Mapped[Optional["Role"]] = relationship(
        "Role",
        foreign_keys=[escalation_role_id],
    )


# =============================================================================
# 5. AUDIT LOGS
# =============================================================================
class AuditLog(Base):
    """Append-only audit trail recording critical system and security events.

    Immutability is strictly enforced by PostgreSQL triggers preventing UPDATE and DELETE.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_occurred_at", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Timestamp when event occurred in UTC",
    )
    actor_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="User ID who executed action; NULL indicates system automated action",
    )
    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Operation name (e.g. 'USER_LOGIN', 'THRESHOLD_UPDATE', 'PROPOSAL_LOCK')",
    )
    entity_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Target domain entity name (e.g. 'rate_cards', 'users')",
    )
    entity_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Primary identifier of target entity as string",
    )
    before: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Entity state prior to modification with secrets redacted",
    )
    after: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Entity state after modification with secrets redacted",
    )
    request_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Correlation request ID for distributed tracing",
    )
    ip: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="Client IP address",
    )

    # Relationships
    actor: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[actor_user_id],
    )
