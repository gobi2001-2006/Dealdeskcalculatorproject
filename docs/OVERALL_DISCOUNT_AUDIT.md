# Overall Discount Audit: Country-Level Discounts

Date: 2026-11-06 · Branch `feature/frontend-backend-integration` · Not committed · Local test database only (Neon untouched)

Decision source: `AUDIO_BUSINESS_RULE_DECISIONS.md`. The overall discount percentage is set per country.

## 1. Before

| Layer | Behaviour |
|---|---|
| Storage | **None.** The overall subscription % and services % were sent with each calculation request (`product_subscription_discounts` / `product_service_discounts`, keyed by product). They existed only inside the snapshot. |
| Page 5 | One "Overall subscription discount" and one "Overall services discount" for the whole proposal. The same value was copied to **every product in every country**. Justifications were "kept on screen only". |
| Page 4 / Page 6 recalculation | Re-sent the snapshot's product discounts. |
| Engine | Applied `product_discounts[product_key]` after line discounts. |
| Proposal Summary | Showed each product's % without saying which country set it. Reasons were not shown. |

## 2. Changes

**Database.** Migration `f2a3b4c5d6e7` is additive. It reuses the existing `proposal_countries` table, which holds one row per country block of a proposal. No new table.

| Column | Type | Rule |
|---|---|---|
| `subscription_discount_pct` | NUMERIC(7,4) NULL | Check: 0–100 (`ck_proposal_countries_subscription_discount_pct_range`) |
| `subscription_discount_reason` | TEXT NULL | Business justification |
| `service_discount_pct` | NUMERIC(7,4) NULL | Check: 0–100 (`ck_proposal_countries_service_discount_pct_range`) |
| `service_discount_reason` | TEXT NULL | Business justification |

NULL means no discount for that country. Existing rows are untouched. The downgrade drops only these columns. A round trip (upgrade → downgrade → upgrade) was run on a local test database.

**API.**
- `POST` / `PATCH /api/proposals/{id}/countries/{block_id}` accept the four fields.
- Percentages outside 0–100 return 422. `null` clears a value.
- `GET /api/proposals/{id}` returns them.

**Engine** (`pricing_engine.py`, `_overall_discount`):

1. A product's overall % comes from **its own country block**.
2. A % sent in the calculation request is still accepted for a country that has none stored. This keeps older API callers working.
3. If a country has a stored % **and** the request also sends one for the same product, the request is rejected with 400. This guarantees a discount is never applied twice.
4. The snapshot records these per product:
   - `subscription_discount_source` / `service_discount_source`: `country`, `request` or null;
   - `subscription_discount_reason` / `service_discount_reason`.
5. `pricing_context.country_blocks` lists every country's stored discounts.
6. Original and discounted amounts are both kept, for example `subscription_subtotal_before_discount` and `subscription_total_after_discount`.
7. Order of application is unchanged: line discount, then the country's overall subscription %. Services: the country's overall services %.
8. Stored country discounts are part of the input fingerprint. Changing one marks the saved calculation "outdated".
   - The fingerprint gains these values only when one is set, so older proposals are not falsely flagged.

**Frontend.**
- **Page 5** (`PricingPage.jsx`, `PricingEditor.jsx`):
  - The overall sections are titled "Overall Subscription Discount — {country}". They edit only the selected country.
  - The justification box says "saved with this country".
  - **Save:** line discounts go to line items, each changed country's discounts go to its country block, then the proposal is recalculated with **no** product-level request discounts.
  - **Older proposals:** a country with nothing stored shows the % its products got in the last snapshot. Saving stores it on the country.
- **`discountsFromSnapshot`:** no longer re-sends discounts whose source is `country`. Page 4 and Page 6 recalculation would otherwise hit the 400 double-discount rule.
- **Page 6** (`ProposalFinancialTable.jsx`):
  - With "Show Discounts" on, each country's product shows "{Country} overall subscription discount X% — {justification} · Services discount Y% — {justification}".
  - The formula text now says "the overall subscription discount set for that country".

## 3. Calculation examples

FX from the local master: 1 INR = 0.012 USD, 1 EUR = 1.08 USD.

**A. Browser, proposal #44** (India / United States / Germany, 12 months, USD reporting):

| Country | Before discount | Line discount | Country discount | Native total | USD |
|---|---|---|---|---|---|
| India | subscription 620,000 INR; services 96,000 INR | — | subscription 10% "India volume commitment"; services 20% "Bundled rollout" | 558,000 + 76,800 = **634,800 INR** | **7,617.60** |
| United States | subscription 160,000 USD; services 2,400 USD | 10% on the add-on → 144,000 | subscription 5% "US launch partner" | 136,800 + 2,400 = **139,200 USD** | **139,200.00** |
| Germany | subscription 74,000 EUR | — | none | **74,000 EUR** | **79,920.00** |
| **Total** | | | | | **226,737.60** |

API snapshot #48 returned 226,737.6 with exactly these per-country values. The database rows matched what was entered.

**B. Playwright** (`pepm-country-discounts.spec.js`, PEPM, 24 months):
- India: 1,920,000 INR − 10% = 1,728,000 INR → 20,736 USD.
- US: 1,080,000 USD − 5% = 1,026,000 USD.
- Contract total **1,046,736 USD**, the same in the API and on Page 6.

**C. Unit test** (`test_country_overall_discounts.py`, fixture rates): total **241,937.60 USD**. India 10% + 20%, US 5%, Germany 0%.

**D. Line discount then country discount** (unit test): 620,000 × 0.90 (line) = 558,000, then × 0.90 (India) = **502,200**. Each discount is applied once.

## 4. Browser verification (in-app browser, local stack)

| Step | Result |
|---|---|
| Open Page 5 for #44 (old proposal, nothing stored) | Each country showed 5%, carried over from the last snapshot (PASS) |
| India 10% + reason, services 20% + reason; US keeps 5% + reason; Germany cleared | Switching countries kept each value separate (PASS) |
| Save Discounts & Recalculate | `PATCH countries/45` (India) and `PATCH countries/46` (US); Germany unchanged, so not sent; `POST calculate`. All 200 (PASS) |
| Database | IN 10 / 20 with both reasons; US 5 with reason; DE NULL (PASS) |
| Page 6 with Show Discounts | Country-labelled discount rows with justifications; Grand Total **$226,737.60** (PASS) |
| Reload Page 5 | All three countries' values and reasons restored from the database (PASS) |
| Console errors / failed API requests | None (PASS) |

Screenshots: `e2e-screenshots/09-page5-country-discount-india.png`, `e2e-screenshots/10-page6-country-discounts.png`.

## 5. Tests

**Backend** `tests/test_country_overall_discounts.py` (6 tests):
- each country's discount applies only to that country;
- discounts and reasons are stored and returned, and clearing works;
- line then country discount are each applied once;
- request + stored discount gives 400, while a request discount for a country without one still works;
- 0–100 validation (422);
- changing a country discount marks the snapshot stale.

**Backend PostgreSQL** `tests/test_country_overall_discounts_pg.py`: two countries, real check constraint (150% is rejected by the database).

**Frontend** `PricingPage.test.jsx`:
- saving sends one country PATCH and a calculation with no product discounts;
- stored values and reasons are restored;
- countries are kept separate, and only the edited country is saved.

**Frontend** `countryOverallDiscounts.test.jsx`: `discountsFromSnapshot` skips country-sourced discounts; Page 6 shows the country name and reasons.
