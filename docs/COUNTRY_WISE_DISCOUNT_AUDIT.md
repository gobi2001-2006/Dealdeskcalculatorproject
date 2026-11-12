# Country-Wise Overall Discount Audit

## Model

Each country block is a row in `proposal_countries` (migration `f2a3b4c5d6e7`). It carries its own:

- `subscription_discount_pct` and `subscription_discount_reason`
- `service_discount_pct` and `service_discount_reason`

There is no proposal-level (global) discount.

## Engine rules (`_overall_discount()` in `pricing_engine.py`)

1. **The country's value is the source of truth.**
2. **The request value is a fallback only.** A value in the request is used only when the country has none. If both are set, the call fails with `InvalidDiscountError`, which prevents a double discount.
3. **The snapshot records where each discount came from.** It stores `*_discount_source` (`country` / `request` / `none`) and `*_reason` per product block.
4. **Each block is priced in its own native currency and then converted with its own FX rate.** One country's discount never touches another country's lines.

## Verification

| Check | Evidence | Result |
|---|---|---|
| India 10% vs US none on one proposal, priced independently | E2E `pepm-country-discounts.spec.js`, screenshots 09 and 10 | ✅ |
| Two proposals in two tabs never share discounts; a reload restores each one's own value | E2E `base-vs-discount` test 2 | ✅ |
| Persisted and returned by `GET /proposals/:id` | API assertions in E2E | ✅ |
| Appears in the snapshot and in the DOCX/PDF export | `test_proposal_export.py`, `ProposalSummaryPage.test.jsx` | ✅ |
| Double discount (country + request) rejected | backend country-discount tests | ✅ |

## Open business rules (not invented)

- Whether a reason is mandatory above a threshold.
- The approval thresholds (the `approval_thresholds` table is empty).
