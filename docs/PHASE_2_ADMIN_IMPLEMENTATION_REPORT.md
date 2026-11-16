# Phase 2: Admin Module, Implementation Report

- **Date:** 2026-11-16
- **Branch:** `feature/ui-font`, on top of `979fa83`
- **Status:** **not committed.** Neon has not been touched.

## 1. Summary

The Admin page (`/admin`) was a static placeholder. It is now a working module with four sections, matching the reference screenshots:

1. **Users**
2. **Roles & Permissions**
3. **Approval Workflow**
4. **Email Notifications**

Everything is stored in the database and validated on the backend. Every admin call is permission-checked on the server.

The existing approval workflow now reads its ceilings, approval matrix and regional Business Heads from this configuration. Email notifications are fired from the existing submit and decision calls.

## 2. New files

**Backend:**

| File | Purpose |
|---|---|
| `app/models/admin.py` | `Region`, `RolePermission`, `ApprovalWorkflowStage`, `AdminSetting`, `NotificationRule`, `EmailLog` |
| `app/schemas/admin.py` | Request and response schemas |
| `app/services/permission_service.py` | Permission catalogue, default matrix, `require_permission` dependency, `X-User-Id` acting user |
| `app/services/admin_service.py` | Users, regions, ceilings (stored in the existing `approval_thresholds`), SLA, stages, sender settings, audit |
| `app/services/notification_service.py` | Rule → recipients → merge fields → `email_logs` (simulated delivery), preview, test send |
| `app/api/routes/admin.py` | `/api/admin/*` endpoints |
| `migrations/versions/d6e7f8a9b0c1_admin_module.py` | Additive migration (see §5) |
| `tests/test_admin_module_pg.py` | 10 PostgreSQL integration tests |

**Frontend:**

| File | Purpose |
|---|---|
| `src/api/adminApi.js` | Admin API client |
| `src/features/admin/UsersTab.jsx` | Users |
| `src/features/admin/RolesPermissionsTab.jsx` | Permission matrix |
| `src/features/admin/ApprovalWorkflowTab.jsx` | Ceilings, matrix, SLA, regions, route preview |
| `src/features/admin/EmailNotificationsTab.jsx` | Rules, template editor, email log, sender settings |
| `src/features/admin/adminUi.jsx`, `adminConstants.js` | Shared UI pieces and constants |
| `src/test/AdminModule.test.jsx` | 5 component tests |

## 3. Existing files modified, and why

| File | Change | Why |
|---|---|---|
| `models/governance.py` | Role CHECK allows `legal` and `ccxo` | The spec's roles |
| `models/master_data.py` | Nullable `Country.region_id` plus a `region` property | Region (ADR) of a country. Also fixes the workflow's read of `country.region`, an attribute that did not exist |
| `models/proposals.py` | Nullable `Approval.stage_code` | Several stages share the Business Head role |
| `models/__init__.py`, `api/router.py` | Register the new models and router | — |
| `services/proposal_workflow_service.py` | Route built from the admin matrix when stages exist (legacy route kept as fallback); resubmission restarts the route; stages decided in order; rejection needs a comment; notifications on submit and decision; `assert_can_submit` / `assert_can_decide` | Admin configuration must drive the existing workflow |
| `api/routes/proposals.py` | Submit and decision check the `X-User-Id` user's permission (403); without the header, the old behaviour is unchanged | Backend enforcement without breaking existing callers |
| `frontend/src/api/client.js` | Adds the `X-User-Id` header from `VITE_DEALDESK_USER_ID` | Identifies the acting user to the backend |
| `features/admin/AdminPage.jsx` | Placeholder replaced by the module | — |
| `tests/test_wave6_integrations.py` | Table count 43 → 49 | 6 new tables |
| `src/test/MastersNavigation.test.jsx` | The Admin assertion now checks the module's tabs instead of the removed placeholder heading | — |

**Untouched:** pricing engine, pricing and discount calculation, the proposal creation flow, the Masters pages, and navigation outside Admin.

## 4. New APIs

See `PHASE_2_ADMIN_API_DOCUMENTATION.md`. There are 22 endpoints under `/api/admin`.

