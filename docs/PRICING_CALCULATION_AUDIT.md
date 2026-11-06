# Pricing Calculation Audit

Date: 2026-11-03 · Branch `feature/frontend-backend-integration` · Not committed · Local test database only (Neon untouched)

**References read in full:**
- `Proposal_Pricing_Model_Calculation Explained.pdf`: 4 pages; text extracted and each page rendered and checked.
- `calculation explained.xlsx`: one sheet; every cell, formula and cached value dumped.
- `deployment and pricing model combinations (2).xlsx`: one sheet; every cell read.

## 1. Summary

**Results**
- The backend calculation matches the independently worked workbook and PDF examples in every case the system can price:
  - Platform + Subscription: 12 cases (ESS and non-ESS, Shared and Private Cloud, 3 tiers each).
  - PEPM with ESS: 6 cases.
  - License + AMC: 6 cases.
  - PDF worked example: **7,33,000**.
  - Also checked: discount stacking, FX consolidation, durations, zero quantity and invalid input.
- Database, API and browser figures agree for every scenario run in the browser (see `BROWSER_E2E_TEST_REPORT.md`).

**Defects found and fixed** (all have regression tests):
1. **License + AMC rates could not be entered correctly from the UI.**
   - The per-user licence fee showed under a column labelled "AMC Rate".
   - The "Capex License Fee" column fed a fallback field.
   - There was no AMC % input at all.
2. **The engine chose the License formula by name** (`"license" in code and "amc" in code`). It also guessed the licence fee as "unit rate, else fixed fee".
3. **The Rate Card UI merged a pack's UOM tables.** ESS, non-ESS and other UOMs were collapsed into one row, so the workbook's separate ESS and non-ESS fee tables showed wrong numbers. They could not be edited.
4. **The Rate Card UI could not hold a different subscription rate per tier**, which the workbook requires (3 / 4 / 5).
5. **The Proposal Configurator could not price a pack with more than one UOM table.** The rate lookup returned 409 "specify uom_id" and the page offered no choice.
6. **Page 5 labelled every rate "/ unit / mo"**, including one-time licence fees.
7. **Hard-coded business fallbacks in the engine:**
   - "USD" and "INR" currency codes.
   - 8 working hours per day.
   - PEPM's UOM picked by the code `"employee"` in two places.

**Fixed after the audit:** multi-region pricing (PDF §3). Every line used to be priced with the primary country's rates and currency; lines now belong to a country block and each region is priced in its own rate card and currency (see §8).

**Not fixed** (needs a business decision, see §7):
- **PEPM for Active Employees (non-ESS):** the combinations workbook forbids it; the calculation workbook prices it.
- **Discount justifications** are not stored.

## 2. Formulas (as implemented, all in the backend)

The engine reads the pricing model's **components** (`has_fixed_component`, `has_unit_component`) and its **billing bases**:
- `fixed_fee_basis`: `annual` or `one_time`.
- `unit_rate_basis`: `monthly`, `annual` or `one_time`; the last value is new.

It never reads the model's name. *Years* = contract months / 12.

| Component | Basis | Contract figure | Year-1 (annual) figure |
|---|---|---|---|
| Fixed (platform) fee of the customer's tier | annual | fee × years | fee |
| | one_time | fee | fee |
| Unit rate × quantity | monthly | rate × qty × months | rate × qty × 12 |
| | annual | rate × qty × years | rate × qty |
| | one_time (licence) | rate × qty, once | rate × qty |
| AMC (only with a one-time unit rate) | % of the one-time total, per year | licence total × AMC% × years | licence total × AMC% |

These are configured in master data, and the workbook cases map onto them like this:
- **PEPM:** unit monthly; UOM locked to Active Employees (with ESS). Total = rate × employees × 12 × years.
- **Platform + Subscription:** fixed annual + unit monthly. Total = fee × years + rate × subscribers × 12 × years.
- **License Fee + AMC:** unit one_time, no fixed fee. Total = fee/user × users + (licence total × AMC%) × years.

Discounts:
- Line discount on (fixed + unit) of a pack or feature.
- Then one overall subscription discount per product subtotal.
- Then one overall services discount per product.
- Individual service-line discounts are rejected, as in PDF §4.

Services: day rate = hourly rate × the service rate's standard hours per day; line = man-days × day rate.

