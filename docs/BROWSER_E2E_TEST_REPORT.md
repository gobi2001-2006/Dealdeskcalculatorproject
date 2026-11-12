# Browser E2E Test Report

Date: 2026-11-03 · Branch `feature/frontend-backend-integration` · Not committed

## Environment

| Item | Value |
|---|---|
| Frontend | Vite dev server `http://localhost:5173` (`VITE_DEALDESK_USER_ID=1`) |
| Backend | FastAPI/uvicorn `http://localhost:8000` |
| Database | Throwaway local PostgreSQL 18, `127.0.0.1:54329/dealdesk_e2e_test`; Alembic head `e1f2a3b4c5d6` plus DEV seed. **Neon was not used.** |
| Tiers | DEV Tier 1 (0–999), DEV Tier 2 (1,000–4,999), DEV Tier 3 (5,000+), created through the Masters API |
| Browsers | Claude in-app browser (interactive runs); Google Chrome via Playwright 1.55 (automated suite) |

Playwright 1.49 hangs while loading ESM specs on Node 24. The suite is pinned to 1.55, and no browser binaries are downloaded (it uses the installed Chrome).

## Screenshots (`docs/e2e-screenshots/`)

| File | What it shows |
|---|---|
| `01-ratecard-platform-BEFORE-merged-uom-tables.jpg` | **Bug:** a pack's ESS, non-ESS and Candidate tables merged into one row (non-ESS fees next to the "Candidate Inflow" UOM; warnings) |
| `02-ratecard-licence-BEFORE-mislabelled-no-amc.jpg` | **Bug:** licence fee shown as "AMC Rate", empty "Capex License Fee", no AMC % |
| `03-ratecard-platform-AFTER-row-per-uom-rate-per-tier.jpg` | Fixed: one row per UOM table, subscription rate per tier (3 / 4 / 5) |
| `04-ratecard-licence-AFTER-licence-and-amc.jpg` | Fixed: licence fee per user and AMC % per tier, UOM1 options only |
| `05-page4-calculation-licence-tier2.jpg` | Page 4: ₹10,800,000,000 (60 months) · year 1 ₹8,560,000,000 |
| `06-page5-discounts-recalculated.jpg` | Page 5 after 10% line + 5% overall: ₹9,747,000,000 |
| `07-page6-summary-after-reload.jpg` | Page 6 after a full reload: same figures |

## Page-by-page results

| Page | URL | Actions | Result |
|---|---|---|---|
| 1 Product Catalogue | `/catalogue` | Load; families, products, features from API | PASS: all `/api` 200, no console errors |
| 2 Pack Builder | `/packs` | Load packs with versions/items | PASS |
| 3 Rate Card & Masters | `/rate-cards` | Deployment/pricing filtering; platform grid edit; licence grid; Add Feature (licence) modal; validation | PASS after fixes F4–F6 (failed before; screenshots 01/02) |
| 4 Proposal Configurator | `/calculator` | New client, India/Tier 2/On-Premise/License + AMC/60 months/20,000; family; pack (UOM choice); feature; save (confirm dialog); calculate | PASS after fix F7 (before: pack rejected with "2 rate cards match … specify uom_id") |
| 5 Pricing & Discounts | `/pricing-discounts?proposalId=39` | 10% line discount + reason, 5% overall; Save & Recalculate | PASS (figures exact). Label fix F8. Reasons not persisted (see Failed scenarios) |
| 6 Proposal Summary | `/proposals?proposalId=39` | Lines, native currency, totals, reload | PASS: identical after reload |

The navigation links carry `?proposalId=` between pages 4, 5 and 6, and no state was lost while navigating.

## Deployment / pricing combinations

Source of truth: `deployment_pricing_options` (5 rows), which matches the combinations workbook.

| Deployment | Pricing models offered (browser) | Expected | Result |
|---|---|---|---|
| Shared Cloud | PEPM, Platform + Subscription | same | PASS |
| Private Cloud | PEPM, Platform + Subscription | same | PASS |
| On-Premise | License Fee + AMC | same | PASS (Rate Card and Configurator modal) |

Unsupported combinations are rejected by the backend with "Invalid combination" (unit tests). The UI no longer falls back to a name-based guess when the matrix is empty; it shows "No pricing model is configured for …". Automated check: `frontend/e2e/combinations.spec.js` compares the dropdown with the API for every deployment.

## Scenario detail: License + AMC, Tier 2, ESS (proposal #39)

