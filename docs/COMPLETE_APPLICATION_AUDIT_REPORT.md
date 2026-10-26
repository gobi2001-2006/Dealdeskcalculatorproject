# Adrenalin Deal Desk — Complete Application Audit Report

**Date:** 26 October 2026
**Branch:** `feature/frontend-backend-integration` (starting commit `f51adf6`, working tree was clean)
**Scope:** all six pages, shared components and API modules, every FastAPI route, the pricing engine, models, schemas, migrations and tests.
**Nothing was committed.** All changes are uncommitted in the working tree for review.

---

## A. Executive summary

**What was checked.** Every frontend page (Product Catalogue, Pack Builder, Rate Card & Masters, Proposal Configurator, Pricing & Discounts, Proposal Summary), the shared API client and API modules, all 91 registered backend routes, the pricing engine, the database models against the migration chain, and all existing tests. The complete workflow was then run for real in a browser against a disposable local PostgreSQL database.

**What was wrong (the most important findings).**

1. **The database migrations were broken.** The code uses a column `pack_items.is_required` that no migration creates. Any database built from the migrations failed on every pack query (Pack Builder, configurator, calculation). Found by running the 13 PostgreSQL tests, which all errored.
2. **Services were overcharged 8×.** The configurator asked for effort in *hours*, but the backend (correctly, per the pricing guide) treats the number as *man-days*. 40 hours were billed as 40 days.
3. **Standalone features were the wrong records.** The "à la carte features" table listed catalogue *products* and sent a product id as `feature_id`, so the wrong item was charged (or the save failed), and the "already included in pack" lock compared feature ids with product ids.
4. **Pricing used guessed ids.** The save routine turned text into database ids by substring guessing (`"india"` → 1, anything containing `"in"` → 1, `"pepm"` → 1, …), hardcoded `uom_id: 1`, user id `1` and currency id `2`. New proposals started from a fake "Acme Global Enterprise" with demo ids, so a fresh save could price the wrong tier/model.
5. **Edits were silently not saved and calculations used stale data.** Re-saving a proposal only *added* records — changed headcount, quantities, removed lines or edited services were never written. "Calculate" on an existing proposal did not save first, so the backend priced old data while the screen said "calculated".
6. **Discounts were applied at the wrong level.** A discount typed on one pack/feature line was sent as a *product-wide* discount (overriding the overall discount). Recalculating from Page 6 silently dropped service discounts.
7. **Demo data replaced real data.** Pages 1, 2, 3, 5 and 6 started from (or fell back to) hard-coded demo catalogues, packs, rates, FX rates and service rates, and offline "saves" changed only screen state while reporting success. Pages 5 and 6 looked up names in the demo arrays, so real proposals showed no pack/feature rows at all.
8. **Rate Card page could write rates to the wrong record.** Save paths used `|| 1` fallbacks for country, deployment model, pricing model, tier and rate-card version, `|| 38` for a pack version, turned a blank price into `0`, and mapped the edited cell to a tier by list position (or by digits in the field name). The backend also silently picked "the first unit of measure in the table" when none was sent.
9. **The engine silently ignored the unit of measure.** If no rate matched the line's unit of measure, it used a rate with a different unit. An existing test written to forbid exactly this was failing.

**What was fixed.** All nine items above, plus the smaller ones listed in section F. The backend now also flags stale snapshots, returns reporting-currency totals itself (the browser no longer converts amounts), validates service rates against the priced country, rejects unknown features when creating packs, and keeps exactly one active version per pack. Four small update/delete routes were added (country blocks and service lines) because, without them, edits could never be persisted.

**Does it work end to end?** **Yes, for a single-country proposal, verified in a real browser** against a local PostgreSQL database seeded with the DEV fixture: catalogue → packs → rates → configure → save → calculate → discounts → summary → refresh → reopen → edit → recalculate. Every total matched a hand calculation (section E), and the database showed no duplicate rows and four immutable snapshots.

**Biggest remaining problems.** (1) Neon has **not** been migrated — the new code fails there until three migrations are applied, which needs your authorization. (2) Multi-country deals are not priced per country (a schema/product decision). (3) The full-contract (multi-year) rule, rounding policy, FX locking and approval thresholds are not confirmed business rules. (4) There is no login: the acting user comes from a setting.

**Readiness:** **Ready for local testing and an internal demonstration with documented limitations. Not ready for production** (see section J).

---

## B. Overall status dashboard

