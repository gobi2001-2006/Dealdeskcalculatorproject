# Page 4 / Page 5 Calculation Separation

Date: 2026-11-06 · Branch `feature/frontend-backend-integration` · Not committed

## 1. Before

- Page 4 ("Calculate Pricing") called `POST /api/proposals/{id}/calculate`. That call:
  - applies every saved discount (line items and the country blocks);
  - writes an immutable snapshot;
  - refreshes the cached net prices on the line items.
- Page 4 also re-sent product discounts read from the last snapshot.
- So Page 4 showed **net** figures, for example proposal 31's "Subscription Total (Net) 1,044,000" and "Full Contract Value 5,220,000".
- Page 4 also wrote audit snapshots that Pages 5 and 6 then read as "latest".

## 2. After

```
Page 4  POST /calculate/base  -> base pricing, no discount, nothing saved
           |  (lines, quantities, duration saved on the proposal)
Page 5  discounts saved on line items and country blocks, then POST /calculate
           |  -> authoritative net pricing, immutable snapshot
Page 6  reads the latest snapshot (net, with base alongside)
```

| | Page 4 Proposal Configurator | Page 5 Pricing & Discounts |
|---|---|---|
| Endpoint | `POST /api/proposals/{id}/calculate/base` (new) | `POST /api/proposals/{id}/calculate` |
| Discounts | None: line, country and request discounts are all ignored | Line, then the country's overall subscription %, then the country's services % |
| Writes | Nothing: no snapshot and no cached line amounts. The engine session is rolled back | Immutable snapshot plus cached line amounts (draft versions) |
| Shown | Unit rate, UOM, quantity, annual consumption, annual platform fee, duration in years, Year 1 base, contract base, base services, base contract value | Net per line and product, the discounts and justifications, Year 1 and contract net, with base kept in the payload |
| Shared state | Its own `baseResult`; never touches the shared `calcApiResult` | Writes `calcApiResult` (also used by Page 6) |

## 3. Engine output: four figures kept apart

Every calculation, base or discounted, now returns these in the snapshot payload (reporting currency):

| Figure | Field |
|---|---|
| Year 1 base | `total_proposal_base_annual_reporting_currency` |
| Year 1 net | `total_proposal_annual_reporting_currency` |
| Contract base | `total_proposal_base_contract_reporting_currency` |
| Contract net | `total_proposal_contract_reporting_currency` |

Other fields:
- **Splits:** `total_subscription_base_annual_…`, `total_subscription_base_contract_…`, `total_services_base_…` and `total_discount_contract_reporting_currency`.
- **Per product:** `subscription_base_annual`, `contract_subscription_base`, `service_base`, `product_base_native_total`, `contract_product_base_native_total` and the reporting equivalents.
- **Run metadata:** `pricing_stage` (`base` or `discounted`) and `contract_term_years`.

Snapshots written before this change have no base fields; the UI then falls back to the existing fields.

## 4. Results

**Proposal 31 copy** (Tier 2, 20,000 ESS, 200,000 + 4 / month, 5 years, 10% US):

| | Year 1 | 5 years |
|---|---|---|
| Page 4 base | 1,160,000 | 5,800,000 |
| Page 5 net | 1,044,000 | 5,220,000 |
| Page 6 | 1,044,000 | 5,220,000 (base 5,800,000 shown in the recalculation dialog) |

**Unit test with a 5% line discount and a 10% country discount:**
- net = 1,160,000 × 0.95 × 0.90 = **991,800** (Year 1) and **4,959,000** (contract);
- base unchanged at 1,160,000 / 5,800,000;
- discount over the contract: 841,000;
- the base call added no snapshot and left the cached line amount unchanged.

## 5. Files

**Backend:**
- `services/pricing_engine.py`: `calculate_base_pricing`, `apply_discounts` / `persist` flags, base totals, `pricing_stage`.
- `api/routes/proposals.py`: `POST /{id}/calculate/base`; shared `_run_pricing` error mapping.
- `schemas/proposals.py`: `BasePricingRequest`; `snapshot_id` is optional; `pricing_stage`.

**Frontend:**
- `api/proposalsApi.js`: `calculateBasePricing`, `requestBasePricing` (replaces `requestProposalCalculation`), `proposalTermMonths`.
- `features/calculator/CalculatorPage.jsx`: own `baseResult`; base on load and on Calculate; strip shows "(base)".
- `features/calculator/components/CalculationModal.jsx`: stage-aware (base on Page 4, net on Page 6).
- `utils/calculationView.js`: base totals and `pricingStage`.

**Tests:**
- `backend/tests/test_base_pricing_and_contract_term.py` (8);
- `ProposalConfiguratorPage.test.jsx`, `ProposalSaveWorkflow.test.js`;
- `e2e/base-vs-discount.spec.js`.

## 6. Open points

- Page 6's "Recalculate" re-applies the saved discounts (it doesn't configure any); that is intended.
- Gross margin is still not calculated (no cost-rate engine).