| Field | Value |
|---|---|
| URL | `/calculator` → `/pricing-discounts?proposalId=39` → `/proposals?proposalId=39` |
| Deployment / pricing / country / tier | On-Premise / License Fee + AMC / India (INR) / DEV Tier 2 |
| UOM | Active Employees (with ESS) (chosen in the new "Rate schedule" select) |
| Lines | DEV TA Premium pack + DEV Standalone Add-on, 20,000 each, 60 months |
| DB rate (both) | unit_rate 200,000.0000 · amc_percentage 7.0000 · fixed_fee NULL · INR |
| Expected per line | 200,000 × 20,000 = 4,000,000,000 + 7% × 4,000,000,000 × 5 = 1,400,000,000 → **5,400,000,000** |
| API snapshot #35 | each line 5,400,000,000; proposal 10,800,000,000; year 1 8,560,000,000; `is_stale=false` |
| Browser (Pages 4/5/6) | ₹10,800,000,000.00 · ₹8,560,000,000.00 |
| After 10% line + 5% overall (snapshot #37) | Expected (4.86 bn + 5.4 bn) × 0.95 = **9,747,000,000**; year 1 (3.852 bn + 4.28 bn) × 0.95 = **7,725,400,000**. API, Page 5 and Page 6 all show these. |
| Status | **PASS**: DB, API, Pages 4–6 agree |

## Scenario detail: Rate Card grid edit (Platform + Subscription, Shared Cloud)

The ESS Tier 2 platform fee was changed in the browser from 200,000 to 210,000 and back. The database showed only row 4 changing, updated in place. Per-tier unit rates (3 / 4 / 5) and the non-ESS and Candidate rows were untouched. **PASS**

## Scenario detail: Add Feature (licence) modal

Inputs: DEV Standalone Add-on, ESS, licence 100,000 / 200,000 / 300,000, AMC 5 / 7 / 10.
- **Submitting without a UOM** was blocked with "Select the unit of measure this rate is charged per."
- **After choosing a UOM**, three rows were saved (fixed_fee NULL, INR). **PASS**

## Calculation scenarios via API

There are 42 checks: the workbook matrix, the PDF example, discounts, FX, durations, zero, negative and missing rates. The full table, with expected values, API results and database rows, is §4 of `PRICING_CALCULATION_AUDIT.md`. Result: **36 pass, 6 blocked by the PEPM non-ESS business conflict**. Multi-region (#36) failed in the audit and passes after the fix below.

## Automated browser suite (Playwright, `frontend/e2e/`)

Run with `npm run test:e2e` against the local stack.

| Spec | Tests | Result |
|---|---|---|
| `smoke.spec.js` | 6 pages: no console errors, no failed `/api` requests | 6 PASS |
| `combinations.spec.js` | Dropdown equals `deployment_pricing_options` for each deployment | 1 PASS |
| `workbook-pricing.spec.js` | Platform ESS Tier 2 (5,800,000) and Licence non-ESS Tier 3 (2,250,000,000): grid values on Page 3, API total, Page 6 total | 2 PASS |
| `multi-region.spec.js` | India + United States: 167,440 USD in the API, both regions on Page 6, the US rate on Page 5 | 1 PASS |

Final run: 10/10 passed.

## Scenario detail: multi-region proposal (proposal #44, after the fix)

India (primary, INR), United States (USD) and Germany (EUR), reporting in USD. Built on Page 4, with one product per country and services in India and the US.

| Step | Result |
|---|---|
| Page 4 save | Lines and service lines stored with their own country block (`proposal_country_id`): India, United States, Germany |
| Page 5, United States | "Additional country" badge, "Priced with United States's rate card and currency", rate `$5.00 / Candidate Inflow / mo + $100,000.00 platform / yr`, line discount editable |
| Discounts: 10% on the US line, 5% overall subscription | Saved; database `discount_pct` = 10 on the US line only |
| Backend snapshot | `DEV_TA_MAX@IN` 685,000 INR → 8,220 USD; `DEV_TA_MAX@US` 139,200 USD; `DEV_TA_MAX@DE` 70,300 EUR → 75,924 USD; total **223,344 USD** |
| Page 6 | Three "Delivered from …" groups, each in its own currency with its FX rate (INR/USD 0.012, EUR/USD 1.08); Grand Total **$223,344.00** |
| Reload Page 5 | US 10% and overall 5% restored; India and Germany lines undiscounted |

Before the fix this scenario failed: all lines were priced with India's rates and the same pack couldn't be added for two countries.

## Failed or blocked scenarios

| Scenario | Status | Root cause | Recommendation |
|---|---|---|---|
| PEPM, Active Employees (non-ESS), 6 cases | **BLOCKED** | The combinations workbook locks PEPM to ESS; the calculation workbook prices non-ESS | Business decision (audit §7 Q2) |
| Discount justifications preserved | **FAIL** | Reason fields are "kept on screen only" and lost on reload | Store reasons (column or approval record) |
| Discount limits / approvals | Not testable | The UI shows "Demo settings — not enforced"; no enforcement exists | Business thresholds needed; don't invent them |
| Fixed-amount discounts | Not applicable | Only percentage discounts exist (0–100, enforced) | n/a |

## Regression test results (final run)

| Suite | Result |
|---|---|
| Backend pytest including PostgreSQL integration (`TEST_DATABASE_URL` local) | **692 passed, 0 skipped, 0 failed** |
| Frontend Vitest | **114 passed** |
| ESLint | clean |
| Production build (`vite build`) | OK |
| Playwright (Chrome) | **10 passed** |
