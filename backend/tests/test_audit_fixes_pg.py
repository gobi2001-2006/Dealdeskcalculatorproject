"""Audit (Oct 2026) regression tests against a REAL local PostgreSQL database.

Opt-in like the other `pg` tests: TEST_DATABASE_URL must point at a local database whose
name contains "test" (see tests/conftest.py). Never Neon.

Every expected number below is calculated by hand in the comments from the DEV seed
fixture (the PDF worked-example placeholders), independently of the engine:
  pack   : platform fee 380,000 + 80 / candidate / month      (INR, India, candidate UoM)
  feature: platform fee  50,000 + 10 / candidate / month      (INR, India, candidate UoM)
  service: 1,500 / hour x 8 hours = 12,000 / man-day          (INR, India)
  FX     : 1 INR = 0.012 USD
"""

from decimal import Decimal

import pytest

from tests.test_phase_e_workflow_pg import D, add_pack_line, add_service, make_proposal

pytestmark = pytest.mark.pg


def _feature_line(client, ids, pid, quantity="100", discount=None, uom=None):
    payload = {
        "feature_id": ids.feature_standalone_id,
        "uom_id": uom or ids.uom_candidate_id,
        "quantity": quantity,
    }
    if discount is not None:
        payload["discount_pct"] = discount
    return client.post(f"/api/proposals/{pid}/line-items", json=payload)


# ---------------------------------------------------------------------------
# Rate resolution: the unit of measure is a real dimension (no silent fallback)
# ---------------------------------------------------------------------------

def test_wrong_unit_of_measure_blocks_calculation_with_helpful_message(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="UOM")["id"]
    line = pg_client.post(f"/api/proposals/{pid}/line-items", json={
        "pack_version_id": ids.pack_version_id, "uom_id": ids.uom_employee_id, "quantity": "100"})
    assert line.status_code == 201, line.text

    resp = pg_client.post(f"/api/proposals/{pid}/calculate", json={})
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert "rate card" in detail.lower()
    assert "candidate" in detail and "employee" in detail  # names both units
    assert pg_client.get(f"/api/proposals/{pid}/calculations/latest").status_code == 404


