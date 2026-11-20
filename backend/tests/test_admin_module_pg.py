"""Phase 2 Admin module tests against a REAL local PostgreSQL database (never Neon).

Covers: users, roles & permissions (persistence + backend enforcement), approval workflow
configuration (ceilings, matrix, SLA, regional Business Heads) and its use by the existing
approval route, and email notifications (rules, templates, preview, log, sender settings).
"""

import pytest
from sqlalchemy import text

from tests.test_phase_e_workflow_pg import add_pack_line, make_proposal

pytestmark = pytest.mark.pg


def H(user_id):
    return {"X-User-Id": str(user_id)}


@pytest.fixture(scope="module", autouse=True)
def _restore_admin_configuration(pg_engine):
    """Apply the APPROVED initial setup first (as an administrator does with
    `python -m scripts.setup_admin_defaults --apply`); the migration itself inserts no business rows.
    Admin configuration is not transactional, so everything is removed again after this module."""
    from sqlalchemy.orm import Session

    from app.services import admin_setup

    with Session(pg_engine) as s:
        assert s.execute(text("SELECT count(*) FROM approval_workflow_stages")).scalar() == 0  # migration: structure only
        assert s.execute(text("SELECT count(*) FROM notification_rules")).scalar() == 0
        assert s.execute(text("SELECT count(*) FROM role_permissions")).scalar() == 0
        admin_setup.apply(s)
        s.commit()
    yield

    with pg_engine.begin() as conn:
        conn.execute(text("DELETE FROM approval_thresholds"))
        conn.execute(text("DELETE FROM admin_settings"))
        conn.execute(text("UPDATE countries SET region_id = NULL"))
        conn.execute(text("UPDATE regions SET business_head_user_id = NULL"))
        conn.execute(text("DELETE FROM user_roles ur USING roles r WHERE ur.role_id = r.id AND r.code = 'admin'"))
        conn.execute(text("DELETE FROM notification_rules"))
        conn.execute(text("UPDATE approvals SET stage_code = NULL"))
        conn.execute(text("DELETE FROM approval_workflow_stages"))
        conn.execute(text("DELETE FROM role_permissions"))
        conn.execute(text("UPDATE roles SET description = NULL"))


@pytest.fixture(scope="module")
def people(pg_engine):
    """Created once through the API while the module is still in bootstrap mode (no admin yet)."""
    return {}


def _create(client, name, email, role, region=None, actor=None):
    resp = client.post("/api/admin/users", json={"full_name": name, "email": email, "role": role,
                                                  "region": region}, headers=H(actor) if actor else {})
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------------------- users
def test_01_bootstrap_users_regions_and_validation(pg_client, pg_engine, people):
    me = pg_client.get("/api/admin/me").json()
    assert me["bootstrap_mode"] is True

    # Regions come from the region master, not from hardcoded values.
    bad = pg_client.post("/api/admin/users", json={"full_name": "X", "email": "x@t.test", "role": "sales_lead",
                                                   "region": "Atlantis"})
    assert bad.status_code == 400 and "not an active region" in bad.json()["detail"]
    for name in ("India", "Middle East"):
        assert pg_client.post("/api/admin/regions", json={"name": name}).status_code == 201
    dup_region = pg_client.post("/api/admin/regions", json={"name": "india"})
    assert dup_region.status_code == 409

    # The first Admin is created in bootstrap mode; from then on the Admin acts.
    people["admin"] = _create(pg_client, "Ada Admin", "ada.admin@t.test", "admin", "Global")
    a = people["admin"]["id"]
    people["sales"] = _create(pg_client, "Sam Sales", "sam.sales@t.test", "sales_lead", "India", a)
    people["bh_in"] = _create(pg_client, "Rahul BH", "rahul.bh@t.test", "business_head", "India", a)
    people["bh_me"] = _create(pg_client, "Faisal BH", "faisal.bh@t.test", "business_head", "Middle East", a)
    people["legal"] = _create(pg_client, "Lee Legal", "lee.legal@t.test", "legal", "Global", a)
    people["cfo"] = _create(pg_client, "Cara CFO", "cara.cfo@t.test", "cfo", "Global", a)
    people["presales"] = _create(pg_client, "Pat Presales", "pat.presales@t.test", "presales", "India", a)

    # Duplicate email (case-insensitive) is rejected.
    dup = pg_client.post("/api/admin/users", json={"full_name": "Again", "email": "ADA.ADMIN@t.test",
                                                   "role": "cfo"}, headers=H(people["admin"]["id"]))
    assert dup.status_code == 409
    # The label is the role's name in the roles table (not a label kept in code).
    with pg_engine.connect() as conn:
        sales_name = conn.execute(text("SELECT name FROM roles WHERE code = 'sales_lead'")).scalar()
    assert people["admin"]["role"] == "admin" and people["sales"]["role_label"] == sales_name