| Area | Status | What it means |
|---|---|---|
| Page 1 — Product Catalogue | **PASS** | Loads saved families/products/features; honest error when the backend is down; creates/updates/deletes through the API. Limitation: one feature shown per product row. |
| Page 2 — Pack Builder | **PASS** | Loads saved packs; edits the active (or newest draft) version; keeps saved features; no invented features; version create/activate works. |
| Page 3 — Rate Card & Masters | **PARTIAL** | Real data only; writes refuse unresolved ids, keep the rate card's UoM and the exact tier. The page is very large and still contains legacy logic (see H). |
| Page 4 — Proposal Configurator | **PASS** | Starts empty, only saved ids, validates before any write, synchronises edits, saves before calculating, restores on reload. |
| Page 5 — Pricing & Discounts | **PASS** | Line discounts saved on line items; overall/services discounts per product; amounts and names from backend. |
| Page 6 — Proposal Summary | **PASS** | Rendered entirely from the saved snapshot; native vs reporting currency labelled; stale/warnings shown. Export/PDF not implemented (disabled). |
| API integration | **PASS** (with gaps) | 91 routes inventoried; every frontend call matches a route, method and schema. 13 routes have no automated test (section D). |
| Pricing engine | **PASS** for confirmed rules | PDF formulas verified with independent arithmetic on PostgreSQL. Full-contract rule unconfirmed. |
| Database persistence | **PASS (local)** / **BLOCKED (Neon)** | Migrations build the full schema locally and match the models; Neon not touched. |
| Hardcoded business data | **PASS** | Demo datasets removed from production code; remaining constants are UI labels or clearly labelled demo thresholds (section C). |
| Frontend build | **PASS** | `vite build` succeeds (bundle-size warning only). |
| Backend tests | **PASS** | 605 passed, 0 skipped (with local PostgreSQL). |
| Frontend tests | **PASS** | 88 passed (10 files). ESLint: 0 problems (was 23 errors, 5 warnings). |
| End-to-end workflow | **PASS (single country, local DB)** | Executed in the in-app browser; multi-country not supported by the backend. |
| Production readiness | **FAIL** | Needs Neon migration, authentication, confirmed business rules, multi-country design. |

Status labels: **PASS** verified and working · **PARTIAL** some parts work, defects remain · **FAIL** confirmed defect remains · **BLOCKED** verification prevented by environment · **NOT TESTED** no reliable verification.

---

## C. Hardcoded / static data report

Searched: every file under `frontend/src` (pages, components, context, API modules, utils, data modules, defaults) with targeted searches for demo arrays, `|| 1`-style id fallbacks, string-id guesses (`'tier-1'`, `'c-in'`, `'dep-shared'`, `'pm-pepm'`), currency fallbacks (`'USD'`, `'INR'`, `'$'`), and literal prices/headcounts/terms. Then every hit was read.

### Defects found and fixed (production code)

