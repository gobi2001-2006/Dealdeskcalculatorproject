# Phase 2: Admin Module, Codebase Analysis

- **Date:** 2026-11-16
- **Branch:** `feature/ui-font`
- **Sources read:**
  - backend: models, schemas, services, routes, migrations, tests;
  - frontend: router, top navigation, Admin and Approvals pages, API client;
  - `Pricing & proposal studio V3.1.docx` (the spec);
  - the 5 Admin screenshots.

## 1. Existing architecture

| Layer | What exists |
|---|---|
| **Backend** | FastAPI (`app/main.py`, `app/api/router.py`), with 9 routers: health, catalogue, packs, masters, rates, customers, deals, proposals, hubspot. |
| **Persistence** | SQLAlchemy 2 typed ORM (`app/models/*`), Pydantic schemas (`app/schemas/*`), and a service layer (`app/services/*`). |
| **Migrations** | Alembic, a linear chain with head `c5d6e7f8a9b0`. |
| **Database** | PostgreSQL (Neon in production; a local throwaway DB for tests). |
| **Frontend** | React 19 + Vite, React Router (`src/app/router.jsx`), Tailwind utility classes, lucide icons, and an axios client (`src/api/client.js`). |
| **Navigation** | `CatalogueTopNav` provides the top tabs (Masters / Proposal / Approvals / Admin) and the second-level tabs. |

## 2. Existing Admin-related frontend

- **`features/admin/AdminPage.jsx`:** a static placeholder made of 3 info cards and an "environment active" panel. It calls no API.
- **`features/approvals/ApprovalsPage.jsx`:** a static placeholder.
- **`/admin` route and the "Admin" top-nav tab:** both exist and are reused.
- **`pricing/components/ApprovalPoliciesCard.jsx`:** read-only. It shows `GET /masters/approval-thresholds`.

## 3. Existing Admin-related backend

| Item | Status |
|---|---|
| `GET /masters/approval-thresholds` | Read-only list of active thresholds |
| `GET /masters/roles` | Lists service-rate roles plus governance roles |
| User CRUD API | **None** |
| Role/permission API | **None** |
| Approval route | `GET /proposals/{id}/approval-route`, `POST /submit`, `POST /approvals/{id}/decision`, `POST /recall` in `proposal_workflow_service.py` |

## 4. Existing tables and relationships

| Entity | Table | Status |
|---|---|---|
| Users | `users` (email unique on `lower(email)`, `region` string, `is_active`, `last_login_at`) | **Already implemented**; reused |
| Roles | `roles`, with a CHECK constraint on 6 codes: admin, pricing_desk, presales, sales_lead, business_head, cfo | **Partial**: Legal and CCXO are missing |
| User–role mapping | `user_roles` (composite PK, `granted_by`) | **Already implemented**; reused |
| Permissions | none. `authorization.py` has a hardcoded `ROLE_PERMISSIONS` dict that is **never used by any route** | **Not implemented** |
| Discount ceilings | `approval_thresholds` (`line_discount`, `overall_discount`, `gm_floor`, `service_discount`; `approver_role_id`, `escalation_role_id`, `timeout_hours`, `region`) | **Partial**: the table exists but is empty, with no write API |
| Approval matrix | none. The stages are hardcoded in `evaluate_proposal_approval_route` | **Not implemented** |
| Regions / Regional BH | **no region master**. `countries` has no region column, yet the workflow reads `country.region`, an attribute that does not exist (a latent crash for proposals with countries) | **Not implemented** |
| SLA / escalation | `approval_thresholds.timeout_hours` and `escalation_role_id` exist, unused | **Partial** |
| Notification rules, templates, email log, sender settings | none | **Not implemented** |
| Email delivery | none. No SMTP or mail library is configured | **Not implemented**; simulated delivery only |
| Approvals | `approvals` (`assigned_role_id`, `status`, `decided_by_user_id`), with no stage identifier | **Requires integration** |
| Audit | `audit_logs` (append-only) | **Already implemented**; reused for admin changes |

## 5. Authentication and authorization