def test_02_admin_endpoints_enforced_once_an_admin_exists(pg_client, people):
    assert pg_client.get("/api/admin/me").json()["bootstrap_mode"] is False
    assert pg_client.get("/api/admin/users").status_code == 401                       # no acting user
    assert pg_client.get("/api/admin/users", headers=H(people["sales"]["id"])).status_code == 403
    assert pg_client.put("/api/admin/roles-permissions", json={"grants": {}},
                         headers=H(people["cfo"]["id"])).status_code == 403
    ok = pg_client.get("/api/admin/users", headers=H(people["admin"]["id"]))
    assert ok.status_code == 200 and len(ok.json()) >= 7


def test_03_edit_role_region_active_search_and_delete(pg_client, pg_seed_ids, people):
    admin = H(people["admin"]["id"])
    make_proposal(pg_client, pg_seed_ids, suffix="ADM-OWN")  # the seed user now owns a deal and a proposal
    created = _create(pg_client, "Temp User", "temp.user@t.test", "presales", "India", people["admin"]["id"])
    upd = pg_client.patch(f"/api/admin/users/{created['id']}",
                          json={"full_name": "Temp Renamed", "role": "legal", "region": "Middle East"}, headers=admin)
    assert upd.status_code == 200, upd.text
    assert (upd.json()["role"], upd.json()["region"], upd.json()["full_name"]) == ("legal", "Middle East", "Temp Renamed")
    off = pg_client.patch(f"/api/admin/users/{created['id']}", json={"is_active": False}, headers=admin)
    assert off.json()["is_active"] is False

    found = pg_client.get("/api/admin/users", params={"search": "renamed"}, headers=admin).json()
    assert [u["id"] for u in found] == [created["id"]]
    by_region = pg_client.get("/api/admin/users", params={"search": "middle east"}, headers=admin).json()
    assert {u["email"] for u in by_region} >= {"faisal.bh@t.test", "temp.user@t.test"}

    # The last active admin cannot be deactivated or demoted.
    last = pg_client.patch(f"/api/admin/users/{people['admin']['id']}", json={"is_active": False}, headers=admin)
    assert last.status_code == 409
    demote = pg_client.patch(f"/api/admin/users/{people['admin']['id']}", json={"role": "cfo"}, headers=admin)
    assert demote.status_code == 409

    # A user with no proposals, deals or decisions can be deleted.
    fresh = _create(pg_client, "Delete Me", "delete.me@t.test", "ccxo", None, people["admin"]["id"])
    assert pg_client.delete(f"/api/admin/users/{fresh['id']}", headers=admin).status_code == 204
    # A user who owns a deal / proposal cannot (the seed user owns DEV data): deactivate instead.
    seed_user = next(u for u in pg_client.get("/api/admin/users", headers=admin).json()
                     if u["email"] == "dev.user@example.test")
    blocked = pg_client.delete(f"/api/admin/users/{seed_user['id']}", headers=admin)
    assert blocked.status_code == 409 and "Deactivate" in blocked.json()["detail"]


