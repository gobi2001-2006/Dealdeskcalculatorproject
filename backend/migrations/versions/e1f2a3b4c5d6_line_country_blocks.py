"""line_country_blocks

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-11-03 18:00:00.000000

Multi-region proposals (Proposal Pricing Model PDF, section 3): each subscription line and each
service line can belong to one country block of its proposal, and is priced with that block's
country, deployment model and pricing model (and therefore that country's rate card and currency).

Adds a nullable proposal_country_id to proposal_line_items and proposal_service_lines.
NULL keeps the previous behaviour (the proposal's primary country block), so existing proposals
and snapshots are unchanged. Additive only; no data is modified.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("proposal_line_items", "proposal_service_lines")


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS proposal_country_id BIGINT NULL;")
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_{table}_proposal_country') THEN
                    ALTER TABLE {table}
                    ADD CONSTRAINT fk_{table}_proposal_country
                    FOREIGN KEY (proposal_country_id) REFERENCES proposal_countries(id) ON DELETE RESTRICT;
                END IF;
            END $$;
            """
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_proposal_country_id ON {table} (proposal_country_id);")
        op.execute(
            f"COMMENT ON COLUMN {table}.proposal_country_id IS "
            "'Country block that prices this line (NULL = the proposal''s primary country block)';"
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_proposal_country_id;")
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS fk_{table}_proposal_country;")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS proposal_country_id;")