## 5. Database changes (migration `d6e7f8a9b0c1`, additive only)

- **6 new tables:**
  - `regions`
  - `role_permissions`
  - `approval_workflow_stages`
  - `admin_settings`
  - `notification_rules`
  - `email_logs`
- **2 nullable columns:** `countries.region_id` and `approvals.stage_code`.
- **Roles:** the CHECK constraint is widened, and the roles `legal` / `ccxo` are inserted.
- **Seeded from the v3.1 spec:**
  - the default permission matrix;
  - 5 approval stages;
  - 9 notification rules (the SLA reminder is off by default).
- **Not seeded:** ceilings, SLA values, regions and sender details. The screenshot values are examples only, so the Admin enters them.
- **Compatibility:**
  - The migration is offline-SQL safe (`alembic upgrade --sql` works).
  - The downgrade removes everything it added. It removes Legal/CCXO only when nothing references them.
- **Status:** applied only to the local test databases. **Neon: not applied. It needs your approval and a backup first.**

## 6. Features completed

| Area | Delivered |
|---|---|
| **Users** | List, search (name, email, region), add, inline edit of name, email, role and region, active toggle, delete with confirmation. |
| **Users: rules** | Duplicate email is rejected case-insensitively (409). Regions come from the region master plus "Global". Users who own data cannot be deleted (409, "deactivate instead"). The last active Admin cannot be removed or demoted. |
| **Roles & Permissions** | 17 permissions × 7 roles, save, reset to spec defaults, unsaved-changes warning. Admin always keeps "Manage users" and "Manage roles". Enforced server-side on every admin API and on submit and approval decisions. |
| **Approval Workflow** | Line, proposal and gross-margin ceilings (stored in `approval_thresholds`, read by the existing endpoint and checks), effective-discount toggle, approval matrix (approver role per stage), SLA, reminder, and escalate-after plus role, with validation. |
| **Regional Business Heads** | Region master with sub-regions, BH (must hold the BH role) and countries. Route preview. |
| **Workflow integration** | Commercial stages are required only on a breach. BH stages route by the proposal's primary-country region. Stages are decided in order, and a regional approver must match the region. Resubmission restarts the route. Already-submitted proposals keep their approval rows. |
| **Email Notifications** | 9 events with on/off, recipient roles, subject and body editor, merge-field chips, live preview, test send, email log with filter, and sender settings. Dynamic recipients: Sales = proposal owner; BH and Presales by region; Legal, CFO and CCXO by role. |

## 7. Features requiring further work

1. **Real sign-in (SSO).** `X-User-Id` identifies the user but does not authenticate them. "Last sign-in" stays "—" until there is a login.
2. **Permission enforcement on edit endpoints.** The configurator, discount and content edit endpoints are **not yet enforced**: the app has no login, and enforcing them now would block the current flow for users without roles. The permissions exist in the matrix and are ready to be applied.
3. **Workflow edit locks.** Locks for the approver on the current step are not implemented (an existing gap).
4. **Real email delivery.** It needs a Microsoft 365 / SMTP relay and signed approve/reject links. Delivery is **simulated** today and clearly labelled as such.
5. **SLA automation.** Reminders and escalation are stored but not run; no scheduler exists.
6. **Approvals inbox.** The Approvals page is still a placeholder (outside Admin scope).
7. **CCXO.** It is view-only by default; whether CCXO can approve is an open spec question.

## 8. Known limitations

- **One role per user** on the Users screen, as in the screenshots. Legacy roles (`pricing_desk`) are kept but not shown.
- **Region scope.** A proposal's region is its primary country's region. Countries with no region give "Global", so no regional BH is resolved and the stage shows "Unassigned".
- **Set-up mode.** While no active Admin exists, admin APIs are open so that the first Admin can be assigned.
- **The `X-User-Id` header** is sent on every frontend call. A configured user with no roles now gets **403 on Submit for approval**. Assign that user a role (for example Sales) on Admin → Users.

## 9. Test results

See `PHASE_2_ADMIN_TEST_REPORT.md`:

- backend 767 passed;
- frontend 187 passed;
- browser E2E 14/14 (one pre-existing spec is timing-flaky);
- manual browser walkthrough of all four tabs.