| File | Value found | Classification | Correction | Verification |
|---|---|---|---|---|
| `api/proposalsApi.js` | `resolveNumericId` substring → id guesses (`'in'`→1, `'pepm'`→1, `'prem'`→3 …); country fallback 2; currency fallback 2/first; `uom_id: 1`; `userId = 1`; `industry 'Enterprise Technology'`; `target_close_date +90 days`; `rate_applied: 0`; contract term `|| 12`; reuse of *another* proposal on code conflict | Defect | Rewritten: validation lists every missing selection; only saved numeric ids; UoM from `/rates/resolve`; user from `VITE_DEALDESK_USER_ID`; no invented industry/date; never attaches to another proposal | `ProposalSaveWorkflow.test.js` (13 tests); browser E2E |
| `features/calculator/calculatorData.js` | `MASTER_CURRENCIES` (10 currencies with ids), client "Acme Global Enterprise", deal "DEAL-2026-0042", notes, headcount 5000, term 36, platform fee 100000 / 300 / 10000, default service line ($220/hr × 40 h), reload defaults (`'Saved Customer'`, `'USD'`, family 1, term 36, headcount 1000, `'tier-1'`, `'dep-shared'`, `'pm-pepm'`, `'hr-1'`) | Defect | Empty initial state; reload maps real fields using live packs/products/countries; term from the latest snapshot | `ProposalSaveWorkflow.test.js` (reload tests) |
| `context/ProposalContext.jsx` | Default country block `'c-in'` | Defect | Starts with no countries | Page 4 test "starts empty" |
| Page 4 components (`AddCountryModal`, `CountryConfigCard`, `FamilyConfigCard`, `FeaturesTable`, `ServiceLinesSection`, `ClientConfigCard`) | Fallbacks to demo countries/tiers/models/families/packs/products/hourly rates; headcount 5000; term 36; `daily_rate / 8`; hourly 150; first-record auto-selection; on-prem name heuristics; client-side price/FCV maths; hours labelled effort | Defect | Only saved masters; nothing auto-selected; man-days; country-filtered service rates; rate shown as stored; no browser maths | `ProposalConfiguratorPage.test.jsx`; E2E |
| `features/pricing/*` | `INITIAL_PACKS/INITIAL_PRODUCTS/INITIAL_PRODUCT_FAMILIES` lookups; `'c-in'` default; `'$'` symbol; ID→name guesses (`'tier-1'`→"Tier 1", else "Tier 3"; else "On-Prem"; else "PEPM"); fixed-amount discounts; per-service-line discounts | Defect | Live catalogue lookup; real master names; percentage only; one services discount | `PricingPage.test.jsx`; E2E (found and fixed the sidebar labels during the run) |
| `features/proposals/*` | Table built from demo arrays; `'INR'` fallback; native amounts labelled with reporting currency; `CountrySummarySectionHeader` id→name guesses (2 = Private Cloud …); "Rental/PEPM" showing the grand total; "Grand Total" showing the year-1 figure; browser FX conversion | Defect | Table rendered from the snapshot; three guessing components removed; correct labels; backend reporting totals | `ProposalSummaryPage.test.jsx`; E2E |
| `features/catalogue/CataloguePage.jsx`, `SummaryStrip.jsx`, `CatalogueTopNav.jsx` | Demo catalogue as initial state and failure fallback; local-only "saved" mutations; "first family" fallback on create; feature errors swallowed; client "Global Enterprise Master"; "POSTGRESQL LIVE" shown by default | Defect | Empty start, honest error, API-only mutations, explicit family, errors reported, neutral defaults | `CataloguePage.test.jsx` |
| `features/packs/PacksPage.jsx` | Demo packs/families/products; silent auto-creation of catalogue features (`<code>-001`); first-feature-only packing; status forced to `active` on every edit; local-only versions/activations/deletes | Defect | Real data only; no invented features; saved features preserved; status untouched | `PacksPage.test.jsx` (9 tests) |
| `features/ratecard/RateCardPage.jsx` (+ sections/modals) | Demo countries, tiers, models, hourly rates, FX rates, pack/feature rates, "spreadsheet demo" platform config + reset button; write fallbacks `|| 1` (country, deployment, pricing model, version, tier) and `|| 38` (pack version); `parseFloat(x) || 0`; positional tier mapping; tier guessed from digits in a field key; `pricingModelId === 1/2/3` filters; FX source "Corporate Treasury"; UoM label "Active Employees (with ESS)" everywhere; blank tiers sent as `'0'` | Defect | `requireId` / `parseAmount` guards; exact tier ids; rate card UoM shown and sent; UoM picker in dialogs; demo state and dead platform handler removed | `RateCardPage.test.jsx`, `FeatureRatesIsolation.test.jsx`, `RateCardIntegration.test.jsx`; E2E |
| `data/rateCardData.js`, demo parts of `catalogueData.js`, `packsData.js` | Entire demo datasets | Defect (unused after fixes) | Removed from production code | Build + tests |
| Backend `routes/rates.py` | Upsert: first UoM in the table when none sent; resolve: `employee` code or first UoM or id 1, then a UoM-ignoring fallback | Defect | Explicit UoM or the pricing model's locked UoM; otherwise 400 / the single matching row | `test_audit_fixes_pg.py` |
| Backend `pricing_engine.py` | Silent UoM-ignoring rate fallback | Defect | Removed; error names the available unit | `test_calculation_rejects_missing_rate_and_missing_tier` (was failing) |

### Legitimate constants that remain (and why)

| File | Value | Why it may stay |
|---|---|---|
| `data/catalogueData.js` `PRODUCT_TYPES` | 3 labels | UI labels mapping to the backend `classification` enum |
| `data/packsData.js` `PRESET_COLORS`, `calculatePackTypeCounts` | colours, count helper | Pure UI |
| `context/ProposalContext.jsx` approval thresholds (30% / 15% / 20%) | demo thresholds | Clearly labelled "Demo settings — not enforced"; not used in any calculation. Should come from the `approval_thresholds` table once an API exists (H-7). |
| `components/*`, CSS, labels, headings | UI text | Presentation only |
| `frontend/src/test/fixtures/*` | backend-shaped records | **Test fixtures only**, never imported by production code |
| Page 3 service-rate table "Calculated Day Rate (hourly × hours/day)" | display arithmetic | Shows the master's own derivation; not used for pricing (P3) |
| Display-only default props in some Page 3 sub-components (e.g. `activeCurrencyCode = 'USD'`) | presentational defaults | Always overridden by the parent; low risk (P3) |

No backend credentials or tokens exist in frontend code. The frontend API base URL stays configurable (`VITE_API_BASE_URL`, default `/api` via the Vite proxy).

---

## D. API endpoint audit

How verified: routes listed from the running FastAPI app's OpenAPI document (91 routes, 4 new). Every `apiClient` call in `frontend/src/api/*.js` was matched to a route, method, path parameters and Pydantic schema. "PG" = exercised by a PostgreSQL test on the disposable local DB; "SQLite" = exercised only by existing in-memory API tests; "E2E" = exercised in the browser run.

Legend: **PASS** route + contract verified and executed · **NOT TESTED** no execution evidence.

