"""Add pack_items.is_required (model column that had no migration)

The PackItem ORM model declares `is_required` (commit 7dafbce), but no migration
created it, so every query on pack_items failed against a database built from the
migration chain ("column pack_items.is_required does not exist").

IF NOT EXISTS keeps the upgrade safe on a database where the column was added by hand.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-26
"""

from typing import Sequence, Union

from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE pack_items "
        "ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true"
    )
    op.execute(
        "COMMENT ON COLUMN pack_items.is_required IS "
        "'Whether this feature is required (mandatory) or optional in this pack version'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE pack_items DROP COLUMN IF EXISTS is_required")
