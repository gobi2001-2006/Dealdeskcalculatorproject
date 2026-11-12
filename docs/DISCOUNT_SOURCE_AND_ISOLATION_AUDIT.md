# Discount Source and Isolation Audit (proposal 31)

Date: 2026-11-06 · Branch `feature/frontend-backend-integration` · Not committed

## 1. Answer: where the 10% comes from

**The 10% belongs to proposal 31. It is stored on proposal 31's own United States country block, and it is applied once.**

Inspection method:
- read-only SQL against the database named in `backend/.env` (Neon), in a session opened with `default_transaction_read_only=on`;
- only `SELECT` statements were run; **no row was changed**.

| Question | Finding |
|---|---|
| 1. Where is it stored? | `proposal_countries` row **18** (proposal 31, United States): `subscription_discount_pct = 10.0000`. The justification (`subscription_discount_reason`) is **empty**. |
| 2. Does it belong to proposal 31? | Yes. The row's `proposal_id` is 31. No other proposal has an overall discount; the only other discounts are line discounts on proposals 24, 25 and 27's own lines. |
| 3. Which product or country? | The **United States country block**. Since 2026-11-06 overall discounts are set per country, so the 10% applies to every product priced in that country. |
| 4. Copied from an earlier calculation? | No. It first appears in snapshot **#62** (2026-11-06 10:54 UTC) with source `country`, written when Page 5 was saved. Snapshot #61 (10:51) has none. |
| 5. Applied once or several times? | Once. Snapshot #68 shows subscription 1,160,000 → 1,044,000 (exactly −10%), with the line discount at 0. |
| 6. Does it survive switching proposals? | It stays on proposal 31 only. The frontend uses no localStorage or sessionStorage; see §3 for the in-memory risk that was fixed. |
| 7. Is it in an immutable snapshot? | Yes. Snapshots #62–#68 record it with `subscription_discount_source = "country"`. Snapshots are immutable (database trigger). |

**Why it looked "inherited":**
- The discount was saved on Page 5 at 10:54, while the US product was **SKU-509** (360,000 / year).
- Afterwards the line was changed on Page 4: more quantity, then the **DEV TA Max** pack at 20,000 employees.
- Because the discount belongs to the **country**, it stayed and now applies to the new pack. This is the approved country-level rule, not a leak.
- Page 4 also showed the discounted figure (1,044,000), because its calculation applied every saved discount. That was the real defect; see `PAGE4_PAGE5_CALCULATION_SEPARATION.md`.

**Snapshot history** (read-only extract):

| Snapshot (UTC) | Product @ country | Before | Discount | After |
|---|---|---|---|---|
| #59 10:47 | SKU-509 | 360,000 | 0 | 360,000 |
| #61 10:51 | SKU-509 @US, SKU-509 @IN | 360,000 | 0 | 360,000 |
| #62 10:54 | SKU-509 @US | 360,000 | **10% (country)** | 324,000 |
| #63 10:55 | @US 10%, @IN 5% | | | |
| #64–#67 | SKU-509 (India block removed; quantity changed) | 360,000 → 960,000 | 10% (country) | |
| #68 11:10 | DEV_TA_MAX (pack, 20,000 ESS) | 1,160,000 | 10% (country) | 1,044,000 |

**Decision:** the discount is legitimate, so it was **preserved**. Proposal 31's data was not modified.

**Recommendation:** open proposal 31 on Page 5 and either add a justification for the 10% or clear it if it was meant for SKU-509 only.

## 2. Expected results for proposal 31 (verified on an isolated local copy)

The copy matches proposal 31: US, Shared Cloud, Platform + Subscription (with ESS), Tier 2, 20,000 employees, 200,000 / year, 4 / employee / month, 5 years, 10% US discount. It was built by `e2e/base-vs-discount.spec.js` on the local test database.

| Stage | Expected | Actual |
|---|---|---|
| Page 4, Year 1 base | 1,160,000 | 1,160,000 |
| Page 4, 5-year base | 5,800,000 | 5,800,000 ("FULL CONTRACT VALUE (USD, 5 YEARS)") |
| Page 5, Year 1 net | 1,044,000 | 1,044,000 |
| Page 5, 5-year net | 5,220,000 | 5,220,000 |
| Page 6 | 5,220,000, "Subscription (5 years)" | identical |
| Page 4 after the Page 5 save | still 5,800,000 (base) | identical |
| Saved discount after the Page 4 "Calculate" | 10% kept | kept |

## 3. Isolation

| Scenario | Result |
|---|---|
| A: 10% on Page 5, then Page 4 | Page 4 shows base 5,800,000; the discount stays saved (PASS, Playwright) |
| B: new proposal | No discount on Page 4 or Page 5; net equals base, 5,800,000 (PASS, Playwright) |
| C: change, save, reload | 10 → 12% restored after reload (PASS, Playwright) |
| D: switch A → B → A in one browser session | Discount state is cleared when another proposal opens; values and reasons never carry over (PASS, Vitest `does not show another proposal's discounts`) |
| E: two tabs with different proposals | Editing A never changes B's screen or database row (PASS, Playwright) |
| Page 5 load fails for proposal B while A's state is in memory | **Defect fixed.** Previously "Save" could write A's on-screen discounts onto B. Saving is now blocked until B's own discounts have loaded (Vitest `blocks saving when this proposal's discounts did not load`) |
| Screen-only line-discount reasons | **Defect fixed.** A reason typed on A could reappear on B when the country + pack key matched. Reasons now carry over only while the same proposal stays open |
| Concurrent edits | Last save wins. Each save re-reads the proposal and only PATCHes changed fields; there is no optimistic locking (open point) |
| Duplicate save clicks | The button is disabled while a save runs |

## 4. Files changed for isolation

- `frontend/src/features/pricing/PricingPage.jsx`:
  - `discountsLoadedFor` save guard;
  - state reset when another proposal opens;
  - the term comes from the proposal.
- `frontend/src/test/PricingPage.test.jsx`: 2 isolation tests.
- `frontend/e2e/base-vs-discount.spec.js`: scenarios A, B, C and E.