### Catalogue (Page 1, also read by Pages 2–6)

| Method & path | Frontend caller | Evidence | Result |
|---|---|---|---|
| GET `/api/catalogue/families` | `getCatalogueFamilies` | PG, E2E | PASS |
| POST `/api/catalogue/families` | `createCatalogueFamily` | SQLite, mocked UI test | PASS |
| GET/PATCH/DELETE `/api/catalogue/families/{id}` | `updateCatalogueFamily`, `deleteCatalogueFamily` | SQLite | PASS |
| GET `/api/catalogue/products` | `getCatalogueProducts` | PG, E2E | PASS |
| POST/PATCH/DELETE `/api/catalogue/products[/{id}]` | create/update/delete product | SQLite, mocked UI test | PASS |
| GET `/api/catalogue/products/{id}` | not called by the frontend | none | NOT TESTED |
| GET `/api/catalogue/features` | `getCatalogueFeatures` | PG, E2E | PASS |
| POST/PATCH/DELETE `/api/catalogue/features[/{id}]` | create/update/delete feature | SQLite, mocked UI test | PASS |

### Packs (Page 2, read by Pages 3–6)

| Method & path | Frontend caller | Evidence | Result |
|---|---|---|---|
| GET `/api/packs/` | `getPacks` | PG, E2E | PASS |
| POST `/api/packs/` | `createPack` (now sends `items`; unknown feature → 404) | PG | PASS |
| GET `/api/packs/detail/{pack_id}` | `getPackDetail` | PG, E2E | PASS |
| PATCH `/api/packs/{pack_id}` | `updatePack` | SQLite, mocked UI test | PASS |
| DELETE `/api/packs/{pack_id}` | `deletePack` | PG | PASS |
| GET `/api/packs/{pack_version_id}` | `getPackVersion` (unused by pages) | PG | PASS — note: same path shape as `PATCH /packs/{pack_id}` but a *version* id; confusing, not broken |
| POST `/api/packs/versions` | `createPackVersion` | PG | PASS |
| PATCH `/api/packs/versions/{id}` | `updatePackVersion` (activation now supersedes the previous active version) | PG | PASS |
| PUT `/api/packs/versions/{id}/items` | `syncPackItems` (locked/superseded → 409) | SQLite, PG (409 case) | PASS |
| POST/PATCH/DELETE `/api/packs/versions/{id}/items/{feature_id}` | `addPackItem`, `updatePackItem`, `removePackItem` (unused by pages) | SQLite | PASS |

### Masters and rates (Page 3, read by Pages 4–6)

| Method & path | Frontend caller | Evidence | Result |
|---|---|---|---|
| GET `/api/masters/countries`, `/currencies`, `/customer-tiers`, `/deployment-models`, `/pricing-models`, `/contract-terms`, `/units-of-measure`, `/deployment-pricing-options` | `ratesApi` getters | PG (`test_read_catalogue_packs_and_masters`), E2E | PASS |
| POST/PATCH/DELETE countries, tiers, deployment models, pricing models; POST currencies | `ratesApi` mutators | SQLite (PATCH deployment/pricing model: none) | PASS / PATCH deployment & pricing model **NOT TESTED** |
| GET `/api/masters/countries/{id}`, `/customer-tiers/{id}` | not called | none | NOT TESTED |
| GET/POST/DELETE `/api/masters/fx-rates` | `getFxRates`, `createFxRate`, `deleteFxRate` | SQLite (POST/DELETE), E2E (GET) | PASS |
| POST `/api/rates/resolve` | `resolveRateCard` (Pages 4) — UoM now from the rate card | PG, E2E | PASS |
| GET/POST `/api/rates/versions`, GET `/versions/active`, POST `/versions/{id}/activate` | version functions | SQLite, E2E (GET) | PASS |
| GET/POST/PATCH/DELETE `/api/rates/service-rates[/{id}]` | service-rate functions | PG (POST/DELETE), SQLite, E2E (GET) | PASS (GET by id NOT TESTED, unused) |
| GET/POST `/api/rates/rate-cards`; PATCH/DELETE `/{id}`; DELETE `/group` | rate-card functions — POST now requires a resolvable UoM | SQLite, mocked UI tests, E2E (GET) | PASS (GET by id NOT TESTED, unused) |
| GET `/api/health/`, GET `/health/db` | not called by the frontend | `/health/db` called manually during E2E | `/api/health/` NOT TESTED |

### Customers, deals, proposals, calculation (Pages 4–6)

