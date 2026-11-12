# Hardcoded Business Value Audit (2026-11-06)

Branch `feature/frontend-backend-integration` · Not committed. This follows `HARDCODED_VALUE_AUDIT.md` (2026-11-03) and the delta in `BROWSER_REGRESSION_REPORT.md`.

**Scope:** `frontend/src` and `backend/app`, searched for:
- discount percentages and defaults (including 10%);
- durations (60, 36, 24, 120 months; 5 years);
- fees, rates, quantities and totals (200,000, 960,000, 1,160,000, 5,800,000, 20,000 and others);
- master ids (country, tier, UOM, pricing model, currency, deployment, user);
- billing-basis strings and working hours.

Every hit was read.

**Classes:**
1. legitimate technical constant;
2. UI label;
3. test fixture;
4. business configuration incorrectly hardcoded;
5. temporary development data.

## Findings

| # | Location | Value | Class | Action |
|---|---|---|---|---|
| 1 | — | 10% discount, any discount default | — | **None found.** Proposal 31's 10% is stored data (`proposal_countries` row 18), not code |
| 2 | — | 60 months, 5 years, 200,000, 4, 20,000, 1,160,000, 5,800,000, 5,220,000 | — | **None found** in application code. They exist only as test expectations (class 3), taken from `calculation explained.xlsx` |
| 3 | — | Country, tier, UOM, pricing-model, currency ids | — | **None found** outside tests |
| 4 | `frontend/src/utils/contractDuration.js` | `MONTHS_PER_YEAR = 12` | 1 | Keep (calendar) |
| 5 | `backend/app/services/pricing_engine.py` | `BILLING_PERIODS_PER_YEAR` (monthly 12, annual 1); `/ 12`; `/ 100` | 1 | Keep |
| 6 | `backend/app/schemas/proposals.py` | `MAX_CONTRACT_TERM_MONTHS = 120` | 4 (pre-existing limit, source undocumented) | One named constant now (was a bare `le=120`). **Decision needed**: confirm 10 years |
| 7 | `pricing_engine.py` | 12-month default when no term is given | 4 (pre-existing, D-17) | Only reached by API calls on proposals without a saved term. **Decision needed**: make the term mandatory? |
| 8 | `models/rate_card.py`, `api/routes/rates.py:136,358`, `services/rate_service.py:666`, `AddHourlyRateModal.jsx:39,141`, `RateCardPage.jsx:2219`, `ServiceRatesSection.jsx:170` | 8 working hours per day (column default and UI) | 4 (pre-existing, D-18) | Listed as a design default in `DATABASE_SCHEMA.md` and the PDF example. Not changed: needs a decision (keep as documented default, or require hours per service rate). The engine itself uses the stored value and never assumes 8 |
| 9 | `PackRatesSection.jsx`, `FeatureRatesSection.jsx`, `PlatformSubscriptionSection.jsx` | Prop defaults `fixedFeeBasis='annual'`, `unitRateBasis='monthly'` | 2 | Label defaults only; real values come from the pricing model |
| 10 | `models/master_data.py` | `unit_rate_basis` server default `'monthly'` | 1 (schema default, migration `d0e1`) | Keep |
| 11 | `frontend/src/api/client.js` | `timeout: 30000` ms | 1 | Keep |
| 12 | `frontend/src/context/ProposalContext.jsx` | Approval thresholds 30 / 15 / 20% | 4 | **Removed** earlier (2026-11-06): read from `approval_thresholds` |
| 13 | `backend/scripts/seed_dev_data.py` | DEV rates, tiers, 1,500/h × 8 h, FX 0.012 | 5 | Dev seed only; never run on Neon |
| 14 | `frontend/src/test/fixtures/*`, `backend/tests/*`, `frontend/e2e/*` | Workbook and PDF figures | 3 | Keep |

**Discount scope** (country-level overall discounts) is data on `proposal_countries`, not a code switch. Nothing in the code chooses proposal-level versus country-level.

## Open decisions

1. The maximum contract duration (120 months).
2. A mandatory contract term (12-month default).
3. The standard working hours default (8 hours).
4. Whether a discount justification is required, and the approval thresholds (the table is empty).

## Re-scan after branch recovery (2026-11-12)

| File | Value | Class | Decision |
|---|---|---|---|
| `PackEditorHeader.jsx` | `versionNo \|\| 1` | Display fallback | Keep (label only) |
| `RateCardPage.jsx` (`handleDeleteTier`) | legacy `'tier-1'` keys | Legacy fallback | Keep; real tiers come from `customer_tiers` |
| `rates.py`, `rate_card.py`, schemas, `rate_service.py` | `hours_per_day` default 8.00 | Business default | **Open decision** #3 above |
| `proposal_export_service.py` | `fx_multiplier or 1.0`, `"USD"` fallback | Defensive fallback | Low risk: every snapshot carries FX and currency. Raising an error instead is an option |
| `proposal_export_service.py` | `contract_term_months` default 12 | Old-snapshot compatibility | Keep (only for snapshots made before the term was stored) |
| Contract duration | was months in UI | — | **Now years, converted × 12, stored**; no hidden default |

The recovered code adds no new hardcoded prices, rates, discounts or FX values.