# ---------------------------------------------------------------------------- roles & permissions
def test_04_permission_matrix_persists_and_is_enforced(pg_client, people):
    admin = H(people["admin"]["id"])
    matrix = pg_client.get("/api/admin/roles-permissions", headers=admin).json()
    assert [r["code"] for r in matrix["roles"]] == ["sales_lead", "presales", "business_head", "legal", "cfo",
                                                    "ccxo", "admin"]
    assert "proposal.submit" in matrix["grants"]["sales_lead"]
    assert "approval.final_l2_cfo" in matrix["grants"]["cfo"]
    assert matrix["grants"]["ccxo"] == ["approval.view_history", "proposal.view"]

    # Admin cannot remove its own user / role management (lock-out protection).
    locked = pg_client.put("/api/admin/roles-permissions", json={"grants": {"admin": ["proposal.view"]}}, headers=admin)
    assert locked.status_code == 400
    unknown = pg_client.put("/api/admin/roles-permissions", json={"grants": {"cfo": ["nope.perm"]}}, headers=admin)
    assert unknown.status_code == 400

    # Grant CCXO "Manage users": persisted and immediately honoured by the backend.
    ccxo = _create(pg_client, "Chris CCXO", "chris.ccxo@t.test", "ccxo", "Global", people["admin"]["id"])
    assert pg_client.get("/api/admin/users", headers=H(ccxo["id"])).status_code == 403
    grants = matrix["grants"]["ccxo"] + ["admin.users"]
    saved = pg_client.put("/api/admin/roles-permissions", json={"grants": {"ccxo": grants}}, headers=admin)
    assert saved.status_code == 200 and "admin.users" in saved.json()["grants"]["ccxo"]
    assert pg_client.get("/api/admin/users", headers=H(ccxo["id"])).status_code == 200

    reset = pg_client.post("/api/admin/roles-permissions/reset", headers=admin)
    assert "admin.users" not in reset.json()["grants"]["ccxo"]
    assert pg_client.get("/api/admin/users", headers=H(ccxo["id"])).status_code == 403


# ---------------------------------------------------------------------------- approval workflow
def test_05_workflow_ceilings_sla_matrix_and_regional_bh(pg_client, pg_seed_ids, people):
    admin = H(people["admin"]["id"])
    wf = pg_client.get("/api/admin/workflow", headers=admin).json()
    assert wf["ceilings"]["line_discount"]["configured"] is False          # nothing invented
    assert [s["stage_code"] for s in wf["stages"]] == ["commercial_line", "commercial_proposal", "final_l1",
                                                       "final_l2_legal", "final_l2_cfo"]

    assert pg_client.put("/api/admin/workflow", json={"ceilings": {"line_discount": 120}}, headers=admin).status_code == 400
    bad_sla = pg_client.put("/api/admin/workflow", json={"sla": {"sla_hours": 48, "reminder_hours": 60}}, headers=admin)
    assert bad_sla.status_code == 400

    saved = pg_client.put("/api/admin/workflow", headers=admin, json={
        "ceilings": {"line_discount": 15, "overall_discount": 20, "gm_floor": 30},
        "test_effective_discount": True,
        "sla": {"sla_hours": 48, "reminder_hours": 24, "escalate_hours": 72, "escalation_role": "cfo"},
        "stages": [{"stage_code": "final_l2_cfo", "approver_role": "cfo"}],
    })
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["ceilings"]["overall_discount"] == {"value_pct": 20.0, "configured": True}  # no fallback value
    assert body["sla"] == {"sla_hours": 48, "reminder_hours": 24, "escalate_hours": 72, "escalation_role": "cfo"}
    assert body["test_effective_discount"] is True
    # Ceilings are stored in the existing approval_thresholds table and read by the existing endpoint.
    listed = {t["threshold_type"]: float(t["value_pct"]) for t in pg_client.get("/api/masters/approval-thresholds").json()}
    assert listed == {"line_discount": 15.0, "overall_discount": 20.0, "gm_floor": 30.0}

    # Regional Business Head mapping: India -> Rahul (must hold the BH role), with the India country.
    india = next(r for r in body["regions"] if r["name"] == "India")
    wrong = pg_client.patch(f"/api/admin/regions/{india['id']}", headers=admin,
                            json={"name": "India", "business_head_user_id": people["sales"]["id"]})
    assert wrong.status_code == 400
    ok = pg_client.patch(f"/api/admin/regions/{india['id']}", headers=admin, json={
        "name": "India", "sub_regions": "South, North", "business_head_user_id": people["bh_in"]["id"],
        "country_ids": [pg_seed_ids.india_id]})
    assert ok.status_code == 200, ok.text
    regions = pg_client.get("/api/admin/workflow", headers=admin).json()["regions"]
    india = next(r for r in regions if r["name"] == "India")
    assert india["business_head_name"] == "Rahul BH" and [c["id"] for c in india["countries"]] == [pg_seed_ids.india_id]


def _ready(monkeypatch):
    import app.services.proposal_workflow_service as wf

    monkeypatch.setattr(wf, "evaluate_proposal_readiness",
                        lambda proposal_id, db: {"is_ready": True, "missing_items": []})