| Method & path | Frontend caller | Evidence | Result |
|---|---|---|---|
| GET/POST `/api/customers/`; GET/PATCH `/{id}` | `getCustomers`, `createCustomer`, `getCustomer` (new), `updateCustomer` | PG, E2E | PASS |
| GET/POST `/api/deals/`; GET/PATCH `/{id}` | `getDeals`, `createDeal` | PG (POST/GET id/PATCH), E2E (POST) | PASS (`GET /deals/` list: mocked UI test only) |
| GET/POST `/api/proposals/`; GET/PATCH `/{id}` | proposal functions | PG, E2E | PASS |
| POST `/{id}/countries` | `addProposalCountry` | PG, E2E | PASS |
| **PATCH/DELETE `/{id}/countries/{proposal_country_id}`** (new) | `updateProposalCountry`, `deleteProposalCountry` | PG, E2E (PATCH) | PASS |
| POST `/{id}/line-items`; PATCH/DELETE `/{id}/line-items/{line_item_id}` | line-item functions (PATCH now also carries discounts) | PG, E2E | PASS |
| POST `/{id}/service-lines` | `addProposalServiceLine` | PG, E2E | PASS |
| **PATCH/DELETE `/{id}/service-lines/{service_line_id}`** (new) | `updateProposalServiceLine`, `deleteProposalServiceLine` | PG | PASS |
| POST `/{id}/calculate` | `calculateProposal` | PG, E2E | PASS |
| GET `/{id}/calculations/latest` (now returns `is_stale`) | `getLatestCalculation` | PG, E2E | PASS |

Other checks: no stale or duplicate frontend endpoints remain; trailing slashes match (`/packs/`, `/customers/`, `/deals/`, `/proposals/`); query parameter names match (`family_id`, `product_id`, `search`, `customer_id`, `rate_card_version_id`, `is_required`). Errors use one mapping (404 missing reference, 409 conflict/lifecycle, 400 validation, 422 pricing configuration). The shared client has no global error interceptor; each caller now formats errors with `describeApiError` (handles FastAPI 422 lists). **CORS is not configured**: fine for development (Vite proxy), required if the frontend is served from another origin.

---

## E. Pricing engine report

Location: `backend/app/services/pricing_engine.py` (single engine; no second engine was created).

**How a rate is selected.** For each line the engine filters the rate-card version pinned to the proposal version by country, customer tier (from the customer), deployment model and pricing model (from the primary country block), unit of measure (from the line) and pack version *or* feature. Exactly one row must match: none → blocking 422 naming the combination (and, new, the unit the rate exists under); several → 422 "ambiguous". The silent "ignore the unit of measure" fallback was removed. Database partial unique indexes make duplicates impossible for the full six dimensions.

**Subscription (pricing guide §1):** `Annual = Platform fee + Rate per unit × Avg monthly volume × 12`.
**Packs and features:** a pack line uses the pack-version rate; a standalone feature uses its own rate. A feature already inside a pack on the same proposal version (or two packs sharing a feature) is rejected with 409 by the backend; the configurator also locks pack contents.
**Services (§2):** `Day rate = Hourly rate × Standard hours per day` (or an explicit daily rate); `Line total = Man-days × Day rate`. The service rate must now belong to the priced country and be active/valid today.
**Discounts (§4), in order:** line discount on each pack/feature line → one overall subscription discount per product → one services discount per product (never per service line). 0–100% only; unknown product codes and individual service-line discounts are rejected.
**Currency:** every amount within a product must share one native currency (else 422). Conversion uses the newest FX rate effective on or before the calculation date (`1 from = rate to`); an inverse rate is used only when no direct rate exists and is flagged. The snapshot records the FX row, date, source and direction.
**Totals:** year 1 = annual subscription + one-time services; full contract = subscription over the term + services (see unresolved rule below). New: the engine returns subscription and services totals in the reporting currency so pages never convert amounts themselves.
**Snapshots:** every calculation appends an immutable snapshot (a database trigger blocks UPDATE/DELETE — verified). New: each snapshot stores a fingerprint of the saved inputs; `calculations/latest` reports `is_stale` when lines, quantities, discounts, countries or services changed afterwards. Failed calculations write nothing.
**Precision:** Decimal arithmetic in the engine, NUMERIC columns; results serialised to JSON as floats.

### Formula tests that passed (independent arithmetic, DEV seed fixture on PostgreSQL)

Fixture values (placeholders from the pricing PDF worked example, not real prices): pack fee 3,80,000 + 80/candidate/month; feature fee 50,000 + 10/month; services 1,500/hour × 8 hours; FX 1 INR = 0.012 USD.

