# Hard-coded Value Audit

Date: 2026-11-03 · Scope: `backend/app`, `backend/scripts`, `backend/migrations`, `frontend/src` (tests reviewed separately) · Not committed

## Classification key

| Code | Meaning |
|---|---|
| A | Legitimate technical constant |
| B | Static UI label or display default |
| C | Test fixture / test-only data |
| D | Business configuration incorrectly hard-coded in application code |
| E | Temporary development / demo data |
| F | Unused or duplicate implementation |

Line numbers marked *(before)* are from the code at the start of this audit. Remaining items cite current lines.

## D: Business configuration in code

| # | File:line | Hard-coded value | Business impact | Recommended fix | Fixed? |
|---|---|---|---|---|---|
| 1 | `backend/app/services/pricing_engine.py:744` *(before)* | `is_license_amc = "license" in pm_code and "amc" in pm_code` | Formula chosen by pricing-model name; renaming a model changes prices | Drive the formula by `fixed_fee_basis` / `unit_rate_basis` (+ `one_time`) | **Yes** (migration `d0e1f2a3b4c5`; test `test_formula_does_not_depend_on_pricing_model_names`) |
| 2 | `pricing_engine.py:755` *(before)* | `license_fee_per_user = unit_rate if unit_rate > 0 else fixed_fee` | Guessed which field holds the licence fee | Licence fee = unit rate with `one_time` basis; AMC % required | **Yes** |
| 3 | `pricing_engine.py` *(before)* | `amc_pct or 0` | Missing AMC silently 0 | Error when a one-time unit rate has no AMC % | **Yes** |
| 4 | `pricing_engine.py:421, 475, 515, 553, 612` *(before)* | `"USD"` currency fallback | Wrong currency label on reports | Use the record's currency; never substitute | **Yes** |
| 5 | `pricing_engine.py:957` *(before)* | `"INR"` service currency fallback | Same | Same | **Yes** |
| 6 | `pricing_engine.py` *(before)* | `hours_per_day or default or Decimal("8.00")` | Invented working hours | Error if the service rate has no hours | **Yes** |
| 7 | `backend/app/services/rate_service.py:250-259` *(before)* | `pm.code == "pepm" or "per employee" in name`; `uom.code != "employee"` | PEPM UOM rule tied to codes and names | Rule from `pricing_models.uom_locked_id` (combinations workbook B11) | **Yes** |
| 8 | `backend/app/api/routes/rates.py:444-446` *(before)* | `pm.code == "pepm"` → look up UOM `code == "employee"` | Same | Use only `uom_locked_id` | **Yes** |
| 9 | `backend/app/services/master_service.py` *(before, earlier session)* | Allowed-UOM fallbacks by code `pepm` / `license_amc` | UOM rules in code | Locked UOM → `pricing_model_uoms` → all active | **Yes** |
| 10 | `frontend/src/features/ratecard/RateCardCenterEditor.jsx:117-194, 218-277` *(before)* | `isPEPM` / `isPlatformSubscription` / `isLicenseAMC` from names (`'platform'`, `'license'`, `'amc'`, `'pepm'`, `'per employee'`, `'premise'`) | Wrong grid or rows for any renamed or new model; on-premise card hard-wired to License + AMC text | `rateLayoutFor()` from model components/bases; rows matched by ids | **Yes** (test: renamed licence model) |
| 11 | `RateCardCenterEditor.jsx:117-131` *(before)* | Name-based deployment → pricing fallback when the matrix is empty | Combination matrix invented in UI | Matrix only from `deployment_pricing_options` | **Yes** |
| 12 | `frontend/src/features/ratecard/PackRatesSection.jsx:65-73` *(before)* | `isLicenseAMC` by name; labels "Capex License Fee" / "AMC Rate" | Licence fee mislabelled as AMC | Licence grid with explicit fields | **Yes** |
| 13 | `modals/AddPackRateModal.jsx:51-59` *(before)* | Name sniffing for layout | Same as #10 | `layout` prop from the page | **Yes** |
| 14 | `rateCardFormatters.js:77-82` *(before)* | `isPlatformSubscriptionModel` name check | Duplicate name logic | Removed (unused after #10) | **Yes** (F) |
| 15 | `frontend/src/features/pricing/components/PricingEditor.jsx:123` *(before)* | `"/ unit / mo"` | One-time licence shown as monthly | Label from the line's `unit_rate_basis` / UOM / AMC | **Yes** |
| 16 | `frontend/src/features/calculator/components/CountryConfigCard.jsx:420` *(before, earlier turn)* | "Active Employees (with ESS)", "Users" | Wrong unit for non-employee UOMs | UOM from the rate card | **Yes** |
| 17 | `backend/app/services/pricing_engine.py:371, 728` | Contract term defaults to `Decimal("12")` when none is supplied | A 12-month term assumed silently | Make the term mandatory, or confirm the default | **No** (business question 5) |
| 18 | `backend/app/models/rate_card.py:396`; `schemas/rate_card.py:386`; `api/routes/rates.py:136, 358`; `services/rate_service.py:666` | Service-rate `hours_per_day` default 8.00 | 8 hours assumed if the user leaves it blank (it is the PDF's example value) | Require it explicitly, or keep it as a documented default | **No**: column is NOT NULL and the UI shows the value; decision needed |
| 19 | `frontend/src/context/ProposalContext.jsx:51-57, 206-207` | Gross-margin floor 30%, line ceiling 15%, overall ceiling 20% | Shown on Page 5 as "Demo settings — not enforced"; not used in any calculation | Load from `approval_thresholds` once business values exist | **No** (labelled demo; also E) |

## B: Static labels and display defaults (kept)

| File:line | Value | Note |
|---|---|---|
| `frontend/src/features/ratecard/rateCardFormatters.js:5-21` | `CURRENCY_SYMBOLS` map (INR → ₹ …) | Display fallback when a currency record has no symbol; the currency master's symbol wins |
| `rateCardFormatters.js:27`, `RateCardPage.jsx:214`, `RateCardCenterEditor.jsx:81`, `PackRatesSection.jsx:15`, `FeatureRatesSection.jsx:15`, `ServiceRatesSection.jsx:7`, `AddPackRateModal.jsx:21`, `AddFeatureRateModal.jsx:21` | `'$'` default symbol | Only before data loads; recommend `''` in a later clean-up |
| `modals/AddFxRateModal.jsx:9, 40` | `'Corporate Treasury'` / `'Manual Input'` FX source text | Editable label |
| `backend/app/services/pricing_engine.py:817-818` | `"Standard Module"` / `"MODULE"` | Placeholder name when a line's product can't be resolved (E) |
| `frontend/src/features/calculator/calculatorData.js:137, 145` | `'resolved from the rate card on save'` | JSON preview text |

Fixed in this audit (B, previously with business effect):
- `RateCardRegistryTable.jsx:43, 91`, `ServiceRatesSection.jsx:199` and `AddHourlyRateModal.jsx:15`: `'USD'` fallback → empty.
- `AddFxRateModal.jsx:4-6`: a built-in list of nine currencies, defaulting to USD → INR, replaced by the currency master only.
- `RateCardCenterEditor.jsx:399, 513`: `'INR'` fallback.
- `PlatformSubscriptionSection.jsx:9`: `'USD'` default.

## A: Technical constants (kept)

| File:line | Value | Why legitimate |
|---|---|---|
| `pricing_engine.py:127` | `BILLING_PERIODS_PER_YEAR = {monthly: 12, annual: 1}` | Calendar facts, keyed by the configured basis |
| `pricing_engine.py:762, 785` | `/ Decimal("12")` | Months per year |
| `pricing_engine.py` (`quantize_currency`) | 2-decimal rounding | Technical; the rounding *policy* is still an open business question |
| Check constraints (0–100 %, non-negative amounts) | Validation ranges | Data integrity |

## C: Test fixtures (expected)

- **Backend:** `tests/test_workbook_pricing.py`, `test_workbook_pricing_pg.py`, `test_platform_subscription_rates.py` and other `tests/*` hold workbook, PDF and fixture values. They are inputs for assertions.
- **Frontend:** `src/test/*.test.jsx` mock API responses; `e2e/*.spec.js` hold workbook inputs.

## E: Development / demo data

| File:line | Value | Note |
|---|---|---|
| `backend/scripts/seed_dev_data.py:112` | FX 1 INR = 0.012 USD, "DEV seed placeholder" | Local DEV only; the script refuses non-local hosts |
| `seed_dev_data.py:237` | Pack 3,80,000 + 80 per candidate (PDF example) | DEV only |
| `seed_dev_data.py:248` | Service 1,500/h × 8 h (PDF example) | DEV only |
| `seed_dev_data.py:152-160` | License + AMC model flags | Now matches the migration (one-time unit, no fixed fee) |
| `backend/migrations/versions/c9d0e1f2a3b4_…py` | UOM rows (additive only) and the PEPM/licence UOM mapping | Reference master data from the workbook; existing names never changed |
| `backend/migrations/versions/d0e1f2a3b4c5_…py` | `UPDATE pricing_models … WHERE code='license_amc'` | One-time configuration alignment with the workbook (documented in the migration) |

## F: Unused or duplicate

| File | Item | Status |
|---|---|---|
| `rateCardFormatters.js` | `isPlatformSubscriptionModel` | Removed |
| `backend/app/api/routes/rates.py` `PATCH /rates/rate-cards/group-uom` | Superseded by `PUT /rates/rate-cards/target` with `current_uom_id` | Kept (now validates the UOM); candidate for removal |
| `PackRatesSection.jsx` / `FeatureRatesSection.jsx` per-tier "dual component" table branch | No longer reachable: platform and licence layouts use `PlatformRatesTable` | Kept; candidate for removal in a clean-up |

## Remaining recommendations

1. Decide items D-17 (default term) and D-18 (default 8 hours).
2. Replace the demo approval policy values (D-19) with `approval_thresholds` data once the business sets them.
3. Remove the unreachable "dual component" branches and the `group-uom` route in a clean-up change.
