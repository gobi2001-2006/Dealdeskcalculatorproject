# Final E2E Test Report

Date: 2026-11-12 · Branch `feature/ui-font` plus uncommitted recovery · **Not committed**

## Environment

- **Backend:** FastAPI on port 8010, using the local PostgreSQL 18 database `dealdesk_e2e_test` (migrated to `c5d6e7f8a9b0` and seeded).
- **Test-only data:** I added two customer tiers ("DEV Tier 2" and "DEV Tier 3") to the local E2E database, because the workbook specs need three tiers.
- **Frontend:** Vite on port 5183, proxied to 8010.
- **Neon:** not touched. No secrets were printed.

## Results

| Suite | Command | Result |
|---|---|---|
| Backend (incl. PG tests) | `pytest` with `TEST_DATABASE_URL` set to local PG | **749 passed, 0 failed** |
| Frontend unit | `npx vitest run` | **133 passed** (15 files) |
| Lint | `npx eslint .` | **0 problems** |
| Build | `npx vite build` | **OK** (chunk-size warning only) |
| Browser E2E (Playwright, Chrome) | `npx playwright test` | **14 passed, 0 skipped** |

E2E specs: `base-vs-discount` (3), `combinations` (1), `multi-region` (1), `pepm-country-discounts` (1), `smoke` (6 pages), `workbook-pricing` (2).

## Page 4 → 5 → 6 consistency (5-year US proposal, 10% country discount)

| Layer | Annual | Contract (FCV) |
|---|---|---|
| Page 4 (base, `/calculate/base`) | 1,160,000 | 5,800,000 |
| Page 5 snapshot (net) | 1,044,000 | 5,220,000 |
| Page 6 display | — | 5,220,000, "Subscription (5 years)" |
| Page 4 revisited | — | 5,800,000 (base unchanged) |

The database, the API snapshot and the UI agree.

## Fixed during this run

- **Leaking test data.** The new identity test left extra catalogue rows behind, which broke `test_read_catalogue_packs_and_masters` when the suite ran in order. I added cleanup to the identity test.
- **Earlier fixes:**
  - three locale and years test expectations;
  - six ESLint errors (pre-existing in `57c5319`);
  - the export test's `tier_fees` payload.

## Screenshots (`docs/e2e-screenshots/`)

- `08-ratecard-pepm-ess-and-non-ess.png`
- `09-page5-country-discount-india.png`
- `10-page6-country-discounts.png`
- `11-page4-base-pricing-5-years.png`
- `12-page5-net-after-10pct.png`
- `13-page6-net-5-years.png`

## Remaining items (need your decision)

1. **Apply 3 pending migrations to Neon** (`f2a3b4c5d6e7`, `a3b4c5d6e7f8`, `c5d6e7f8a9b0`). Take a backup first.
2. **Back up `587be2f`.** It exists only locally, so push it or commit this tree.
3. **Open business rules:** rounding, FX locking, approval thresholds, supersede, the hours/day default, and fixed-amount discounts.
