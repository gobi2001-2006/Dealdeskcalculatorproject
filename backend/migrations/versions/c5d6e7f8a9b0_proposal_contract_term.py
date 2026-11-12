"""proposal_contract_term

Revision ID: c5d6e7f8a9b0
Revises: a3b4c5d6e7f8
Create Date: 2026-11-06 18:00:00.000000

Contract duration is entered in years on the Proposal Configurator and stored in months
(months = years x 12), the unit the pricing engine and calculation snapshots already use.

Until now the term lived only inside calculation snapshots (a request input), so the Proposal
Configurator could not save it without creating a snapshot. This adds one nullable column:

  proposals.contract_term_months INTEGER NULL, CHECK (contract_term_months > 0)

NULL keeps the previous behaviour (the latest snapshot's term is shown; the engine defaults to
12 months when none is given). Additive only: no existing row is changed, nothing is backfilled.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CHECK = "ck_proposals_contract_term_months_positive"


def upgrade() -> None:
    op.execute("ALTER TABLE proposals ADD COLUMN IF NOT EXISTS contract_term_months INTEGER NULL;")
    op.execute(
        "COMMENT ON COLUMN proposals.contract_term_months IS 'Contract duration in months (UI: years x 12)';"
    )
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{CHECK}') THEN
                ALTER TABLE proposals ADD CONSTRAINT {CHECK}
                    CHECK (contract_term_months IS NULL OR contract_term_months > 0);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE proposals DROP CONSTRAINT IF EXISTS {CHECK};")
    op.execute("ALTER TABLE proposals DROP COLUMN IF EXISTS contract_term_months;")