| Scenario | Hand calculation | Backend result |
|---|---|---|
| PDF worked example (pack 250, 5% overall, 12 man-days) | 6,20,000 → 5,89,000; services 1,44,000; total 7,33,000 INR = 8,796 USD | identical (existing test) |
| Line + overall + services discounts, 24 months | feature 62,000 − 10% = 55,800; subtotal 6,75,800 − 5% = 6,42,010; services 1,44,000 − 10% = 1,29,600; 7,71,610 INR = **9,259.32 USD**; contract 14,13,620 INR = **16,963.44 USD** | identical (`test_discount_levels_and_totals_match_hand_calculation`, and in the browser) |
| Reporting split | 6,42,010 × 0.012 = 7,704.12; services 1,555.20 | identical |
| Quantity change 250 → 300 (browser, same discounts) | (6,68,000 + 55,800) × 0.95 + 1,29,600 = 8,17,210 INR = **9,806.52 USD**; contract **18,057.84 USD** | identical |
| Rejections | wrong UoM, missing rate, missing tier, ambiguous dimensions, discount < 0 or > 100, unknown product code, service rate from another country, mixed currencies in one product | all blocked with clear errors; no snapshot written |
| Staleness / history | patch a quantity after calculating | `is_stale: true`; old snapshot unchanged; recalculation creates a new one |

### Business rules that remain unresolved (not invented)

1. **Full-contract value.** Implemented as platform fee × term/12 + consumption × term months + services once, with no escalation. The FSD speaks of billable months and renewal escalation; the PDF only defines the annual figure. Needs sign-off (FSD open item).
2. **Rounding.** The engine rounds each line and product to 2 decimals; the FSD says "round once at presentation". Needs a decision.
3. **FX locking.** The FSD says a proposal stores the `fx_rate_id` it was priced with; the engine uses the latest effective rate at calculation time (and records it in the snapshot). Needs the "FX update and locking rule" (FSD open item).
4. **Multi-country.** Lines have no country, so only the primary country is priced (the engine adds a visible warning). Needs a `country_id` on lines and a product decision.
5. **Product grouping for packs.** A pack's product is the product of its first feature; product-level discounts follow that. Needs confirmation for packs spanning products.
6. **Approval thresholds and gross margin.** Not implemented (no cost-rate engine, no thresholds API).
7. **Pack version supersede rule (new).** Activating a version now supersedes the previously active one, inferred from the FSD ("cannot be edited, only superseded") to keep exactly one active version. Please confirm.

---

## F. Files changed

### Backend

| File | Change | Why | Test evidence |
|---|---|---|---|
| `migrations/versions/b8c9d0e1f2a3_add_pack_items_is_required.py` (new) | Adds `pack_items.is_required` (IF NOT EXISTS) | Model column had no migration; all pack queries failed | 13 PG tests went from error → pass; drift check shows no column drift |
| `app/services/pricing_engine.py` | No UoM fallback (+ helpful message); service-rate country/validity check; input fingerprint + `is_stale`; reporting-currency subscription/services totals | Defects 9, P-checks, staleness, no browser FX maths | `test_audit_fixes_pg.py` |
| `app/api/routes/rates.py` | `/rates/resolve`: strict UoM or rate-card's own UoM; rate-card upsert: no "first UoM" default | Silent dimension substitution | PG tests |
| `app/services/proposal_service.py`, `app/api/routes/proposals.py` | Update/delete for country blocks and service lines (draft only) | Edits could not be persisted | PG tests |
| `app/schemas/proposals.py` | `is_stale` on calculation response | Staleness | PG tests |
| `app/services/catalogue_service.py` | Unknown feature on pack create → 404; activating a version supersedes the old one; superseded versions frozen | Silent drops; two "active" versions | PG test |
| `tests/test_audit_fixes_pg.py` (new) | 11 PostgreSQL tests | Regression evidence | 24/24 PG pass |

### Frontend

| File(s) | Change | Why |
|---|---|---|
| `api/proposalsApi.js` | Rewritten save/calculate workflow (validation first, sync, UoM from rate card, user from config, keeps product discounts) | Defects 2–6 |
| `features/calculator/*` (page, data, 7 components) | Empty start, saved ids only, active pack version, real features, man-days, country-filtered rates, no browser maths, reload mapping, notices | Defects 2–5, 7 |
| `features/pricing/*` (page + 3 components) | Rewritten editor/page; backend totals; real names | Defects 6, 7 |
| `features/proposals/*` (page, table, footer; 3 components removed) | Snapshot-driven table, correct labels, no duplicate saves, discounts kept on recalculation | Defects 6, 7 |
| `features/catalogue/*`, `features/packs/PacksPage.jsx` | Real data only, honest errors, no invented features, safe delete | Defect 7 |
| `features/ratecard/*` (page, 6 components, 3 dialogs) | Write guards, exact tiers, real UoM, no demo state | Defect 8 |
| `utils/calculationView.js`, `utils/catalogueLookup.js`, `components/common/CalculationNotices.jsx` (new) | Shared formatting, lookups, stale/warning notices | Consistency |
| `data/*.js` | Demo datasets removed | Production must not ship fake data |
| `context/ProposalContext.jsx` | Empty default; discount state keyed by line target / proposal | Defects 4, 6 |
| `frontend/.env.example` (new) | Documents `VITE_DEALDESK_USER_ID`, `VITE_API_BASE_URL` | Configuration |
| `src/test/*` | 6 test files rewritten, 2 replaced, 2 new + fixtures | Old tests asserted demo-data behaviour and response fields the backend never returns |
| `.claude/launch.json` (new, local tooling) | Dev-server launch config pointing at the local test DB | Used for the E2E run; safe to delete |