def test_06_route_uses_admin_configuration_and_runs_in_order(pg_client, pg_seed_ids, people, monkeypatch):
    ids = pg_seed_ids
    _ready(monkeypatch)
    pid = make_proposal(pg_client, ids, suffix="ADM-ROUTE")["id"]
    assert add_pack_line(pg_client, ids, pid, discount="18").status_code == 201        # breaches 15%

    route = pg_client.get(f"/api/proposals/{pid}/approval-route").json()
    assert route["route_source"] == "admin_configuration" and route["region"] == "India"
    stages = {s["stage_code"]: s for s in route["approval_stages"]}
    assert stages["commercial_line"]["is_required"] is True
    assert stages["commercial_proposal"]["is_required"] is False                       # no overall discount
    assert stages["commercial_line"]["assigned_user_name"] == "Rahul BH"               # regional mapping
    assert stages["final_l2_legal"]["assigned_user_name"] == "Lee Legal"

    # Submit: the acting user needs "Submit for approval".
    assert pg_client.post(f"/api/proposals/{pid}/submit", json={}, headers=H(people["cfo"]["id"])).status_code == 403
    sub = pg_client.post(f"/api/proposals/{pid}/submit", json={"notes": "go"}, headers=H(people["sales"]["id"]))
    assert sub.status_code == 200, sub.text
    route = pg_client.get(f"/api/proposals/{pid}/approval-route").json()
    open_ids = {s["stage_code"]: s["approval_id"] for s in route["approval_stages"] if s["approval_id"]}
    assert set(open_ids) == {"commercial_line", "final_l1", "final_l2_legal", "final_l2_cfo"}

    def decide(code, user, decision="approved", notes="ok"):
        return pg_client.post(f"/api/proposals/{pid}/approvals/{open_ids[code]}/decision",
                              json={"decision": decision, "notes": notes}, headers=H(people[user]["id"]))

    assert decide("final_l1", "bh_in").status_code == 400                              # out of order
    assert decide("commercial_line", "bh_me").status_code == 403                       # other region
    assert decide("commercial_line", "legal").status_code == 403                       # no permission
    assert decide("commercial_line", "bh_in").status_code == 200
    assert decide("final_l1", "bh_in").status_code == 200
    assert decide("final_l2_legal", "legal").status_code == 200
    last = decide("final_l2_cfo", "cfo")
    assert last.status_code == 200 and last.json()["proposal_status"] == "approved"

    # Notifications written to the log with dynamic recipients.
    log = pg_client.get("/api/admin/notifications/log", params={"proposal_id": pid},
                        headers=H(people["admin"]["id"])).json()
    events = {(e["event_code"], e["recipient_email"]) for e in log}
    assert ("line_discount_breach", "rahul.bh@t.test") in events      # BH resolved by region
    assert ("line_discount_breach", "dev.user@example.test") in events  # Sales = proposal owner
    assert ("commercial_submitted", "cara.cfo@t.test") in events
    assert ("final_l2", "lee.legal@t.test") in events
    assert ("final_completed", "lee.legal@t.test") in events
    assert all(e["status"] in ("simulated", "skipped") for e in log)
    sample = next(e for e in log if e["event_code"] == "line_discount_breach" and e["recipient_email"] == "rahul.bh@t.test")
    assert "Hi Rahul BH" in sample["body"] and "PROP-ADM-ROUTE" in sample["subject"] and "18%" in sample["body"]


def test_07_rejection_needs_comment_and_returns_proposal(pg_client, pg_seed_ids, people, monkeypatch):
    ids = pg_seed_ids
    _ready(monkeypatch)
    pid = make_proposal(pg_client, ids, suffix="ADM-REJ")["id"]
    assert add_pack_line(pg_client, ids, pid).status_code == 201
    assert pg_client.post(f"/api/proposals/{pid}/submit", json={}, headers=H(people["sales"]["id"])).status_code == 200
    route = pg_client.get(f"/api/proposals/{pid}/approval-route").json()
    l1 = next(s for s in route["approval_stages"] if s["stage_code"] == "final_l1")
    assert next(s for s in route["approval_stages"] if s["stage_code"] == "commercial_line")["is_required"] is False
    url = f"/api/proposals/{pid}/approvals/{l1['approval_id']}/decision"
    assert pg_client.post(url, json={"decision": "rejected", "notes": ""}, headers=H(people["bh_in"]["id"])).status_code == 400
    rej = pg_client.post(url, json={"decision": "rejected", "notes": "Fix scope"}, headers=H(people["bh_in"]["id"]))
    assert rej.status_code == 200 and rej.json()["proposal_status"] == "rejected"
    log = pg_client.get("/api/admin/notifications/log", params={"proposal_id": pid, "event_code": "proposal_returned"},
                        headers=H(people["admin"]["id"])).json()
    assert {e["recipient_email"] for e in log} >= {"dev.user@example.test", "pat.presales@t.test"}


