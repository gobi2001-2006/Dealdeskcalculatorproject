# Platform + Subscription Rate Card: Tier 1/2/3 Platform Fees, UOM and Subscription Rate

Date: 2026-11-03 · Branch: `feature/frontend-backend-integration` · Status: not committed

## 1. Audit findings (before the change)

| Area | What existed | Gap |
|---|---|---|
| `rate_cards` table | One row per tier with `fixed_fee`, `unit_rate`, `uom_id`, `tier_id`, plus pack/feature, country, deployment, pricing model, currency, version | Already separates the two components. **No new rate table needed.** |
| `pricing_models` | `has_fixed_component`, `has_unit_component`, `fixed_fee_basis` (annual / one_time), `uom_locked_id` | No billing period for the unit rate; the engine hard-coded "monthly" (×12, × term months). |
| UOM master | Earlier uncommitted work added `units_of_measure.category`, `pricing_model_uoms`, allowed-UOM API | The allowed-UOM lookup fell back on hard-coded pricing-model codes; the rate-card save did not check the UOM against the pricing model. |
| Rate Card UI (Platform + Subscription) | Six price columns per row (platform fee **and** unit rate per tier); UOM shown read-only | No UOM picker, no single subscription rate; the Add Feature modal had no platform-fee inputs at all. |
| Saving | One request per tier cell; changing UOM was impossible from the grid | A row could end up with different UOMs or rates per tier. |
| Pricing engine | Tier chosen from the customer; rate row matched on line UOM | Missing fixed fee or unit rate silently priced as 0. |

The business Excel files referenced in the request are **not in the repository**, so the formula could not be checked against them (see §6).

## 2. Database changes

* **New migration `d0e1f2a3b4c5`**: `pricing_models.unit_rate_basis VARCHAR(20) NOT NULL DEFAULT 'monthly'`, check `IN ('monthly','annual')`. Existing rows become `monthly`, which is what the engine already assumed, so totals do not change.
* **Earlier uncommitted migration `c9d0e1f2a3b4` tightened** (it has not been applied anywhere I know of — confirm before applying):
  * no longer renames existing UOMs (it changed `employee` and `candidate` names);
  * no longer adds a second "Candidate Inflow" UOM next to `candidate`;
  * no longer seeds six "… Rental" UOMs that are not in the requirements;
  * no longer restricts Platform + Subscription to product UOMs only (the reference screenshot uses *Active Employees (with ESS)* for platform rows). With no mapping rows, every active UOM is allowed.
* Verified on a local PostgreSQL: upgrade from empty, downgrade/upgrade round-trip, and upgrade of a database holding old-style rows (names preserved, no duplicates).

How one UI row is stored: a pack or feature row = one `rate_cards` row per tier. Each tier row holds that tier's platform fee in `fixed_fee`; all tier rows of the item share the same `uom_id` and `unit_rate` (the subscription rate).

## 3. API changes

| Endpoint | Change |
|---|---|
| `PUT /api/rates/rate-cards/target` | **New.** Saves one pack/feature row atomically: `tier_fees: [{tier_id, fixed_fee}]`, `uom_id`, `unit_rate`. Creates/updates tier rows in place, removes a tier whose fee is cleared, applies the UOM and rate to every tier. Rejects: negative values (422), no tier fee, a UOM not allowed or inactive, a pricing model without both components (400), a retired version (409). |
| `GET /api/masters/pricing-models/{id}/allowed-uoms` | Rules now come only from data: locked UOM → mapped UOMs (`pricing_model_uoms`) → otherwise all active UOMs. Hard-coded code fallbacks removed. |
| `POST /api/rates/rate-cards`, `PATCH /api/rates/rate-cards/group-uom` | Now also reject a UOM the pricing model does not allow. |
| Pricing model create/update/list | `unit_rate_basis` added. |
| Calculation response, per line | Adds `tier_id`, `tier_name`, `uom_code`, `uom_name`, `fixed_fee_basis`, `unit_rate_basis`. |

## 4. Calculation (backend only)

For pricing models with a fixed and a unit component (License Fee + AMC keeps its own branch):

