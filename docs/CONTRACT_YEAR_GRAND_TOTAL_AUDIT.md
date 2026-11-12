# Contract Duration (Years) and Grand Total Audit

## Behaviour

- On Page 4 the user enters the duration in **whole years** (`Contract Duration (Years)`). `frontend/src/utils/contractDuration.js` converts it with `contract_months = years × 12`.
- **Validation messages:**
  - `0` → "at least 1 year"
  - `1.5` → "whole number of years"
  - Blank → required.
- **Persistence and compatibility:**
  - The term is stored in `proposals.contract_term_months` (migration `c5d6e7f8a9b0`, additive and nullable).
  - Old proposals without a stored term still load, and the snapshot term is used for display.
  - A calculate request whose term contradicts the stored term is rejected with **400**, so a stale tab cannot silently re-price.
- **Labels:**
  - FCV: "Full Contract Value (USD, N years)".
  - Page 6 and the export: "Subscription (N years)".

## Grand total formula (backend `pricing_engine.py`)

```
annual_subscription  = Σ lines (fixed fee + unit rate × qty × periods/yr) × FX
contract_subscription = annual_subscription × contract_months / 12
grand_total (FCV)    = contract_subscription + one-time services
```

Page 4 shows the **base** values (`total_proposal_base_*`). Pages 5 and 6 show the **net** values after discounts.

## Verified in the browser (E2E `base-vs-discount.spec.js`, local DB)

| Scenario | Annual base | Contract base | Net after 10% | Result |
|---|---|---|---|---|
| 5 years | 1,160,000 | 5,800,000 | 5,220,000 | ✅ |
| 3 years (changed on Page 4) | 1,160,000 | 3,480,000 | 3,132,000 | ✅ |

- Changing the duration marks the saved snapshot `is_stale = true`. Recalculating on Page 5 clears it.
- The backend tests in `test_base_pricing_and_contract_term.py` cover 1, 2, 3 and 5 years, a contradicting term, and a missing term.
- Screenshots:
  - `docs/e2e-screenshots/11-page4-base-pricing-5-years.png`
  - `docs/e2e-screenshots/13-page6-net-5-years.png`