def test_resolve_without_uom_uses_the_rate_cards_own_uom(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    base = {
        "country_id": ids.india_id, "deployment_model_id": ids.deployment_shared_id,
        "pricing_model_id": ids.pricing_platform_sub_id, "tier_id": ids.tier_id,
        "pack_version_id": ids.pack_version_id,
    }
    ok = pg_client.post("/api/rates/resolve", json=base)
    assert ok.status_code == 200, ok.text
    assert ok.json()["uom_id"] == ids.uom_candidate_id

    # Naming a UoM that has no row is a miss (404) - never another row.
    strict = pg_client.post("/api/rates/resolve", json={**base, "uom_id": ids.uom_employee_id})
    assert strict.status_code == 404, strict.text


# ---------------------------------------------------------------------------
# Independent arithmetic: line, overall subscription and service discounts
# ---------------------------------------------------------------------------

def test_discount_levels_and_totals_match_hand_calculation(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="ARITH")["id"]
    assert add_pack_line(pg_client, ids, pid, quantity="250").status_code == 201
    assert _feature_line(pg_client, ids, pid, quantity="100", discount="10").status_code == 201
    assert add_service(pg_client, pid, ids, "12").status_code == 201

    calc = pg_client.post(f"/api/proposals/{pid}/calculate", json={
        "product_subscription_discounts": {"DEV_TA_MAX": "5"},
        "product_service_discounts": {"DEV_TA_MAX": "10"},
        "contract_term_months": 24,
    })
    assert calc.status_code == 200, calc.text
    product = calc.json()["snapshot_payload"]["products"][0]
    lines = {li["feature_id"] or "pack": li for li in product["line_items"]}

    # Pack, annual: 380,000 + 80 x 250 x 12 (240,000) = 620,000; no line discount.
    assert D(lines["pack"]["item_subscription_after_discount"]) == Decimal("620000.00")
    # Feature, annual: 50,000 + 10 x 100 x 12 (12,000) = 62,000; 10% line discount = 6,200 -> 55,800.
    feat = lines[ids.feature_standalone_id]
    assert D(feat["item_subscription_before_discount"]) == Decimal("62000.00")
    assert D(feat["item_discount_amount"]) == Decimal("6200.00")
    assert D(feat["item_subscription_after_discount"]) == Decimal("55800.00")
    # Product subtotal 620,000 + 55,800 = 675,800; 5% overall = 33,790 -> 642,010 (line first, then overall).
    assert D(product["subscription_subtotal_before_discount"]) == Decimal("675800.00")
    assert D(product["subscription_discount_amount"]) == Decimal("33790.00")
    assert D(product["subscription_total_after_discount"]) == Decimal("642010.00")
    # Services 12 man-days x 12,000 = 144,000; one 10% product-level service discount = 14,400 -> 129,600.
    assert D(product["service_subtotal_before_discount"]) == Decimal("144000.00")
    assert D(product["service_discount_amount"]) == Decimal("14400.00")
    assert D(product["service_total_after_discount"]) == Decimal("129600.00")
    # Native total 642,010 + 129,600 = 771,610 INR; x 0.012 = 9,259.32 USD.
    assert D(product["product_native_total"]) == Decimal("771610.00")
    assert D(product["product_reporting_total"]) == Decimal("9259.32")
    assert D(calc.json()["total_proposal_annual_reporting_currency"]) == Decimal("9259.32")
    # Reporting-currency split (so the UI never converts): 642,010 x 0.012 = 7,704.12 subscription;
    # services 129,600 x 0.012 = 1,555.20 (= 9,259.32 - 7,704.12).
    payload = calc.json()["snapshot_payload"]
    assert D(product["subscription_reporting_total"]) == Decimal("7704.12")
    assert D(product["service_reporting_total"]) == Decimal("1555.20")
    assert D(payload["total_subscription_annual_reporting_currency"]) == Decimal("7704.12")
    assert D(payload["total_services_reporting_currency"]) == Decimal("1555.20")

    # Full-contract figures (CURRENT IMPLEMENTED RULE, not confirmed by the pricing PDF:
    # platform fee pro-rated by term/12, consumption x term months, services once):
    #   pack    380,000 x 2 + 80 x 250 x 24 = 760,000 + 480,000 = 1,240,000
    #   feature  50,000 x 2 + 10 x 100 x 24 = 100,000 +  24,000 =   124,000 - 10% = 111,600
    #   subtotal 1,351,600 - 5% (67,580) = 1,284,020 ; + services 129,600 = 1,413,620 INR
    #   x 0.012 = 16,963.44 USD
    assert D(product["contract_subscription_total_after_discount"]) == Decimal("1284020.00")
    assert D(product["contract_product_reporting_total"]) == Decimal("16963.44")
    # 1,284,020 x 0.012 = 15,408.24 (= 16,963.44 - 1,555.20 services)
    assert D(payload["total_subscription_contract_reporting_currency"]) == Decimal("15408.24")
    assert calc.json()["contract_term_months"] == 24


def test_invalid_discounts_are_rejected_not_clamped(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="DISC")["id"]
    assert add_pack_line(pg_client, ids, pid).status_code == 201
    for bad in ("-1", "100.01"):
        resp = pg_client.post(f"/api/proposals/{pid}/calculate", json={
            "product_subscription_discounts": {"DEV_TA_MAX": bad}})
        assert resp.status_code == 400, resp.text
    assert _feature_line(pg_client, ids, pid, discount="150").status_code in (400, 422)
    unknown = pg_client.post(f"/api/proposals/{pid}/calculate", json={
        "product_service_discounts": {"NOT_ON_PROPOSAL": "5"}})
    assert unknown.status_code == 400, unknown.text
    assert pg_client.get(f"/api/proposals/{pid}/calculations/latest").status_code == 404


# ---------------------------------------------------------------------------
# Service rates must belong to the priced country and share its currency
# ---------------------------------------------------------------------------

def test_service_rate_from_another_country_is_rejected(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    us_rate = pg_client.post("/api/rates/service-rates", json={
        "role_name": "US Architect", "country_id": ids.usa_id, "currency_id": ids.usd_id,
        "hourly_rate": "200", "hours_per_day": "8", "valid_from": "2026-01-01"})
    assert us_rate.status_code == 201, us_rate.text

    pid = make_proposal(pg_client, ids, suffix="SRVC")["id"]  # priced in India
    assert add_pack_line(pg_client, ids, pid).status_code == 201
    line = pg_client.post(f"/api/proposals/{pid}/service-lines", json={
        "role_name": "US Architect", "days_or_hours": "2", "service_rate_id": us_rate.json()["id"]})
    assert line.status_code == 201, line.text

    resp = pg_client.post(f"/api/proposals/{pid}/calculate", json={})
    assert resp.status_code == 422, resp.text
    assert "country" in resp.json()["detail"].lower()
    pg_client.delete(f"/api/rates/service-rates/{us_rate.json()['id']}")


def test_mixed_native_currencies_in_one_product_are_rejected(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    usd_rate_in_india = pg_client.post("/api/rates/service-rates", json={
        "role_name": "USD Billed Consultant", "country_id": ids.india_id, "currency_id": ids.usd_id,
        "hourly_rate": "100", "hours_per_day": "8", "valid_from": "2026-01-01"})
    assert usd_rate_in_india.status_code == 201, usd_rate_in_india.text

    pid = make_proposal(pg_client, ids, suffix="MIX")["id"]
    assert add_pack_line(pg_client, ids, pid).status_code == 201  # INR rate card
    assert pg_client.post(f"/api/proposals/{pid}/service-lines", json={
        "role_name": "USD Billed Consultant", "days_or_hours": "1",
        "service_rate_id": usd_rate_in_india.json()["id"]}).status_code == 201

    resp = pg_client.post(f"/api/proposals/{pid}/calculate", json={})
    assert resp.status_code == 422, resp.text
    assert "currenc" in resp.json()["detail"].lower()
    pg_client.delete(f"/api/rates/service-rates/{usd_rate_in_india.json()['id']}")


# ---------------------------------------------------------------------------
# Snapshots: staleness flag, append-only history
# ---------------------------------------------------------------------------

def test_latest_snapshot_reports_staleness_after_input_change(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="STALE")["id"]
    line = add_pack_line(pg_client, ids, pid)
    assert line.status_code == 201

    first = pg_client.post(f"/api/proposals/{pid}/calculate", json={})
    assert first.status_code == 200 and first.json()["is_stale"] is False
    assert pg_client.get(f"/api/proposals/{pid}/calculations/latest").json()["is_stale"] is False

    patched = pg_client.patch(f"/api/proposals/{pid}/line-items/{line.json()['id']}", json={"quantity": "300"})
    assert patched.status_code == 200, patched.text
    latest = pg_client.get(f"/api/proposals/{pid}/calculations/latest").json()
    assert latest["is_stale"] is True
    assert latest["snapshot_id"] == first.json()["snapshot_id"]  # old snapshot untouched

    second = pg_client.post(f"/api/proposals/{pid}/calculate", json={})
    assert second.status_code == 200
    assert second.json()["snapshot_id"] != first.json()["snapshot_id"]
    # 380,000 + 80 x 300 x 12 (288,000) = 668,000 INR x 0.012 = 8,016.00 USD
    assert D(second.json()["total_proposal_reporting_currency"]) == Decimal("8016.00")
    assert pg_client.get(f"/api/proposals/{pid}/calculations/latest").json()["is_stale"] is False


# ---------------------------------------------------------------------------
# New draft-only update/delete routes for country blocks and service lines
# ---------------------------------------------------------------------------

def test_country_block_update_and_delete(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="CUPD")["id"]
    block = pg_client.get(f"/api/proposals/{pid}").json()["countries"][0]

    ok = pg_client.patch(f"/api/proposals/{pid}/countries/{block['id']}", json={"user_headcount": 900})
    assert ok.status_code == 200, ok.text
    assert ok.json()["user_headcount"] == 900

    # A configured deployment/pricing combination (seed: private cloud + PEPM) is accepted.
    combo = pg_client.patch(f"/api/proposals/{pid}/countries/{block['id']}", json={
        "deployment_model_id": ids.deployment_private_id, "pricing_model_id": ids.pricing_pepm_id})
    assert combo.status_code == 200, combo.text
    assert combo.json()["pricing_model_id"] == ids.pricing_pepm_id
    # Unknown pricing model -> 404; clearing only one of the pair -> 400.
    unknown = pg_client.patch(f"/api/proposals/{pid}/countries/{block['id']}", json={"pricing_model_id": 999999})
    assert unknown.status_code == 404, unknown.text
    half = pg_client.patch(f"/api/proposals/{pid}/countries/{block['id']}", json={"deployment_model_id": None})
    assert half.status_code == 400, half.text

    other = make_proposal(pg_client, ids, suffix="CUPD2")["id"]
    assert pg_client.patch(f"/api/proposals/{other}/countries/{block['id']}",
                           json={"user_headcount": 1}).status_code == 404

    assert pg_client.delete(f"/api/proposals/{pid}/countries/{block['id']}").status_code == 204
    assert pg_client.get(f"/api/proposals/{pid}").json()["countries"] == []


def test_service_line_update_and_delete(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pid = make_proposal(pg_client, ids, suffix="SUPD")["id"]
    line = add_service(pg_client, pid, ids, "3")
    assert line.status_code == 201
    sid = line.json()["id"]

    ok = pg_client.patch(f"/api/proposals/{pid}/service-lines/{sid}", json={"days_or_hours": "5"})
    assert ok.status_code == 200, ok.text
    assert D(ok.json()["days_or_hours"]) == Decimal("5")

    no_line_discount = pg_client.patch(f"/api/proposals/{pid}/service-lines/{sid}", json={"discount_pct": "5"})
    assert no_line_discount.status_code == 400, no_line_discount.text

    assert pg_client.delete(f"/api/proposals/{pid}/service-lines/{sid}").status_code == 204
    assert pg_client.delete(f"/api/proposals/{pid}/service-lines/{sid}").status_code == 404


def test_activating_a_pack_version_supersedes_the_previous_one(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    pack = pg_client.post("/api/packs/", json={
        "code": "AUDIT-VER-PACK", "name": "Versioned pack", "variant": "standard",
        "feature_ids": [ids.feature_recruit_id]})
    assert pack.status_code == 201, pack.text
    v1 = pack.json()["pack_versions"][0]
    assert v1["status"] == "active"

    v2 = pg_client.post("/api/packs/versions", json={"pack_id": pack.json()["id"], "version_no": 2, "status": "draft"})
    assert v2.status_code == 201, v2.text
    assert pg_client.patch(f"/api/packs/versions/{v2.json()['id']}", json={"status": "active"}).status_code == 200

    versions = {v["version_no"]: v["status"] for v in pg_client.get(f"/api/packs/detail/{pack.json()['id']}").json()["pack_versions"]}
    assert versions == {1: "superseded", 2: "active"}  # exactly one active version

    # A superseded version is frozen: no item edits, no reactivation.
    assert pg_client.put(f"/api/packs/versions/{v1['id']}/items", json=[]).status_code == 409
    assert pg_client.patch(f"/api/packs/versions/{v1['id']}", json={"status": "active"}).status_code == 409
    pg_client.delete(f"/api/packs/{pack.json()['id']}")


def test_pack_creation_rejects_unknown_feature(pg_client, pg_seed_ids):
    resp = pg_client.post("/api/packs/", json={
        "code": "AUDIT-BAD-PACK", "name": "Bad pack", "variant": "standard",
        "feature_ids": [pg_seed_ids.feature_recruit_id, 999999]})
    assert resp.status_code == 404, resp.text
    assert all(p["code"] != "AUDIT-BAD-PACK" for p in pg_client.get("/api/packs/").json())
