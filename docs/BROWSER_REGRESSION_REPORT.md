# Browser Regression Report: Country Discounts and PEPM UOMs

Date: 2026-11-06 · Branch `feature/frontend-backend-integration` · Not committed

## Environment

| Item | Value |
|---|---|
| Frontend | Vite dev server `http://localhost:5173` (`VITE_DEALDESK_USER_ID=1`) |
| Backend | uvicorn `http://localhost:8000` with `DATABASE_URL` set to the local test database (overrides `.env`) |
| Database | Throwaway local PostgreSQL 18, `127.0.0.1:54329/dealdesk_e2e_test`, Alembic head `a3b4c5d6e7f8`. **Neon was not used.** |
| Browsers | Claude in-app browser (manual run) and Google Chrome via Playwright 1.55 (automated) |
| Launch configs | `.claude/launch.json` (`backend-e2e-local`, `frontend-dev`), recreated because the file was missing |

## Scenarios

| # | Scenario | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | Old proposal #44 opened on Page 5 | Each country shows the % from its last calculation, since nothing is stored yet | IN 5, US 5, DE 5 | PASS |
| 2 | Different % per country (IN 10 / services 20, US 5, DE none) with justifications | Saved per country; only changed countries are PATCHed | `PATCH countries/45`, `PATCH countries/46`, `POST calculate`, all 200 | PASS |
| 3 | Backend totals | IN 634,800 INR → 7,617.60; US 139,200; DE 74,000 EUR → 79,920; total 226,737.60 USD | Snapshot #48: identical | PASS |
| 4 | Database | `proposal_countries` IN 10/20 + reasons, US 5 + reason, DE NULL | Identical | PASS |
| 5 | Page 6 with Show Discounts | Country-labelled discount rows with justifications; Grand Total $226,737.60 | Identical | PASS |
| 6 | Reload Page 5 | Values and justifications restored per country | Identical | PASS |
| 7 | PEPM allowed UOMs | ESS and non-ESS | API `[employee, active_employees_non_ess]` | PASS |
| 8 | PEPM Tier 1/2/3 rates per UOM on Page 3 | Two rows, ESS 3/4/5 and non-ESS 1/2/3 | Identical (screenshot 08) | PASS |
| 9 | Two-country PEPM proposal: India ESS 20,000, US non-ESS 15,000, Tier 2, 24 months, India 10%, US 5% | India 1,920,000 INR (rate 4) → 1,728,000 → 20,736 USD; US 1,080,000 (rate 3) → 1,026,000; total 1,046,736 USD | API, Page 5 and Page 6 identical (screenshots 09, 10) | PASS |
| 10 | Page 4 for that proposal | India offers ESS and non-ESS; US offers non-ESS; quantity label follows the UOM | Identical | PASS |
| 11 | Page 5 approval card | Values from `approval_thresholds`; none invented | Table empty, so "Not configured" ×4, labelled "Not enforced yet" | PASS |
| 12 | Console errors and failed `/api` requests, all 6 pages | none | none (manual run and Playwright smoke suite) | PASS |

## Backend response comparison (scenario 3, snapshot #48)

```
DEV_TA_MAX@IN INR sub% 10 (country) srv% 20 native 634800 USD 7617.6   India volume commitment / Bundled rollout
DEV_TA_MAX@US USD sub% 5  (country) srv% 0  native 139200 USD 139200   US launch partner
DEV_TA_MAX@DE EUR sub% 0            srv% 0  native  74000 USD 79920
total_proposal_reporting_currency 226737.6
```

## Screenshots (`docs/e2e-screenshots/`)

| File | What it shows |
|---|---|
| `08-ratecard-pepm-ess-and-non-ess.png` | Page 3: PEPM rows for with-ESS and non-ESS, each with its own tier rates |
| `09-page5-country-discount-india.png` | Page 5: India's own overall discount and justification |
| `10-page6-country-discounts.png` | Page 6: per-country discount rows and the consolidated total $1,046,736.00 |

## Automated results (final run)

| Suite | Result |
|---|---|
| Backend pytest including PostgreSQL integration (local `TEST_DATABASE_URL`) | **712 passed**, 0 failed (was 692) |
| Frontend Vitest | **120 passed** (was 114) |
| ESLint | clean |
| Production build (`vite build`) | OK |
| Playwright (Chrome) | **11 passed**, including the new `pepm-country-discounts.spec.js` |

New tests:
- `test_country_overall_discounts.py` (6)
- `test_country_overall_discounts_pg.py` (1)
- `test_approval_thresholds_api.py` (2)
- PEPM tests in `test_workbook_pricing.py` (non-ESS ×6, allowed list, invalid UOM, rate per UOM)
- `test_pg_pepm` for ESS and non-ESS
- `PricingPage.test.jsx` (3 new, 1 rewritten)
- `countryOverallDiscounts.test.jsx` (3)
- `e2e/pepm-country-discounts.spec.js`

## Hardcoded value check (delta since `HARDCODED_VALUE_AUDIT.md`)

| Finding | Class | Action |
|---|---|---|
| `ProposalContext.jsx` and `ApprovalPoliciesCard.jsx`: approval thresholds 30% / 15% / 20% | 4. Business configuration hard-coded (invented) | **Removed.** Page 5 reads `GET /api/masters/approval-thresholds` (active, in-date rows of `approval_thresholds`) and shows "Not configured" when none exist |
| PEPM locked to ESS (seed + data) | 4. Business configuration | Now data only: lock cleared by migration `a3b4c5d6e7f8`; seed updated |
| One proposal-wide overall discount copied to every product | 4. Business rule in the UI | Per-country values stored in `proposal_countries` |
| `BILLING_PERIODS_PER_YEAR` (monthly 12, annual 1), `/ 12` months per year, `/ 100` | 1. Technical constant | Keep |
| 12-month default term when the API call sends none | 4. Business default (open question) | Kept and documented; Page 4 always sends a term |
| UOM/model codes in migrations and the dev seed | 5. Reference / dev data | Keep (matched by code, never id) |
| Ids and amounts in tests and fixtures | 3. Test fixture | Keep |

No hard-coded UOM, pricing-model, country, tier or currency ids or names were found in `frontend/src` or `backend/app` outside comments.

## Pending for Neon (not applied; needs explicit approval)

1. `f2a3b4c5d6e7`: country discount columns.
2. `a3b4c5d6e7f8`: PEPM allows ESS and non-ESS.

Both apply on top of `e1f2a3b4c5d6`.
