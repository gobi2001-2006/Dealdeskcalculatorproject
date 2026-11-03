"""pricing_model_unit_rate_basis

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-11-03 12:00:00.000000

Adds pricing_models.unit_rate_basis: how a rate card's unit_rate is billed
('monthly', 'annual' or 'one_time'). It sits beside the existing fixed_fee_basis so the fixed
(platform) fee and the unit rate can have different billing frequencies, and so the engine no
longer infers the formula from the pricing model's name.

Existing rows get 'monthly' (what the engine assumed for PEPM and Platform + Subscription).
License Fee + AMC is aligned with calculation explained.xlsx: a one-time licence fee per user
(unit rate, 'one_time') plus an annual AMC % of that licence total, and no fixed fee.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE pricing_models
        ADD COLUMN IF NOT EXISTS unit_rate_basis VARCHAR(20) NOT NULL DEFAULT 'monthly';
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_pricing_models_unit_rate_basis'
            ) THEN
                ALTER TABLE pricing_models
                ADD CONSTRAINT ck_pricing_models_unit_rate_basis
                CHECK (unit_rate_basis IN ('monthly', 'annual', 'one_time'));
            END IF;
        END $$;
        """
    )
    op.execute(
        "COMMENT ON COLUMN pricing_models.unit_rate_basis IS "
        "'How the unit rate is billed: monthly, annual or one_time';"
    )
    # License Fee + AMC (workbook): licence fee per user is charged once; AMC % is on the rate card.
    op.execute(
        """
        UPDATE pricing_models
        SET unit_rate_basis = 'one_time', has_fixed_component = false, fixed_fee_basis = NULL
        WHERE code = 'license_amc';
        """
    )


def downgrade() -> None:
    op.execute(
        "UPDATE pricing_models SET has_fixed_component = true, fixed_fee_basis = 'annual' WHERE code = 'license_amc';"
    )
    op.execute("ALTER TABLE pricing_models DROP CONSTRAINT IF EXISTS ck_pricing_models_unit_rate_basis;")
    op.execute("ALTER TABLE pricing_models DROP COLUMN IF EXISTS unit_rate_basis;")
