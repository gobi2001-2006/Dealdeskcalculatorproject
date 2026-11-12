"""Multi-region proposal on a REAL local PostgreSQL database (opt-in `pg` tests; never Neon).

India (INR, DEV seed rate: 380,000 + 80 / candidate / month) and the United States (USD rate created
here: 100,000 + 5 / candidate / month), consolidated into USD with the seeded FX rate 1 INR = 0.012 USD.
  India : 380,000 + 80 x 250 x 12   = 620,000 INR -> 7,440 USD
  USA   : 100,000 + 5 x 1,000 x 12  = 160,000 USD
  Total : 167,440 USD
"""

import pytest

from tests.test_phase_e_workflow_pg import make_proposal

pytestmark = pytest.mark.pg


def test_pg_two_regions_priced_in_their_own_currency(pg_client, pg_seed_ids):
    ids = pg_seed_ids
    saved = pg_client.put("/api/rates/rate-cards/target", json={
        "rate_card_version_id": ids.rate_card_version_id, "country_id": ids.usa_id,
        "deployment_model_id": ids.deployment_shared_id, "pricing_model_id": ids.pricing_platform_sub_id,
        "pack_version_id": ids.pack_version_id, "uom_id": ids.uom_candidate_id, "unit_rate": "5",
        "tier_fees": [{"tier_id": ids.tier_id, "fixed_fee": "100000"}]})
    assert saved.status_code == 200, saved.text
    assert {r["currency"]["code"] for r in saved.json()} == {"USD"}

    pid = make_proposal(pg_client, ids, suffix="MR-PG")["id"]  # primary block: India
    us_block = pg_client.post(f"/api/proposals/{pid}/countries", json={
        "country_id": ids.usa_id, "deployment_model_id": ids.deployment_shared_id,
        "pricing_model_id": ids.pricing_platform_sub_id, "is_primary_deployment": False})
    assert us_block.status_code == 201, us_block.text
    in_block = next(c for c in pg_client.get(f"/api/proposals/{pid}").json()["countries"] if c["country_id"] == ids.india_id)

    for block, qty in ((in_block["id"], 250), (us_block.json()["id"], 1000)):
        r = pg_client.post(f"/api/proposals/{pid}/line-items", json={
            "proposal_country_id": block, "pack_version_id": ids.pack_version_id,
            "uom_id": ids.uom_candidate_id, "quantity": str(qty)})
        assert r.status_code == 201, r.text

    res = pg_client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12})
    assert res.status_code == 200, res.text
    payload = res.json()["snapshot_payload"]
    assert payload["products"][0]["is_primary_country"] is True  # primary country listed first
    india = next(p for p in payload["products"] if p["country_id"] == ids.india_id)
    usa = next(p for p in payload["products"] if p["country_id"] == ids.usa_id)
    assert (india["native_currency_code"], india["product_native_total"], india["product_reporting_total"]) == ("INR", 620000, 7440)
    assert (usa["native_currency_code"], usa["product_native_total"], usa["product_reporting_total"]) == ("USD", 160000, 160000)
    assert payload["total_proposal_reporting_currency"] == 167440

    # The US block still has a line: deleting it is refused (service rule + database foreign key).
    gone = pg_client.delete(f"/api/proposals/{pid}/countries/{us_block.json()['id']}")
    assert gone.status_code == 409, gone.text
