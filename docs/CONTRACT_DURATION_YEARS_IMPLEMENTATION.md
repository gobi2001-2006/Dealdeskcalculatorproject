# Contract Duration in Years

Date: 2026-11-06 · Branch `feature/frontend-backend-integration` · Not committed

## 1. Rule

- Users enter and see **years**.
- The backend stores and prices **months**: `contract_months = contract_years × 12`.
- The conversion lives in one place: `frontend/src/utils/contractDuration.js`, with `MONTHS_PER_YEAR = 12`, a calendar constant.

| Input | Stored |
|---|---|
| 1 year | 12 months |
| 2 years | 24 months |
| 3 years | 36 months |
| 4 years | 48 months |
| 5 years | 60 months |

Existing data in months is shown in years: 60 → 5 years, 24 → 2 years. An older non-whole term such as 18 months shows as 1.5 years, and saving asks for whole years.

## 2. Database (migration `c5d6e7f8a9b0`, additive)

- `proposals.contract_term_months INTEGER NULL`, with `CHECK (contract_term_months IS NULL OR contract_term_months > 0)`.
- **Why:** until now the term lived only inside calculation snapshots, which are request inputs. Page 4 no longer writes snapshots (base pricing is a preview), so the duration needed a place on the proposal.
- **No conflicting fields:** months is the only stored unit, and snapshots keep their own copy for audit.
- **No backfill:** existing proposals keep NULL and show the term of their latest snapshot until they're next saved.
- Upgrade → downgrade → upgrade was tested on a local test database.

## 3. API

- `POST` / `PATCH /api/proposals/` accept `contract_term_months` (1–120).
- `POST /calculate` and `POST /calculate/base`:
  - use the proposal's saved term when the request omits it;
  - reject a different term with **400** ("saved as 60 months; the request asked for 36");
  - with no saved term, a request term still works (older proposals and API callers), and the 12-month default is unchanged.
- `GET /calculations/latest` marks the snapshot **outdated** when the saved term differs from the snapshot's term.

## 4. UI labels

| Where | Before | After |
|---|---|---|
| Page 4 country card | "Contract Term (Mo)" | **"Contract Duration (Years)"** (whole years, minimum 1) |
| Page 4 header chip | "60 Months" | "5 years" |
| Add Country dialog | "Contract Term (Months)" | "Contract Duration (Years)" |
| Calculation dialog | "Full Contract Value (USD, 60 months)" | **"FULL CONTRACT VALUE (USD, 5 YEARS)"**, generated from the term |
| Page 5 sidebar / header | "60m", "Contract term 60 months" | "5 years", "Contract duration 5 years" |
| Page 5 summary card | "Subscription FCV (Net, 60 mo)" | "Subscription FCV (Net, 5 years)" |
| Page 6 card and table header | "Subscription (60 mo)" | "Subscription (5 years)" |

## 5. Edge cases

| Case | Behaviour | Test |
|---|---|---|
| 1 year / 5 years | 12 / 60 months; FCV label "1 year" / "5 years" | Vitest, Playwright |
| 0 or negative years | "Contract duration must be at least 1 year" in the UI; the API rejects 0 / −12 with 422 | `test_contract_term_validation` |
| Decimal years (1.5) | "must be a whole number of years"; nothing is saved | `rejects a duration that is not a whole number of years` |
| Above the maximum | The API rejects > 120 months (422) | `test_contract_term_validation` |
| Existing proposal stored in months | Shown in years from the latest snapshot | `shows the duration saved on the proposal in years` |
| Duration changed after a snapshot | Saved snapshot flagged outdated; Page 5 re-prices with the new term (3 years: base 3,480,000, net 3,132,000) | Playwright, `test_changing_the_saved_term_marks_the_calculation_outdated` |
| Duration changed after discounts are configured | Discounts kept; net = base × (1 − 10%) for the new term | Playwright |
| Request contradicting the saved term | 400 | `test_saved_contract_term_is_used_and_cannot_be_contradicted` |

## 6. Open business questions

- **Maximum duration:** the API limit of 120 months (10 years) predates this work and has no documented source. Confirm or change it. The `contract_terms` master holds standard terms (locally only 12 months) and is not used as a limit.
- **Missing term:** for API calls on proposals without a saved term the engine still defaults to 12 months. Should a term be mandatory?
