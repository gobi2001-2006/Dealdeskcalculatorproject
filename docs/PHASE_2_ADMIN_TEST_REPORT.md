# Phase 2: Admin Module Test Report

Date: 2026-11-16. Every result below comes from a run made in this session. All databases were **local throwaway PostgreSQL 18 databases** (port 54329: `dealdesk_test` for pytest, `dealdesk_e2e_test` for the browser runs). **Neon was not used.**

## 1. Automated suites

| Suite | Command | Result |
|---|---|---|
| Backend (all, incl. PostgreSQL integration) | `pytest` with `TEST_DATABASE_URL` set to local PG | **767 passed, 0 failed**, 1 skipped (pre-existing skip) |
| New: `tests/test_admin_module_pg.py` | part of the above | **10 / 10 passed** |
| Alembic offline SQL tests (waves 1–6) | part of the above | Pass, with the new migration included |
| Frontend unit (Vitest) | `npx vitest run` | **187 passed** (22 files), including 5 new tests in `AdminModule.test.jsx` |
| Frontend build | `npx vite build` | OK |
| ESLint on the Admin files | `npx eslint src/features/admin src/api/adminApi.js src/api/client.js …` | **0 problems** |
| ESLint on the whole repo | `npx eslint .` | **35 errors, 2 warnings, all in files from commit `979fa83`**, which this work did not touch: `ratesApi.js`, `ProposalContext.jsx`, `HubSpotImportPage.jsx`, `ProposalContentPage.jsx`, `ProposalPreviewModal.jsx`, `ProposalReviewSubmitPage.jsx`, and 2 test files |
| Browser E2E regression (Playwright, Chrome) | `npx playwright test` | **14 / 14 passed** in the last 2 full runs. `workbook-pricing.spec.js:97` failed in 2 of 4 full runs and passed alone. It is timing-flaky, and its pricing path is not touched by this work |

## 2. Requirement coverage (backend tests)

| Area | Checked |
|---|---|
| **Users** | Create; duplicate email (case-insensitive) → 409; edit name / role / region; deactivate; search by name and by region; unknown region → 400; last Admin cannot be deactivated or demoted; unreferenced user deleted (204); data owner → 409 "Deactivate" |
| **Authorization** | Set-up mode is open. After the first Admin exists: no header → 401; Sales → 403; CFO saving the matrix → 403; Admin → 200 |
| **Permissions** | Spec defaults; Admin lock-out protection → 400; unknown permission → 400; granting CCXO "Manage users" takes effect immediately (403 → 200); reset restores 403 |
| **Workflow** | Ceilings are not invented when unset; a percentage above 100 → 400; reminder later than SLA → 400; save 15/20/30 + SLA 48/24/72→CFO; the ceilings appear in the existing `/masters/approval-thresholds` endpoint; BH mapping rejects a non-BH user; country assignment |
| **Integration** | An 18% line on an India proposal → `commercial_line` is required and assigned to India's BH; `commercial_proposal` is not required. A user without permission cannot submit (403); Sales can. Out-of-order decision → 400; BH of another region → 403; Legal on a commercial stage → 403. The full chain ends `approved` |
| **Rejection** | An empty comment → 400. Rejecting returns the proposal; Sales and regional Presales are notified |
| **Legacy** | Submit without `X-User-Id` still works |
| **Notifications** | 9 rules with the spec defaults; bad recipient role → 400; rule update persisted; preview merge (unknown field left visible); sender validation; test send logged as simulated; disabled and off-by-default rules send nothing; recipients resolved dynamically (BH by region, Sales = owner, CFO, Legal); the body contains the merged values |

## 3. Manual browser walkthrough (`http://localhost:5183/admin`, local backend on 8010)

1. **Set-up mode.** The banner was shown. On Approval Workflow, I entered 15 / 20 / 30 % and SLA 48 / 24 / 72 → CFO and saved. A reload and the API showed the saved values.
2. **Users.** I added "Rahul Iyer", Business Head, India; the role card counts updated. Adding a duplicate email in upper case showed "A user with email … already exists." The region list came from the region master plus "Global". I assigned the seed user Admin / Global; the set-up banner disappeared.
3. **Enforcement (curl).** No header → 401; the BH user → 403; Admin → 200.
4. **Roles & Permissions.** The matrix matched the reference screenshot. I ticked CCXO → Manage users and saved: "Permissions saved."
5. **Regional Business Heads.** Only Business Head users were offered. I saved India → Rahul Iyer with the country India.
6. **Email Notifications.** The rules and recipients matched the screenshot. I inserted a merge field at the cursor, the live preview updated, and I saved the template. A test send before the sender was configured was logged with the warning "Sender 'From' address is not configured". I saved the sender settings, and the delivery was shown as *Simulated*.
7. **End-to-end through the existing workflow** (API, as named users):
   - The route came from the admin configuration: India → Rahul Iyer, Legal → Anita Desai, CFO → Suresh Krishnan.
   - Admin submitting → 403.
   - Sales submitting was blocked by the existing readiness checklist until content was filled. It then succeeded.
   - L1 before commercial → 400; Legal on commercial → 403.
   - Then Commercial → L1 → L2 Legal → L2 CFO → **approved**.
   - The Email log (UI) showed 23 entries across the 7 events, with correct recipients.

## 4. Not tested or not possible

- **Real email delivery:** no relay exists. Delivery is simulated by design.
- **SSO and login:** they do not exist. "Last sign-in" is not populated.
- **SLA reminder and escalation execution:** no scheduler exists.
- **Neon migration:** not run. It needs your approval.
