"""admin_module

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-11-16 10:00:00.000000

Phase 2 Admin module. Additive only; no existing row is changed or deleted.

1. roles: the allowed-code CHECK is widened with 'legal' and 'ccxo' and those two roles are added
   (spec roles: Sales, Presales, Business Head, Legal, CFO, CCXO, Admin; 'sales_lead' is Sales).
2. New tables: regions, role_permissions, approval_workflow_stages, admin_settings,
   notification_rules, email_logs.
3. New nullable columns: countries.region_id (Region ADR of a country) and approvals.stage_code.
4. roles.description (nullable): role descriptions, entered by the Admin or the approved setup.

No business rows are inserted (no permission grants, approval stages or notification rules): the
approved v3.1 initial setup is applied deliberately with `python -m scripts.setup_admin_defaults
--apply` (values in app/services/admin_setup.py). Discount ceilings, SLA values, regions and sender
settings are business values the Admin enters.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_CODES = "'admin', 'pricing_desk', 'presales', 'sales_lead', 'business_head', 'cfo'"
NEW_CODES = OLD_CODES + ", 'legal', 'ccxo'"


def upgrade() -> None:
    # 1. Roles: widen the allowed codes, add Legal and CCXO.
    op.execute(
        """
        DO $$
        DECLARE r record;
        BEGIN
            FOR r IN SELECT conname FROM pg_constraint
                     WHERE conrelid = 'roles'::regclass AND contype = 'c'
                       AND pg_get_constraintdef(oid) ILIKE '%code%'
            LOOP
                EXECUTE format('ALTER TABLE roles DROP CONSTRAINT %I', r.conname);
            END LOOP;
        END $$;
        """
    )
    op.execute(f"ALTER TABLE roles ADD CONSTRAINT ck_roles_ck_roles_code_allowed CHECK (code IN ({NEW_CODES}))")
    op.execute(
        "INSERT INTO roles (code, name) VALUES ('legal', 'Legal'), ('ccxo', 'CCXO') "
        "ON CONFLICT (code) DO NOTHING"
    )

    # 2. New tables.
    op.create_table(
        "regions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sub_regions", sa.Text(), nullable=True),
        sa.Column("business_head_user_id", sa.BigInteger(), nullable=True),
        sa.Column("status", sa.String(20), server_default=sa.text("'active'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_regions"),
        sa.ForeignKeyConstraint(["business_head_user_id"], ["users.id"], ondelete="SET NULL",
                                name="fk_regions_business_head_user_id_users"),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_regions_status_allowed"),
    )
    op.execute("CREATE UNIQUE INDEX uq_regions_lower_name ON regions (lower(name))")
    op.create_index("ix_regions_business_head_user_id", "regions", ["business_head_user_id"])

    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.BigInteger(), nullable=False),
        sa.Column("permission_code", sa.String(80), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("granted_by", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("role_id", "permission_code", name="pk_role_permissions"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE", name="fk_role_permissions_role_id_roles"),
        sa.ForeignKeyConstraint(["granted_by"], ["users.id"], ondelete="SET NULL",
                                name="fk_role_permissions_granted_by_users"),
    )

    op.create_table(
        "approval_workflow_stages",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("stage_code", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("sub_label", sa.String(100), nullable=True),
        sa.Column("condition_text", sa.String(255), nullable=True),
        sa.Column("approver_role_id", sa.BigInteger(), nullable=False),
        sa.Column("routing", sa.String(20), server_default=sa.text("'global'"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_approval_workflow_stages"),
        sa.UniqueConstraint("stage_code", name="uq_approval_workflow_stages_stage_code"),
        sa.ForeignKeyConstraint(["approver_role_id"], ["roles.id"], ondelete="RESTRICT",
                                name="fk_approval_workflow_stages_approver_role_id_roles"),
        sa.CheckConstraint("routing IN ('regional', 'global')", name="ck_approval_workflow_stages_routing_allowed"),
    )

    op.create_table(
        "admin_settings",
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("value", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("updated_by", sa.BigInteger(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("key", name="pk_admin_settings"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL", name="fk_admin_settings_updated_by_users"),
    )

    op.create_table(
        "notification_rules",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("event_code", sa.String(60), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("recipient_roles", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("include_approve_links", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("subject_template", sa.String(500), nullable=False),
        sa.Column("body_template", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_notification_rules"),
        sa.UniqueConstraint("event_code", name="uq_notification_rules_event_code"),
    )

    op.create_table(
        "email_logs",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("event_code", sa.String(60), nullable=False),
        sa.Column("proposal_id", sa.BigInteger(), nullable=True),
        sa.Column("recipient_role", sa.String(50), nullable=True),
        sa.Column("recipient_name", sa.String(200), nullable=True),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("cc_email", sa.String(255), nullable=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("is_test", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_email_logs"),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="SET NULL",
                                name="fk_email_logs_proposal_id_proposals"),
        sa.CheckConstraint("status IN ('simulated', 'sent', 'failed', 'skipped')", name="ck_email_logs_status_allowed"),
    )
    op.create_index("ix_email_logs_created_at", "email_logs", ["created_at"])
    op.create_index("ix_email_logs_event_code", "email_logs", ["event_code"])
    op.create_index("ix_email_logs_proposal_id", "email_logs", ["proposal_id"])

    # 3. New nullable columns on existing tables.
    op.add_column("countries", sa.Column("region_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_countries_region_id_regions", "countries", "regions", ["region_id"], ["id"],
                          ondelete="SET NULL")
    op.create_index("ix_countries_region_id", "countries", ["region_id"])
    op.add_column("approvals", sa.Column("stage_code", sa.String(50), nullable=True))

    op.add_column("roles", sa.Column("description", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("roles", "description")
    op.drop_column("approvals", "stage_code")
    op.drop_index("ix_countries_region_id", table_name="countries")
    op.drop_constraint("fk_countries_region_id_regions", "countries", type_="foreignkey")
    op.drop_column("countries", "region_id")
    op.drop_table("email_logs")
    op.drop_table("notification_rules")
    op.drop_table("admin_settings")
    op.drop_table("approval_workflow_stages")
    op.drop_table("role_permissions")
    op.drop_table("regions")
    # Legal / CCXO are removed only when nothing references them.
    op.execute(
        "DELETE FROM roles r WHERE r.code IN ('legal', 'ccxo') "
        "AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.role_id = r.id) "
        "AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.assigned_role_id = r.id) "
        "AND NOT EXISTS (SELECT 1 FROM approval_thresholds t WHERE t.approver_role_id = r.id "
        "OR t.escalation_role_id = r.id)"
    )
    op.execute("ALTER TABLE roles DROP CONSTRAINT IF EXISTS ck_roles_ck_roles_code_allowed")
    op.execute(f"ALTER TABLE roles ADD CONSTRAINT ck_roles_code_allowed CHECK (code IN ({OLD_CODES}))")
