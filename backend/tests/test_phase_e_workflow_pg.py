"""Phase E: end-to-end Phase 1 workflow against a REAL local PostgreSQL database.

Opt-in: runs only when TEST_DATABASE_URL points at a local database whose name
contains "test" (see tests/conftest.py). The schema is built by Alembic
(`upgrade head`), so these tests also prove the migrations match the models.

Regression fixture: the worked example in
"Proposal_Pricing_Model_Calculation Explained.pdf" (Talent Acquisition / India):
    platform fee 3,80,000 + (80 x 250 candidates x 12 = 2,40,000) = 6,20,000
    less 5% overall subscription discount            = 5,89,000
    services 12 man-days x (1,500/h x 8h = 12,000)   = 1,44,000
    product native total                              = 7,33,000
These are DEV seed values used as a fixture, never as production rules.
"""

from decimal import Decimal

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.pg


def D(value) -> Decimal:
    return Decimal(str(value))


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def make_customer(client, ids, code="CUST-001", tier=True):
    payload = {
        "code": code,
        "name": f"Customer {code}",
        "country_id": ids.india_id,
        "industry": "Retail",
        "status": "active",
    }
    if tier:
        payload["customer_tier_id"] = ids.tier_id
    resp = client.post("/api/customers/", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def make_proposal(client, ids, tier=True, suffix="1", with_country=True):
    customer = make_customer(client, ids, code=f"CUST-{suffix}", tier=tier)
    deal = client.post("/api/deals/", json={
        "code": f"DEAL-{suffix}", "name": "Retail rollout", "customer_id": customer["id"],
        "owner_user_id": ids.user_id, "status": "open", "target_close_date": "2026-12-31",
    })
    assert deal.status_code == 201, deal.text
    proposal = client.post("/api/proposals/", json={
        "code": f"PROP-{suffix}", "deal_id": deal.json()["id"],
        "currency_id": ids.usd_id, "created_by_user_id": ids.user_id,
    })
    assert proposal.status_code == 201, proposal.text
    body = proposal.json()
    if with_country:
        country = client.post(f"/api/proposals/{body['id']}/countries", json={
            "country_id": ids.india_id, "user_headcount": 250, "is_primary_deployment": True,
            "deployment_model_id": ids.deployment_shared_id, "pricing_model_id": ids.pricing_platform_sub_id,
        })
        assert country.status_code == 201, country.text
    return body


def add_pack_line(client, ids, proposal_id, quantity="250", discount=None):
    payload = {"pack_version_id": ids.pack_version_id, "uom_id": ids.uom_candidate_id, "quantity": quantity}
    if discount is not None:
        payload["discount_pct"] = discount
    return client.post(f"/api/proposals/{proposal_id}/line-items", json=payload)


def add_service(client, proposal_id, ids, days):
    return client.post(f"/api/proposals/{proposal_id}/service-lines", json={
        "role_name": "Implementation Consultant", "days_or_hours": days,
        "service_rate_id": ids.service_rate_id,
    })


# ---------------------------------------------------------------------------
# Step 1-2: catalogue, masters and rate-card resolution
# ---------------------------------------------------------------------------

def test_read_catalogue_packs_and_masters(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    assert any(f["id"] == ids.family_id for f in pg_client.get("/api/catalogue/families").json())
    products = pg_client.get("/api/catalogue/products", params={"family_id": ids.family_id}).json()
    assert [p["id"] for p in products] == [ids.product_id]
    features = pg_client.get("/api/catalogue/features", params={"product_id": ids.product_id}).json()
    assert {f["id"] for f in features} >= {ids.feature_recruit_id, ids.feature_agent_id, ids.feature_standalone_id}

    assert pg_client.get("/api/packs/").status_code == 200
    detail = pg_client.get(f"/api/packs/{ids.pack_version_id}")
    assert detail.status_code == 200, detail.text
    assert {i["feature_id"] for i in detail.json()["pack_items"]} == {ids.feature_recruit_id, ids.feature_agent_id}

    for path in ("currencies", "countries", "deployment-models", "pricing-models", "customer-tiers",
                 "contract-terms", "units-of-measure", "deployment-pricing-options"):
        resp = pg_client.get(f"/api/masters/{path}")
        assert resp.status_code == 200, (path, resp.text)
        assert len(resp.json()) >= 1, path


def test_rate_card_resolution_requires_exactly_one_match(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    base = {
        "country_id": ids.india_id, "deployment_model_id": ids.deployment_shared_id,
        "pricing_model_id": ids.pricing_platform_sub_id, "tier_id": ids.tier_id,
        "uom_id": ids.uom_candidate_id, "pack_version_id": ids.pack_version_id,
    }
    ok = pg_client.post("/api/rates/resolve", json=base)
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert D(body["fixed_fee"]) == Decimal("380000")
    assert D(body["unit_rate"]) == Decimal("80")
    assert body["currency_code"] == "INR"

    # No matching row (private cloud has no rate in the seed) -> 404, never a guess.
    miss = pg_client.post("/api/rates/resolve", json={**base, "deployment_model_id": ids.deployment_private_id})
    assert miss.status_code == 404, miss.text

    # Target must be pack XOR feature.
    both = pg_client.post("/api/rates/resolve", json={**base, "feature_id": ids.feature_standalone_id})
    assert both.status_code == 422, both.text
    none = pg_client.post("/api/rates/resolve", json={k: v for k, v in base.items() if k != "pack_version_id"})
    assert none.status_code == 422, none.text


# ---------------------------------------------------------------------------
# Step 3: customers
# ---------------------------------------------------------------------------

def test_customer_crud_search_and_error_responses(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    created = make_customer(pg_client, ids, code="ACME-1")
    cid = created["id"]
    assert pg_client.get(f"/api/customers/{cid}").json()["code"] == "ACME-1"

    patched = pg_client.patch(f"/api/customers/{cid}", json={"industry": "Banking", "name": "Acme Bank"})
    assert patched.status_code == 200 and patched.json()["industry"] == "Banking"

    make_customer(pg_client, ids, code="ZENITH-9")
    assert {c["code"] for c in pg_client.get("/api/customers/").json()} == {"ACME-1", "ZENITH-9"}
    found = pg_client.get("/api/customers/", params={"search": "acme"}).json()
    assert [c["code"] for c in found] == ["ACME-1"]
    assert len(pg_client.get("/api/customers/", params={"limit": 1}).json()) == 1

    # Duplicate code -> 409 with a safe message (no SQL / driver text).
    dup = pg_client.post("/api/customers/", json={
        "code": "ACME-1", "name": "Dup", "country_id": ids.india_id, "status": "active"})
    assert dup.status_code == 409
    # Unknown country -> 404 naming the missing reference, no SQL leakage.
    bad = pg_client.post("/api/customers/", json={
        "code": "NEW-1", "name": "X", "country_id": 99999, "status": "active"})
    assert bad.status_code == 404, bad.text
    for resp in (dup, bad):
        detail = str(resp.json()["detail"]).lower()
        assert "psycopg" not in detail and "insert into" not in detail and "constraint" not in detail

    assert pg_client.patch("/api/customers/99999", json={"name": "Nope"}).status_code == 404
    assert pg_client.patch(f"/api/customers/{cid}", json={"country_id": 99999}).status_code == 404


# ---------------------------------------------------------------------------
# Steps 4-10: the complete workflow
# ---------------------------------------------------------------------------

def test_phase1_workflow_end_to_end_matches_pdf_worked_example(pg_client, pg_seed_ids, pg_engine):
    ids = pg_seed_ids
    proposal = make_proposal(pg_client, ids)
    pid = proposal["id"]

    # Deal/customer relationship integrity.
    deal = pg_client.get(f"/api/deals/{proposal['deal_id']}").json()
    assert deal["customer_id"] == proposal["customer_id"]
    mismatch = pg_client.post("/api/proposals/", json={
        "code": "PROP-X", "deal_id": proposal["deal_id"], "customer_id": proposal["customer_id"] + 999,
        "currency_id": ids.usd_id, "created_by_user_id": ids.user_id})
    assert mismatch.status_code in (400, 404), mismatch.text

    # Line items and service lines (8 + 4 man-days).
    assert add_pack_line(pg_client, ids, pid, discount="0").status_code == 201
    assert add_service(pg_client, pid, ids, "8").status_code == 201
    assert add_service(pg_client, pid, ids, "4").status_code == 201

    calc = pg_client.post(f"/api/proposals/{pid}/calculate", json={
        "product_subscription_discounts": {"DEV_TA_MAX": "5"},
        "calculated_by_user_id": ids.user_id,
    })
    assert calc.status_code == 200, calc.text
    result = calc.json()
    product = result["snapshot_payload"]["products"][0]

    assert D(product["subscription_subtotal_before_discount"]) == Decimal("620000.00")
    assert D(product["subscription_discount_amount"]) == Decimal("31000.00")
    assert D(product["subscription_total_after_discount"]) == Decimal("589000.00")
    assert D(product["service_subtotal_before_discount"]) == Decimal("144000.00")
    assert D(product["service_total_after_discount"]) == Decimal("144000.00")
    assert D(product["product_native_total"]) == Decimal("733000.00")
    assert product["native_currency_code"] == "INR"

    # FX: 1 INR = 0.012 USD (DEV placeholder); direction and details are recorded.
    assert product["reporting_currency_code"] == "USD"
    assert D(product["fx_rate_multiplier"]) == Decimal("0.012")
    assert D(product["product_reporting_total"]) == Decimal("8796.00")
    assert D(result["total_proposal_reporting_currency"]) == Decimal("8796.00")
    assert product["fx_rate_id"] is not None and product["fx_effective_date"] == "2026-01-01"
    assert product["fx_inverted"] is False

    # Calculation inputs are traceable.
    line = product["line_items"][0]
    assert D(line["platform_fee"]) == Decimal("380000") and D(line["rate_per_unit"]) == Decimal("80")
    assert D(line["annual_consumption_fee"]) == Decimal("240000.00")
    assert line["rate_card_id"] is not None
    svc = product["service_lines"]
    assert [D(s["day_rate"]) for s in svc] == [Decimal("12000.00")] * 2

    # Persistence and retrieval.
    latest = pg_client.get(f"/api/proposals/{pid}/calculations/latest")
    assert latest.status_code == 200, latest.text
    assert latest.json()["snapshot_id"] == result["snapshot_id"]
    assert latest.json()["snapshot_payload"] == result["snapshot_payload"]

    stored = pg_client.get(f"/api/proposals/{pid}").json()
    version = stored["versions"][0]
    # The line carries platform fee + consumption (6,20,000); the 5% discount is product-level only.
    assert D(version["line_items"][0]["extended_amount"]) == Decimal("620000.00")
    assert D(version["line_items"][0]["list_unit_price"]) == Decimal("80.0000")
    assert {D(s["extended_amount"]) for s in version["service_lines"]} == {Decimal("96000.00"), Decimal("48000.00")}

    with pg_engine.connect() as conn:
        row = conn.execute(text(
            "select count(*), max((snapshot_payload->>'total_proposal_reporting_currency')::numeric) "
            "from calculation_snapshots where proposal_version_id = :v"), {"v": version["id"]}).one()
    assert row[0] == 1 and row[1] == Decimal("8796.00")

    # Re-calculating appends a new snapshot and never alters the old one.
    again = pg_client.post(f"/api/proposals/{pid}/calculate", json={})
    assert again.status_code == 200
    assert again.json()["snapshot_id"] != result["snapshot_id"]


def test_snapshot_is_immutable_in_database(pg_client, pg_seed_ids, pg_engine):
    ids = pg_seed_ids
    proposal = make_proposal(pg_client, ids, suffix="IMM")
    add_pack_line(pg_client, ids, proposal["id"])
    assert pg_client.post(f"/api/proposals/{proposal['id']}/calculate", json={}).status_code == 200
    with pytest.raises(Exception) as err:
        with pg_engine.begin() as conn:
            conn.execute(text("update calculation_snapshots set snapshot_payload = '{}'::jsonb"))
    assert "immutable" in str(err.value).lower()
    with pytest.raises(Exception) as err:
        with pg_engine.begin() as conn:
            conn.execute(text("delete from calculation_snapshots"))
    assert "immutable" in str(err.value).lower()


# ---------------------------------------------------------------------------
# Business rules
# ---------------------------------------------------------------------------

def test_no_double_charging_between_pack_and_standalone_feature(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="DBL")["id"]
    assert add_pack_line(pg_client, ids, pid).status_code == 201

    # Same pack twice.
    assert add_pack_line(pg_client, ids, pid).status_code == 409
    # A feature that is already inside the chosen pack.
    inside = pg_client.post(f"/api/proposals/{pid}/line-items", json={
        "feature_id": ids.feature_recruit_id, "uom_id": ids.uom_candidate_id, "quantity": "250"})
    assert inside.status_code == 409, inside.text
    # A feature outside the pack is allowed.
    outside = pg_client.post(f"/api/proposals/{pid}/line-items", json={
        "feature_id": ids.feature_standalone_id, "uom_id": ids.uom_candidate_id, "quantity": "250"})
    assert outside.status_code == 201, outside.text

    # Reverse order: standalone feature first, then a pack that contains it.
    pid2 = make_proposal(pg_client, ids, suffix="DBL2")["id"]
    first = pg_client.post(f"/api/proposals/{pid2}/line-items", json={
        "feature_id": ids.feature_agent_id, "uom_id": ids.uom_candidate_id, "quantity": "250"})
    assert first.status_code == 201, first.text
    assert add_pack_line(pg_client, ids, pid2).status_code == 409


def test_calculation_rejects_missing_rate_and_missing_tier(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    # No rate-card row exists for the employee UoM -> blocking error, never a made-up price.
    pid = make_proposal(pg_client, ids, suffix="NORATE")["id"]
    line = pg_client.post(f"/api/proposals/{pid}/line-items", json={
        "pack_version_id": ids.pack_version_id, "uom_id": ids.uom_employee_id, "quantity": "100"})
    assert line.status_code == 201, line.text
    resp = pg_client.post(f"/api/proposals/{pid}/calculate", json={})
    assert resp.status_code == 422 and "rate card" in resp.json()["detail"].lower()
    assert pg_client.get(f"/api/proposals/{pid}/calculations/latest").status_code == 404  # nothing persisted

    # Customer without a tier: the tier dimension cannot be silently ignored.
    pid2 = make_proposal(pg_client, ids, suffix="NOTIER", tier=False)["id"]
    add_pack_line(pg_client, ids, pid2)
    resp = pg_client.post(f"/api/proposals/{pid2}/calculate", json={})
    assert resp.status_code == 422 and "tier" in resp.json()["detail"].lower()


def test_calculation_rejects_ambiguous_dimensions_and_bad_discounts(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="DISC")["id"]
    add_pack_line(pg_client, ids, pid)
    assert pg_client.post(f"/api/proposals/{pid}/calculate", json={
        "product_subscription_discounts": {"DEV_TA_MAX": "101"}}).status_code == 400
    assert pg_client.post(f"/api/proposals/{pid}/calculate", json={
        "product_service_discounts": {"DEV_TA_MAX": "-1"}}).status_code in (400, 422)
    assert pg_client.get(f"/api/proposals/{pid}/calculations/latest").status_code == 404

    # Individual service-line discounts are prohibited by the pricing specification.
    resp = pg_client.post(f"/api/proposals/{pid}/service-lines", json={
        "role_name": "Implementation Consultant", "days_or_hours": "1",
        "service_rate_id": ids.service_rate_id, "discount_pct": "10"})
    assert resp.status_code == 400, resp.text


def test_service_discount_applies_once_at_product_level(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="SVC")["id"]
    add_pack_line(pg_client, ids, pid)
    add_service(pg_client, pid, ids, "8")
    add_service(pg_client, pid, ids, "4")
    calc = pg_client.post(f"/api/proposals/{pid}/calculate", json={
        "product_service_discounts": {"DEV_TA_MAX": "10"}}).json()
    product = calc["snapshot_payload"]["products"][0]
    assert D(product["service_subtotal_before_discount"]) == Decimal("144000.00")
    assert D(product["service_discount_amount"]) == Decimal("14400.00")
    assert D(product["service_total_after_discount"]) == Decimal("129600.00")
    assert D(product["subscription_discount_amount"]) == Decimal("0.00")
    assert D(product["product_native_total"]) == Decimal("749600.00")


def test_proposal_requires_active_rate_card_version(pg_client, pg_seed_ids, pg_engine):
    ids = pg_seed_ids
    customer = make_customer(pg_client, ids, code="RCV-1")
    deal = pg_client.post("/api/deals/", json={
        "code": "DEAL-RCV", "name": "d", "customer_id": customer["id"],
        "owner_user_id": ids.user_id, "status": "open"}).json()
    with pg_engine.begin() as conn:
        conn.execute(text("update rate_card_versions set status = 'retired'"))
    try:
        resp = pg_client.post("/api/proposals/", json={
            "code": "PROP-RCV", "deal_id": deal["id"], "currency_id": ids.usd_id,
            "created_by_user_id": ids.user_id})
        assert resp.status_code == 400, resp.text
        assert "rate card" in resp.json()["detail"].lower()
    finally:
        with pg_engine.begin() as conn:
            conn.execute(text("update rate_card_versions set status = 'active' where version_no = 'RC-DEV-1'"))


def test_invalid_references_return_clean_errors(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    customer = make_customer(pg_client, ids, code="REF-1")
    resp = pg_client.post("/api/deals/", json={
        "code": "D-BAD", "name": "x", "customer_id": customer["id"], "owner_user_id": 99999, "status": "open"})
    assert resp.status_code == 404, resp.text
    resp = pg_client.post("/api/deals/", json={
        "code": "D-BAD2", "name": "x", "customer_id": 99999, "owner_user_id": ids.user_id, "status": "open"})
    assert resp.status_code == 404, resp.text
    assert pg_client.get("/api/deals/99999").status_code == 404
    assert pg_client.get("/api/proposals/99999").status_code == 404
    assert pg_client.post("/api/proposals/99999/calculate", json={}).status_code == 404


# ---------------------------------------------------------------------------
# Country block: pricing dimensions are validated by the API and enforced by the database
# ---------------------------------------------------------------------------

def test_country_block_dimension_rules(pg_client, pg_seed_ids, pg_engine):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="CTRY", with_country=False)["id"]
    models = {m["code"]: m["id"] for m in pg_client.get("/api/masters/deployment-models").json()}

    # deployment_model_id and pricing_model_id must be supplied together.
    half = pg_client.post(f"/api/proposals/{pid}/countries", json={
        "country_id": ids.india_id, "deployment_model_id": ids.deployment_shared_id})
    assert half.status_code == 422, half.text

    # On-premise has no permitted pricing model in the seed -> rejected, not stored.
    bad = pg_client.post(f"/api/proposals/{pid}/countries", json={
        "country_id": ids.india_id, "deployment_model_id": models["on_premise"],
        "pricing_model_id": ids.pricing_pepm_id})
    assert bad.status_code == 400, bad.text
    assert "not available" in bad.json()["detail"]

    # Unknown model -> 404.
    assert pg_client.post(f"/api/proposals/{pid}/countries", json={
        "country_id": ids.india_id, "deployment_model_id": 99999, "pricing_model_id": ids.pricing_pepm_id,
    }).status_code == 404

    ok = pg_client.post(f"/api/proposals/{pid}/countries", json={
        "country_id": ids.india_id, "deployment_model_id": ids.deployment_shared_id,
        "pricing_model_id": ids.pricing_pepm_id, "is_primary_deployment": True})
    assert ok.status_code == 201, ok.text
    assert ok.json()["deployment_model_id"] == ids.deployment_shared_id

    # Only one primary deployment country; the same country cannot be added twice.
    second_primary = pg_client.post(f"/api/proposals/{pid}/countries", json={
        "country_id": ids.usa_id, "is_primary_deployment": True})
    assert second_primary.status_code == 409, second_primary.text
    assert pg_client.post(f"/api/proposals/{pid}/countries", json={"country_id": ids.india_id}).status_code == 409

    # The database itself rejects an invalid combination, even if the API were bypassed.
    with pytest.raises(Exception) as err:
        with pg_engine.begin() as conn:
            conn.execute(text(
                "insert into proposal_countries(proposal_id, country_id, deployment_model_id, pricing_model_id) "
                "values (:p, :c, :d, :m)"),
                {"p": pid, "c": ids.usa_id, "d": models["on_premise"], "m": ids.pricing_pepm_id})
    assert "fk_proposal_countries_deployment_pricing_option" in str(err.value)
    with pytest.raises(Exception) as err:
        with pg_engine.begin() as conn:
            conn.execute(text(
                "insert into proposal_countries(proposal_id, country_id, deployment_model_id) values (:p, :c, :d)"),
                {"p": pid, "c": ids.usa_id, "d": ids.deployment_shared_id})
    assert "pricing_dims_both_or_neither" in str(err.value)


# ---------------------------------------------------------------------------
# Customer / deal / proposal relationship integrity
# ---------------------------------------------------------------------------

def test_deal_customer_link_is_protected_once_proposals_exist(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    proposal = make_proposal(pg_client, ids, suffix="LINK")
    other = make_customer(pg_client, ids, code="OTHER-CUST")

    # The deal's customer cannot be swapped under an existing proposal.
    resp = pg_client.patch(f"/api/deals/{proposal['deal_id']}", json={"customer_id": other["id"]})
    assert resp.status_code == 400, resp.text

    # A proposal's customer must remain the customer of its deal.
    resp = pg_client.patch(f"/api/proposals/{proposal['id']}", json={"customer_id": other["id"]})
    assert resp.status_code == 400, resp.text

    # Harmless updates still work.
    assert pg_client.patch(f"/api/deals/{proposal['deal_id']}", json={"name": "Renamed"}).status_code == 200
    assert pg_client.patch(f"/api/proposals/{proposal['id']}", json={"status": "submitted"}).status_code == 200
