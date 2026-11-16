# Phase 2: Admin API

- **Base path:** `/api/admin`
- **Acting user:** the `X-User-Id: <user id>` header. The frontend sends it from `VITE_DEALDESK_USER_ID`. **It identifies the user; it is not authentication.**

**Errors:**

| Code | Meaning |
|---|---|
| 400 | Validation |
| 401 | No acting user |
| 403 | Missing permission or inactive user |
| 404 | Not found |
| 409 | Conflict: duplicate, still referenced, or last Admin |

**Set-up mode:** while no active user holds the Admin role, the permission check is skipped so the first Admin can be created.

| Permission | Guards |
|---|---|
| `admin.users` | users, `GET regions` |
| `admin.roles` | roles-permissions |
| `admin.workflow` | workflow, region writes |
| `admin.notifications` | notifications |

## Session and reference data

| Method | Path | Permission | Returns |
|---|---|---|---|
| GET | `/me` | none | `{user, roles, permissions, bootstrap_mode}` |
| GET | `/meta` | none | `{roles[{code,label}], recipient_roles, merge_fields, delivery_mode, global_region, countries[]}` |

## Users

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/users?search=` | — | Searches name, email and region. Returns `[{id, full_name, email, region, is_active, last_login_at, role, role_label, roles}]` |
| POST | `/users` | `{full_name, email, role, region?, is_active?}` | **201**. `role` is one of `sales_lead`, `presales`, `business_head`, `legal`, `cfo`, `ccxo`, `admin`. `region` is an active region name or `Global`. Duplicate email → **409** |
| PATCH | `/users/{id}` | any of the POST fields | Changing the role replaces the user's Admin-module role. Removing or demoting the last active Admin → **409** |
| DELETE | `/users/{id}` | — | **204**. A user who is still referenced, or your own user → **409** |

## Regions (Region ADR and Business Head mapping)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/regions` | — | `[{id, name, sub_regions, status, business_head_user_id, business_head_name, countries[]}]` |
| POST | `/regions` | `{name, sub_regions?, business_head_user_id?, country_ids?}` | **201**. Name is unique (case-insensitive). `Global` is reserved |
| PATCH | `/regions/{id}` | the same fields | The BH must be an active user with the Business Head role. `country_ids` replaces the region's countries. A rename updates users who had the old name |
| DELETE | `/regions/{id}` | — | **409** while users are assigned to it |

## Roles and permissions

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/roles-permissions` | — | `{roles[], permissions[{code,category,label,description}], grants{role:[codes]}, locked{admin:[...]}}` |
| PUT | `/roles-permissions` | `{grants: {role_code: [permission codes]}}` | Replaces the grants of the listed roles. Unknown codes → 400. Admin must keep `admin.users` and `admin.roles` |
| POST | `/roles-permissions/reset` | — | Restores the v3.1 defaults |

**Permission codes:**

| Category | Codes |
|---|---|
| Proposal | `proposal.view`, `proposal.import_hubspot`, `proposal.edit_configurator`, `proposal.edit_discounts`, `proposal.edit_content`, `proposal.submit` |
| Approvals | `approval.line_discount`, `approval.proposal_discount`, `approval.final_l1`, `approval.final_l2_legal`, `approval.final_l2_cfo`, `approval.view_history` |
| Administration | `admin.users`, `admin.roles`, `admin.workflow`, `admin.notifications`, `admin.masters` |

## Approval workflow

| Method | Path | Body / returns |
|---|---|---|
| GET | `/workflow` | `{ceilings:{line_discount|overall_discount|gm_floor:{value_pct, configured, engine_fallback_pct}}, test_effective_discount, sla:{sla_hours, reminder_hours, escalate_hours, escalation_role}, stages[], regions[]}` |
| PUT | `/workflow` | `{ceilings?:{line_discount?, overall_discount?, gm_floor?}, test_effective_discount?, sla?:{...}, stages?:[{stage_code, approver_role?, routing?, is_active?}]}` |

**Validation:**

- Percentages must be between 0 and 100.
- Hours must be whole numbers above 0.
- Reminder ≤ SLA ≤ escalate.
- Roles must be known.

**Where things are stored:**

- Ceilings → global active rows in `approval_thresholds`. The existing `GET /api/masters/approval-thresholds` endpoint returns them.
- The toggle and SLA → `admin_settings`.

**Stage codes:**

| Code | Stage |
|---|---|
| `commercial_line` | Commercial, line-level |
| `commercial_proposal` | Commercial, proposal-level |
| `final_l1` | Final, Level 1 |
| `final_l2_legal` | Final, Level 2 (Legal) |
| `final_l2_cfo` | Final, Level 2 (CFO) |

## Email notifications

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/notifications/rules` | — | 9 rules: `{event_code, label, description, is_enabled, recipient_roles, include_approve_links, subject_template, body_template}` |
| PUT | `/notifications/rules/{event_code}` | `{is_enabled?, recipient_roles?, subject_template?, body_template?}` | Recipient roles: `sales`, `presales`, `business_head`, `legal`, `cfo`, `ccxo`. The subject and body cannot be empty |
| POST | `/notifications/rules/{event_code}/preview` | `{subject_template?, body_template?}` | Rendered with sample data. Unknown `{{fields}}` stay visible |
| POST | `/notifications/rules/{event_code}/test-send` | `{user_id}` | Writes an `is_test` log row with status `simulated` |
| GET | `/notifications/log?event_code=&proposal_id=&limit=` | — | Newest first |
| GET / PUT | `/notifications/sender` | `{from_name, from_email, reply_to, always_cc, deal_desk_url}` | Emails and the URL are validated. The response includes `delivery_mode: "simulated"` |

**Events:**

| Event code | When |
|---|---|
| `line_discount_breach` | Line discount above the line ceiling |
| `proposal_discount_breach` | Overall discount above the proposal ceiling |
| `commercial_submitted` | Submitted for commercial approval |
| `commercial_decision` | Commercial approval decided |
| `final_l1_submitted` | Awaiting final L1 |
| `final_l2` | Moving to Legal, then CFO |
| `final_completed` | Fully approved |
| `proposal_returned` | Any rejection |
| `sla_reminder` | Approval pending past the reminder window |

**Merge fields:**

- `recipient`, `proposal_id`, `deal_name`, `company`, `region`, `value`
- `eff_disc`, `threshold_line`, `threshold_prop`, `breach_lines`, `breach_prop`
- `stage`, `actor`, `decision`, `comment`, `link`

## Changes to existing proposal endpoints

| Endpoint | With `X-User-Id` | Without |
|---|---|---|
| `POST /api/proposals/{id}/submit` | Needs `proposal.submit`, otherwise 403. The header user is the actor | Unchanged (payload `acting_user_id`) |
| `POST /api/proposals/{id}/approvals/{aid}/decision` | Needs the stage permission. Regional stages also need the user's region to be the proposal's region or Global. Pre-Phase-2 approval rows need the assigned role | Unchanged |
| `GET /api/proposals/{id}/approval-route` | — | When the stages are configured, the response adds `route_source: "admin_configuration"`, `region`, `ceilings`, `line_breaches`, `proposal_breaches`, and `stage_code` / `approval_id` / `assigned_user_id` / `routing` per stage. The existing fields are kept |
