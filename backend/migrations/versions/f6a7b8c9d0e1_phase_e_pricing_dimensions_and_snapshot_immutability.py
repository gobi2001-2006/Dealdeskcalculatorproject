"""phase_e_pricing_dimensions_and_snapshot_immutability

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-17 13:00:00.000000

Phase E integration fixes (additive, non-destructive):

1. proposal_countries gains deployment_model_id and pricing_model_id (both NULLABLE).
   The rate card is resolved by six dimensions (country, deployment model, pricing
   model, tier, pack/feature, unit of measure) and must return exactly one row.
   Before this change a proposal had nowhere to record the deployment and pricing
   model, so the engine could not honour two of the six dimensions.
   A composite FK to deployment_pricing_options guarantees that only a permitted
   deployment/pricing combination can be stored, and a CHECK requires the two
   columns to be set together or not at all. Existing rows keep NULLs.

2. calculation_snapshots becomes immutable in the database: UPDATE and DELETE are
   rejected by a trigger (same technique as audit_logs). Historical snapshots can
   therefore never be altered, even by code that bypasses the application layer.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_CREATE_SNAPSHOT_IMMUTABLE_FN = """
CREATE OR REPLACE FUNCTION trg_fn_protect_calculation_snapshots_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'calculation_snapshots rows are immutable: UPDATE and DELETE are prohibited.';
END;
$$;
"""

_CREATE_SNAPSHOT_IMMUTABLE_TRIGGER = """
CREATE TRIGGER trg_protect_calculation_snapshots_immutable
BEFORE UPDATE OR DELETE ON calculation_snapshots
FOR EACH ROW
EXECUTE FUNCTION trg_fn_protect_calculation_snapshots_immutable();
"""

_DROP_SNAPSHOT_IMMUTABLE_TRIGGER = """
DROP TRIGGER IF EXISTS trg_protect_calculation_snapshots_immutable ON calculation_snapshots;
"""

_DROP_SNAPSHOT_IMMUTABLE_FN = """
DROP FUNCTION IF EXISTS trg_fn_protect_calculation_snapshots_immutable();
"""


def upgrade() -> None:
    # 1. Pricing dimensions on the proposal country block.
    op.add_column(
        "proposal_countries",
        sa.Column("deployment_model_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "proposal_countries",
        sa.Column("pricing_model_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_proposal_countries_deployment_model_id_deployment_models"),
        "proposal_countries",
        "deployment_models",
        ["deployment_model_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_proposal_countries_pricing_model_id_pricing_models"),
        "proposal_countries",
        "pricing_models",
        ["pricing_model_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_proposal_countries_deployment_pricing_option"),
        "proposal_countries",
        "deployment_pricing_options",
        ["deployment_model_id", "pricing_model_id"],
        ["deployment_model_id", "pricing_model_id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_proposal_countries_pricing_dims_both_or_neither"),
        "proposal_countries",
        "(deployment_model_id IS NULL) = (pricing_model_id IS NULL)",
    )
    op.create_index(
        op.f("ix_proposal_countries_deployment_model_id"),
        "proposal_countries",
        ["deployment_model_id"],
    )
    op.create_index(
        op.f("ix_proposal_countries_pricing_model_id"),
        "proposal_countries",
        ["pricing_model_id"],
    )

    # 2. Immutable calculation snapshots.
    op.execute(_CREATE_SNAPSHOT_IMMUTABLE_FN)
    op.execute(_CREATE_SNAPSHOT_IMMUTABLE_TRIGGER)


def downgrade() -> None:
    op.execute(_DROP_SNAPSHOT_IMMUTABLE_TRIGGER)
    op.execute(_DROP_SNAPSHOT_IMMUTABLE_FN)

    op.drop_index(op.f("ix_proposal_countries_pricing_model_id"), table_name="proposal_countries")
    op.drop_index(op.f("ix_proposal_countries_deployment_model_id"), table_name="proposal_countries")
    op.drop_constraint(
        op.f("ck_proposal_countries_pricing_dims_both_or_neither"),
        "proposal_countries",
        type_="check",
    )
    op.drop_constraint(
        op.f("fk_proposal_countries_deployment_pricing_option"),
        "proposal_countries",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_proposal_countries_pricing_model_id_pricing_models"),
        "proposal_countries",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_proposal_countries_deployment_model_id_deployment_models"),
        "proposal_countries",
        type_="foreignkey",
    )
    op.drop_column("proposal_countries", "pricing_model_id")
    op.drop_column("proposal_countries", "deployment_model_id")
