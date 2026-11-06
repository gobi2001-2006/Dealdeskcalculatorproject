# PEPM Unit of Measure Audit

Date: 2026-11-06 · Branch `feature/frontend-backend-integration` · Not committed · Local test database only (Neon untouched)

Decision source: `AUDIO_BUSINESS_RULE_DECISIONS.md`. PEPM allows Active Employees (with ESS) and Active Employees (non-ESS).

## 1. Allowed UOMs

| Pricing model | Allowed UOMs (from the database) | Default |
|---|---|---|
| PEPM (`pepm`) | Active Employees (with ESS) `employee`; Active Employees (non-ESS) `active_employees_non_ess` | with ESS |
| License Fee + AMC (`license_amc`) | the same two | with ESS |
| Platform + Subscription (`platform_subscription`) | no mapping, so every active UOM | — |

## 2. Database relationships

- `pricing_models.uom_locked_id`: a hard lock to one UOM.
  - Before: PEPM was locked to `employee`.
  - Now: NULL for PEPM.
- `pricing_model_uoms (pricing_model_id, uom_id, is_default)`: the allowed list when there is no lock.
  - PEPM → `employee` (default) and PEPM → `active_employees_non_ess`.
  - These rows already existed from migration `c9d0e1f2a3b4`. The lock overrode them.
- `rate_cards`: one row per (version, country, deployment, pricing model, tier, **UOM**, pack or feature). ESS and non-ESS rates are therefore separate schedules with their own tier rates.

**Migration `a3b4c5d6e7f8`** (data only, matched by business codes, never by ids):

```sql
INSERT INTO pricing_model_uoms ... PEPM -> employee (default), PEPM -> active_employees_non_ess  -- only if missing
UPDATE pricing_models SET uom_locked_id = NULL WHERE code = 'pepm';
```

- The downgrade restores the ESS lock.
- Existing rate cards are not touched.
- The dev seed (`scripts/seed_dev_data.py`) no longer sets the lock.

Verified on the local browser-test database:
- `pepm | uom_locked_id none | employee,active_employees_non_ess`;
- upgrade → downgrade → upgrade round trip on the migration test database.

## 3. Rules in code (unchanged, already data-driven)

| Where | Rule |
|---|---|
| `master_service.list_allowed_uoms_for_pricing_model` | Locked UOM, else `pricing_model_uoms` rows (defaults first), else all active UOMs |
| `master_service.validate_uom_for_pricing_model` | Rejects any UOM outside that list (400). Used when saving a rate card (`PUT /api/rates/rate-cards/target`) and on UOM changes |
| `GET /api/masters/pricing-models/{id}/allowed-uoms` | Returns the list; Page 3 and Page 4 dropdowns use it |
| `rates.py` resolve | Defaults a line to the locked UOM only when a model is locked; otherwise the line's own `uom_id` picks the schedule |
| Engine | `rate × quantity × billing periods`, using the rate card matched by the line's UOM. Nothing in it refers to PEPM by name |

A search of `frontend/src` and `backend/app` found no PEPM name or code checks. The only mentions are comments.

## 4. Calculation verification

Approved formula: **PEPM total = monthly rate × employee quantity × contract months.**

| Check | Expected | Result |
|---|---|---|
| Workbook PEPM, with ESS, Tier 1/2/3 × Shared/Private (5 years) | 1,800,000 / 4,800,000 / 9,000,000 | PASS (6) |
| Workbook PEPM, **non-ESS**, Tier 1/2/3 × Shared/Private (rows 63–70) | 1,800,000 / 4,800,000 / 9,000,000 | PASS (6); was **blocked** before |
| Same on PostgreSQL (`test_workbook_pricing_pg.py::test_pg_pepm`, ESS and non-ESS) | same | PASS (6) |
| Different rates per UOM (ESS 4, non-ESS 2, Tier 2, 24 months) | ESS 4 × 20,000 × 24 = 1,920,000; non-ESS 2 × 15,000 × 24 = 720,000 | PASS: rate matched to the line's UOM |
| Allowed-UOM API for PEPM | `[employee, active_employees_non_ess]` | PASS |
| A third UOM (Candidate Inflow) for PEPM | 400 with the UOM name | PASS |
| Playwright: India ESS (4 × 20,000 × 24) and US non-ESS (3 × 15,000 × 24), each with its own country discount | 1,920,000 INR and 1,080,000 USD before discounts; total 1,046,736 USD | PASS |

The fixtures in `test_rates_masters_apis.py`, `test_rate_card_combinations_and_tiers.py` and `test_audit_pricing_rules.py` still build a locked "pepm" model. They test the **lock mechanism** itself (`uom_locked_id`), which remains supported. Their comments now say so.

## 5. User interface

- **Page 3, Rate Card** (Shared Cloud + Per Employee Per Month):
  - one row per pack per UOM ("UOM: Active Employees (with ESS)" and "UOM: Active Employees (non-ESS)"), each with its own Tier 1/2/3 rates;
  - the banner reads "Total = Rate per unit per month × Quantity × Contract months".
  - Screenshot: `e2e-screenshots/08-ratecard-pepm-ess-and-non-ess.png`.
- **Page 4, Configurator**, proposal #48:
  - India's "Rate schedule (unit of measure)" dropdown offers both units, because India has rates for both.
  - The US offers only non-ESS, the only US schedule.
  - The quantity label follows the chosen UOM ("Active Employees (non-ESS) — Country Deployment Volume").
  - The resolved rate is shown, for example "Rate card #41: USD 3.00 per Active Employees (non-ESS) / month".
- **Page 5:** the US line shows "$3.00 / Active Employees (non-ESS) / mo".
