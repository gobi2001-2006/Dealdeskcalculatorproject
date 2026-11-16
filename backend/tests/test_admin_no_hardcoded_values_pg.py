"""Zero hardcoded Admin business values (real local PostgreSQL, never Neon).

A new database holds no Admin business configuration. Everything shows as "not configured" until an
Admin enters it, or until the APPROVED initial setup is applied deliberately
(`python -m scripts.setup_admin_defaults --apply`). No percentage, approver, role label or template is
taken from code at run time.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from tests.test_phase_e_workflow_pg import make_proposal

pytestmark = pytest.mark.pg

ADMIN_TABLES = ("approval_workflow_stages", "notification_rules", "role_permissions", "approval_thresholds",
                "admin_settings")


def _clear(engine):
    with engine.begin() as conn:
        conn.execute(text("UPDATE approvals SET stage_code = NULL"))
        for table in ADMIN_TABLES:
            conn.execute(text(f"DELETE FROM {table}"))
        conn.execute(text("UPDATE roles SET description = NULL"))


@pytest.fixture(scope="module", autouse=True)
def _empty_admin_configuration(pg_engine):
    _clear(pg_engine)
    yield
    _clear(pg_engine)


def test_a_new_database_has_no_admin_business_rows(pg_engine):
    with pg_engine.connect() as conn:
        for table in ADMIN_TABLES:
            assert conn.execute(text(f"SELECT count(*) FROM {table}")).scalar() == 0, table


def test_workflow_api_shows_not_configured_instead_of_values(pg_client):
    wf = pg_client.get("/api/admin/workflow").json()  # bootstrap mode: no admin assigned yet
    for key in ("line_discount", "overall_discount", "gm_floor"):
        assert wf["ceilings"][key] == {"value_pct": None, "configured": False}
    assert wf["stages"] == [] and wf["submitter_roles"] == []
    assert wf["sla"] == {"sla_hours": None, "reminder_hours": None, "escalate_hours": None, "escalation_role": None}


def test_labels_come_from_the_roles_table(pg_client, pg_engine):
    with pg_engine.connect() as conn:
        names = dict(conn.execute(text("SELECT code, name FROM roles")).all())
    meta = pg_client.get("/api/admin/meta").json()
    assert {r["code"]: r["label"] for r in meta["roles"]} == {r["code"]: names[r["code"]] for r in meta["roles"]}
    assert meta["recipient_labels"]["sales"].startswith(names["sales_lead"])
    assert meta["recipient_labels"]["cfo"] == names["cfo"]


def test_route_and_readiness_report_missing_configuration(pg_client, pg_seed_ids):
    pid = make_proposal(pg_client, pg_seed_ids, suffix="NOCFG")["id"]
    route = pg_client.get(f"/api/proposals/{pid}/approval-route").json()
    assert route["route_source"] == "not_configured" and route["approval_stages"] == []
    issues = " ".join(route["configuration_issues"])
    assert "No approval stages are configured" in issues
    assert "line-level discount ceiling is not configured" in issues
    assert "proposal-level discount ceiling is not configured" in issues
    assert route["ceilings"]["line_pct"] is None and route["ceilings"]["proposal_pct"] is None

    policy = pg_client.get(f"/api/proposals/{pid}/readiness").json()["discount_policy"]
    assert policy["line_level"]["ceiling_pct"] is None and policy["line_level"]["configured"] is False
    assert policy["proposal_level"]["is_breached"] is False and policy["gm_floor"]["floor_pct"] is None
    assert policy["not_configured"] == ["Line-level discount ceiling", "Proposal-level discount ceiling"]


def test_submission_is_blocked_until_the_workflow_is_configured(pg_client, pg_seed_ids, pg_engine, monkeypatch):
    from app.services import proposal_workflow_service as wf

    pid = make_proposal(pg_client, pg_seed_ids, suffix="NOCFG-SUBMIT")["id"]
    monkeypatch.setattr(wf, "evaluate_proposal_readiness",
                        lambda proposal_id, db: {"is_ready": True, "missing_items": []})
    with Session(pg_engine) as s:
        with pytest.raises(wf.ProposalWorkflowError, match="not fully configured"):
            wf.submit_proposal_for_approval(proposal_id=pid, acting_user_id=pg_seed_ids.user_id, notes=None, db=s)
        s.rollback()


def test_setup_fills_only_what_is_missing_and_keeps_admin_edits(pg_engine):
    from app.services import admin_setup

    with Session(pg_engine) as s:
        first = admin_setup.apply(s)
        s.commit()
        assert first["stages"] == len(admin_setup.STAGES) and first["rules"] == len(admin_setup.RULES)
        assert first["permissions"] > 0

        s.execute(text("UPDATE notification_rules SET subject_template = 'Edited by Admin' WHERE event_code = 'final_l2'"))
        s.execute(text("UPDATE approval_workflow_stages SET routing = 'global' WHERE stage_code = 'final_l1'"))
        s.commit()

        again = admin_setup.apply(s)
        s.commit()
        assert again == {"role_descriptions": 0, "permissions": 0, "stages": 0, "rules": 0}
        assert s.execute(text("SELECT subject_template FROM notification_rules WHERE event_code = 'final_l2'")).scalar() == "Edited by Admin"
        assert s.execute(text("SELECT routing FROM approval_workflow_stages WHERE stage_code = 'final_l1'")).scalar() == "global"


def test_first_admin_is_never_locked_out_of_an_empty_matrix(pg_client, pg_engine):
    _clear(pg_engine)  # empty matrix, nothing seeded
    with pg_engine.begin() as conn:
        conn.execute(text("DELETE FROM user_roles ur USING roles r WHERE ur.role_id = r.id AND r.code = 'admin'"))
    try:
        # Bootstrap: no Admin yet.
        admin = pg_client.post("/api/admin/users", json={"full_name": "First Admin", "email": "first.admin@t.test",
                                                         "role": "admin"})
        assert admin.status_code == 201, admin.text
        h = {"X-User-Id": str(admin.json()["id"])}
        # The two locked permissions always hold for the Admin role: Users and the matrix stay reachable...
        assert pg_client.get("/api/admin/users", headers=h).status_code == 200
        matrix = pg_client.get("/api/admin/roles-permissions", headers=h).json()
        assert matrix["grants"]["admin"] == ["admin.roles", "admin.users"]
        # ...but nothing else until it is granted in the matrix.
        assert pg_client.get("/api/admin/workflow", headers=h).status_code == 403
        granted = pg_client.put("/api/admin/roles-permissions", headers=h,
                                json={"grants": {"admin": ["admin.roles", "admin.users", "admin.workflow"]}})
        assert granted.status_code == 200, granted.text
        assert pg_client.get("/api/admin/workflow", headers=h).status_code == 200
    finally:
        with pg_engine.begin() as conn:
            conn.execute(text("DELETE FROM user_roles ur USING roles r WHERE ur.role_id = r.id AND r.code = 'admin'"))
        _clear(pg_engine)