FX: 1 unit of the native currency = `rate` units of the reporting currency. The engine uses the newest rate effective on the calculation date; an inverted rate is used only if no direct one exists.

A missing fixed fee, unit rate or AMC % for the customer's tier is an error, never 0. AMC % is stored on a 0–100 scale: 5 means 5%, and it is divided by 100 exactly once.

## 3. Reference discrepancies

| # | Where | Finding | Independent result | Needs business owner? |
|---|---|---|---|---|
| D1 | Workbook `D12:E12` (ESS Platform + Subscription) | Tier 1 total `=C10+C5` (5-year platform + 5-year subscription). Tier 2/3 use `=D3+D9` (**one** year of platform + **one** year of subscription). Cached 1,160,000 / 2,100,000. | 5,800,000 / 10,500,000 (consistent with Tier 1); one-year figures are 1,160,000 / 2,100,000 | Confirm the 5-year formula is intended (we implement it). |
| D2 | Workbook `D25:E25` (non-ESS) | Same inconsistency. Cached 1,010,000 / 1,900,000. | 5,050,000 / 9,500,000 | Same |
| D3 | PDF §1 vs workbook | PDF defines the **annual** subscription (platform + rate × volume × 12). The workbook totals the **whole contract**. | Both are reported: `item_subscription_before_discount` (annual) and `contract_subscription_before_discount` (contract) | No conflict; confirm which one the proposal headline should show. |
| D4 | Combinations sheet B11 vs workbook rows 63–70 | "For PEPM the UOM shall always be Active Employees (with ESS)", but the workbook has a non-ESS PEPM table (3/4/5 → 1.8M / 4.8M / 9.0M). | Non-ESS PEPM would equal the ESS totals with these inputs | **Yes**: we keep the lock (combinations sheet). Non-ESS PEPM rates are rejected. |
| D5 | Workbook PEPM `C60` | `=C57*C58*12*5`: duration typed as 5, not the duration cell `C56`. | Same result here (C56 = 5) | Formula hygiene only |
| D6 | Workbook `D47` | Cached `56000000.000000007` (float rounding of 7%) | 56,000,000 exactly (engine uses Decimal) | No |
| D7 | Workbook vs earlier UI brief | Workbook: subscription rate **per tier** (3/4/5). Earlier screenshot: **one** subscription rate per pack. | UI now supports both: one rate, or "Set rate per tier". | Confirm whether per-tier is the norm. |
| D8 | Workbook UOM notes vs PDF example | Workbook: platform/licence fees are defined per **UOM1** (ESS / non-ESS); subscriptions are counted in a product **UOM2**. PDF example prices the platform pack per candidate (a UOM2) with no UOM1. | Engine prices either. The rate-card UOM is the fee table's UOM, and both kinds are allowed for Platform + Subscription. | **Yes**: should a Platform + Subscription rate carry two UOMs (UOM1 fee table and UOM2 subscription unit)? That needs one nullable column `rate_cards.subscription_uom_id` (proposal; not built). |
| D9 | PDF §3 table vs §5 example | TA India shows ₹14,25,000 in §3 but ₹7,33,000 in §5 (different illustrative deals). Implied FX: 1 INR ≈ 0.012 USD, 1 EUR ≈ 1.0798 USD. | Illustrative only; FX comes from the FX master | No |
| D10 | Workbook UOM2 list | 14 UOM2 names, including "… Monthly Rental" / "Annual Rental" variants. Seven exist in the database; the rental variants were **not** seeded. | n/a | Confirm the rental UOMs, then add them in Master Data (no code change). |

## 4. Verification results (live local API, after fixes)

All rates were configured in the database and every proposal priced through `POST /api/proposals/{id}/calculate`. "Expected" values are the workbook or PDF inputs worked out by hand, not the workbook's cached results.

Harness run `ED528`: 35 pass of 42 checks (6 of the 7 others are the PEPM non-ESS business conflict).

