"""role_description

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-11-17 10:00:00.000000

Adds roles.description (nullable): role descriptions, entered by the Admin or the approved setup
(`python -m scripts.setup_admin_defaults --apply`).

It is a separate migration because databases that already applied an earlier version of
d6e7f8a9b0c1 (Neon) never received the column. IF NOT EXISTS keeps it safe on databases where an
interim d6e7f8a9b0c1 already added it. Additive only; no row is changed.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE roles ADD COLUMN IF NOT EXISTS description VARCHAR(255)")


def downgrade() -> None:
    op.execute("ALTER TABLE roles DROP COLUMN IF EXISTS description")
