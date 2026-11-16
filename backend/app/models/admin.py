"""Admin module models (Phase 2).

New configuration tables owned by the Admin module. Everything else the module needs is reused:
users / roles / user_roles (governance.py), approval_thresholds (ceilings), audit_logs.

1. regions                  - Region (ADR) master with the regional Business Head mapping.
2. role_permissions         - Role x permission matrix (permission codes live in permission_service).
3. approval_workflow_stages - Approval matrix: which role approves each stage and how it is routed.
4. admin_settings           - Small keyed JSON settings (SLA / escalation, email sender, toggles).
5. notification_rules       - Per-event email rule: on/off, recipient roles, subject and body template.
6. email_logs               - Outbox / delivery log (simulated delivery until a mail relay is configured).
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Region(Base):
    """Region (ADR) master. Users, countries and the Business Head routing refer to it by name."""

    __tablename__ = "regions"
    __table_args__ = (
        Index("uq_regions_lower_name", func.lower(text("name")), unique=True),
        CheckConstraint("status IN ('active', 'inactive')", name="status_allowed"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sub_regions: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Free text, e.g. 'GCC, Levant'")
    business_head_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
        comment="Business Head who approves proposals of this region",
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'active'"), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    business_head: Mapped[Optional["User"]] = relationship("User", foreign_keys=[business_head_user_id])  # noqa: F821


class RolePermission(Base):
    """One granted permission of one role. Absence of a row means 'not granted'."""

    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_code: Mapped[str] = mapped_column(String(80), primary_key=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    granted_by: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class ApprovalWorkflowStage(Base):
    """One stage of the approval matrix (commercial line / proposal, final L1, L2 Legal, L2 CFO)."""

    __tablename__ = "approval_workflow_stages"
    __table_args__ = (
        UniqueConstraint("stage_code"),
        CheckConstraint("routing IN ('regional', 'global')", name="routing_allowed"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    stage_code: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    sub_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    condition_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    approver_role_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False
    )
    routing: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'global'"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    approver_role: Mapped["Role"] = relationship("Role")  # noqa: F821


class AdminSetting(Base):
    """Keyed JSON setting, e.g. 'approval_sla', 'approval_options', 'email_sender'."""

    __tablename__ = "admin_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    updated_by: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class NotificationRule(Base):
    """Email rule for one workflow event."""

    __tablename__ = "notification_rules"
    __table_args__ = (UniqueConstraint("event_code"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    event_code: Mapped[str] = mapped_column(String(60), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    recipient_roles: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    include_approve_links: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    subject_template: Mapped[str] = mapped_column(String(500), nullable=False)
    body_template: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class EmailLog(Base):
    """One email produced by a notification rule (or a test send)."""

    __tablename__ = "email_logs"
    __table_args__ = (
        CheckConstraint("status IN ('simulated', 'sent', 'failed', 'skipped')", name="status_allowed"),
        Index("ix_email_logs_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    event_code: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    proposal_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("proposals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recipient_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    recipient_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    recipient_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cc_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