```
Platform total      = tier platform fee × contract years      (fee once if fixed_fee_basis = one_time)
Subscription total  = subscription rate × volume per period × periods in the contract
                      (monthly: × contract months; annual: × contract years)
Combined            = Platform total + Subscription total
```

* The tier is the customer's tier; the rate row must match the line's UOM (otherwise the calculation stops with a clear message).
* A missing platform fee or subscription rate for the customer's tier now stops the calculation instead of pricing it as 0.
* Also fixed: the AMC percentage was divided by 100 only when ≥ 1, so 0.5 % was treated as 50 %.

## 5. Frontend changes

* `PlatformRatesTable.jsx` (new): Pack/Feature · one column per tier from the tier master · UOM select (options from the allowed-UOM API, disabled when locked) · Subscription Rate · remove. Warns when saved tiers disagree on UOM or rate.
* Pack and feature sections use it only under Platform + Subscription; PEPM and License + AMC grids are unchanged.
* Edits are debounced per row and saved with the new endpoint; saved values reload on reopen.
* Add Pack / Add Feature modals: in Platform + Subscription they ask for a platform fee per tier, one UOM and one subscription rate.
* Banner text is driven by the pricing model's bases (no hard-coded "per employee" or "× 12").

## 6. Verification

* Backend: **633 passed, 0 skipped** (includes PostgreSQL integration tests on a throwaway local cluster). New file `tests/test_platform_subscription_rates.py` (25 tests).
* Frontend: **99 passed**, lint clean, production build OK. New file `src/test/RateCardPlatformSubscription.test.jsx` (9 tests).
* Browser, local database: edited Tier 2/3 fees, UOM and rate → one row per tier in PostgreSQL, existing row updated in place; reload shows saved values; Add Feature modal saves 3 tier rows.
* Calculation through the API (Tier 2 customer, 200 units, 24 months, fee 300,000, rate 85): platform 600,000 + subscription 408,000 = **1,008,000** (hand-checked). Quantity 300 → subscription 612,000, platform unchanged. Customer moved to Tier 3 → platform 500,000, subscription unchanged. Line with a different UOM → blocked.
* Neon was not touched. No production migration was run. Nothing committed.

## 7. Open points

1. **Excel rules not verified.** The files were not supplied with the repository. Please confirm: (a) subscription rates are monthly for every UOM; (b) the quantity for each UOM is a per-month volume; (c) the platform fee is annual and multiplied by contract years.
2. **Product-level UOM restriction** is not modelled. UOMs are restricted per pricing model; each pack/feature picks its own. Restricting by product would need a small `product_uoms` mapping table plus admin UI.
3. **No admin UI** for `pricing_model_uoms` or `unit_rate_basis` yet (API only).
4. ~~Proposal Configurator labels the quantity "Active Employees (with ESS)"~~ **Fixed (follow-up below).** Still open: one country volume is used as the quantity of every pack in that country; if packs there use different UOMs the page now warns, but a per-pack quantity would need a change to how the Configurator saves lines.
5. **Neon** still needs, with your go-ahead: `f6a7b8c9d0e1`, `a7b8c9d0e1f2`, `b8c9d0e1f2a3`, plus now `c9d0e1f2a3b4` and `d0e1f2a3b4c5`.

## 8. Follow-up: Proposal Configurator quantity labels

* `POST /api/rates/resolve` now also returns `fixed_fee_basis` and `unit_rate_basis` (it already returned `uom_name`).
* The country volume input (which becomes every selected pack's quantity) is labelled with the pack rate card's UOM and period, e.g. "Interviews — Country Deployment Volume" / "Interviews / month". With no resolved pack it reads "Pack Quantity"; with packs in different UOMs it warns.
* Pack and feature rate descriptions read e.g. "platform fee INR 250,000 / year + INR 85.00 per Interviews / month"; feature quantities show their own UOM.
* The calculation details table shows the UOM next to each line's volume; the summary footer no longer says "× 12" unconditionally.
* Tests: backend 634 passed (PostgreSQL included); frontend 105 passed, lint clean, build OK. Checked in the browser on the local E2E proposal.
