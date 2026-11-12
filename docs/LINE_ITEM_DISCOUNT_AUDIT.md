# Line-Item Discount Audit

## Where it lives

- **Database fields:**
  - Subscription lines: `proposal_line_items.discount_pct`.
  - Service lines: `proposal_service_lines.discount_pct`.
- **Where it is edited:** on Page 5 (`PricingEditor.jsx`). Page 4 never applies discounts, because `/calculate/base` ignores them.
- **Engine:** `item_discount_amount = subscription_before_discount × pct / 100`, applied before the country overall discount:
  ```
  after_line    = base × (1 − line%)
  after_overall = after_line × (1 − country_overall%)
  ```

## Rules confirmed by tests

| Rule | Test |
|---|---|
| Must be 0–100. Out-of-range or negative values are **rejected (422/400), not clamped** | `test_invalid_discounts_are_rejected_not_clamped` |
| Line % and overall % compound and match a hand calculation | `test_discount_levels_and_totals_match_hand_calculation` |
| A country overall % is applied once, never also as a line % | E2E `base-vs-discount` (`item_discount_pct == 0` when only the overall is set) |
| Snapshot and export show `Line discount N% = −amount` | `ProposalSummaryPage.test.jsx`, `test_proposal_export.py` |

## Limitation

The backend supports **percentage only**. A fixed-amount line discount is not modelled. If you need one, it is a schema decision for you to make; I did not invent it.
