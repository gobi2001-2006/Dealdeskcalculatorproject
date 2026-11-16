# Phase 2 — Admin Module Hardcoded Value Audit

Date: 2026-11-17 · Branch `feature/ui-font` · Not committed · Local test databases only (Neon untouched)

**Scope:** Users, Roles & Permissions, Approval Workflow and Email Notifications, frontend and backend, plus the approval logic that consumes the Admin configuration (`proposal_workflow_service.py`) and the Review & Submit page that displays it.

**Rule applied:** screenshots define layout only. Every business value comes from PostgreSQL through the API, or is shown as "Not configured".

## 1. Decision on initial configuration (approved)

Asked before implementation. Answer (2026-11-17): **"Keep v3.1 defaults as approved setup."**

- **Migration `d6e7f8a9b0c1`:** now creates **structure only**. It no longer inserts permission grants, approval stages or notification rules. It adds a nullable `roles.description` column.
- **Approved values:** live in one module, `backend/app/services/admin_setup.py`, with the approval date and source. The application **never reads them at run time**. They reach the database only when someone deliberately:
  - runs `python -m scripts.setup_admin_defaults` (dry run) or `--apply`, which fills only what is missing and never overwrites Admin edits (tested);
  - presses **Reset to defaults** (permission matrix) or **Reset template** (one notification template).
- **Not in the approved setup, entered by the Admin:**
  - discount ceilings and the gross margin floor;
  - SLA, reminder and escalation hours, and the escalation role;
  - regions and their Business Heads;
  - users;
  - sender name, From, Reply-To and CC addresses, and the Deal Desk URL.

## 2. Findings and actions

### Backend

| File | Value or configuration | Classification | Action |
|---|---|---|---|
| `migrations/.../d6e7f8a9b0c1_admin_module.py` | `DEFAULT_PERMISSIONS`, 5 `STAGES` (approver roles, routing), 9 `RULES` (recipients, subjects, templates) inserted automatically | Business configuration (seed data) | **Removed** from the migration; moved to the approved setup (§1) |
| `app/services/permission_service.py` | `DEFAULT_PERMISSIONS` (Reset to defaults) | Business configuration | **Moved** to `admin_setup.PERMISSIONS` (approved), used only by the reset action |
| `app/services/permission_service.py` | `ADMIN_ROLES` with labels ("Sales", "CFO", …) and `ROLE_LABELS` | Business labels duplicated in code | **Replaced:** labels and descriptions come from the `roles` table (`admin_roles(db)`, `role_labels(db)`). Code keeps only `ADMIN_ROLE_CODES`, the role codes the logic implements (the same set the `roles` check constraint allows) |
| `app/services/admin_service.py` | `ENGINE_FALLBACK = {line 15, overall 10, gm 50}` | Hardcoded percentages | **Removed.** A missing ceiling is `configured: false`, `value_pct: null` |
| `app/services/proposal_workflow_service.py` (readiness) | Ceiling fallbacks 15 / 10 / 50; approver fallbacks "Pricing Desk" / "Business Head"; **65% assumed gross margin**; currency fallback "USD" / "$" | Hardcoded business values / invented data | **Removed.** Ceilings come from `approval_thresholds` only; approver names from the configured stages; gross margin only when the engine calculated one; currency from the proposal |
| `app/services/proposal_workflow_service.py` (legacy route, used when no stages exist) | Ceilings 15 / 10 / 50; "CFO if discount > 25% or margin < 35%"; Business Head "always"; names "Pricing Desk Analyst", "Chief Financial Officer", "Sales Lead"; 65% margin | Hardcoded approval rules | **Removed.** Without configured stages the route is `route_source: "not_configured"` with a configuration issue, and **submission is blocked** ("The approval workflow is not fully configured: …") |
| `app/services/proposal_workflow_service.py` | Missing ceiling | (new rule) | Commercial stages show "… ceiling not configured" and submission is blocked; nothing is assumed |
| `app/services/proposal_workflow_service.py` `_fmt_money` | "USD" in email values | Hardcoded currency | **Replaced** by the proposal's reporting currency from the calculation snapshot |
| `app/services/notification_service.py` `SAMPLE_CONTEXT` | "Rahul Iyer", "Priya Sharma", "PROP-0000", "USD 120,000.00", thresholds 15 / 20, "Sample pack — 18%" | Sample / dummy records | **Removed.** Preview and test send use a **real proposal** (chosen, else the latest): its owner, deal, company, region, value, configured ceilings, actual breaches, current stage, last decision. With no proposal, fields stay visible as `{{field}}` |
| `app/services/notification_service.py` | Recipient labels | Business labels | **Added** `recipient_labels(db)` from the `roles` table ("Sales" = the proposal owner) |
| `app/api/routes/admin.py` | No "Reset template" endpoint (screenshot shows the button) | — | **Added** `POST /api/admin/notifications/rules/{event}/reset` (approved template) |
| `app/api/routes/auth.py` | Demo-role labels from `ADMIN_ROLES` | Business labels | **Replaced** with role names from the database |
| `app/services/permission_service.py` `ADMIN_LOCKED` | "Manage users" and "Manage roles & permissions" always held by the Admin role | Technical safety rule | **Kept and enforced:** with nothing seeded, the first Admin would otherwise be locked out (tested) |
| `app/services/permission_service.py` `PERMISSIONS` | Permission codes and labels | Code concept (each one is checked by a route) | Keep |
| `app/services/permission_service.py` `STAGE_PERMISSION` | Stage code → permission code | Code concept | Keep |
| `app/services/notification_service.py` `RECIPIENT_ROLES`, `MERGE_FIELDS`, `DELIVERY_MODE = "simulated"` | Recipient codes the resolver implements; fields the code can fill; no mail relay | Code concept / technical | Keep |
| `app/services/admin_service.py` `GLOBAL_REGION = "Global"`; `notification_service.proposal_region` → "Global" | Sentinel meaning "not region-specific" | Technical | Keep |
| `migrations/.../d6e7f8a9b0c1_admin_module.py` | Legal and CCXO rows in `roles` | Role catalogue (reference data; codes pinned by a check constraint, like the existing 6 roles from migration `c3d4e5f6a7b8`) | Keep |
| `app/services/proposal_workflow_service.py` | 20 MB attachment limit; payment milestones must total 100% | Technical limit / arithmetic rule | Keep (outside the Admin scope) |

