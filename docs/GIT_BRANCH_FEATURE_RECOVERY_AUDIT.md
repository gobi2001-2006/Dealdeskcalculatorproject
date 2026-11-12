# Git Branch Feature Recovery Audit

Date: 2026-11-12 · Working branch: `feature/ui-font` (HEAD `57c5319`) · **Nothing committed or pushed.**

## 1. Protection of current work

- I worked on top of the dirty tree and never reset, cleaned, rebased, stashed or force-pushed it.
- Before any merge, I backed up all 25 touched files, plus `working-tree.patch` and `status.txt`, to the session scratchpad (`backup-before-587be2f/`).
- I read the reference branches with `git show`, `git log` and `git diff`, and with a temporary worktree that I removed afterwards. I never checked them out over the working tree.

## 2. Branches inspected

| Branch | Tip | Commits not in HEAD | Verdict |
|---|---|---|---|
| `feature/frontend-backend-integration` (local) | `587be2f` | `f82966b`, `51610ba`, `aae65a8`, `587be2f` | Source of everything recovered |
| `origin/feature/frontend-backend-integration` | `aae65a8` | same, without `587be2f` | `587be2f` is **local-only, never pushed** |
| `origin/feature/backend-api` | `8cb65bd` | `815f231` and its revert `8cb65bd` | Net zero against `61d9a37`; nothing to recover |
| `feature/backend-api` (local) | `4749240` | old ancestor | Nothing to recover |

Merge base of HEAD and the integration branch: `e072254`.

## 3. Feature comparison

| Feature | HEAD (`57c5319`) | Integration branch | Action |
|---|---|---|---|
| Line-item discounts (subscription and service %) | Present since `e072254` | Same | Kept (Case A) |
| Country-wise overall discounts (sub/svc % + reason) | Missing | `f82966b` (backend) and `51610ba` (frontend) | Recovered earlier in this tree (Case B) |
| PEPM ESS / non-ESS UOMs (migration `a3b4c5d6e7f8`) | Missing | `f82966b` | Recovered (Case B) |
| Contract duration in years, stored term (`c5d6e7f8a9b0`) | Missing | `587be2f` | **Recovered now** (Case B) |
| Page 4 base pricing (`/calculate/base`), Page 5 net | Missing | `587be2f` | **Recovered now** (Case B) |
| Gobi's UI refresh (fonts, spacing, cards) | Present | Missing | Kept; merged around it (Case C) |
| Proposal Summary product identity | Defective in both | Defective in both | **New fix** (Case D) |

## 4. Recovery method

For each file, I ran `git merge-file` with base `aae65a8`, ours = the working file and theirs = `587be2f`. I normalised CRLF before the merge and restored it afterwards.

- **Merged cleanly:** backend proposal routes, models, schemas, pricing engine and proposal service; frontend `proposalsApi.js`, `calculatorData.js`, `AddCountryModal.jsx`, `CountryConfigCard.jsx`, `PricingPage.jsx`, `CommercialSummaryCard.jsx`, `calculationView.js`, `vite.config.js`, and four test files.
- **Added:** `c5d6e7f8a9b0_proposal_contract_term.py`, `test_base_pricing_and_contract_term.py`, `contractDuration.js`, `e2e/base-vs-discount.spec.js`, `e2e/pepm-country-discounts.spec.js` (from `51610ba`), and the 587be2f docs and screenshots.
- **Conflicts resolved by hand.** I kept Gobi's markup and classes and took 587be2f's logic:
  - `IncludedProductsSidebar.jsx`
  - `PricingEditor.jsx`
  - `ProposalSummaryPage.jsx`
  - `ProposalFinancialTable.jsx`
  - `CalculatorPage.jsx`
  - `CalculationModal.jsx` (6 hunks)

## 5. Not done (needs your approval)

- **Neon is behind by 3 migrations:** `f2a3b4c5d6e7`, `a3b4c5d6e7f8` and `c5d6e7f8a9b0`. The recovered code needs them applied, so take a backup first and then run `alembic upgrade head` on Neon. I did not touch Neon.
- **`587be2f` exists only on your machine.** Push it, or commit this tree, so it is not lost.