Important files inspected but not modified: `app/main.py`, `app/api/errors.py`, `app/db/session.py`, all models, `migrations/env.py` and all earlier migrations, `scripts/seed_dev_data.py`, `tests/conftest.py`, `api/client.js`, `api/catalogueApi.js`, `api/packsApi.js`, `api/ratesApi.js`, routing, layout components.

---

## G. Test results (all executed during this audit)

| What | Command | Result | Data used |
|---|---|---|---|
| Backend baseline (before changes) | `pytest -q` (no TEST_DATABASE_URL) | 573 passed, 21 skipped | SQLite in-memory; PG tests skipped |
| PG tests baseline | `TEST_DATABASE_URL=…/dealdesk_test pytest -m pg` | **13 errors** (`pack_items.is_required` missing) | Disposable local PostgreSQL 18 cluster on port 54329 |
| Backend final, no PG | `pytest -q` | 573 passed, 32 skipped | SQLite |
| Backend final, all | `TEST_DATABASE_URL=…/dealdesk_test pytest -q` | **605 passed, 0 skipped**, 5 deprecation warnings | SQLite + local PostgreSQL |
| Pricing calculation tests | included above (`test_pricing_engine`, `test_audit_pricing_rules`, `test_phase_e_*`, `test_audit_fixes_pg`) | pass | as above |
| Schema drift check | Alembic `compare_metadata` after `upgrade head` | before: missing `pack_items.is_required`; after: only naming/comment differences | local PostgreSQL |
| Frontend tests baseline | `npx vitest run` | 124 passed | mocks (no backend) |
| Frontend tests final | `npx vitest run` | **88 passed** (10 files) | mocked API client (fake backend routes); **not** real end-to-end |
| Lint baseline / final | `npx eslint .` | 23 errors + 5 warnings → **0** | — |
| Production build baseline / final | `npx vite build` | success → **success** (>500 kB chunk warning) | — |
| End-to-end (browser) | uvicorn + Vite dev server + in-app browser | **PASS** — Pages 1–6, save, calculate, discounts, refresh, reopen, edit, recalculate; no server errors or console errors | Local DB `dealdesk_e2e_test` built by migrations + DEV seed |
| Neon | not run | **BLOCKED by policy** (not authorized) | — |

Why the frontend test count went down (124 → 88): about 90 old tests asserted the defects themselves — demo rows appearing when every API call fails, demo values, a "fixed amount" discount the backend does not support, per-service-line discounts, and response fields such as `total_contract_value`, `margin_pct` and products-as-an-object that the backend never returns. They were replaced with fewer, behaviour-focused tests against the real response shapes; the UI flows they covered (create/filter/delete, versions, validation, navigation) are still tested.

---

## H. Remaining issues and priorities

| # | Priority | What is wrong | Why it matters | Where | Next step | Blocks MVP? |
|---|---|---|---|---|---|---|
| 1 | **P0** | Neon is behind the migration chain (expected at `e5f6a7b8c9d0`; needs `f6a7b8c9d0e1`, `a7b8c9d0e1f2`, `b8c9d0e1f2a3`). Not re-checked this session. | The current code fails against Neon until migrated | `backend/migrations` | Authorize a backup + `alembic upgrade head` on Neon (or a read-only revision check first) | Yes, for any Neon-backed demo |
| 2 | **P1** | Multi-country deals price everything with the primary country | Wrong figures for multi-region deals (a warning is shown) | Engine, `proposal_line_items` / `proposal_service_lines` | Product decision + `country_id` on both line tables | Yes for multi-country |
| 3 | **P1** | Full-contract rule, rounding policy, FX locking not confirmed | Contract values may change after sign-off | Engine | Business sign-off of section E items 1–3 | Partly |
| 4 | **P1** | No authentication; acting user from `VITE_DEALDESK_USER_ID`; anyone can edit rate cards | Not acceptable in production | Whole app | Implement auth/roles (FSD: Pricing Desk/Admin only) | Production only |
| 5 | P2 | Contract term is stored only on snapshots | A term entered but never calculated is lost on reload | `proposals` schema | Add `contract_term_months` to proposal version/country | No |
| 6 | P2 | Saving is several API calls, not one transaction | A failure mid-way leaves a partial update (re-saving converges) | `proposalsApi.saveFullProposal` | A single backend "save configuration" endpoint | No |
| 7 | P2 | Approval thresholds and gross margin not implemented; demo thresholds displayed | Governance workflow missing | Page 5, backend | Thresholds API + cost rates | No (labelled) |
| 8 | P2 | Changing the tier in a proposal updates the *customer* record (pricing uses the customer tier) | Affects the customer's other proposals | Data model | Decide where the tier lives | No |
| 9 | P2 | Catalogue shows one feature per product; Pack Builder selects products | Products with several features are awkward to manage | Pages 1–2 | Feature-level UI | No |
| 10 | P2 | `backend/.env` points at Neon, so a local `uvicorn` run uses Neon by default | Easy to touch production by accident | `backend/.env` | Use a local `.env` and keep the Neon URL elsewhere | No |
| 11 | P2 | CORS not configured | Needed when the frontend is served from another origin | `app/main.py` | Add `CORSMiddleware` with an env-driven allow-list | Deployment only |
| 12 | P3 | Page 3 is ~2,700 lines with legacy logic; clearing a rate cell gives an error instead of deleting the rate | Maintainability | `RateCardPage.jsx` | Refactor into smaller components with a delete-on-clear rule | No |
| 13 | P3 | 13 routes have no automated test (listed in D) | Coverage | tests | Add API tests | No |
| 14 | P3 | Proposal notes are screen-only; Export PDF / document generation / HubSpot not implemented | Missing features (labelled) | Pages 4, 6 | Later phases | No |
| 15 | P3 | Deprecation warnings (`HTTP_422_UNPROCESSABLE_ENTITY`, httpx); 860 kB bundle | Hygiene | backend, Vite | Update constants; code-split | No |

