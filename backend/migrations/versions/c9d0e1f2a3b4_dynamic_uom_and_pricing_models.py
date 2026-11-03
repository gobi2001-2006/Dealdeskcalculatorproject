"""dynamic_uom_and_pricing_models

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-11-03 01:00:00.000000

Implements:
1. UOM Category ('uom1' for employee-based, 'uom2' for product-specific billing units) on units_of_measure.
2. AMC Percentage (numeric 7,4) on rate_cards for License Fee + AMC calculation.
3. pricing_model_uoms association table for allowed UOMs per pricing model.
4. Additive reference seeds for UOM1 and UOM2 (existing UOM names are left unchanged).
5. Populates allowed UOM associations for PEPM and License Fee + AMC (Platform + Subscription stays unrestricted).
"""

from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add category column to units_of_measure
    op.execute(
        """
        ALTER TABLE units_of_measure
        ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'uom2';
        """
    )
    # Add check constraint if not exists
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_units_of_measure_category'
            ) THEN
                ALTER TABLE units_of_measure
                ADD CONSTRAINT ck_units_of_measure_category CHECK (category IN ('uom1', 'uom2'));
            END IF;
        END $$;
        """
    )

    # 2. Add amc_percentage column to rate_cards
    op.execute(
        """
        ALTER TABLE rate_cards
        ADD COLUMN IF NOT EXISTS amc_percentage NUMERIC(7, 4) NULL;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_rate_cards_amc_percentage_range'
            ) THEN
                ALTER TABLE rate_cards
                ADD CONSTRAINT ck_rate_cards_amc_percentage_range
                CHECK (amc_percentage IS NULL OR (amc_percentage >= 0 AND amc_percentage <= 100));
            END IF;
        END $$;
        """
    )

    # 3. Create pricing_model_uoms table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS pricing_model_uoms (
            pricing_model_id BIGINT NOT NULL REFERENCES pricing_models(id) ON DELETE CASCADE,
            uom_id BIGINT NOT NULL REFERENCES units_of_measure(id) ON DELETE RESTRICT,
            is_default BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (pricing_model_id, uom_id)
        );
        """
    )

    # 4. Classify / seed UOM master records (additive only: existing names are never changed)
    op.execute("UPDATE units_of_measure SET category = 'uom1' WHERE code = 'employee';")

    # Billing units named in the business requirements. Inserted only when the code is absent;
    # 'candidate' (existing) is the candidate-inflow unit, so no second candidate UOM is added.
    uom_seeds = [
        ("active_employees_non_ess", "Active Employees (non-ESS)", "uom1"),
        ("gb_data", "GB of Data", "uom2"),
        ("bgv", "BGV", "uom2"),
        ("interviews", "Interviews", "uom2"),
        ("navi_tokens", "Navi Tokens", "uom2"),
        ("payslips", "Payslips", "uom2"),
        ("api_calls", "API Calls", "uom2"),
    ]

    for code, name, category in uom_seeds:
        op.execute(
            f"""
            INSERT INTO units_of_measure (code, name, category, status)
            SELECT '{code}', '{name}', '{category}', 'active'
            WHERE NOT EXISTS (
                SELECT 1 FROM units_of_measure WHERE code = '{code}' OR lower(name) = lower('{name}')
            );
            """
        )

    # 5. Populate pricing_model_uoms mappings
    # PEPM -> Active Employees (with ESS) [default] and Active Employees (non-ESS)
    op.execute(
        """
        INSERT INTO pricing_model_uoms (pricing_model_id, uom_id, is_default)
        SELECT pm.id, uom.id, (CASE WHEN uom.code = 'employee' THEN true ELSE false END)
        FROM pricing_models pm, units_of_measure uom
        WHERE pm.code = 'pepm' AND uom.code IN ('employee', 'active_employees_non_ess')
        AND NOT EXISTS (
            SELECT 1 FROM pricing_model_uoms pmu WHERE pmu.pricing_model_id = pm.id AND pmu.uom_id = uom.id
        );
        """
    )

    # License Fee + AMC -> Active Employees (with ESS) [default] and Active Employees (non-ESS)
    op.execute(
        """
        INSERT INTO pricing_model_uoms (pricing_model_id, uom_id, is_default)
        SELECT pm.id, uom.id, (CASE WHEN uom.code = 'employee' THEN true ELSE false END)
        FROM pricing_models pm, units_of_measure uom
        WHERE pm.code = 'license_amc' AND uom.code IN ('employee', 'active_employees_non_ess')
        AND NOT EXISTS (
            SELECT 1 FROM pricing_model_uoms pmu WHERE pmu.pricing_model_id = pm.id AND pmu.uom_id = uom.id
        );
        """
    )

    # Platform + Subscription: no mapping rows. With no mapping the backend allows every active
    # UOM (employee-based and product-specific); add pricing_model_uoms rows to restrict it.

    # Ensure PEPM has uom_locked_id set to employee
    op.execute(
        """
        UPDATE pricing_models
        SET uom_locked_id = (SELECT id FROM units_of_measure WHERE code = 'employee' LIMIT 1)
        WHERE code = 'pepm';
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS pricing_model_uoms;")
    op.execute("ALTER TABLE rate_cards DROP COLUMN IF EXISTS amc_percentage;")
    op.execute("ALTER TABLE units_of_measure DROP COLUMN IF EXISTS category;")

