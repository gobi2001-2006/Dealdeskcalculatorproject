"""pepm_allow_ess_and_non_ess

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-11-06 10:05:00.000000

Business decision (2026-11-06, docs/AUDIO_BUSINESS_RULE_DECISIONS.md): PEPM may be charged per
Active Employees (with ESS) or per Active Employees (non-ESS); the dropdown offers both.
This matches calculation explained.xlsx ("UOM1 for license, platform, or PEPM could be ...",
and its separate PEPM block for non self-service users).

Data change only (no schema change):
  - pricing_models.uom_locked_id is cleared for PEPM, so it is no longer locked to one UOM;
  - pricing_model_uoms keeps / gets PEPM -> employee (default) and PEPM -> active_employees_non_ess,
    so the allowed-UOM API returns exactly those two.
Rows are matched by business code, never by id. Existing rate cards are not touched.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO pricing_model_uoms (pricing_model_id, uom_id, is_default)
        SELECT pm.id, uom.id, (uom.code = 'employee')
        FROM pricing_models pm, units_of_measure uom
        WHERE pm.code = 'pepm' AND uom.code IN ('employee', 'active_employees_non_ess')
        AND NOT EXISTS (
            SELECT 1 FROM pricing_model_uoms pmu WHERE pmu.pricing_model_id = pm.id AND pmu.uom_id = uom.id
        );
        """
    )
    op.execute("UPDATE pricing_models SET uom_locked_id = NULL WHERE code = 'pepm';")


def downgrade() -> None:
    # Restore the previous ESS-only lock. Mapping rows are left in place (the lock takes precedence).
    op.execute(
        """
        UPDATE pricing_models
        SET uom_locked_id = (SELECT id FROM units_of_measure WHERE code = 'employee' LIMIT 1)
        WHERE code = 'pepm';
        """
    )