---

## I. Simple end-to-end explanation

1. **Master data** (countries with currencies, tiers, deployment and pricing models, units of measure, FX rates, rate-card versions, service rates) lives in PostgreSQL and is read through `/api/masters/*` and `/api/rates/*`.
2. **Products and packs**: Page 1 manages families, products and features; Page 2 bundles features into versioned packs. The configurator offers each pack's *active* version and the family's standalone features, locking features that are already in the chosen pack.
3. **Prices**: when you pick a pack or feature, the page asks `/api/rates/resolve` which saved rate-card row applies (country, deployment model, pricing model, tier, pack/feature); that row also gives the unit of measure stored on the line. The browser only *shows* rates; it never calculates totals.
4. **Save and calculate**: "Calculate Pricing" first validates the screen, then saves it (create, update or delete so the database matches the screen), then calls `/api/proposals/{id}/calculate`. The backend reloads everything from the database, resolves every rate itself, applies line, overall and services discounts in that order, converts to the reporting currency, and stores an immutable snapshot.
5. **Where results are saved**: line amounts on the draft proposal version, the full breakdown in `calculation_snapshots` (one new row per calculation, never edited).
6. **Page 6** loads the proposal and `/calculations/latest`, shows every line, the native and converted totals and the full contract value exactly as stored, and warns if the snapshot is outdated or the engine reported a limitation. Refreshing or reopening reads the same data again.

---

## J. Final recommendation

**Ready for local testing and an internal demonstration with documented limitations** (single-country proposals on a local database). **Not ready for production.**

Next steps, in priority order:

1. Review and commit these changes (nothing is committed).
2. Authorize the Neon step: back up, check the current Alembic revision read-only, then `alembic upgrade head`.
3. Get business sign-off on the full-contract rule, rounding, FX locking and the pack-version supersede rule.
4. Decide the multi-country design and add `country_id` to line tables.
5. Add authentication and role restrictions (rate cards, thresholds).
6. Persist the contract term; add a single transactional "save configuration" endpoint.
7. Implement approval thresholds and gross margin; then document export and HubSpot.

To run locally: create `frontend/.env.local` with `VITE_DEALDESK_USER_ID=<an existing user id>` (the DEV seed creates user 1), point `DATABASE_URL` at a local database, `python -m scripts.seed_dev_data` (refuses non-local databases), start `uvicorn app.main:app` and `npm run dev`.

---

## K. Safety confirmation

- **Neon was not contacted** in any way during this audit (no connection, query, migration, seed or test). Every backend run had `DATABASE_URL`/`TEST_DATABASE_URL` set to a throw-away PostgreSQL cluster on `127.0.0.1:54329` (databases `dealdesk_test`, `dealdesk_e2e_test`); the test configuration refuses non-local URLs, and the E2E backend was confirmed to serve the freshly seeded local records before use.
- **No production migrations** were run. The new migration was applied only to the local test databases.
- **Existing user changes were preserved**: the working tree was clean at the start; nothing was reset, stashed, checked out or committed. Three obsolete page components, two superseded test files and the demo data module were deleted as part of the change set (all recoverable from git).
- **Git changes were reviewed** (`git status`, `git diff --stat`, secret scan of the diff).
- **Secrets**: no credentials, tokens or connection strings appear in the code changes or this report; only local, password-less test URLs are named.
- **Blocked checks**: Neon state and revision (not authorized); multi-country pricing (not supported by the schema).