- There is **no login and no token check on any route**. `authentication.py` (bcrypt, JWT helpers) is unused by the API.
- The acting user comes from `VITE_DEALDESK_USER_ID` in the frontend. It is sent as a payload field (`acting_user_id`, default 1) on submit and decision.
- `check_permission` / `check_regional_access` are covered by unit tests only.

**Consequence:** permissions can only be enforced on the backend for a *declared* acting user. Phase 2 adds an `X-User-Id` header, which the frontend sends from the existing setting. This header **is not authentication**. Real SSO or login is still required (spec open point).

## 6. Reusable components

- `CatalogueTopNav` (header and tabs);
- the Tailwind classes and colour tokens already used (the amber/orange accents in the screenshots match the existing theme);
- the `apiClient` axios instance;
- `Badge`, `Button` and `Card` in `components/common`;
- `AuditLog` for change history;
- `_find_assigned_user_for_role` for regional resolution.

## 7. Missing functionality

1. User CRUD with role, region, active flag and search.
2. Legal and CCXO roles.
3. A permission matrix, persisted and enforced.
4. Writable ceilings and a gross-margin floor.
5. The effective-discount toggle.
6. A configurable approval matrix.
7. SLA, reminder and escalation settings.
8. A region master with a Business Head mapping, plus country → region.
9. Notification rules and templates, with a preview and a test send.
10. An email log and sender settings.
11. Notifications fired from the existing workflow.

## 8. Existing files to modify (minimal changes)

| File | Change | Why |
|---|---|---|
| `models/governance.py` | Widen the role CHECK to include `legal` and `ccxo` | Spec roles |
| `models/master_data.py` | Add nullable `Country.region_id` and a `region` property | Fixes the `country.region` crash; regional routing |
| `models/proposals.py` | Add a nullable `Approval.stage_code` | Several stages share the BH role |
| `services/proposal_workflow_service.py` | The route reads the stage matrix, ceilings and BH mapping; notifications are dispatched on submit and decision | Admin config must drive the workflow |
| `api/routes/proposals.py` | Permission check on submit and decision | Backend enforcement |
| `api/router.py` | Register the `admin` router | — |
| `frontend/src/api/client.js` | Send the `X-User-Id` header | Acting user for enforcement |
| `features/admin/AdminPage.jsx` | Replace the placeholder with the 4-tab module | The Admin module itself |

## 9. New files

- **Backend:**
  - `models/admin.py`
  - `schemas/admin.py`
  - `services/admin_service.py`
  - `services/permission_service.py`
  - `services/notification_service.py`
  - `api/routes/admin.py`
  - migration `d6e7f8a9b0c1_admin_module.py`
  - tests `test_admin_module_pg.py`
- **Frontend:**
  - `api/adminApi.js`
  - `features/admin/{UsersTab, RolesPermissionsTab, ApprovalWorkflowTab, EmailNotificationsTab}.jsx`
  - a vitest file

## 10. Risks and compatibility

- **Approval route change.** Once the stage matrix is seeded, the route follows the spec: Commercial line, Commercial proposal, Final L1 (BH), L2 Legal, L2 CFO. This replaces the old Sales-lead / Pricing-desk / BH / CFO route. The old logic is **kept as a fallback** when no stages are configured.
  - Existing `approvals` rows (with no `stage_code`) still display, because they match by role.
  - Already-submitted proposals keep their approval rows.
- **Enforcement scope.** It applies to admin APIs and to submit/decision. Configurator, discount and content edits stay unenforced, because the app has no login and the configured user may hold no role. Enforcing them now would block the current flow. This is documented as further work.
- **Bootstrap.** While no user holds the Admin role, admin APIs are open, so the first admin can be assigned. After that, only users with `admin.users` (and the other admin permissions) can use them.
- **Ceilings.** The engine's existing fallbacks (15 / 10 / 50 %) are kept when nothing is saved. The screenshot values (15 / 20 / 30) are **not** auto-seeded; the admin saves them.
- **Migration.** It is additive only: new tables, nullable columns and a widened CHECK. **It will not be run on Neon without approval.**
