"""Wave 6 Models for Adrenalin Deal Desk: Documents, Clauses, CRM Integration & Publishing.

Defines the final seven planned schema tables:
1. clauses — Master legal, commercial, and operational clauses.
2. clause_versions — Immutable versions of clauses preserving historical proposal text.
3. proposal_clauses — Association table pinning exact clause versions to proposal versions.
4. documents — Generated/uploaded contracts, rate quotes, and proposal summaries.
5. crm_field_mappings — Bidirectional schema mapping definitions between internal and external CRM entities.
6. crm_sync_logs — Audit and debugging log for CRM object synchronization operations.
7. publish_jobs — Async publishing task tracking and lifecycle states.
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


# =============================================================================
# 1. CLAUSES
# =============================================================================
class Clause(Base):
    """Reusable legal, payment, SLA, and commercial clauses."""

    __tablename__ = "clauses"
    __table_args__ = (
        UniqueConstraint("code", name="uq_clauses_code"),
        CheckConstraint(
            "category IN ('legal', 'payment', 'commercial', 'sla', 'compliance', 'custom')",
            name="ck_clauses_category",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_clauses_status",
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
        comment="Unique business code (e.g. 'CLS-PAY-001', 'CLS-SLA-999')",
    )
    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Clause title / heading",
    )
    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Classification: 'legal', 'payment', 'commercial', 'sla', 'compliance', 'custom'",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Usage guidance or editorial summary",
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
    versions: Mapped[list["ClauseVersion"]] = relationship(
        "ClauseVersion",
        back_populates="clause",
        cascade="all, delete-orphan",
    )


# =============================================================================
# 2. CLAUSE VERSIONS
# =============================================================================
class ClauseVersion(Base):
    """Immutable snapshot versions of clause wording."""

    __tablename__ = "clause_versions"
    __table_args__ = (
        UniqueConstraint(
            "clause_id", "version_no",
            name="uq_clause_versions_clause_id_version_no",
        ),
        CheckConstraint(
            "version_no > 0",
            name="ck_clause_versions_version_no_positive",
        ),
        CheckConstraint(
            "status IN ('draft', 'approved', 'active', 'superseded')",
            name="ck_clause_versions_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    clause_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("clauses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    version_no: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Sequential version integer (1, 2, 3...)",
    )
    body_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Full legal text of the clause version",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
        comment="Version status: 'draft', 'approved', 'active', 'superseded'",
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    clause: Mapped["Clause"] = relationship("Clause", back_populates="versions")
    created_by_user: Mapped[Optional["User"]] = relationship("User")
    proposal_associations: Mapped[list["ProposalClause"]] = relationship(
        "ProposalClause",
        back_populates="clause_version",
    )


# =============================================================================
# 3. PROPOSAL CLAUSES
# =============================================================================
class ProposalClause(Base):
    """Associates specific immutable clause versions to proposal versions with ordering."""

    __tablename__ = "proposal_clauses"
    __table_args__ = (
        UniqueConstraint(
            "proposal_version_id", "clause_version_id",
            name="uq_proposal_clauses_version_clause",
        ),
        CheckConstraint(
            "sort_order >= 0",
            name="ck_proposal_clauses_sort_order_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposal_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    clause_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("clause_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
        comment="Sequence index for document generation placement",
    )
    custom_override_text: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Discretionary proposal-specific override wording if modified from master",
    )
    is_mandatory: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    proposal_version: Mapped["ProposalVersion"] = relationship("ProposalVersion")
    clause_version: Mapped["ClauseVersion"] = relationship(
        "ClauseVersion",
        back_populates="proposal_associations",
    )


# =============================================================================
# 4. DOCUMENTS
# =============================================================================
class Document(Base):
    """Generated or uploaded contracts, quotes, and commercial documents."""

    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "doc_type IN ('proposal_pdf', 'order_form', 'rate_card_summary', 'msa', 'sow', 'custom')",
            name="ck_documents_doc_type",
        ),
        CheckConstraint(
            "status IN ('generated', 'pending', 'uploaded', 'archived', 'failed')",
            name="ck_documents_status",
        ),
        CheckConstraint(
            "file_size_bytes IS NULL OR file_size_bytes >= 0",
            name="ck_documents_file_size_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposal_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Document kind: 'proposal_pdf', 'order_form', 'rate_card_summary', 'msa', 'sow', 'custom'",
    )
    file_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Display file name (e.g. 'Proposal_Acme_v1.pdf')",
    )
    storage_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="Cloud object storage key / URI (e.g. 's3://dealdesk-docs/proposals/2026/04/doc-123.pdf')",
    )
    mime_type: Mapped[str] = mapped_column(
        String(100),
        default="application/pdf",
        server_default=text("'application/pdf'"),
        nullable=False,
    )
    file_size_bytes: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="generated",
        server_default=text("'generated'"),
        nullable=False,
        comment="Status: 'generated', 'pending', 'uploaded', 'archived', 'failed'",
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    proposal_version: Mapped["ProposalVersion"] = relationship("ProposalVersion")
    created_by_user: Mapped[Optional["User"]] = relationship("User")


# =============================================================================
# 5. CRM FIELD MAPPINGS
# =============================================================================
class CrmFieldMapping(Base):
    """Configures entity and attribute mappings between Deal Desk and CRM systems."""

    __tablename__ = "crm_field_mappings"
    __table_args__ = (
        UniqueConstraint(
            "crm_provider", "internal_entity", "internal_field",
            name="uq_crm_field_mappings_provider_internal_field",
        ),
        CheckConstraint(
            "sync_direction IN ('inbound', 'outbound', 'bidirectional')",
            name="ck_crm_field_mappings_direction",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive')",
            name="ck_crm_field_mappings_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    crm_provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="CRM System identifier: 'hubspot', 'salesforce', 'zoho'",
    )
    internal_entity: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Deal Desk model name (e.g. 'deals', 'customers', 'proposals')",
    )
    internal_field: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Model attribute name (e.g. 'code', 'target_close_date', 'status')",
    )
    external_object: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="CRM object (e.g. 'deal', 'company', 'contact')",
    )
    external_field: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="CRM property name (e.g. 'dealname', 'amount', 'closedate')",
    )
    sync_direction: Mapped[str] = mapped_column(
        String(20),
        default="outbound",
        server_default=text("'outbound'"),
        nullable=False,
        comment="Direction: 'inbound', 'outbound', 'bidirectional'",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        server_default=text("'active'"),
        nullable=False,
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


# =============================================================================
# 6. CRM SYNC LOGS
# =============================================================================
class CrmSyncLog(Base):
    """Audit and telemetry logs for CRM synchronization calls."""

    __tablename__ = "crm_sync_logs"
    __table_args__ = (
        Index("ix_crm_sync_logs_entity", "entity_type", "entity_id"),
        Index("ix_crm_sync_logs_status", "status"),
        Index("ix_crm_sync_logs_synced_at", "synced_at"),
        CheckConstraint(
            "status IN ('success', 'failed', 'partial', 'skipped')",
            name="ck_crm_sync_logs_status",
        ),
        CheckConstraint(
            "direction IN ('inbound', 'outbound')",
            name="ck_crm_sync_logs_direction",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    crm_provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="CRM system (e.g. 'hubspot')",
    )
    entity_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Entity synchronized (e.g. 'deals', 'customers')",
    )
    entity_id: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Internal entity record ID as string",
    )
    external_record_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="CRM record identifier returned by external API",
    )
    direction: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="'inbound' or 'outbound'",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="'success', 'failed', 'partial', 'skipped'",
    )
    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Sanitized error description on sync failure",
    )
    payload_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Redacted synchronization payload",
    )
    request_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Correlation request ID for distributed tracing",
    )
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


# =============================================================================
# 7. PUBLISH JOBS
# =============================================================================
class PublishJob(Base):
    """Lifecycle tracking for asynchronous document generation and publishing."""

    __tablename__ = "publish_jobs"
    __table_args__ = (
        Index("ix_publish_jobs_status", "status"),
        Index("ix_publish_jobs_created_at", "created_at"),
        CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')",
            name="ck_publish_jobs_status",
        ),
        CheckConstraint(
            "retry_count >= 0",
            name="ck_publish_jobs_retry_count_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=False),
        primary_key=True,
    )
    proposal_version_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("proposal_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    job_type: Mapped[str] = mapped_column(
        String(50),
        default="publish_proposal",
        server_default=text("'publish_proposal'"),
        nullable=False,
        comment="Job classification (e.g. 'publish_proposal', 'generate_contract', 'sync_crm')",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="queued",
        server_default=text("'queued'"),
        nullable=False,
        comment="'queued', 'processing', 'completed', 'failed', 'cancelled'",
    )
    idempotency_key: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        unique=True,
        comment="Idempotency key preventing duplicate concurrent publication tasks",
    )
    retry_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )
    error_details: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    document_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("documents.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        comment="Resulting generated document on completion",
    )
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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
    proposal_version: Mapped["ProposalVersion"] = relationship("ProposalVersion")
    document: Mapped[Optional["Document"]] = relationship("Document")
    requested_by_user: Mapped[Optional["User"]] = relationship("User")
