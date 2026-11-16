# Phase 2 — Login Page Implementation Report

Date: 2026-11-17 · Branch `feature/ui-font` · Not committed

**Visual reference:** the user's screenshot, and the sign-in screen of `Proposal_Pricing_Calculator_v3.1 (1).html` (`#login`, `.lg-*`).

**Business context:** transcript of 15 Nov. Each role (Sales, Presales, Business Head, Legal, CFO, CCXO, Admin) has its own sign-in, and approvals depend on who is signed in.

## 1. Existing authentication (before this change)

| Area | Finding |
|---|---|
| Backend helpers | `app/services/authentication.py`: bcrypt hashing (`hash_password`, `verify_password`), HS256 JWT (`create_access_token`, `decode_access_token`, 8 h default), email normalisation. **Not used by any endpoint** |
| Login / logout / refresh endpoints | **None** |
| Password reset | **None** |
| SSO (Microsoft Entra ID) | **None** (no client id, tenant or callback anywhere) |
| Acting user | `permission_service.get_acting_user_id` read the `X-User-Id` header: identification, not authentication (documented as such) |
| Users / roles | `users` (`password_hash` NOT NULL; Admin-created users get `!ADMIN-CREATED-NO-LOGIN`, which can never match a password), `roles`, `user_roles`, `role_permissions` (Admin module). Role codes: `sales_lead`, `presales`, `business_head`, `legal`, `cfo`, `ccxo`, `admin` |
| Frontend | No login page, no route guard. `api/client.js` sent `X-User-Id` from `VITE_DEALDESK_USER_ID` |
| Styling | Tailwind (existing pages). The login page uses its own plain CSS file, as requested |

**Conclusion:** there was no authentication flow to reuse, only the hashing and JWT helpers. The minimum flow was added on top of them. The existing `X-User-Id` identification is kept (switchable off), and no existing permission rule changed.

## 2. Files

**Created:**

| File | Purpose |
|---|---|
| `backend/app/api/routes/auth.py` | `GET /api/auth/config`, `POST /api/auth/login`, `POST /api/auth/demo-login` (dev only), `GET /api/auth/me`, `POST /api/auth/logout` |
| `backend/app/schemas/auth.py` | Request/response models (email format validation) |
| `backend/scripts/set_user_password.py` | Admin tool: set a user's password at a hidden prompt (bcrypt) |
| `backend/tests/test_auth_login.py` | 13 tests |
| `frontend/src/features/auth/LoginPage.jsx` | The page |
| `frontend/src/features/auth/LoginPage.css` | Plain CSS, scoped to `.login-page`, CSS variables |
| `frontend/src/features/auth/AdrenalinLogo.jsx` | Wordmark from the prototype (marked there as a placeholder for the official asset) |
| `frontend/src/features/auth/RequireAuth.jsx` | Route guard |
| `frontend/src/auth/session.js` | Token / user storage, expiry, landing page by permission |
| `frontend/src/api/authApi.js` | Auth API calls |
| `frontend/src/test/LoginPage.test.jsx` | 17 tests |

**Modified (minimal):**

| File | Change |
|---|---|
| `backend/app/services/permission_service.py` | `get_acting_user_id` accepts `Authorization: Bearer <token>` first (invalid or expired → 401). `X-User-Id` still works unless `DEALDESK_ALLOW_USER_ID_HEADER=false` |
| `backend/app/api/router.py` | Registers `/auth` |
| `frontend/src/api/client.js` | Sends the Bearer token when signed in (else the dev `X-User-Id` as before); on a 401 with a token, clears the session and goes to `/login?expired=1` |
| `frontend/src/api/proposalsApi.js` | `getConfiguredUserId()` uses the signed-in user (else `VITE_DEALDESK_USER_ID`, as before) |
| `frontend/src/api/adminApi.js` | 401 message now says "not signed in" |
| `frontend/src/app/router.jsx` | Adds `/login`; existing routes unchanged, wrapped in `RequireAuth` |
| `frontend/src/features/catalogue/CatalogueTopNav.jsx` | User chip shows the signed-in name and role plus **Sign out** (otherwise "Commercial Ops", as before) |

No database schema change, no migration, and no change to pricing, discounts, the approval workflow or Admin behaviour.

## 3. APIs