| # | Case | Expected (independent) | API result | DB rate (fixed / unit / AMC %) | Status |
|---|---|---|---|---|---|
| 1 | platform · shared_cloud · ESS · DEV Tier 1 | contract_platform_fee=500,000; contract_consumption_fee=1,800,000; contract_total=2,300,000; annual_total_pdf=460,000 | contract_platform_fee=500,000; contract_consumption_fee=1,800,000; contract_total=2,300,000; annual_total_pdf=460,000 | 100,000 / 3 / — | PASS |
| 2 | platform · shared_cloud · ESS · DEV Tier 2 | contract_platform_fee=1,000,000; contract_consumption_fee=4,800,000; contract_total=5,800,000; annual_total_pdf=1,160,000 | contract_platform_fee=1,000,000; contract_consumption_fee=4,800,000; contract_total=5,800,000; annual_total_pdf=1,160,000 | 200,000 / 4 / — | PASS |
| 3 | platform · shared_cloud · ESS · DEV Tier 3 | contract_platform_fee=1,500,000; contract_consumption_fee=9,000,000; contract_total=10,500,000; annual_total_pdf=2,100,000 | contract_platform_fee=1,500,000; contract_consumption_fee=9,000,000; contract_total=10,500,000; annual_total_pdf=2,100,000 | 300,000 / 5 / — | PASS |
| 4 | platform · shared_cloud · non-ESS · DEV Tier 1 | contract_platform_fee=125,000; contract_consumption_fee=1,800,000; contract_total=1,925,000; annual_total_pdf=385,000 | contract_platform_fee=125,000; contract_consumption_fee=1,800,000; contract_total=1,925,000; annual_total_pdf=385,000 | 25,000 / 3 / — | PASS |
| 5 | platform · shared_cloud · non-ESS · DEV Tier 2 | contract_platform_fee=250,000; contract_consumption_fee=4,800,000; contract_total=5,050,000; annual_total_pdf=1,010,000 | contract_platform_fee=250,000; contract_consumption_fee=4,800,000; contract_total=5,050,000; annual_total_pdf=1,010,000 | 50,000 / 4 / — | PASS |
| 6 | platform · shared_cloud · non-ESS · DEV Tier 3 | contract_platform_fee=500,000; contract_consumption_fee=9,000,000; contract_total=9,500,000; annual_total_pdf=1,900,000 | contract_platform_fee=500,000; contract_consumption_fee=9,000,000; contract_total=9,500,000; annual_total_pdf=1,900,000 | 100,000 / 5 / — | PASS |
| 7 | platform · private_cloud · ESS · DEV Tier 1 | contract_platform_fee=500,000; contract_consumption_fee=1,800,000; contract_total=2,300,000; annual_total_pdf=460,000 | contract_platform_fee=500,000; contract_consumption_fee=1,800,000; contract_total=2,300,000; annual_total_pdf=460,000 | 100,000 / 3 / — | PASS |
| 8 | platform · private_cloud · ESS · DEV Tier 2 | contract_platform_fee=1,000,000; contract_consumption_fee=4,800,000; contract_total=5,800,000; annual_total_pdf=1,160,000 | contract_platform_fee=1,000,000; contract_consumption_fee=4,800,000; contract_total=5,800,000; annual_total_pdf=1,160,000 | 200,000 / 4 / — | PASS |
| 9 | platform · private_cloud · ESS · DEV Tier 3 | contract_platform_fee=1,500,000; contract_consumption_fee=9,000,000; contract_total=10,500,000; annual_total_pdf=2,100,000 | contract_platform_fee=1,500,000; contract_consumption_fee=9,000,000; contract_total=10,500,000; annual_total_pdf=2,100,000 | 300,000 / 5 / — | PASS |
| 10 | platform · private_cloud · non-ESS · DEV Tier 1 | contract_platform_fee=125,000; contract_consumption_fee=1,800,000; contract_total=1,925,000; annual_total_pdf=385,000 | contract_platform_fee=125,000; contract_consumption_fee=1,800,000; contract_total=1,925,000; annual_total_pdf=385,000 | 25,000 / 3 / — | PASS |
| 11 | platform · private_cloud · non-ESS · DEV Tier 2 | contract_platform_fee=250,000; contract_consumption_fee=4,800,000; contract_total=5,050,000; annual_total_pdf=1,010,000 | contract_platform_fee=250,000; contract_consumption_fee=4,800,000; contract_total=5,050,000; annual_total_pdf=1,010,000 | 50,000 / 4 / — | PASS |
| 12 | platform · private_cloud · non-ESS · DEV Tier 3 | contract_platform_fee=500,000; contract_consumption_fee=9,000,000; contract_total=9,500,000; annual_total_pdf=1,900,000 | contract_platform_fee=500,000; contract_consumption_fee=9,000,000; contract_total=9,500,000; annual_total_pdf=1,900,000 | 100,000 / 5 / — | PASS |
| 13 | pepm · shared_cloud · ESS · DEV Tier 1 | contract_total=1,800,000 | contract_total=1,800,000 | — / 3 / — | PASS |
| 14 | pepm · shared_cloud · ESS · DEV Tier 2 | contract_total=4,800,000 | contract_total=4,800,000 | — / 4 / — | PASS |
| 15 | pepm · shared_cloud · ESS · DEV Tier 3 | contract_total=9,000,000 | contract_total=9,000,000 | — / 5 / — | PASS |
| 16 | pepm · shared_cloud · non-ESS · DEV Tier 1 | contract_total=1,800,000 | HTTP 422: {'detail': "Rate card lookup failed: No saved rate card exists for Shared Cloud … | — | BLOCKED (business conflict) |
| 17 | pepm · shared_cloud · non-ESS · DEV Tier 2 | contract_total=4,800,000 | HTTP 422: {'detail': "Rate card lookup failed: No saved rate card exists for Shared Cloud … | — | BLOCKED (business conflict) |
| 18 | pepm · shared_cloud · non-ESS · DEV Tier 3 | contract_total=9,000,000 | HTTP 422: {'detail': "Rate card lookup failed: No saved rate card exists for Shared Cloud … | — | BLOCKED (business conflict) |
| 19 | pepm · private_cloud · ESS · DEV Tier 1 | contract_total=1,800,000 | contract_total=1,800,000 | — / 3 / — | PASS |
| 20 | pepm · private_cloud · ESS · DEV Tier 2 | contract_total=4,800,000 | contract_total=4,800,000 | — / 4 / — | PASS |
| 21 | pepm · private_cloud · ESS · DEV Tier 3 | contract_total=9,000,000 | contract_total=9,000,000 | — / 5 / — | PASS |
| 22 | pepm · private_cloud · non-ESS · DEV Tier 1 | contract_total=1,800,000 | HTTP 422: {'detail': "Rate card lookup failed: No saved rate card exists for Private Cloud… | — | BLOCKED (business conflict) |
| 23 | pepm · private_cloud · non-ESS · DEV Tier 2 | contract_total=4,800,000 | HTTP 422: {'detail': "Rate card lookup failed: No saved rate card exists for Private Cloud… | — | BLOCKED (business conflict) |
| 24 | pepm · private_cloud · non-ESS · DEV Tier 3 | contract_total=9,000,000 | HTTP 422: {'detail': "Rate card lookup failed: No saved rate card exists for Private Cloud… | — | BLOCKED (business conflict) |
| 25 | license · on_premise · ESS · DEV Tier 1 | contract_total=1,250,000,000 | contract_total=1,250,000,000 | — / 100,000 / 5 | PASS |
| 26 | license · on_premise · ESS · DEV Tier 2 | contract_total=5,400,000,000 | contract_total=5,400,000,000 | — / 200,000 / 7 | PASS |
| 27 | license · on_premise · ESS · DEV Tier 3 | contract_total=13,500,000,000 | contract_total=13,500,000,000 | — / 300,000 / 10 | PASS |
| 28 | license · on_premise · non-ESS · DEV Tier 1 | contract_total=312,500,000 | contract_total=312,500,000 | — / 25,000 / 5 | PASS |
| 29 | license · on_premise · non-ESS · DEV Tier 2 | contract_total=1,080,000,000 | contract_total=1,080,000,000 | — / 40,000 / 7 | PASS |
| 30 | license · on_premise · non-ESS · DEV Tier 3 | contract_total=2,250,000,000 | contract_total=2,250,000,000 | — / 50,000 / 10 | PASS |
| 31 | PDF worked example (India, Premium pack, 12 months, 5% subscription discount) | subscription_subtotal_before_discount=620,000; subscription_total_after_discount=589,000; service_subtotal_before_discount=144,000; product_native_total=733,000 | subscription_subtotal_before_discount=620,000; subscription_total_after_discount=589,000; service_subtotal_before_discount=144,000; product_native_total=733,000 | — | PASS |
| 32 | Discount stacking: 10% line, 5% product subscription, 10% services (12 months) | line_after_discount=558,000; subscription_total_after_discount=530,100; service_total_after_discount=129,600; product_native_total=659,700 | line_after_discount=558,000; subscription_total_after_discount=530,100; service_total_after_discount=129,600; product_native_total=659,700 | — | PASS |
| 33 | Per-service-line discount is not allowed | outcome=rejected | {"create_http": 400, "calc_http": 200, "detail": "{'snapshot_id': 28, 'proposal_id': 32, 'proposal_version_id': 32, 'version_no': 1, 'calcul | — | PASS |
| 34 | Subscription discount > 100% rejected | http=4xx | http=400 | — | PASS |
| 35 | FX consolidation: INR product reported in USD | product_native_total=620,000; product_reporting_total=7,440 | product_native_total=620,000; product_reporting_total=7,440 | — | PASS |
| 36 | Multi-region: India + United States in one proposal | each product priced in its own country/currency=True | *Before:* all lines priced with India's rates (FAIL). *After §8:* IN 620,000 INR → 7,440 USD; US 160,000 USD; total 167,440 USD | — | PASS (after fix) |
| 37 | Zero quantity: only the platform fee is charged | contract_total=500,000 | contract_total=500,000 | — | PASS |
| 38 | 18-month term (non-whole years): platform fee pro-rated by months/12 | contract_platform_fee=150,000; contract_consumption_fee=540,000 | contract_platform_fee=150,000; contract_consumption_fee=540,000 | — | PASS |
| 39 | Negative quantity rejected | http=422 | http=422 | — | PASS |
| 40 | Missing rate card is an error, not zero | http=4xx | http=422 | — | PASS |
| 41 | PEPM rate for Active Employees (non-ESS) is rejected (locked UOM) | http=400 | http=[400, 400, 400, 400, 400, 400] | — | PASS |
| 42 | AMC % above 100 rejected | http=422 | http=422 | — | PASS |

Browser checks of the same figures are in `BROWSER_E2E_TEST_REPORT.md`. Automated regression coverage:
- `backend/tests/test_workbook_pricing.py`: 35 tests.
- `backend/tests/test_workbook_pricing_pg.py`: 12 tests on PostgreSQL.
- `backend/tests/test_platform_subscription_rates.py`: 26 tests.
- `frontend/e2e/workbook-pricing.spec.js`.

## 5. Incorrect behaviour found and fixes applied

| # | Defect | Impact | Fix | Regression test |
|---|---|---|---|---|
| F1 | Engine picked the License formula from the pricing model's name; licence fee = "unit rate, else fixed fee" | Renaming a model changed prices; wrong field silently used | Formula driven by billing bases; `unit_rate_basis='one_time'`. Migration `d0e1f2a3b4c5` aligns License + AMC: one-time unit, no fixed fee. | `test_formula_does_not_depend_on_pricing_model_names`, `test_license_amc_workbook` ×6 |
| F2 | Missing AMC % priced as 0 | Licence deals under-quoted | Calculation error "no AMC % (enter 0 if none)" | `test_licence_without_amc_percentage_is_an_error_not_zero` |
| F3 | (earlier session, kept) AMC divided by 100 only when ≥ 1 | 0.5% treated as 50% | Always /100 | `test_license_amc_workbook` |
| F4 | License grid mislabelled; no AMC input | AMC could not be entered; licence fee shown as "AMC Rate" | Licence grid: fee per user + AMC % per tier | `RateCardLicenseLayout.test.jsx` (4) |
| F5 | Grid merged UOM tables of one pack/feature | Wrong figures displayed; ESS and non-ESS fee tables uneditable | One row per (item, UOM); save/delete scoped to that UOM (`current_uom_id`, `uom_id` on group delete) | `test_ess_and_non_ess_schedules_are_independent`, `test_deleting_one_uom_schedule_keeps_the_other`, `test_moving_a_schedule_onto_an_existing_uom_is_a_conflict`, frontend schedule tests |
| F6 | No per-tier subscription rate | Workbook rates (3/4/5) impossible from the UI | "Set rate per tier" mode; tiers with differing saved rates open in it | `shows a rate per tier…` (frontend), `test_platform_subscription_workbook` ×12 |
| F7 | Configurator could not price an item with two UOM tables (409) | Workbook proposals impossible from Page 4 | "Rate schedule (unit of measure)" select for packs and features; saved with the line and restored on reopen | Browser run (proposal #39); configurator unit tests |
| F8 | Page 5 rate label "/ unit / mo" for every model | Licence fee shown as monthly | Label from the line's UOM, billing basis and AMC % | Browser check |
| F9 | Engine fallbacks "USD"/"INR"/8 h; PEPM UOM chosen by code `"employee"` | Wrong currency labels; invented hours; name-coupled rule | Removed; PEPM lock comes from `pricing_models.uom_locked_id`; missing hours → error | `test_pepm_uom_validation_rejects_incompatible_uom`, `test_pepm_non_ess_rate_is_rejected_by_the_locked_uom` |

## 6. Formula verification tables

### Platform + Subscription (5 years)

| UOM1 | Tier | Fee | Rate | Qty | Platform total | Subscription total | Combined | Engine |
|---|---|---|---|---|---|---|---|---|
| ESS | 1 | 100,000 | 3 | 10,000 | 500,000 | 1,800,000 | 2,300,000 | ✔ |
| ESS | 2 | 200,000 | 4 | 20,000 | 1,000,000 | 4,800,000 | 5,800,000 | ✔ (workbook cell: 1,160,000 ✘) |
| ESS | 3 | 300,000 | 5 | 30,000 | 1,500,000 | 9,000,000 | 10,500,000 | ✔ (workbook cell: 2,100,000 ✘) |
| non-ESS | 1 | 25,000 | 3 | 10,000 | 125,000 | 1,800,000 | 1,925,000 | ✔ |
| non-ESS | 2 | 50,000 | 4 | 20,000 | 250,000 | 4,800,000 | 5,050,000 | ✔ (workbook cell: 1,010,000 ✘) |
| non-ESS | 3 | 100,000 | 5 | 30,000 | 500,000 | 9,000,000 | 9,500,000 | ✔ (workbook cell: 1,900,000 ✘) |

### PEPM (5 years): 3 × 10,000 × 60 = 1,800,000 · 4 × 20,000 × 60 = 4,800,000 · 5 × 30,000 × 60 = 9,000,000 ✔ (ESS). Non-ESS: blocked (D4).

### License Fee + AMC (5 years)

| UOM1 | Tier | Fee/user | Users | AMC | Licence total | Annual AMC | Total | Engine |
|---|---|---|---|---|---|---|---|---|
| ESS | 1 | 100,000 | 10,000 | 5% | 1,000,000,000 | 50,000,000 | 1,250,000,000 | ✔ |
| ESS | 2 | 200,000 | 20,000 | 7% | 4,000,000,000 | 280,000,000 | 5,400,000,000 | ✔ |
| ESS | 3 | 300,000 | 30,000 | 10% | 9,000,000,000 | 900,000,000 | 13,500,000,000 | ✔ |
| non-ESS | 1 | 25,000 | 10,000 | 5% | 250,000,000 | 12,500,000 | 312,500,000 | ✔ |
| non-ESS | 2 | 40,000 | 20,000 | 7% | 800,000,000 | 56,000,000 | 1,080,000,000 | ✔ |
| non-ESS | 3 | 50,000 | 30,000 | 10% | 1,500,000,000 | 150,000,000 | 2,250,000,000 | ✔ |

AMC input is a percentage (5 = 5%), with a range check of 0–100. Entering 0.05 means 0.05%, so the fraction form is not supported: the UI asks for a percentage.

### PDF worked example (India, 12 months)

| Step | Expected | Engine |
|---|---|---|
| Platform 3,80,000 + 250 × 80 × 12 | 6,20,000 | ✔ |
| After 5% overall subscription discount | 5,89,000 | ✔ |
| Day rate 1,500 × 8 | 12,000 | ✔ |
| Services 12 man-days × 12,000 | 1,44,000 | ✔ |
| Product total | 7,33,000 | ✔ |
| With 10% line + 5% overall + 10% services | 5,30,100 + 1,29,600 = 6,59,700 | ✔ |
| FX: 6,20,000 INR at 0.012 → USD | 7,440 | ✔ |

## 7. Remaining business questions

1. **Workbook D1/D2:** ~~confirm the full-contract total~~ **Resolved 2026-11-06:** platform × years + subscription × years (user's calculator check: 5,050,000 / 9,500,000). See `AUDIO_BUSINESS_RULE_DECISIONS.md`.
2. **PEPM non-ESS (D4):** **Resolved 2026-11-06: both are allowed** (migration `a3b4c5d6e7f8`, see `PEPM_UOM_AUDIT.md`). Original question: keep PEPM locked to ESS, or allow non-ESS? If allowed: clear `uom_locked_id` and map both UOMs in `pricing_model_uoms`. This is data only, no code change.
3. **Platform + Subscription UOMs (D8):** one UOM per rate, or a UOM1 fee table plus a UOM2 subscription unit? The latter needs a nullable `rate_cards.subscription_uom_id`.
4. **Partial years:** an 18-month term pro-rates the annual platform fee (× 1.5). The workbook only shows whole years.
5. **Default term:** when no contract term is supplied the engine assumes 12 months. Should it be mandatory?
6. **Multi-region (PDF §3):** implemented (§8). **Resolved 2026-11-06:** overall discounts are set per country (migration `f2a3b4c5d6e7`, see `OVERALL_DISCOUNT_AUDIT.md`).
7. **Discount justifications:** reasons are "kept on screen only". Should they be stored, and are approval thresholds to be enforced? The `approval_thresholds` table exists but the UI shows "Demo settings — not enforced".
8. **Rounding policy, FX locking at signature, approval limits:** still open from the October audit.

## 8. Multi-region pricing (implemented after the audit)

PDF §3 says each product is delivered from a country and priced with that country's rate card and currency, then consolidated. This was finding #36 (FAIL). It is now implemented.

**Schema (additive, migration `e1f2a3b4c5d6`, revises `d0e1f2a3b4c5`):**
- nullable `proposal_country_id` on `proposal_line_items` and `proposal_service_lines`;
- foreign key to `proposal_countries(id)` with ON DELETE RESTRICT, plus an index on each table;
- no new tables, no data rewritten. Existing lines keep NULL, which means "the primary country block", so saved proposals price exactly as before.

**Rules:**
- A line is priced with its own block's country, deployment model and pricing model, in that country's rate-card currency.
- Products are grouped per (country block, product). When a product appears in more than one country, its key is `CODE@ISO` (for example `DEV_TA_MAX@US`), so discounts and the summary keep the regions apart.
- The same pack or feature may be added once per country; the "double charging" checks apply within a country.
- A service line must use a service rate of its own block's country (400 otherwise).
- A country block that still has lines cannot be deleted (409).
- A block with no lines gets the warning "<country> has no packs, features or services on this proposal; nothing is priced for that country."
- Line discounts can be set in every country; the overall subscription and services discounts stay proposal-wide (the existing rule, unchanged).
- Each product is converted to the reporting currency with the FX rate saved on the Rate Card page (no hard-coded rates).

**Verified:**

| Check | Expected | Result |
|---|---|---|
| Unit tests (`test_multi_region_pricing.py`, 9) | per-country rates, currencies, keys, validation | PASS |
| PostgreSQL (`test_multi_region_pg.py`): India 250 + United States 1,000 candidates, 12 months | IN 620,000 INR → 7,440 USD; US 160,000 USD; total 167,440 USD; deleting the US block → 409 | PASS |
| Playwright (`e2e/multi-region.spec.js`) | same totals in the API, on Page 6 and the US rate on Page 5 | PASS |
| Browser, proposal #44 (India, United States, Germany), 10% line discount on the US line, 5% overall subscription | IN (620,000 × 0.95 + 96,000) = 685,000 INR → 8,220 USD; US 160,000 × 0.9 × 0.95 + 2,400 = 139,200 USD; DE 74,000 × 0.95 = 70,300 EUR → 75,924 USD (FX 1.08); **total 223,344 USD** | PASS (API, Page 5, Page 6, database: `discount_pct` 10 on the US line only; survives reload) |

**Pending for Neon (not applied; needs explicit approval):** `c9d0e1f2a3b4`, `d0e1f2a3b4c5`, `e1f2a3b4c5d6`, in addition to the migrations already listed as pending before this work.
