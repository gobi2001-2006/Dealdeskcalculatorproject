"""create_wave5_proposal_tables

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-10 14:40:00.000000

Wave 5 — Proposal & Deal Management
Creates 11 tables in dependency order:
  1. customers
  2. deals
  3. proposals
  4. proposal_contacts
  5. proposal_versions
  6. proposal_countries
  7. proposal_line_items
  8. proposal_service_lines
  9. calculation_snapshots
  10. proposal_content
  11. approvals
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. customers
    # -----------------------------------------------------------------------
    op.create_table(
        "customers",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=50), nullable=False, comment="Unique customer code"),
        sa.Column("name", sa.String(length=200), nullable=False, comment="Customer legal name"),
        sa.Column("country_id", sa.BigInteger(), nullable=False),
        sa.Column("customer_tier_id", sa.BigInteger(), nullable=True),
        sa.Column("industry", sa.String(length=100), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customers")),
        sa.UniqueConstraint("code", name=op.f("uq_customers_code")),
        sa.ForeignKeyConstraint(
            ["country_id"],
            ["countries.id"],
            name=op.f("fk_customers_country_id_countries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_tier_id"],
            ["customer_tiers.id"],
            name=op.f("fk_customers_customer_tier_id_customer_tiers"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'prospect')",
            name="ck_customers_status",
        ),
    )
    op.create_index(op.f("ix_customers_code"), "customers", ["code"], unique=False)
    op.create_index(op.f("ix_customers_country_id"), "customers", ["country_id"], unique=False)
    op.create_index(op.f("ix_customers_customer_tier_id"), "customers", ["customer_tier_id"], unique=False)

    # -----------------------------------------------------------------------
    # 2. deals
    # -----------------------------------------------------------------------
    op.create_table(
        "deals",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=50), nullable=False, comment="Unique deal identifier"),
        sa.Column("name", sa.String(length=200), nullable=False, comment="Opportunity title"),
        sa.Column("customer_id", sa.BigInteger(), nullable=False),
        sa.Column("owner_user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'open'"),
            nullable=False,
        ),
        sa.Column("target_close_date", sa.Date(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deals")),
        sa.UniqueConstraint("code", name=op.f("uq_deals_code")),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name=op.f("fk_deals_customer_id_customers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_deals_owner_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'won', 'lost', 'abandoned')",
            name="ck_deals_status",
        ),
    )
    op.create_index(op.f("ix_deals_code"), "deals", ["code"], unique=False)
    op.create_index(op.f("ix_deals_customer_id"), "deals", ["customer_id"], unique=False)
    op.create_index(op.f("ix_deals_owner_user_id"), "deals", ["owner_user_id"], unique=False)

    # -----------------------------------------------------------------------
    # 3. proposals
    # -----------------------------------------------------------------------
    op.create_table(
        "proposals",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=50), nullable=False, comment="Unique proposal code"),
        sa.Column("deal_id", sa.BigInteger(), nullable=False),
        sa.Column("customer_id", sa.BigInteger(), nullable=False),
        sa.Column("currency_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'draft'"),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposals")),
        sa.UniqueConstraint("code", name=op.f("uq_proposals_code")),
        sa.ForeignKeyConstraint(
            ["deal_id"],
            ["deals.id"],
            name=op.f("fk_proposals_deal_id_deals"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            name=op.f("fk_proposals_customer_id_customers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["currency_id"],
            ["currencies.id"],
            name=op.f("fk_proposals_currency_id_currencies"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_proposals_created_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'superseded')",
            name="ck_proposals_status",
        ),
    )
    op.create_index(op.f("ix_proposals_code"), "proposals", ["code"], unique=False)
    op.create_index(op.f("ix_proposals_deal_id"), "proposals", ["deal_id"], unique=False)
    op.create_index(op.f("ix_proposals_customer_id"), "proposals", ["customer_id"], unique=False)
    op.create_index(op.f("ix_proposals_currency_id"), "proposals", ["currency_id"], unique=False)
    op.create_index(op.f("ix_proposals_created_by_user_id"), "proposals", ["created_by_user_id"], unique=False)

    # -----------------------------------------------------------------------
    # 4. proposal_contacts
    # -----------------------------------------------------------------------
    op.create_table(
        "proposal_contacts",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("role_title", sa.String(length=100), nullable=True),
        sa.Column("is_primary", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_contacts")),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["proposals.id"],
            name=op.f("fk_proposal_contacts_proposal_id_proposals"),
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "proposal_id", "email",
            name=op.f("uq_proposal_contacts_proposal_email"),
        ),
    )
    op.create_index(op.f("ix_proposal_contacts_proposal_id"), "proposal_contacts", ["proposal_id"], unique=False)

    # -----------------------------------------------------------------------
    # 5. proposal_versions
    # -----------------------------------------------------------------------
    op.create_table(
        "proposal_versions",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_id", sa.BigInteger(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("rate_card_version_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'draft'"),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_versions")),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["proposals.id"],
            name=op.f("fk_proposal_versions_proposal_id_proposals"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["rate_card_version_id"],
            ["rate_card_versions.id"],
            name=op.f("fk_proposal_versions_rate_card_version_id_rate_card_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_proposal_versions_created_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "proposal_id", "version_no",
            name=op.f("uq_proposal_versions_proposal_id_version_no"),
        ),
        sa.CheckConstraint(
            "version_no > 0",
            name="ck_proposal_versions_version_no_positive",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'under_review', 'approved', 'rejected', 'locked', 'superseded')",
            name="ck_proposal_versions_status",
        ),
    )
    op.create_index(op.f("ix_proposal_versions_proposal_id"), "proposal_versions", ["proposal_id"], unique=False)
    op.create_index(op.f("ix_proposal_versions_rate_card_version_id"), "proposal_versions", ["rate_card_version_id"], unique=False)
    op.create_index(op.f("ix_proposal_versions_created_by_user_id"), "proposal_versions", ["created_by_user_id"], unique=False)

    # -----------------------------------------------------------------------
    # 6. proposal_countries
    # -----------------------------------------------------------------------
    op.create_table(
        "proposal_countries",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_id", sa.BigInteger(), nullable=False),
        sa.Column("country_id", sa.BigInteger(), nullable=False),
        sa.Column("user_headcount", sa.Integer(), nullable=True),
        sa.Column("is_primary_deployment", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_countries")),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["proposals.id"],
            name=op.f("fk_proposal_countries_proposal_id_proposals"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["country_id"],
            ["countries.id"],
            name=op.f("fk_proposal_countries_country_id_countries"),
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "proposal_id", "country_id",
            name=op.f("uq_proposal_countries_proposal_country"),
        ),
        sa.CheckConstraint(
            "user_headcount IS NULL OR user_headcount >= 0",
            name="ck_proposal_countries_headcount_non_negative",
        ),
    )
    op.create_index(op.f("ix_proposal_countries_proposal_id"), "proposal_countries", ["proposal_id"], unique=False)
    op.create_index(op.f("ix_proposal_countries_country_id"), "proposal_countries", ["country_id"], unique=False)

    # -----------------------------------------------------------------------
    # 7. proposal_line_items
    # -----------------------------------------------------------------------
    op.create_table(
        "proposal_line_items",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_version_id", sa.BigInteger(), nullable=False),
        sa.Column("line_number", sa.Integer(), nullable=False),
        sa.Column("pack_version_id", sa.BigInteger(), nullable=True),
        sa.Column("feature_id", sa.BigInteger(), nullable=True),
        sa.Column("uom_id", sa.BigInteger(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("list_unit_price", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("discount_pct", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("net_unit_price", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("extended_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("currency_id", sa.BigInteger(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_line_items")),
        sa.ForeignKeyConstraint(
            ["proposal_version_id"],
            ["proposal_versions.id"],
            name=op.f("fk_proposal_line_items_proposal_version_id_proposal_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["pack_version_id"],
            ["pack_versions.id"],
            name=op.f("fk_proposal_line_items_pack_version_id_pack_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["feature_id"],
            ["features.id"],
            name=op.f("fk_proposal_line_items_feature_id_features"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["uom_id"],
            ["units_of_measure.id"],
            name=op.f("fk_proposal_line_items_uom_id_units_of_measure"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["currency_id"],
            ["currencies.id"],
            name=op.f("fk_proposal_line_items_currency_id_currencies"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "(pack_version_id IS NOT NULL AND feature_id IS NULL) OR "
            "(pack_version_id IS NULL AND feature_id IS NOT NULL)",
            name="ck_proposal_line_items_target_exclusive",
        ),
        sa.CheckConstraint("quantity >= 0", name="ck_proposal_line_items_quantity_non_negative"),
        sa.CheckConstraint("list_unit_price >= 0", name="ck_proposal_line_items_list_unit_price_non_negative"),
        sa.CheckConstraint("net_unit_price >= 0", name="ck_proposal_line_items_net_unit_price_non_negative"),
        sa.CheckConstraint(
            "discount_pct IS NULL OR (discount_pct >= 0 AND discount_pct <= 100)",
            name="ck_proposal_line_items_discount_pct_range",
        ),
        sa.CheckConstraint("extended_amount >= 0", name="ck_proposal_line_items_extended_amount_non_negative"),
    )
    op.create_index(op.f("ix_proposal_line_items_proposal_version_id"), "proposal_line_items", ["proposal_version_id"], unique=False)
    op.create_index(op.f("ix_proposal_line_items_pack_version_id"), "proposal_line_items", ["pack_version_id"], unique=False)
    op.create_index(op.f("ix_proposal_line_items_feature_id"), "proposal_line_items", ["feature_id"], unique=False)
    op.create_index(op.f("ix_proposal_line_items_uom_id"), "proposal_line_items", ["uom_id"], unique=False)
    op.create_index(op.f("ix_proposal_line_items_currency_id"), "proposal_line_items", ["currency_id"], unique=False)

    # -----------------------------------------------------------------------
    # 8. proposal_service_lines
    # -----------------------------------------------------------------------
    op.create_table(
        "proposal_service_lines",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_version_id", sa.BigInteger(), nullable=False),
        sa.Column("service_rate_id", sa.BigInteger(), nullable=True),
        sa.Column("role_name", sa.String(length=100), nullable=False),
        sa.Column("days_or_hours", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("rate_applied", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("discount_pct", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("extended_amount", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("currency_id", sa.BigInteger(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_service_lines")),
        sa.ForeignKeyConstraint(
            ["proposal_version_id"],
            ["proposal_versions.id"],
            name=op.f("fk_proposal_service_lines_proposal_version_id_proposal_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["service_rate_id"],
            ["service_rates.id"],
            name=op.f("fk_proposal_service_lines_service_rate_id_service_rates"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["currency_id"],
            ["currencies.id"],
            name=op.f("fk_proposal_service_lines_currency_id_currencies"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint("days_or_hours >= 0", name="ck_proposal_service_lines_quantity_non_negative"),
        sa.CheckConstraint("rate_applied >= 0", name="ck_proposal_service_lines_rate_applied_non_negative"),
        sa.CheckConstraint(
            "discount_pct IS NULL OR (discount_pct >= 0 AND discount_pct <= 100)",
            name="ck_proposal_service_lines_discount_pct_range",
        ),
        sa.CheckConstraint("extended_amount >= 0", name="ck_proposal_service_lines_extended_amount_non_negative"),
    )
    op.create_index(op.f("ix_proposal_service_lines_proposal_version_id"), "proposal_service_lines", ["proposal_version_id"], unique=False)
    op.create_index(op.f("ix_proposal_service_lines_service_rate_id"), "proposal_service_lines", ["service_rate_id"], unique=False)
    op.create_index(op.f("ix_proposal_service_lines_currency_id"), "proposal_service_lines", ["currency_id"], unique=False)

    # -----------------------------------------------------------------------
    # 9. calculation_snapshots
    # -----------------------------------------------------------------------
    op.create_table(
        "calculation_snapshots",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_version_id", sa.BigInteger(), nullable=False),
        sa.Column("snapshot_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "calculated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("calculated_by_user_id", sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_calculation_snapshots")),
        sa.ForeignKeyConstraint(
            ["proposal_version_id"],
            ["proposal_versions.id"],
            name=op.f("fk_calculation_snapshots_proposal_version_id_proposal_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["calculated_by_user_id"],
            ["users.id"],
            name=op.f("fk_calculation_snapshots_calculated_by_user_id_users"),
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_calc_snapshots_version",
        "calculation_snapshots",
        ["proposal_version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_calculation_snapshots_calculated_by_user_id"),
        "calculation_snapshots",
        ["calculated_by_user_id"],
        unique=False,
    )

    # -----------------------------------------------------------------------
    # 10. proposal_content
    # -----------------------------------------------------------------------
    op.create_table(
        "proposal_content",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_version_id", sa.BigInteger(), nullable=False),
        sa.Column("section_key", sa.String(length=100), nullable=False),
        sa.Column("content_text", sa.Text(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposal_content")),
        sa.ForeignKeyConstraint(
            ["proposal_version_id"],
            ["proposal_versions.id"],
            name=op.f("fk_proposal_content_proposal_version_id_proposal_versions"),
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "proposal_version_id", "section_key",
            name=op.f("uq_proposal_content_version_section"),
        ),
    )
    op.create_index(op.f("ix_proposal_content_proposal_version_id"), "proposal_content", ["proposal_version_id"], unique=False)

    # -----------------------------------------------------------------------
    # 11. approvals
    # -----------------------------------------------------------------------
    op.create_table(
        "approvals",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
        ),
        sa.Column("proposal_version_id", sa.BigInteger(), nullable=False),
        sa.Column("threshold_id", sa.BigInteger(), nullable=True),
        sa.Column("assigned_role_id", sa.BigInteger(), nullable=False),
        sa.Column("decided_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("decision_notes", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_approvals")),
        sa.ForeignKeyConstraint(
            ["proposal_version_id"],
            ["proposal_versions.id"],
            name=op.f("fk_approvals_proposal_version_id_proposal_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["threshold_id"],
            ["approval_thresholds.id"],
            name=op.f("fk_approvals_threshold_id_approval_thresholds"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_role_id"],
            ["roles.id"],
            name=op.f("fk_approvals_assigned_role_id_roles"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by_user_id"],
            ["users.id"],
            name=op.f("fk_approvals_decided_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'escalated', 'cancelled')",
            name="ck_approvals_status",
        ),
    )
    op.create_index(op.f("ix_approvals_proposal_version_id"), "approvals", ["proposal_version_id"], unique=False)
    op.create_index(op.f("ix_approvals_threshold_id"), "approvals", ["threshold_id"], unique=False)
    op.create_index(op.f("ix_approvals_assigned_role_id"), "approvals", ["assigned_role_id"], unique=False)
    op.create_index(op.f("ix_approvals_decided_by_user_id"), "approvals", ["decided_by_user_id"], unique=False)


def downgrade() -> None:
    # 11. approvals
    op.drop_index(op.f("ix_approvals_decided_by_user_id"), table_name="approvals")
    op.drop_index(op.f("ix_approvals_assigned_role_id"), table_name="approvals")
    op.drop_index(op.f("ix_approvals_threshold_id"), table_name="approvals")
    op.drop_index(op.f("ix_approvals_proposal_version_id"), table_name="approvals")
    op.drop_table("approvals")

    # 10. proposal_content
    op.drop_index(op.f("ix_proposal_content_proposal_version_id"), table_name="proposal_content")
    op.drop_table("proposal_content")

    # 9. calculation_snapshots
    op.drop_index(op.f("ix_calculation_snapshots_calculated_by_user_id"), table_name="calculation_snapshots")
    op.drop_index("ix_calc_snapshots_version", table_name="calculation_snapshots")
    op.drop_table("calculation_snapshots")

    # 8. proposal_service_lines
    op.drop_index(op.f("ix_proposal_service_lines_currency_id"), table_name="proposal_service_lines")
    op.drop_index(op.f("ix_proposal_service_lines_service_rate_id"), table_name="proposal_service_lines")
    op.drop_index(op.f("ix_proposal_service_lines_proposal_version_id"), table_name="proposal_service_lines")
    op.drop_table("proposal_service_lines")

    # 7. proposal_line_items
    op.drop_index(op.f("ix_proposal_line_items_currency_id"), table_name="proposal_line_items")
    op.drop_index(op.f("ix_proposal_line_items_uom_id"), table_name="proposal_line_items")
    op.drop_index(op.f("ix_proposal_line_items_feature_id"), table_name="proposal_line_items")
    op.drop_index(op.f("ix_proposal_line_items_pack_version_id"), table_name="proposal_line_items")
    op.drop_index(op.f("ix_proposal_line_items_proposal_version_id"), table_name="proposal_line_items")
    op.drop_table("proposal_line_items")

    # 6. proposal_countries
    op.drop_index(op.f("ix_proposal_countries_country_id"), table_name="proposal_countries")
    op.drop_index(op.f("ix_proposal_countries_proposal_id"), table_name="proposal_countries")
    op.drop_table("proposal_countries")

    # 5. proposal_versions
    op.drop_index(op.f("ix_proposal_versions_created_by_user_id"), table_name="proposal_versions")
    op.drop_index(op.f("ix_proposal_versions_rate_card_version_id"), table_name="proposal_versions")
    op.drop_index(op.f("ix_proposal_versions_proposal_id"), table_name="proposal_versions")
    op.drop_table("proposal_versions")

    # 4. proposal_contacts
    op.drop_index(op.f("ix_proposal_contacts_proposal_id"), table_name="proposal_contacts")
    op.drop_table("proposal_contacts")

    # 3. proposals
    op.drop_index(op.f("ix_proposals_created_by_user_id"), table_name="proposals")
    op.drop_index(op.f("ix_proposals_currency_id"), table_name="proposals")
    op.drop_index(op.f("ix_proposals_customer_id"), table_name="proposals")
    op.drop_index(op.f("ix_proposals_deal_id"), table_name="proposals")
    op.drop_index(op.f("ix_proposals_code"), table_name="proposals")
    op.drop_table("proposals")

    # 2. deals
    op.drop_index(op.f("ix_deals_owner_user_id"), table_name="deals")
    op.drop_index(op.f("ix_deals_customer_id"), table_name="deals")
    op.drop_index(op.f("ix_deals_code"), table_name="deals")
    op.drop_table("deals")

    # 1. customers
    op.drop_index(op.f("ix_customers_customer_tier_id"), table_name="customers")
    op.drop_index(op.f("ix_customers_country_id"), table_name="customers")
    op.drop_index(op.f("ix_customers_code"), table_name="customers")
    op.drop_table("customers")
