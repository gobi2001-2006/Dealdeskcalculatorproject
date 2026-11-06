# Business Rule Decisions (voice note, 2026-11-03)

Date recorded: 2026-11-06 · Branch `feature/frontend-backend-integration` · Not committed

## Source

- **Voice note:** `WhatsApp Ptt 2026-11-03 at 7.24.13 PM.ogg` (67 seconds).
- **How the decisions were captured:**
  - No speech-to-text tool was available on this machine.
  - The user chose to type the decisions rather than install one.
  - The audio itself was **not** transcribed by the assistant.
- **The user's text, verbatim:**
  > percentage can be defined at country level then pepm allow to Active with ESS and Non-ESS
  > dropvalue as Active with ESS and Non-ESS
- **Supporting evidence the user attached:**
  - A screenshot of `calculation explained.xlsx`, rows 73–95. It says "UOM1 for license, platform, or PEPM could be — Active Employees (with ESS), Active Employees (non-ESS)".
  - Two calculator screenshots: 250,000 + 4,800,000 = 5,050,000 and 500,000 + 9,000,000 = 9,500,000.

## Decisions

| Question | Decision | Explanation | Implementation impact |
|---|---|---|---|
| Overall discount scope | **Set per country.** Each country in a proposal has its own overall discount %. | A multi-country proposal prices each country in its own rate card and currency. The discount follows the same boundary. One country's discount never changes another country's figures. | **Backend:** 4 nullable columns on the existing `proposal_countries` table; the engine applies each block's % to that block's products only. **Frontend:** Page 5 edits and saves the % and justification per country; Page 6 shows them per country. |
| PEPM UOM eligibility | **Both** Active Employees (with ESS) **and** Active Employees (non-ESS). Both appear in the dropdown. | Matches the workbook: PEPM blocks for self-service users (rows 53–60) and non self-service users (rows 63–70), and the UOM1 note (row 74). | **Data only:** `pricing_models.uom_locked_id` cleared for PEPM; `pricing_model_uoms` holds PEPM → ESS (default) and PEPM → non-ESS. No code rule names PEPM. The allowed-UOM API, rate-card validation and dropdowns read these rows. |

## Interpretations to confirm

These follow from the decisions, but the typed note does not state them word for word.

1. **The services discount is also per country.** Page 5 has two overall discounts: subscription and services. Both are now set per country. Before, both were one value applied to every product.
2. **Fixed-amount discounts are still not supported.** The decision says "percentage", so only percentages are stored.
3. **Line-item discount reasons stay screen-only.** Only the overall discounts got stored justifications.

## Related confirmation from the screenshots

- The calculator screenshots confirm the contract total is the platform fee for every year plus the subscription for every year.
  - Non-ESS Tier 2 = 250,000 + 4,800,000 = **5,050,000**.
  - Non-ESS Tier 3 = 500,000 + 9,000,000 = **9,500,000**.
- The workbook's cached cells D25:E25 (1,010,000 / 1,900,000) and D12:E12 use a one-year formula and are wrong.
- The engine already returned 5,050,000 and 9,500,000. This was tested in `test_workbook_pricing.py::test_platform_subscription_workbook`. No calculation change was needed.
- This resolves open question 1 of `PRICING_CALCULATION_AUDIT.md` §7.

## Not decided here (still open)

- Rounding policy and locking the FX rate when a proposal is signed.
- Approval thresholds and enforcement. The `approval_thresholds` table is now shown read-only on Page 5, but it is empty and nothing enforces it.
- Whether a contract term should be mandatory. The API defaults to 12 months when none is sent; Page 4 always sends one.
