# Pricing Edge-Case Test Report

Date: 2026-11-06 · Branch `feature/frontend-backend-integration` · Not committed

**Environment:** throwaway local PostgreSQL `127.0.0.1:54329`, Alembic head `c5d6e7f8a9b0`.

**Browser stack:** backend `:8010` and frontend `:5183`, on separate ports because port 8000 was occupied by another, probably Neon-backed, server. **Neon was not written to.** Proposal 31 was only read, in a read-only session.

## 1. Results (final runs)

| Suite | Result |
|---|---|
| Backend pytest including PostgreSQL integration | **720 passed** (was 712) |
| Frontend Vitest | **124 passed** (was 120) |
| ESLint / production build | clean / OK |
| Playwright (Chrome) | **14 passed** (3 new in `base-vs-discount.spec.js`) |

## 2. Discount edge cases

| Case | Expected | Result | Where |
|---|---|---|---|
| No discount configured | Net = base (5,800,000) | PASS | Playwright scenario B |
| 0% | Stored as "no discount" (NULL); net = base | PASS | `PricingPage` save logic |
| 100% | Allowed (0–100 rule); net 0, base kept, never negative | PASS | `test_hundred_percent_discount_floors_at_zero_never_negative` |
| Above 100% / negative | 422 (API), database check, UI message | PASS | `test_country_discount_must_be_between_0_and_100`, PG test |
| Above an approval limit | Not enforced: `approval_thresholds` is empty and no limits are invented | Documented | Open question |
| Fixed-amount discounts | Not supported: the 2026-11-06 decision says percentage | Documented | — |
| Missing justification | Allowed (optional), stored as NULL; proposal 31 has none | Documented | Open question |
| Discount changed after a snapshot | Snapshot flagged outdated | PASS | `test_changing_a_country_discount_marks_the_saved_calculation_stale` |
| Applied twice | Request + stored country discount → 400; line then country each applied once | PASS | `test_request_discount_cannot_stack_on_a_country_discount`, `test_line_discount_then_country_discount_are_applied_once_each` |
| Subscription % touching services, or the reverse | Never | PASS | `test_subscription_and_service_discounts_never_cross` |
| Per-service-line discount | Rejected (one services % per country) | PASS | existing `test_audit_fixes_pg` |

## 3. Contract duration

See `CONTRACT_DURATION_YEARS_IMPLEMENTATION.md` §5. All cases pass: 1 / 5 years, 0, negative, decimal, > 120 months, stored months, and changes after a snapshot or after discounts.

## 4. Pricing edge cases (existing tests, all passing)

| Case | Result | Test |
|---|---|---|
| Missing UOM / wrong UOM | Clear 4xx message | `test_wrong_unit_of_measure_blocks_calculation_with_helpful_message` |
| Inactive UOM | Not offered (allowed list = active UOMs) | `list_allowed_uoms_for_pricing_model` tests |
| Missing rate card | 422, never 0 | `test_calculation_rejects_missing_rate_and_missing_tier` |
| Zero quantity | Only the platform fee | audit scenario 37 |
| Negative quantity | 422 | audit scenario 39 |
| Missing platform fee / subscription rate | Error naming the missing component | `test_formula_does_not_depend_on_pricing_model_names` and related |
| Monthly, annual and one-time bases | Formula by billing basis | `test_workbook_pricing.py` (Platform, PEPM ESS/non-ESS, Licence + AMC) |
| Multiple products, countries, currencies | Each priced in its own country and currency, consolidated with saved FX | `test_multi_region_pricing.py`, Playwright multi-region |
| Different tiers | Tier 1/2/3 workbook matrix | `test_workbook_pricing.py` |

## 5. Persistence edge cases

| Case | Result |
|---|---|
| Browser refresh | Discounts, justifications and duration restored from the database (Playwright) |
| Direct navigation (`?proposalId=`) | Each page loads that proposal's own data |
| Switching proposals / multiple tabs | No leakage (`DISCOUNT_SOURCE_AND_ISOLATION_AUDIT.md` §3) |
| API failure while loading Page 5 | Save is blocked; previously another proposal's discounts could be written (fixed) |
| API failure while saving | Error toast; partial PATCHes are re-checked on the next save (each save diffs against the database) |
| Duplicate save requests | Button disabled while saving |
| Stale snapshot | "Outdated calculation" banner (fingerprint, saved term) |
| Concurrent updates | Last write wins; no optimistic locking (open point) |

## 6. Screenshots (`docs/e2e-screenshots/`)

| File | What it shows |
|---|---|
| `11-page4-base-pricing-5-years.png` | Page 4 dialog: "FULL CONTRACT VALUE (USD, 5 YEARS)" $5,800,000.00, Year 1 $1,160,000.00, "Base pricing — before discounts" |
| `12-page5-net-after-10pct.png` | Page 5 after saving the 10% US discount |
| `13-page6-net-5-years.png` | Page 6: net $5,220,000.00, "Subscription (5 years)" |
