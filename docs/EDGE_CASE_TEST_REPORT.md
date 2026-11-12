# Edge-Case Test Report

All cases ran against a throwaway local PostgreSQL database (`dealdesk_test` / `dealdesk_e2e_test` on port 54329). Neon was never used.

| # | Edge case | Expected | Where tested | Result |
|---|---|---|---|---|
| 1 | Duration 0 years | Rejected: "at least 1 year" | `UnitComprehensive.test.jsx` | ✅ |
| 2 | Duration 1.5 years | Rejected: "whole number of years" | `UnitComprehensive.test.jsx` | ✅ |
| 3 | Durations of 1, 2, 3 and 5 years | FCV = annual × years | `test_base_pricing_and_contract_term.py`, E2E | ✅ |
| 4 | Request term contradicts the stored term | 400 | `test_base_pricing_and_contract_term.py` | ✅ |
| 5 | Duration changed after a calculation | Snapshot marked stale | E2E `base-vs-discount` test 3 | ✅ |
| 6 | Discount below 0 or above 100 | Rejected, not clamped | `test_invalid_discounts_are_rejected_not_clamped` | ✅ |
| 7 | Country discount and request discount both set | `InvalidDiscountError` | backend country-discount tests | ✅ |
| 8 | Proposal with no discount | Net = base | E2E test 2 (5,800,000 = 5,800,000) | ✅ |
| 9 | Two tabs, two proposals | No discount bleed | E2E test 2 | ✅ |
| 10 | India (INR) + US (USD) blocks | Own currencies, consolidated in USD | E2E `multi-region` | ✅ |
| 11 | Mixed native currencies within one product | Rejected | `test_mixed_native_currencies_in_one_product_are_rejected` | ✅ |
| 12 | Wrong UOM | Blocked with a helpful message | `test_wrong_unit_of_measure_blocks_calculation…` | ✅ |
| 13 | Never calculated | Page 6 shows "Pending calculation", never $0.00 | `ProposalSummaryPage.test.jsx` | ✅ |
| 14 | Zero commercial items | Export blocked with a message | `ProposalSummaryPage.test.jsx` | ✅ |
| 15 | Pack with features from two products | Deterministic pack identity | `test_pack_product_identity_is_deterministic` | ✅ |
| 16 | PEPM ESS vs non-ESS | Each priced at its own rate | E2E `pepm-country-discounts` | ✅ |
| 17 | Workbook tiers 1–3 (Platform + Subscription, Licence + AMC) | Match the hand-worked totals | E2E `workbook-pricing` | ✅ |
| 18 | Viewer locale en-US vs en-IN | Tests are locale-independent | `ProposalSummaryPage.test.jsx`, `ProposalConfiguratorPage.test.jsx` | ✅ |

**Not covered, because the business rules are undecided:** rounding policy, FX locking at quote time, discount approval thresholds, and supersede/versioning of sent proposals.