| Endpoint | Behaviour |
|---|---|
| `GET /api/auth/config` | `{password_login, demo_login_enabled, demo_roles, microsoft_sso_enabled: false, password_reset_enabled: false}`. Demo roles are listed only when demo sign-in is enabled |
| `POST /api/auth/login` | `{email, password, remember_me}` → `{access_token, token_type: "bearer", expires_in, user: {id, full_name, email, region, roles, role_labels, permissions}}`. Any failure (unknown email, inactive, no password set, wrong password) → **401 "Incorrect email or password."**, so the response never reveals which accounts exist. Updates `users.last_login_at` |
| `POST /api/auth/demo-login` | **404 unless `DEALDESK_DEMO_LOGIN` is true.** When enabled: signs in the first active user who holds the role. No such user → 404 "No active user has the X role…" |
| `GET /api/auth/me` | The signed-in user, roles and permissions (401 when not signed in) |
| `POST /api/auth/logout` | 204. Tokens are stateless JWTs; the client discards its token |
| All existing endpoints | Unchanged contracts. The acting user now comes from the Bearer token when present |

## 4. Login page

**Layout:**
- Two panels: branding 52%, form 48%.
- Left: navy panel with copper and teal mountain shapes (the prototype's SVG), logo top-left, the heading and description from the brief, and the footer "Internal use only · Adrenalin Deal Desk".

**Form:**
- Logo, "Sign in", "Use your Adrenalin work account.".
- Work email: required, format check, placeholder `name@myadrenalin.com`.
- Password: required, with a show/hide toggle (`aria-pressed`).
- "Keep me signed in": on by default, as in the reference.
- "Forgot password?".
- Full-width orange **Sign in**: spinner and "Signing in…" while waiting; disabled, with a guard against repeated submissions.
- **Sign in with Microsoft**.
- Demo roles (7 buttons with icons; labels from the server).

**Errors:**
- Per-field messages linked with `aria-describedby`.
- One alert for server errors. The server's "Incorrect email or password." is shown; other failures show generic text, never raw backend details.
- The password field is cleared after a failure.

**After sign-in:**
- Return to the requested page (`?from=`, same-app paths only: `//evil` and absolute URLs are ignored).
- Otherwise land by **permission**, not role name:
  - approvers → `/approvals`;
  - proposal builders → `/proposals/import`;
  - masters → `/catalogue`;
  - other admin → `/admin`.

**Session:**
- The token and user are kept in memory plus `localStorage` ("Keep me signed in") or `sessionStorage` (this tab only).
- Expiry follows the server's `expires_in`.
- **The password is never stored** (checked in the browser).

## 5. SSO and password reset status

- **Microsoft SSO: not configured.** No Entra ID app registration, tenant or redirect exists in the project. The button is shown (as in the reference) with `aria-disabled="true"`; clicking it explains that Microsoft sign-in is not configured. Nothing is simulated.
- **Forgot password: not configured.** No email or reset service exists. The link says "Password reset is not set up yet. Ask your Deal Desk administrator…". An administrator uses `python -m scripts.set_user_password --email …`.

## 6. Demo sign-in status

- **Off by default.** The endpoint answers 404 and the page shows no demo section.
- Enable it only for development or testing, on the backend: `DEALDESK_DEMO_LOGIN=true`.
- It signs in an **existing** user who holds the role (assign users on Admin → Users). It never creates users or invents credentials.
- **It must stay off in production.** The page labels it "Development only".

## 7. Security considerations

| Topic | Status |
|---|---|
| Password storage | bcrypt (12 rounds), existing helper; plain text never stored or logged |
| Account enumeration | One message for every login failure |
| Token | HS256 JWT, 8 h (`ACCESS_TOKEN_EXPIRE_MINUTES`). **Set `JWT_SECRET_KEY` in production**: the code's default is an insecure development value |
| Legacy `X-User-Id` | Still accepted (keeps today's dev setup and tests working). **Set `DEALDESK_ALLOW_USER_ID_HEADER=false` in production**, and leave `VITE_DEALDESK_USER_ID` unset in production builds |
| Token over the header | A Bearer token always wins: a signed-in Sales user sending `X-User-Id` of an admin still gets 403 (tested) |
| Open redirect | `from` limited to same-app paths |
| Token in browser storage | Readable by scripts on the page (XSS risk). Stronger option: httpOnly cookie sessions with CSRF protection (future work) |
| Logout | Stateless: the token is valid until it expires. Server-side revocation would need a deny-list or refresh tokens (future) |
| Brute force | No rate limiting or lockout yet (future, at the API gateway or in the app) |
| Proposal data after sign-out | Full page reload to `/login`, so in-memory proposal state is discarded |

## 8. Route protection

`RequireAuth` wraps every existing page:

| Situation | Result |
|---|---|
| Signed in (token not expired) | Page opens |
| Not signed in, `VITE_DEALDESK_USER_ID` set (**today's dev setup**, e.g. `frontend/.env.local`) | Page opens as before |
| Not signed in, no dev id (production build) | `/login?from=<page>` |

To require sign-in on a developer machine, remove `VITE_DEALDESK_USER_ID` from `frontend/.env.local`. What a user may do is still decided by the backend permission checks.

## 9. Responsive verification (in-app browser)

| Viewport | Result |
|---|---|
| Desktop 1600×900 | Split 52% / 48%, logo top-left, no horizontal scroll |
| Tablet 768×1024 | Split 46% / 54%, roles 4 per row, no horizontal scroll |
| Mobile 375×812 | Branding panel hidden, compact logo, single column, button fits, roles 2 per row, 16 px inputs (no zoom on focus), no horizontal scroll |

Focus rings are visible on every control (`:focus-visible`). Labels are linked to their inputs, and keyboard order is email → password → toggle → keep signed in → forgot → Sign in → Microsoft → roles.

## 10. Tests

**Browser run.** Local throwaway PostgreSQL; backend `:8010`, frontend `:5183`; demo sign-in on; dev id off; one throwaway user per role with a test password. Neon was not used.

| # | Check | Result |
|---|---|---|
| 1 | Page loads; `/approvals` without a session → `/login?from=/approvals` | PASS |
| 2 | Empty submit → "Enter your work email." / "Enter your password." | PASS |
| 3 | Invalid email format (unit test) | PASS |
| 4 | Show / hide password | PASS (unit) |
| 5 | Wrong password → "Incorrect email or password.", stays on the page, password cleared | PASS |
| 6 | Valid sign-in (Business Head) → back to `/approvals`, nav shows "Bala Head · Business Head" | PASS |
| 7 | Loading state and a single request on repeated submits | PASS (unit) |
| 8 | Keep me signed in → `localStorage`; off → `sessionStorage`; password never stored | PASS |
| 9 | Landing by permission | PASS (unit and browser) |
| 10 | Server-side protection: Business Head token → `/api/admin/users` 403, also with a forged `X-User-Id` | PASS |
| 11 | Sign out → `/login`, session removed; `/admin` then requires sign-in | PASS |
| 12 | Microsoft button explains it isn't configured; nothing is simulated | PASS |
| 13 | Demo roles: hidden and the endpoint 404 when disabled; with the flag on, "Admin" signs in Ada Admin and the Admin page loads (me, meta, users, regions 200) | PASS |
| 14 | Responsive desktop / tablet / mobile | PASS |

**Automated results:**

| Suite | Result |
|---|---|
| Backend pytest incl. PostgreSQL (`TEST_DATABASE_URL` local) | **780 passed**, 1 skipped (was 767; +13 auth) |
| Frontend Vitest | **204 passed** (was 187; +17 login, guard and session) |
| Production build | OK |
| ESLint on the changed and new files | clean (35 older errors remain in HubSpot / proposal-content files, untouched) |

## 11. Remaining limitations

1. **Microsoft SSO not implemented.** Needs an Entra ID app registration (tenant, client id, redirect URI) and a backend token exchange.
2. **Password reset not implemented.** Needs an email service. For now admins use `scripts/set_user_password.py`.
3. **No password set yet.** Users created on Admin → Users cannot sign in with a password until an admin sets one.
4. **Stateless logout, no refresh tokens.** Sessions end at token expiry (8 h).
5. **No rate limiting or account lockout.**
6. **Token in browser storage**, not an httpOnly cookie.
7. **Production settings must be applied:** `JWT_SECRET_KEY`, `DEALDESK_ALLOW_USER_ID_HEADER=false`, `DEALDESK_DEMO_LOGIN` unset, and no `VITE_DEALDESK_USER_ID` in the build.
8. **Placeholder logo.** It's the prototype's placeholder wordmark; replace `AdrenalinLogo.jsx` with the official asset.
9. **Fonts.** "Space Grotesk / Inter" are named in the CSS but not loaded (no external font request); the system font is used when they aren't installed.
