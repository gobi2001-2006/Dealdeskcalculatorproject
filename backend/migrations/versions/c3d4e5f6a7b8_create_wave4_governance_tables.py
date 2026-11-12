"""create_wave4_governance_tables

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-10 14:30:00.000000

Wave 4 — Users & Governance
Creates five tables:
  1. roles (seeded with 6 fixed canonical roles)
  2. users (with case-insensitive lower(email) unique index)
  3. user_roles (composite primary key)
  4. approval_thresholds
  5. audit_logs (append-only protected by PostgreSQL trigger)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Trigger SQL: reject UPDATE or DELETE on audit_logs
_CREATE_AUDIT_APPEND_ONLY_FN = """
CREATE OR REPLACE FUNCTION trg_fn_protect_audit_logs_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs table is append-only: UPDATE and DELETE operations are prohibited.';
END;
$$;
"""

_CREATE_AUDIT_APPEND_ONLY_TRIGGER = """
CREATE TRIGGER trg_protect_audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION trg_fn_protect_audit_logs_append_only();
"""

_DROP_AUDIT_APPEND_ONLY_TRIGGER = """
DROP TRIGGER IF EXISTS trg_protect_audit_logs_append_only ON audit_logs;
"""

_DROP_AUDIT_APPEND_ONLY_FN = """
DROP FUNCTION IF EXISTS trg_fn_protect_audit_logs_append_only();
"""


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. roles
    # -----------------------------------------------------------------------
    op.create_table(
        "roles",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "code",
            sa.String(length=50),
            nullable=False,
            comment="Unique role code (e.g. 'admin', 'cfo')",
        ),
        sa.Column(
            "name",
            sa.String(length=100),
            nullable=False,
            comment="Human-readable role title",
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("code", name=op.f("uq_roles_code")),
        sa.CheckConstraint(
            "code IN ('admin', 'pricing_desk', 'presales', 'sales_lead', 'business_head', 'cfo')",
            name="ck_roles_code_allowed",
        ),
    )
    op.create_index(op.f("ix_roles_code"), "roles", ["code"], unique=False)

    # Seed 6 canonical roles
    roles_table = sa.table(
        "roles",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
    )
    op.bulk_insert(
        roles_table,
        [
            {"code": "admin", "name": "System Administrator"},
            {"code": "pricing_desk", "name": "Pricing Desk Analyst"},
            {"code": "presales", "name": "Presales Consultant"},
            {"code": "sales_lead", "name": "Sales Lead"},
            {"code": "business_head", "name": "Business Head"},
            {"code": "cfo", "name": "Chief Financial Officer"},
        ],
    )

    # -----------------------------------------------------------------------
    # 2. users
    # -----------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "email",
            sa.String(length=255),
            nullable=False,
            comment="User email address",
        ),
        sa.Column(
            "full_name",
            sa.String(length=200),
            nullable=False,
            comment="User full display name",
        ),
        sa.Column(
            "password_hash",
            sa.String(length=255),
            nullable=False,
            comment="Bcrypt or Argon2 password hash",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
            comment="Active account status",
        ),
        sa.Column(
            "region",
            sa.String(length=100),
            nullable=True,
            comment="Assigned territory/region",
        ),
        sa.Column(
            "hubspot_owner_id",
            sa.String(length=100),
            nullable=True,
            comment="CRM owner identifier",
        ),
        sa.Column(
            "last_login_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp of most recent authentication",
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    # Case-insensitive lower(email) unique index
    op.execute("CREATE UNIQUE INDEX uq_users_lower_email ON users (lower(email));")

    # -----------------------------------------------------------------------
    # 3. user_roles
    # -----------------------------------------------------------------------
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("role_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "granted_by",
            sa.BigInteger(),
            nullable=True,
            comment="Admin user who granted this role",
        ),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id", "role_id", name=op.f("pk_user_roles")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_roles_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name=op.f("fk_user_roles_role_id_roles"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["granted_by"],
            ["users.id"],
            name=op.f("fk_user_roles_granted_by_users"),
            ondelete="RESTRICT",
        ),
    )

    # -----------------------------------------------------------------------
    # 4. approval_thresholds
    # -----------------------------------------------------------------------
    op.create_table(
        "approval_thresholds",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "threshold_type",
            sa.String(length=50),
            nullable=False,
            comment="Threshold rule category",
        ),
        sa.Column(
            "value_pct",
            sa.Numeric(precision=7, scale=4),
            nullable=False,
            comment="Trigger percentage (0.0000 to 100.0000%)",
        ),
        sa.Column("approver_role_id", sa.BigInteger(), nullable=False),
        sa.Column("escalation_role_id", sa.BigInteger(), nullable=True),
        sa.Column("timeout_hours", sa.Integer(), nullable=True),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_approval_thresholds")),
        sa.ForeignKeyConstraint(
            ["approver_role_id"],
            ["roles.id"],
            name=op.f("fk_approval_thresholds_approver_role_id_roles"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["escalation_role_id"],
            ["roles.id"],
            name=op.f("fk_approval_thresholds_escalation_role_id_roles"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "threshold_type IN ('gm_floor', 'line_discount', 'overall_discount', 'service_discount')",
            name="ck_approval_thresholds_threshold_type",
        ),
        sa.CheckConstraint(
            "value_pct >= 0 AND value_pct <= 100",
            name="ck_approval_thresholds_value_pct_range",
        ),
        sa.CheckConstraint(
            "timeout_hours IS NULL OR timeout_hours > 0",
            name="ck_approval_thresholds_timeout_hours_positive",
        ),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to >= valid_from",
            name="ck_approval_thresholds_valid_date_order",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'retired')",
            name="ck_approval_thresholds_status",
        ),
    )
    op.create_index(
        op.f("ix_approval_thresholds_threshold_type"),
        "approval_thresholds",
        ["threshold_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_approval_thresholds_approver_role_id"),
        "approval_thresholds",
        ["approver_role_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_approval_thresholds_escalation_role_id"),
        "approval_thresholds",
        ["escalation_role_id"],
        unique=False,
    )

    # -----------------------------------------------------------------------
    # 5. audit_logs
    # -----------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="Timestamp when event occurred in UTC",
        ),
        sa.Column(
            "actor_user_id",
            sa.BigInteger(),
            nullable=True,
            comment="User ID who executed action; NULL indicates system automated action",
        ),
        sa.Column(
            "action",
            sa.String(length=100),
            nullable=False,
            comment="Operation name",
        ),
        sa.Column(
            "entity_type",
            sa.String(length=100),
            nullable=False,
            comment="Target domain entity name",
        ),
        sa.Column(
            "entity_id",
            sa.String(length=100),
            nullable=False,
            comment="Primary identifier of target entity as string",
        ),
        sa.Column(
            "before",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Entity state prior to modification",
        ),
        sa.Column(
            "after",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Entity state after modification",
        ),
        sa.Column(
            "request_id",
            sa.String(length=100),
            nullable=True,
            comment="Correlation request ID",
        ),
        sa.Column(
            "ip",
            sa.String(length=50),
            nullable=True,
            comment="Client IP address",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name=op.f("fk_audit_logs_actor_user_id_users"),
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_audit_logs_entity",
        "audit_logs",
        ["entity_type", "entity_id"],
        unique=False,
    )
    op.create_index(
        "ix_audit_logs_occurred_at",
        "audit_logs",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_audit_logs_actor_user_id"),
        "audit_logs",
        ["actor_user_id"],
        unique=False,
    )

    # Install append-only trigger on audit_logs
    op.execute(_CREATE_AUDIT_APPEND_ONLY_FN)
    op.execute(_CREATE_AUDIT_APPEND_ONLY_TRIGGER)


def downgrade() -> None:
    # 5. audit_logs
    op.execute(_DROP_AUDIT_APPEND_ONLY_TRIGGER)
    op.execute(_DROP_AUDIT_APPEND_ONLY_FN)
    op.drop_index(op.f("ix_audit_logs_actor_user_id"), table_name="audit_logs")
    op.drop_index("ix_audit_logs_occurred_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_entity", table_name="audit_logs")
    op.drop_table("audit_logs")

    # 4. approval_thresholds
    op.drop_index(
        op.f("ix_approval_thresholds_escalation_role_id"),
        table_name="approval_thresholds",
    )
    op.drop_index(
        op.f("ix_approval_thresholds_approver_role_id"),
        table_name="approval_thresholds",
    )
    op.drop_index(
        op.f("ix_approval_thresholds_threshold_type"),
        table_name="approval_thresholds",
    )
    op.drop_table("approval_thresholds")

    # 3. user_roles
    op.drop_table("user_roles")

    # 2. users
    op.execute("DROP INDEX IF EXISTS uq_users_lower_email;")
    op.drop_table("users")

    # 1. roles
    op.drop_index(op.f("ix_roles_code"), table_name="roles")
    op.drop_table("roles")