def test_07b_approval_inbox_follows_role_region_and_stage_order(pg_client, pg_seed_ids, people, monkeypatch):
    """Phase 3 Approvals page: the inbox reuses the route and the decision permission check."""
    ids = pg_seed_ids
    _ready(monkeypatch)
    pid = make_proposal(pg_client, ids, suffix="ADM-INBOX")["id"]
    assert add_pack_line(pg_client, ids, pid, discount="18").status_code == 201        # breaches 15%

    assert pg_client.get("/api/approvals/inbox").status_code == 401                    # no signed-in user

    def item(user):
        body = pg_client.get("/api/approvals/inbox", headers=H(people[user]["id"])).json()
        return body, next(i for i in body["items"] if i["proposal_id"] == pid)

    _, draft = item("bh_in")
    assert draft["status"] == "draft" and draft["current_stage"] is None and draft["awaiting_me"] is False
    assert draft["region"] == "India" and draft["breach_count"] == 1 and draft["deal_name"]

    assert pg_client.post(f"/api/proposals/{pid}/submit", json={}, headers=H(people["sales"]["id"])).status_code == 200
    body, bh = item("bh_in")
    assert bh["current_stage"]["stage_code"] == "commercial_line" and bh["current_stage"]["assigned_user_name"] == "Rahul BH"
    assert bh["awaiting_me"] is True and bh["submitted_at"]
    assert body["counts"]["awaiting_me"] >= 1 and body["counts"]["in_progress"] >= 1
    assert item("bh_me")[1]["awaiting_me"] is False        # other region
    assert item("legal")[1]["awaiting_me"] is False         # later stage, no permission for this one
    assert item("sales")[1]["awaiting_me"] is False

    mine = pg_client.get(f"/api/approvals/{pid}/my-action", headers=H(people["bh_in"]["id"])).json()
    assert mine["can_decide"] is True and mine["approval_id"] == bh["current_stage"]["approval_id"]
    assert pg_client.get(f"/api/approvals/{pid}/my-action", headers=H(people["cfo"]["id"])).json()["can_decide"] is False
    assert pg_client.get("/api/approvals/999999/my-action", headers=H(people["bh_in"]["id"])).status_code == 404

    # After the decision the stage moves on: Business Head L1 is next (same user), Legal still waits.
    url = f"/api/proposals/{pid}/approvals/{bh['current_stage']['approval_id']}/decision"
    assert pg_client.post(url, json={"decision": "approved", "notes": "ok"}, headers=H(people["bh_in"]["id"])).status_code == 200
    assert item("bh_in")[1]["current_stage"]["stage_code"] == "final_l1"
    assert item("legal")[1]["awaiting_me"] is False


def test_07c_inbox_query_count_does_not_grow_with_proposals(pg_client, pg_engine, pg_seed_ids, people, monkeypatch):
    """Remote databases (Neon) pay a round trip per query: the inbox must not run queries per proposal."""
    from sqlalchemy import event

    _ready(monkeypatch)
    count = [0]

    def on_execute(*_args, **_kwargs):
        count[0] += 1

    def inbox_queries():
        count[0] = 0
        event.listen(pg_engine, "before_cursor_execute", on_execute)
        try:
            assert pg_client.get("/api/approvals/inbox", headers=H(people["bh_in"]["id"])).status_code == 200
        finally:
            event.remove(pg_engine, "before_cursor_execute", on_execute)
        return count[0]

    def add(suffix):
        pid = make_proposal(pg_client, pg_seed_ids, suffix=suffix)["id"]
        assert add_pack_line(pg_client, pg_seed_ids, pid, discount="18").status_code == 201
        assert pg_client.post(f"/api/proposals/{pid}/submit", json={}, headers=H(people["sales"]["id"])).status_code == 200
        return pid

    pid = add("ADM-PERF-1")
    few = inbox_queries()
    for n in range(2, 6):
        add(f"ADM-PERF-{n}")
    assert inbox_queries() == few, "the inbox issues queries per proposal"

    count[0] = 0
    event.listen(pg_engine, "before_cursor_execute", on_execute)
    try:
        mine = pg_client.get(f"/api/approvals/{pid}/my-action", headers=H(people["bh_in"]["id"])).json()
    finally:
        event.remove(pg_engine, "before_cursor_execute", on_execute)
    assert mine["can_decide"] is True and count[0] <= 15


