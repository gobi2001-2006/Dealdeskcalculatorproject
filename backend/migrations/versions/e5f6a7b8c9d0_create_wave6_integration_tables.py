"""create_wave6_integration_tables

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-10-10 14:55:00.000000

Wave 6 — Documents, Clauses, CRM Integration & Publishing
Creates 7 tables in dependency order:
  1. clauses
  2. clause_versions
  3. proposal_clauses
  4. documents
  5. crm_field_mappings
  6. crm_sync_logs
  7. publish_jobs
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. clauses
    # -----------------------------------------------------------------------
    op.create_table(
        "clauses",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=50), nullable=False, comment="Unique clause code"),
        sa.Column("title", sa.String(length=200), nullable=False, comment="Clause title"),
        sa.Column("category", sa.String(length=50), nullable=False, comment="Clause category"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clauses")),
        sa.UniqueConstraint("code", name=op.f("uq_clauses_code")),
        sa.CheckConstraint(
            "category IN ('legal', 'payment', 'commercial', 'sla', 'compliance', 'custom')",
            name="ck_clauses_category",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_clauses_status",
        ),
    )
    op.create_index(op.f("ix_clauses_code"), "clauses", ["code"], unique=False)

    # -----------------------------------------------------------------------
    # 2. clause_versions
    # -----------------------------------------------------------------------
    op.create_table(
        "clause_versions",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("clause_id", sa.BigInteger(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_clause_versions")),
        sa.ForeignKeyConstraint(
            ["clause_id"],
            ["clauses.id"],
            name=op.f("fk_clause_versions_clause_id_clauses"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_clause_versions_created_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "clause_id", "version_no",
            name=op.f("uq_clause_versions_clause_id_version_no"),
        ),
        sa.CheckConstraint("version_no > 0", name="ck_clause_versions_version_no_positive"),
        sa.CheckConstraint(
            "status IN ('draft', 'approved', 'active', 'superseded')",
            name="ck_clause_versions_status",
        ),
    )
    op.create_index(op.f("ix_clause_versions_clause_id"), "clause_versions", ["clause_id"], unique=False)
    op.create_index(op.f("ix_clause_versions_created_by_user_id"), "clause_versions", ["created_by_user_id"], unique=False)

    # -----------------------------------------------------------------------
    # 3. proposal_clauses
    # -----------------------------------------------------------------------
    op.create_table(
        "proposal_clauses",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_version_id", sa.BigInteger(), nullable=False),
        sa.Column("clause_version_id", sa.BigInteger(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("custom_override_text", sa.Text(), nullable=True),
        sa.Column("is_mandatory", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_clauses")),
        sa.ForeignKeyConstraint(
            ["proposal_version_id"],
            ["proposal_versions.id"],
            name=op.f("fk_proposal_clauses_proposal_version_id_proposal_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["clause_version_id"],
            ["clause_versions.id"],
            name=op.f("fk_proposal_clauses_clause_version_id_clause_versions"),
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "proposal_version_id", "clause_version_id",
            name=op.f("uq_proposal_clauses_version_clause"),
        ),
        sa.CheckConstraint("sort_order >= 0", name="ck_proposal_clauses_sort_order_non_negative"),
    )
    op.create_index(op.f("ix_proposal_clauses_proposal_version_id"), "proposal_clauses", ["proposal_version_id"], unique=False)
    op.create_index(op.f("ix_proposal_clauses_clause_version_id"), "proposal_clauses", ["clause_version_id"], unique=False)

    # -----------------------------------------------------------------------
    # 4. documents
    # -----------------------------------------------------------------------
    op.create_table(
        "documents",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_version_id", sa.BigInteger(), nullable=False),
        sa.Column("doc_type", sa.String(length=50), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=100), server_default=sa.text("'application/pdf'"), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'generated'"), nullable=False),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_documents")),
        sa.ForeignKeyConstraint(
            ["proposal_version_id"],
            ["proposal_versions.id"],
            name=op.f("fk_documents_proposal_version_id_proposal_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_documents_created_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "doc_type IN ('proposal_pdf', 'order_form', 'rate_card_summary', 'msa', 'sow', 'custom')",
            name="ck_documents_doc_type",
        ),
        sa.CheckConstraint(
            "status IN ('generated', 'pending', 'uploaded', 'archived', 'failed')",
            name="ck_documents_status",
        ),
        sa.CheckConstraint(
            "file_size_bytes IS NULL OR file_size_bytes >= 0",
            name="ck_documents_file_size_non_negative",
        ),
    )
    op.create_index(op.f("ix_documents_proposal_version_id"), "documents", ["proposal_version_id"], unique=False)
    op.create_index(op.f("ix_documents_created_by_user_id"), "documents", ["created_by_user_id"], unique=False)

    # -----------------------------------------------------------------------
    # 5. crm_field_mappings
    # -----------------------------------------------------------------------
    op.create_table(
        "crm_field_mappings",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("crm_provider", sa.String(length=50), nullable=False),
        sa.Column("internal_entity", sa.String(length=100), nullable=False),
        sa.Column("internal_field", sa.String(length=100), nullable=False),
        sa.Column("external_object", sa.String(length=100), nullable=False),
        sa.Column("external_field", sa.String(length=100), nullable=False),
        sa.Column("sync_direction", sa.String(length=20), server_default=sa.text("'outbound'"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'active'"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_field_mappings")),
        sa.UniqueConstraint(
            "crm_provider", "internal_entity", "internal_field",
            name=op.f("uq_crm_field_mappings_crm_provider"),
        ),
        sa.CheckConstraint(
            "sync_direction IN ('inbound', 'outbound', 'bidirectional')",
            name="ck_crm_field_mappings_direction",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')",
            name="ck_crm_field_mappings_status",
        ),
    )

    # -----------------------------------------------------------------------
    # 6. crm_sync_logs
    # -----------------------------------------------------------------------
    op.create_table(
        "crm_sync_logs",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("crm_provider", sa.String(length=50), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.String(length=100), nullable=False),
        sa.Column("external_record_id", sa.String(length=100), nullable=True),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("request_id", sa.String(length=100), nullable=True),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_sync_logs")),
        sa.CheckConstraint(
            "status IN ('success', 'failed', 'partial', 'skipped')",
            name="ck_crm_sync_logs_status",
        ),
        sa.CheckConstraint(
            "direction IN ('inbound', 'outbound')",
            name="ck_crm_sync_logs_direction",
        ),
    )
    op.create_index("ix_crm_sync_logs_entity", "crm_sync_logs", ["entity_type", "entity_id"], unique=False)
    op.create_index("ix_crm_sync_logs_status", "crm_sync_logs", ["status"], unique=False)
    op.create_index("ix_crm_sync_logs_synced_at", "crm_sync_logs", ["synced_at"], unique=False)

    # -----------------------------------------------------------------------
    # 7. publish_jobs
    # -----------------------------------------------------------------------
    op.create_table(
        "publish_jobs",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_version_id", sa.BigInteger(), nullable=False),
        sa.Column("job_type", sa.String(length=50), server_default=sa.text("'publish_proposal'"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'queued'"), nullable=False),
        sa.Column("idempotency_key", sa.String(length=100), nullable=True),
        sa.Column("retry_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("error_details", sa.Text(), nullable=True),
        sa.Column("document_id", sa.BigInteger(), nullable=True),
        sa.Column("requested_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_publish_jobs")),
        sa.ForeignKeyConstraint(
            ["proposal_version_id"],
            ["proposal_versions.id"],
            name=op.f("fk_publish_jobs_proposal_version_id_proposal_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name=op.f("fk_publish_jobs_document_id_documents"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["users.id"],
            name=op.f("fk_publish_jobs_requested_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_publish_jobs_idempotency_key")),
        sa.CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')",
            name="ck_publish_jobs_status",
        ),
        sa.CheckConstraint("retry_count >= 0", name="ck_publish_jobs_retry_count_non_negative"),
    )
    op.create_index(op.f("ix_publish_jobs_proposal_version_id"), "publish_jobs", ["proposal_version_id"], unique=False)
    op.create_index(op.f("ix_publish_jobs_document_id"), "publish_jobs", ["document_id"], unique=False)
    op.create_index(op.f("ix_publish_jobs_requested_by_user_id"), "publish_jobs", ["requested_by_user_id"], unique=False)
    op.create_index("ix_publish_jobs_status", "publish_jobs", ["status"], unique=False)
    op.create_index("ix_publish_jobs_created_at", "publish_jobs", ["created_at"], unique=False)


def downgrade() -> None:
    # 7. publish_jobs
    op.drop_index("ix_publish_jobs_created_at", table_name="publish_jobs")
    op.drop_index("ix_publish_jobs_status", table_name="publish_jobs")
    op.drop_index(op.f("ix_publish_jobs_requested_by_user_id"), table_name="publish_jobs")
    op.drop_index(op.f("ix_publish_jobs_document_id"), table_name="publish_jobs")
    op.drop_index(op.f("ix_publish_jobs_proposal_version_id"), table_name="publish_jobs")
    op.drop_table("publish_jobs")

    # 6. crm_sync_logs
    op.drop_index("ix_crm_sync_logs_synced_at", table_name="crm_sync_logs")
    op.drop_index("ix_crm_sync_logs_status", table_name="crm_sync_logs")
    op.drop_index("ix_crm_sync_logs_entity", table_name="crm_sync_logs")
    op.drop_table("crm_sync_logs")

    # 5. crm_field_mappings
    op.drop_table("crm_field_mappings")

    # 4. documents
    op.drop_index(op.f("ix_documents_created_by_user_id"), table_name="documents")
    op.drop_index(op.f("ix_documents_proposal_version_id"), table_name="documents")
    op.drop_table("documents")

    # 3. proposal_clauses
    op.drop_index(op.f("ix_proposal_clauses_clause_version_id"), table_name="proposal_clauses")
    op.drop_index(op.f("ix_proposal_clauses_proposal_version_id"), table_name="proposal_clauses")
    op.drop_table("proposal_clauses")

    # 2. clause_versions
    op.drop_index(op.f("ix_clause_versions_created_by_user_id"), table_name="clause_versions")
    op.drop_index(op.f("ix_clause_versions_clause_id"), table_name="clause_versions")
    op.drop_table("clause_versions")

    # 1. clauses
    op.drop_index(op.f("ix_clauses_code"), table_name="clauses")
    op.drop_table("clauses")
