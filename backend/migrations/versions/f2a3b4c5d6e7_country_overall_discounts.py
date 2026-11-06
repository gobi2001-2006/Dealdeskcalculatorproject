"""country_overall_discounts

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-11-06 10:00:00.000000

Business decision (2026-11-06, docs/AUDIO_BUSINESS_RULE_DECISIONS.md): the overall discount
percentage is defined per country, not once per proposal.

Adds to proposal_countries (one row per country block of a proposal):
  - subscription_discount_pct / subscription_discount_reason
  - service_discount_pct / service_discount_reason
All nullable (NULL = no discount set for that country), with 0-100 range checks.
Additive only: no existing rows are changed, no table is created or dropped.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ("subscription_discount_pct", "NUMERIC(7, 4)", "Overall subscription discount % for this country (applied after line discounts)"),
    ("subscription_discount_reason", "TEXT", "Business justification for the overall subscription discount"),
    ("service_discount_pct", "NUMERIC(7, 4)", "Overall professional-services discount % for this country"),
    ("service_discount_reason", "TEXT", "Business justification for the overall services discount"),
)
CHECKS = (
    ("ck_proposal_countries_subscription_discount_pct_range",
     "subscription_discount_pct IS NULL OR (subscription_discount_pct >= 0 AND subscription_discount_pct <= 100)"),
    ("ck_proposal_countries_service_discount_pct_range",
     "service_discount_pct IS NULL OR (service_discount_pct >= 0 AND service_discount_pct <= 100)"),
)


def upgrade() -> None:
    for name, sql_type, comment in COLUMNS:
        op.execute(f"ALTER TABLE proposal_countries ADD COLUMN IF NOT EXISTS {name} {sql_type} NULL;")
        op.execute(f"COMMENT ON COLUMN proposal_countries.{name} IS '{comment}';")
    for name, expr in CHECKS:
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}') THEN
                    ALTER TABLE proposal_countries ADD CONSTRAINT {name} CHECK ({expr});
                END IF;
            END $$;
            """
        )


def downgrade() -> None:
    for name, _ in CHECKS:
        op.execute(f"ALTER TABLE proposal_countries DROP CONSTRAINT IF EXISTS {name};")
    for name, _, _ in reversed(COLUMNS):
        op.execute(f"ALTER TABLE proposal_countries DROP COLUMN IF EXISTS {name};")
