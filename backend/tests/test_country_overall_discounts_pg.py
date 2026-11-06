"""Country-level overall discounts on a REAL local PostgreSQL database (opt-in `pg` tests; never Neon).

India (DEV seed rate 380,000 + 80 / candidate / month) and the United States (rate created here:
100,000 + 5 / candidate / month), 12 months, reporting in USD (seed FX 1 INR = 0.012 USD).
  India : 620,000 INR - 10%  = 558,000 INR -> 6,696 USD
  USA   : 160,000 USD - 25%  = 120,000 USD
  Total : 126,696 USD
"""

import pytest
from sqlalchemy import text

from tests.test_phase_e_workflow_pg import make_proposal

pytestmark = pytest.mark.pg


def test_pg_each_country_keeps_its_own_overall_discount(pg_client, pg_seed_ids, pg_engine):
    ids = pg_seed_ids
    saved = pg_client.put("/api/rates/rate-cards/target", json={
        "rate_card_version_id": ids.rate_card_version_id, "country_id": ids.usa_id,
        "deployment_model_id": ids.deployment_shared_id, "pricing_model_id": ids.pricing_platform_sub_id,
        "pack_version_id": ids.pack_version_id, "uom_id": ids.uom_candidate_id, "unit_rate": "5",
        "tier_fees": [{"tier_id": ids.tier_id, "fixed_fee": "100000"}]})
    assert saved.status_code == 200, saved.text

    pid = make_proposal(pg_client, ids, suffix="CD-PG")["id"]  # primary block: India
    us = pg_client.post(f"/api/proposals/{pid}/countries", json={
        "country_id": ids.usa_id, "deployment_model_id": ids.deployment_shared_id,
        "pricing_model_id": ids.pricing_platform_sub_id, "is_primary_deployment": False}).json()
    india = next(c for c in pg_client.get(f"/api/proposals/{pid}").json()["countries"] if c["country_id"] == ids.india_id)
    for block, qty in ((india["id"], 250), (us["id"], 1000)):
        r = pg_client.post(f"/api/proposals/{pid}/line-items", json={
            "proposal_country_id": block, "pack_version_id": ids.pack_version_id,
            "uom_id": ids.uom_candidate_id, "quantity": str(qty)})
        assert r.status_code == 201, r.text

    for block, pct, reason in ((india["id"], "10", "India volume"), (us["id"], "25", "US launch partner")):
        r = pg_client.patch(f"/api/proposals/{pid}/countries/{block}", json={
            "subscription_discount_pct": pct, "subscription_discount_reason": reason})
        assert r.status_code == 200, r.text

    res = pg_client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12})
    assert res.status_code == 200, res.text
    products = {p["country_id"]: p for p in res.json()["snapshot_payload"]["products"]}
    assert (products[ids.india_id]["product_native_total"], products[ids.india_id]["product_reporting_total"]) == (558000, 6696)
    assert products[ids.usa_id]["product_native_total"] == 120000
    assert products[ids.usa_id]["subscription_discount_reason"] == "US launch partner"
    assert res.json()["snapshot_payload"]["total_proposal_reporting_currency"] == 126696

    # Stored in proposal_countries; the database range check rejects values outside 0-100.
    with pg_engine.connect() as conn:
        rows = dict(conn.execute(text(
            "SELECT id, subscription_discount_pct FROM proposal_countries WHERE proposal_id = :p"), {"p": pid}).all())
        assert {k: float(v) for k, v in rows.items()} == {india["id"]: 10.0, us["id"]: 25.0}
        with pytest.raises(Exception, match="subscription_discount_pct_range"):
            conn.execute(text("UPDATE proposal_countries SET subscription_discount_pct = 150 WHERE id = :i"), {"i": us["id"]})