### Frontend

| File | Value or configuration | Classification | Action |
|---|---|---|---|
| `features/admin/adminConstants.js` `ROLE_BLURBS` | Role descriptions | Business text duplicated in code | **Removed.** Users tab shows `roles.description` from the API ("No description" when empty) |
| `features/admin/adminConstants.js` `RECIPIENT_LABELS` | Recipient labels | Business labels | **Removed.** Uses `meta.recipient_labels` |
| `features/admin/adminConstants.js` `ROLE_STYLES` | Icon and colour per role code | UI constant | Keep |
| `features/admin/ApprovalWorkflowTab.jsx` | "Not configured — the approval check currently uses {fallback}%" | Shows a hardcoded percentage | **Replaced** by "Not configured — enter a value and save." |
| `features/admin/ApprovalWorkflowTab.jsx` | Route preview first step "Sales / Presales" | Hardcoded role mapping | **Replaced** by `submitter_roles` (roles granted *Submit for approval*), or "No role can submit" |
| `features/admin/ApprovalWorkflowTab.jsx` | "… reminder rule is off by default" | Claims a default | **Removed** |
| `features/admin/ApprovalWorkflowTab.jsx` | No empty state for stages or the route | — | **Added** "No approval stages are configured …" and "No active approval stages." |
| `features/admin/EmailNotificationsTab.jsx` | "Live preview (sample data)" | Sample data | **Replaced** by "Live preview · using {proposal}" with real From / To, or "no proposal yet — merge fields are shown unfilled" |
| `features/admin/EmailNotificationsTab.jsx` | — | — | **Added** Reset template button; empty state when no rules exist |
| `features/admin/RolesPermissionsTab.jsx` | "Reset … to the default permissions from the specification" | — | Wording now names the approved initial setup; **added** notice when no permission is granted |
| `features/admin/UsersTab.jsx` | Role counts | — | Already computed from the user records (kept) |
| `features/proposals/ProposalReviewSubmitPage.jsx` | Effective Discount card orange when `> 10` | Hardcoded percentage | **Replaced** by the configured ceiling's `is_breached` |
| `features/proposals/ProposalReviewSubmitPage.jsx` | `ceiling_pct.toFixed()` | Crashes when not configured | Shows "Not configured". Configuration issues are listed above the route ("submission is blocked") |
| `features/admin/*` | Placeholders | — | Only "Search users…" and "—"; no example addresses |
| `features/admin/*` | CSS classes, headings, labels, button text | UI constants | Keep |

**Final scan:** no email addresses, people, regions, sample records, percentages or hour values remain in the Admin frontend or backend. The only leftovers are CSS class numbers, a validation message and code comments.

## 3. Schema and API changes

