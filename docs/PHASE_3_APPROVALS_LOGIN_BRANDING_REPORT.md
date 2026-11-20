# Phase 3 — Approvals Page, Login Restyle, Brand and Admin Colours

Date: 2026-11-21 · Branch `feature/ui-font` · Not committed · Local test databases only (Neon untouched)

**Rules applied:**
- The supplied screenshots and logo images were used for layout and style only. None of their example names, companies, amounts, percentages or dates appear in code.
- No migration, no seed data and no change to pricing, calculation, saving, export, approval route logic or the permission checks.
- One read-only field was added to an existing response (`list_total`).

## 1. Files

| File | New / changed | Why |
|---|---|---|
| `backend/app/services/approval_inbox_service.py` | New | Builds the inbox: every proposal the user can see, its current open stage and whether this user may decide it. Reuses `evaluate_proposal_approval_route` and `assert_can_decide`, with no new rules |
| `backend/app/api/routes/approvals.py` | New | `GET /api/approvals/inbox` and `GET /api/approvals/{id}/my-action`. Both require *View proposals & pricing* |
| `backend/app/api/router.py` | Changed | Registers the approvals router |
| `backend/app/services/proposal_workflow_service.py` | Changed (additive) | The approval route now also returns `list_total` (pre-discount total from the latest calculation snapshot; `null` without one). Nothing else changed |
| `backend/tests/test_admin_module_pg.py` | Changed | New test `test_07b_approval_inbox_follows_role_region_and_stage_order` |
| `frontend/src/features/approvals/ApprovalsPage.jsx` | Rewritten | The static placeholder became the Approval Inbox (list, detail, decision) |
| `frontend/src/api/approvalsApi.js` | New | Client for the two inbox endpoints |
| `frontend/src/components/brand/AdrenalinBrand.jsx`, `brandColors.js` | New | One shared definition of the brand: round "a" badge with the four-colour ring, and the "adrenalin" wordmark with ® and the colour underline |
| `frontend/src/features/auth/AdrenalinLogo.jsx` | Changed | Now uses the shared brand |
| `frontend/public/favicon.svg`, `frontend/index.html` | Changed | Browser-tab icon is the brand badge; the tab title is "Adrenalin Deal Desk" |
| `frontend/src/features/catalogue/CatalogueTopNav.jsx` | Changed | Brand badge and wordmark in the top bar (it replaces the green shield). The "Deal Desk / Commercial Engine" text is kept from `sm` width up |
| `frontend/src/features/auth/LoginPage.jsx`, `LoginPage.css` | Changed | Restyle only:<br>• the palette is now the app's slate and emerald (it was copper/beige);<br>• the left panel art is the brand ring, with a colour stripe.<br>Sign-in behaviour, messages and demo / SSO / reset handling are unchanged |
| `frontend/src/features/admin/*.jsx`, `adminConstants.js` | Changed | Colours only:<br>• orange accents → emerald (buttons, focus rings, checkboxes, active tabs, selected rows);<br>• beige backgrounds `#f4f2ee` / `#faf8f5` → `slate-100` / `slate-50`, as on Masters, Proposal and Approvals.<br>The CCXO role icon keeps its own colour |
| `frontend/src/test/ApprovalsPage.test.jsx` | New (5 tests) | Covers:<br>• empty states;<br>• list and detail from the API;<br>• decision shown only when the server allows it;<br>• Reject needs a comment and calls the existing endpoint;<br>• "not configured" route |
| `frontend/src/test/MastersNavigation.test.jsx` | Changed | Looks for the new inbox instead of the old placeholder heading |

## 2. API

`GET /api/approvals/inbox` (needs `proposal.view`; 401 without a signed-in user, 403 without the permission):

```json
{
  "items": [{
    "proposal_id": 2, "proposal_code": "PROP-…", "deal_name": "…", "company": "…", "owner_name": "…",
    "region": "…", "status": "submitted", "currency": "USD", "net_total": 6101.0, "list_total": 7440.0,
    "effective_discount_pct": 18.0, "breach_count": 1,
    "current_stage": {"stage_code": "commercial_line", "stage_label": "…", "role_name": "…",
                      "assigned_user_name": "…", "approval_id": 3},
    "awaiting_me": true, "created_at": "…", "submitted_at": "…", "configuration_issues": []
  }],
  "counts": {"awaiting_me": 1, "in_progress": 2, "completed": 0, "all": 3}
}
```

- **`awaiting_me`** is true only when the user passes the same check the decision endpoint applies: the stage permission, the region for regional stages, and the stage must be the first open one.
- **`GET /api/approvals/{id}/my-action`** returns `{approval_id, stage_label, can_decide}` for the detail view.
- **Decisions** still use `POST /api/proposals/{id}/approvals/{approval_id}/decision`. That endpoint enforces permissions, stage order and the rejection comment, writes the audit log and sends the configured notifications.

