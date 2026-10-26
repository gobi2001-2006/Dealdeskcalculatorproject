"""add_license_amc_pricing_model_and_combinations

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-21 22:30:00.000000

Adds the 'license_amc' pricing model to pricing_models (for On-Premise) and configures
the allowed deployment-pricing option (On-Premise + License Fee + AMC) in deployment_pricing_options.
Also guarantees that PEPM is locked to the 'Active Employees (with ESS)' unit of measure.
"""

from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Insert 'license_amc' into pricing_models if not exists
    op.execute(
        """
        INSERT INTO pricing_models (code, name, description, has_fixed_component, has_unit_component, fixed_fee_basis, status)
        SELECT 'license_amc', 'License Fee + AMC', 'On-premise perpetual/term capex license with annual maintenance support', true, true, 'annual', 'active'
        WHERE NOT EXISTS (
            SELECT 1 FROM pricing_models WHERE code = 'license_amc'
        );
        """
    )

    # 2. Lock PEPM pricing model to Active Employee UOM if uom_locked_id is null
    op.execute(
        """
        UPDATE pricing_models
        SET uom_locked_id = (SELECT id FROM units_of_measure WHERE code = 'employee' LIMIT 1)
        WHERE code = 'pepm' AND uom_locked_id IS NULL;
        """
    )

    # 3. Insert On-Premise + License Fee + AMC combination into deployment_pricing_options
    op.execute(
        """
        INSERT INTO deployment_pricing_options (deployment_model_id, pricing_model_id)
        SELECT d.id, p.id
        FROM deployment_models d, pricing_models p
        WHERE d.code = 'on_premise' AND p.code = 'license_amc'
        AND NOT EXISTS (
            SELECT 1 FROM deployment_pricing_options dpo
            WHERE dpo.deployment_model_id = d.id AND dpo.pricing_model_id = p.id
        );
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM deployment_pricing_options
        WHERE pricing_model_id IN (SELECT id FROM pricing_models WHERE code = 'license_amc');
        """
    )
    op.execute(
        """
        DELETE FROM pricing_models WHERE code = 'license_amc';
        """
    )
