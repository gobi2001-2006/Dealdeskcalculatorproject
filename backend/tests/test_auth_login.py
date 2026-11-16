"""Sign-in (Phase 2 login page): /api/auth/* and Bearer tokens on the existing permission checks.

Test users and passwords are fixtures created here; nothing is read from or written to a real database.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.admin import RolePermission
from app.models.governance import Role, User, UserRole
from app.services.admin_service import NO_LOGIN_PASSWORD
from app.services.authentication import hash_password

PASSWORD = "Fixture-Pass-123"


@pytest.fixture
def env(monkeypatch):
    monkeypatch.delenv("DEALDESK_DEMO_LOGIN", raising=False)
    monkeypatch.delenv("DEALDESK_ALLOW_USER_ID_HEADER", raising=False)
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    roles = {code: Role(id=i, code=code, name=code.title()) for i, code in enumerate(("admin", "sales_lead", "business_head"), 1)}
    db.add_all(roles.values())
    db.flush()
    hashed = hash_password(PASSWORD)
    users = {
        "admin": User(id=1, email="admin@example.test", full_name="Ada Admin", password_hash=hashed, is_active=True),
        "sales": User(id=2, email="Sam.Sales@Example.test", full_name="Sam Sales", password_hash=hashed, is_active=True),
        "inactive": User(id=3, email="old@example.test", full_name="Old User", password_hash=hashed, is_active=False),
        "nologin": User(id=4, email="new@example.test", full_name="New User", password_hash=NO_LOGIN_PASSWORD, is_active=True),
    }
    db.add_all(users.values())
    db.flush()
    db.add_all([
        UserRole(user_id=1, role_id=roles["admin"].id),
        UserRole(user_id=2, role_id=roles["sales_lead"].id),
        RolePermission(role_id=roles["admin"].id, permission_code="admin.users"),
        RolePermission(role_id=roles["sales_lead"].id, permission_code="proposal.view"),
    ])
    db.commit()

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    try:
        yield SimpleNamespace(client=TestClient(app), Session=Session)
    finally:
        app.dependency_overrides.pop(get_db, None)
        db.close()


def _login(env, email, password=PASSWORD, remember=False):
    return env.client.post("/api/auth/login", json={"email": email, "password": password, "remember_me": remember})


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_returns_a_token_and_the_users_roles_and_permissions(env):
    r = _login(env, "  sam.sales@example.TEST ")  # email is normalised
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_type"] == "bearer" and body["expires_in"] > 0
    assert body["user"]["email"] == "Sam.Sales@Example.test"
    assert body["user"]["roles"] == ["sales_lead"] and body["user"]["permissions"] == ["proposal.view"]
    me = env.client.get("/api/auth/me", headers=_bearer(body["access_token"]))
    assert me.status_code == 200 and me.json()["id"] == 2
    with env.Session() as s:
        assert s.get(User, 2).last_login_at is not None


@pytest.mark.parametrize("email,password", [
    ("sam.sales@example.test", "wrong-password"),   # wrong password
    ("nobody@example.test", PASSWORD),              # unknown email
    ("old@example.test", PASSWORD),                 # inactive user
    ("new@example.test", NO_LOGIN_PASSWORD),        # no password set (Admin-created user)
])
def test_every_failure_gives_the_same_generic_message(env, email, password):
    r = _login(env, email, password)
    assert r.status_code == 401
    assert r.json()["detail"] == "Incorrect email or password."


def test_invalid_email_and_missing_password_are_rejected(env):
    assert _login(env, "not-an-email").status_code == 422
    assert env.client.post("/api/auth/login", json={"email": "a@b.co", "password": ""}).status_code == 422


def test_the_token_is_used_by_existing_permission_checks(env):
    admin_token = _login(env, "admin@example.test").json()["access_token"]
    sales_token = _login(env, "sam.sales@example.test").json()["access_token"]
    assert env.client.get("/api/admin/users", headers=_bearer(admin_token)).status_code == 200
    assert env.client.get("/api/admin/users", headers=_bearer(sales_token)).status_code == 403
    # The token wins over the legacy header (a Sales token cannot claim to be the admin).
    both = {**_bearer(sales_token), "X-User-Id": "1"}
    assert env.client.get("/api/admin/users", headers=both).status_code == 403


def test_invalid_or_tampered_tokens_are_rejected(env):
    token = _login(env, "admin@example.test").json()["access_token"]
    for bad in ("not-a-token", token[:-3] + "abc"):
        r = env.client.get("/api/admin/users", headers=_bearer(bad))
        assert r.status_code == 401 and "sign in again" in r.json()["detail"]


def test_me_requires_a_signed_in_user(env):
    assert env.client.get("/api/auth/me").status_code == 401


def test_legacy_user_id_header_can_be_switched_off(env, monkeypatch):
    assert env.client.get("/api/admin/users", headers={"X-User-Id": "1"}).status_code == 200  # default: kept
    monkeypatch.setenv("DEALDESK_ALLOW_USER_ID_HEADER", "false")
    assert env.client.get("/api/admin/users", headers={"X-User-Id": "1"}).status_code == 401
    token = _login(env, "admin@example.test").json()["access_token"]
    assert env.client.get("/api/admin/users", headers=_bearer(token)).status_code == 200


def test_demo_login_does_not_exist_unless_enabled(env):
    cfg = env.client.get("/api/auth/config").json()
    assert cfg == {"password_login": True, "demo_login_enabled": False, "demo_roles": [],
                   "microsoft_sso_enabled": False, "password_reset_enabled": False}
    assert env.client.post("/api/auth/demo-login", json={"role_code": "admin"}).status_code == 404


def test_demo_login_when_enabled_signs_in_an_existing_user_with_that_role(env, monkeypatch):
    monkeypatch.setenv("DEALDESK_DEMO_LOGIN", "true")
    cfg = env.client.get("/api/auth/config").json()
    assert cfg["demo_login_enabled"] is True
    # Roles and their names come from the roles table (this fixture has three), in the app's order.
    assert [(r["code"], r["label"]) for r in cfg["demo_roles"]] == [
        ("sales_lead", "Sales_Lead"), ("business_head", "Business_Head"), ("admin", "Admin")]

    r = env.client.post("/api/auth/demo-login", json={"role_code": "sales_lead"})
    assert r.status_code == 200 and r.json()["user"]["id"] == 2
    none = env.client.post("/api/auth/demo-login", json={"role_code": "business_head"})
    assert none.status_code == 404 and "Business_Head" in none.json()["detail"]  # the role's stored name
    assert env.client.post("/api/auth/demo-login", json={"role_code": "superuser"}).status_code == 422


def test_logout_is_accepted(env):
    assert env.client.post("/api/auth/logout").status_code == 204