## 3. Approvals page

- **Tabs:** Awaiting me, In progress, Completed and All, with counts from the API.
- **Rows:** company and deal, status or current stage, code, region, net value in the proposal's currency, number of breaches, and how long it has been waiting.
- **Detail view:**
  - net value, list value, effective discount, and readiness (completed checks out of total checks);
  - "Awaiting stage — assignee";
  - the approval route timeline: done stages green, the current stage amber, queued or not-required stages grey;
  - discount breaches against the configured ceilings ("ceiling not configured" when missing);
  - history from the audit log, with comments;
  - "Open proposal" (to Review & Submit).
- **Decision panel:** shown only when the server says this user may decide. Approve, or Reject with a mandatory comment (checked in the browser and again on the server).
- **Empty and not-configured states:**
  - "No proposals are waiting for you.";
  - "The approval workflow is not configured (Admin → Approval Workflow).";
  - configuration issues from the route;
  - 403: "Your role cannot view proposals (Roles & Permissions → View proposals & pricing)."

## 4. Hardcoded-value audit

| File | Value | Classification | Action |
|---|---|---|---|
| Screenshots (Gulf Crest Bank, Arjun Menon, Faisal Rahman, 15% / 20% ceilings, PRP-2026-…) | Example data | Sample data | **Not used anywhere.** Every name, value and ceiling comes from the API |
| `ApprovalsPage.jsx` `TABS` | Tab keys, labels and filters (`submitted`, `approved`, `rejected`) | Code concept (the proposal status codes the database allows) | Keep |
| `ApprovalsPage.jsx` | Empty-state and help text | UI text | Keep |
| `ApprovalsPage.jsx` `NODE_TONE` | Timeline colours per approval status | UI constant | Keep |
| `approval_inbox_service.py` `IN_PROGRESS_STATUSES`, `COMPLETED_STATUSES` | Status codes | Code concept (matches the `proposals` status constraint) | Keep |
| `components/brand/brandColors.js` | Ring and colour-stripe colours | Brand artwork (taken from the supplied logo) | Keep, in one place |
| `LoginPage.css` | Palette variables | UI theme, matching the app's Tailwind slate and emerald | Keep |
| Previous `ApprovalsPage.jsx` | "Governance Workflow", "Commercial Delegations"… placeholder cards | Static placeholder text | **Removed** |

## 5. Tests and checks

| Check | Result |
|---|---|
| Backend Admin and workflow PostgreSQL tests (incl. the new inbox test) | 18 passed |
| Backend full suite (local PostgreSQL) | **788 passed, 1 skipped** |
| Frontend Vitest | **214 passed** (25 files) |
| ESLint (all changed frontend files) | Clean |
| Frontend build | OK |

**Browser check** (local backend and frontend on `dealdesk_e2e_test`, with three local test proposals created for the check, signed in with the local demo roles):

1. **Login:** new brand badge and wordmark, slate and emerald colours, ring artwork. The sign-in buttons work. The phone-width layout is fine.
2. **Business Head:**
   - "Awaiting me" shows 2.
   - The breach proposal shows the route, the breach (18% against the 12.5% ceiling, +5.5 pts), history and the decision panel.
   - Reject with an empty comment is refused.
   - Approve recorded the decision. The stage turned green and the proposal moved on to Final Level 1. History shows the decision with its comment, and the breach table shows "Approved".
3. **Business Head on Admin:** "Your role has no administration permissions" (correct).
4. **Admin:**
   - The Roles & Permissions and Email Notifications tabs now use slate and emerald.
   - The Approvals page shows the 403 message, because the local matrix doesn't grant the Admin *View proposals*.
5. **Phone width (375 px):** the list sits above the detail, with no sideways scrolling.
6. **Console:** only the expected 403s from step 4.

## 6. Notes and open points

- The product name in the top bar stays "Deal Desk · Commercial Engine". The screenshots show "Pricing & Proposal Studio"; tell me if the name should change.
- The logo is drawn as SVG from the supplied images. Replace `components/brand/AdrenalinBrand.jsx` when the official vector files are available.
- The spec document `D:\adrenalin\Pricing & proposal studio V3.1.docx` was referenced but not read for this change; the screenshots defined the layout.
- "Bulk approve" and SLA reminders are not included. SLA values are stored, but no reminder job runs yet.

## 7. Full backend run

**788 passed, 1 skipped** (local PostgreSQL `dealdesk_pg_test`, 2 min 36 s).