def test_08_legacy_calls_without_acting_user_still_work(pg_client, pg_seed_ids, monkeypatch):
    """Existing callers that do not send X-User-Id keep the previous behaviour."""
    _ready(monkeypatch)
    pid = make_proposal(pg_client, pg_seed_ids, suffix="ADM-LEG")["id"]
    assert pg_client.post(f"/api/proposals/{pid}/submit", json={"acting_user_id": pg_seed_ids.user_id}).status_code == 200


# ---------------------------------------------------------------------------- notifications
def test_09_rules_templates_preview_test_send_and_sender(pg_client, pg_engine, pg_seed_ids, people):
    admin = H(people["admin"]["id"])
    rules = pg_client.get("/api/admin/notifications/rules", headers=admin).json()
    assert len(rules) == 9
    sla = next(r for r in rules if r["event_code"] == "sla_reminder")
    assert sla["is_enabled"] is False and sla["recipient_roles"] == ["business_head", "legal", "cfo"]

    bad = pg_client.put("/api/admin/notifications/rules/final_completed", json={"recipient_roles": ["bogus"]},
                        headers=admin)
    assert bad.status_code == 400
    upd = pg_client.put("/api/admin/notifications/rules/final_completed", headers=admin, json={
        "is_enabled": False, "recipient_roles": ["sales", "cfo"], "subject_template": "Done {{proposal_id}}",
        "body_template": "Hi {{recipient}}, {{deal_name}} approved. {{unknown_field}}"})
    assert upd.status_code == 200
    assert (upd.json()["is_enabled"], upd.json()["recipient_roles"]) == (False, ["sales", "cfo"])

    # The preview uses a REAL proposal, never invented sample values.
    proposal = make_proposal(pg_client, pg_seed_ids, suffix="ADM-PREVIEW")
    latest_code = proposal["code"]
    preview = pg_client.post("/api/admin/notifications/rules/final_completed/preview", headers=admin,
                             json={"body_template": "Hi {{recipient}} — {{deal_name}} {{unknown_field}}",
                                   "proposal_id": proposal["id"]}).json()
    assert preview["proposal_code"] == latest_code
    assert preview["subject"] == f"Done {latest_code}"
    assert preview["body"].endswith("{{unknown_field}}")       # unknown field left visible, not invented
    assert "PROP-0000" not in preview["subject"] and "Rahul Iyer" not in preview["body"]
    assert isinstance(preview["recipients"], list)

    bad_sender = pg_client.put("/api/admin/notifications/sender", json={"from_email": "not-an-email"}, headers=admin)
    assert bad_sender.status_code == 400
    sender = pg_client.put("/api/admin/notifications/sender", headers=admin, json={
        "from_name": "Deal Desk", "from_email": "desk@t.test", "reply_to": "desk@t.test",
        "always_cc": None, "deal_desk_url": "https://desk.t.test"})
    assert sender.status_code == 200 and sender.json()["delivery_mode"] == "simulated"
    assert pg_client.get("/api/admin/notifications/sender", headers=admin).json()["from_email"] == "desk@t.test"

    sent = pg_client.post("/api/admin/notifications/rules/final_completed/test-send", headers=admin,
                          json={"user_id": people["cfo"]["id"], "proposal_id": proposal["id"]})
    assert sent.status_code == 200, sent.text
    assert sent.json()["is_test"] is True and sent.json()["status"] == "simulated"
    assert sent.json()["subject"] == f"[TEST] Done {latest_code}"

    # Reset template: back to the approved initial template for this event.
    reset = pg_client.post("/api/admin/notifications/rules/final_completed/reset", headers=admin)
    assert reset.status_code == 200, reset.text
    assert reset.json()["subject_template"] == "[Approved] Proposal {{proposal_id}} · {{deal_name}}"


def test_10_disabled_rule_sends_nothing(pg_engine, people):
    from sqlalchemy.orm import Session

    from app.services.notification_service import dispatch

    with Session(pg_engine) as s:
        assert dispatch(s, "final_completed", None, {}) == []          # disabled in test_09
        assert dispatch(s, "sla_reminder", None, {}) == []             # off by default
        s.rollback()