| Change | Why |
|---|---|
| `roles.description VARCHAR(255) NULL` (inside the not-yet-applied migration `d6e7f8a9b0c1`) | Role descriptions had no database source |
| Migration `d6e7f8a9b0c1` no longer inserts business rows | Seed data only by approved, deliberate setup |
| `GET /api/admin/meta`: `roles[].description`, `recipient_labels` | Labels and descriptions from the database |
| `GET /api/admin/workflow`: `submitter_roles`; ceilings no longer carry `engine_fallback_pct` | Route preview from data; no fallback values |
| `POST /api/admin/notifications/rules/{event}/preview` and `/test-send`: optional `proposal_id`; preview returns `proposal_code`, `recipients`, `from_*` | Real-data preview |
| `POST /api/admin/notifications/rules/{event}/reset` | Reset template (approved setup) |
| Approval route: `configuration_issues`, `currency`; `route_source: "not_configured"` | Explicit "not configured" instead of invented rules |
| Readiness `discount_policy`: `configured` flags, `not_configured` list, nullable ceilings and margin | Same |

## 4. Tests

| Suite | Result |
|---|---|
| `tests/test_admin_no_hardcoded_values_pg.py` (new, 7) | New database has no Admin business rows; workflow API shows not configured (no fallback); labels from the roles table; route and readiness report missing configuration; submission blocked; setup fills only what is missing and keeps edits; first Admin never locked out |
| `tests/test_admin_module_pg.py` (10, updated) | Applies the approved setup first (as an administrator would). Preview and test send use a real proposal; Reset template; role label from the database |
| `tests/test_auth_login.py` (13, updated) | Demo roles labelled from the database |
| `frontend/src/test/AdminNoHardcodedValues.test.jsx` (new, 5) | Role names and descriptions from the API; not-configured ceilings with no fallback number; empty stages and route; submitters from the matrix; recipient labels from the API; preview with a real proposal or none |
| `frontend/src/test/MastersNavigation.test.jsx` | Now sets its own dev identity instead of depending on `frontend/.env.local` |
| Frontend Vitest | **209 passed** |
| Backend pytest incl. PostgreSQL | see §6 |

## 5. Deployment notes (Neon)

1. Neon is at `c5d6e7f8a9b0`. Migration `d6e7f8a9b0c1` was **never applied** there, so the structure-only version is the first one Neon will get.
2. After `alembic upgrade head`, the Admin pages show "Not configured" everywhere. To load the approved initial setup:
   `python -m scripts.setup_admin_defaults` (review the counts), then `--apply`.
3. **Then the Admin must configure:**
   - discount ceilings and the gross margin floor;
   - SLA / reminder / escalation;
   - regions and Business Heads;
   - sender settings;
   - the users and their roles.

   Until the ceilings and stages exist, **proposals cannot be submitted** (clear message on Review & Submit).

## 6. Verification run

Run on 2026-11-17 against local throwaway PostgreSQL only (Neon untouched).

| Check | Result |
|---|---|
| Backend pytest, full suite incl. PostgreSQL | **787 passed, 1 skipped** |
| Frontend Vitest | **209 passed**; Admin suites re-run after the last fix: 10 passed |
| ESLint (changed Admin files) | Clean |
| Frontend build | OK |

**Browser check** (local backend and frontend on a database migrated to head, with no Admin setup applied, signed in as a local Admin):

1. **Users:** role cards show the names from the `roles` table, counts from the user records and "No description".
2. **Roles & Permissions:** only the Admin's two locked permissions are ticked, and a notice says nothing else is granted. Only the Users and Roles tabs are available.
3. **Grant and reload:** granting the Admin *Manage approval workflow* and *Manage email notifications*, saving and reloading kept both. The two tabs then appeared.
4. **Approval Workflow:** three ceilings show "Not configured" and the matrix shows "No approval stages are configured…". The route preview shows "No role can submit" and "No active approval stages.". Escalation roles are listed from the database. No percentage, approver or region appears.
5. **Persistence:** a 12.5% line-level ceiling was saved and was still there after a reload. The other two ceilings still show "Not configured".
6. **Email Notifications:** shows "No notification rules are configured…" and 0 rules.
7. **`python -m scripts.setup_admin_defaults`:**
   - The dry run reported 7 descriptions, 30 grants, 5 stages and 9 rules, and wrote nothing.
   - `--apply` wrote them.
   - A second dry run reported 0 for all four.
   - The Admin's hand-set grants and the 12.5% ceiling were kept.
8. **After setup:**
   - The role cards show the approved descriptions.
   - The matrix has 5 stages, and the route preview runs from Presales Consultant / Sales Lead through to Chief Financial Officer.
   - There are 9 rules.
   - The preview shows "no proposal yet", "From: Not configured (Sender settings)" and "To: No recipient resolves for this proposal". There were no proposals and no sender settings.
9. **Console:** no errors.
