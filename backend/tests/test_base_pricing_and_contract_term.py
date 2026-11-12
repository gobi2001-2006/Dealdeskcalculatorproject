"""Page 4 base pricing vs Page 5 discounted pricing, and the contract term saved on the proposal.

Reference (calculation explained.xlsx, Platform + Subscription with ESS, Tier 2, 5 years), test data only:
  platform 200,000 / year ; rate 4 x 20,000 employees x 12 = 960,000 / year
  Year 1 base     = 1,160,000        Contract base (60 months) = 1,000,000 + 4,800,000 = 5,800,000
  With a 10% overall (country) discount: Year 1 net 1,044,000 ; contract net 5,220,000
"""

from decimal import Decimal

from sqlalchemy import func, select

from app.models import CalculationSnapshot, ProposalLineItem
from tests.test_multi_region_pricing import _line, _proposal, _service, mr  # noqa: F401  (fixture)
from tests.test_workbook_pricing import configure_workbook, wb  # noqa: F401  (fixture)

TIER2 = 1


def _proposal_tier2(env, term_months=60, suffix="BT"):
    c, ids = env.client, env.ids
    cust = c.post("/api/customers/", json={"code": f"C-{suffix}", "name": suffix, "country_id": ids.india,
                                           "customer_tier_id": ids.tiers[TIER2]}).json()
    deal = c.post("/api/deals/", json={"code": f"D-{suffix}", "name": suffix, "customer_id": cust["id"], "owner_user_id": ids.user}).json()
    body = {"code": f"P-{suffix}", "deal_id": deal["id"], "customer_id": cust["id"], "currency_id": ids.inr,
            "created_by_user_id": ids.user, "rate_card_version_id": ids.rcv}
    if term_months is not None:
        body["contract_term_months"] = term_months
    prop = c.post("/api/proposals/", json=body)
    assert prop.status_code == 201, prop.text
    pid = prop.json()["id"]
    block = c.post(f"/api/proposals/{pid}/countries", json={
        "country_id": ids.india, "deployment_model_id": ids.dep["shared_cloud"], "pricing_model_id": ids.pm["platform"],
        "is_primary_deployment": True}).json()
    line = c.post(f"/api/proposals/{pid}/line-items", json={
        "pack_version_id": ids.pv, "uom_id": ids.uom["ESS"], "quantity": "20000"})
    assert line.status_code == 201, line.text
    return pid, block["id"], line.json()["id"]


def _snapshot_count(env, pid):
    with env.Session() as s:
        return s.execute(select(func.count()).select_from(CalculationSnapshot)).scalar_one()


def test_base_pricing_ignores_saved_discounts_and_saves_nothing(wb):  # noqa: F811
    configure_workbook(wb)
    pid, block, line_id = _proposal_tier2(wb)
    c = wb.client
    assert c.patch(f"/api/proposals/{pid}/countries/{block}", json={"subscription_discount_pct": "10"}).status_code == 200
    assert c.patch(f"/api/proposals/{pid}/line-items/{line_id}", json={"discount_pct": "5"}).status_code == 200

    # Page 5: the saved discounts apply (line 5%, then the country's 10%).
    net = c.post(f"/api/proposals/{pid}/calculate", json={}).json()
    snapshots_after_net = _snapshot_count(wb, pid)
    with wb.Session() as s:
        cached = s.get(ProposalLineItem, line_id).extended_amount

    # Page 4: base pricing, no discount of any kind, nothing written.
    base = c.post(f"/api/proposals/{pid}/calculate/base", json={})
    assert base.status_code == 200, base.text
    b = base.json()
    assert b["snapshot_id"] is None and b["pricing_stage"] == "base"
    bp = b["snapshot_payload"]
    assert bp["total_proposal_annual_reporting_currency"] == 1160000
    assert bp["total_proposal_contract_reporting_currency"] == 5800000
    assert bp["total_proposal_base_annual_reporting_currency"] == 1160000
    assert bp["total_proposal_base_contract_reporting_currency"] == 5800000
    assert bp["products"][0]["subscription_discount_pct"] == 0
    assert bp["all_subscription_line_items"][0]["item_discount_pct"] == 0
    assert _snapshot_count(wb, pid) == snapshots_after_net                      # no snapshot added
    with wb.Session() as s:
        assert s.get(ProposalLineItem, line_id).extended_amount == cached       # cached net amount untouched
    latest = c.get(f"/api/proposals/{pid}/calculations/latest").json()
    assert latest["snapshot_id"] == net["snapshot_id"]                          # Page 5/6 still see the net calculation

    # The saved calculation keeps base and net apart (Year 1 and full contract).
    p = net["snapshot_payload"]
    assert p["pricing_stage"] == "discounted"
    assert p["total_proposal_base_annual_reporting_currency"] == 1160000
    assert p["total_proposal_base_contract_reporting_currency"] == 5800000
    assert p["total_proposal_annual_reporting_currency"] == 991800      # 1,160,000 x 0.95 x 0.90
    assert p["total_proposal_contract_reporting_currency"] == 4959000   # 5,800,000 x 0.95 x 0.90
    assert p["total_discount_contract_reporting_currency"] == 5800000 - 4959000


def test_workbook_tier2_ten_percent_country_discount(wb):  # noqa: F811
    configure_workbook(wb)
    pid, block, _ = _proposal_tier2(wb, suffix="T2")
    wb.client.patch(f"/api/proposals/{pid}/countries/{block}", json={"subscription_discount_pct": "10"})
    p = wb.client.post(f"/api/proposals/{pid}/calculate", json={}).json()["snapshot_payload"]
    assert (p["total_proposal_base_annual_reporting_currency"], p["total_proposal_annual_reporting_currency"]) == (1160000, 1044000)
    assert (p["total_proposal_base_contract_reporting_currency"], p["total_proposal_contract_reporting_currency"]) == (5800000, 5220000)
    assert p["contract_term_years"] == 5


def test_saved_contract_term_is_used_and_cannot_be_contradicted(wb):  # noqa: F811
    configure_workbook(wb)
    pid, _, _ = _proposal_tier2(wb, term_months=24, suffix="TERM")
    c = wb.client
    used = c.post(f"/api/proposals/{pid}/calculate/base", json={}).json()
    assert used["contract_term_months"] == 24
    assert used["snapshot_payload"]["total_proposal_contract_reporting_currency"] == 1160000 * 2
    same = c.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 24})
    assert same.status_code == 200
    clash = c.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 36})
    assert clash.status_code == 400 and "24 months" in clash.json()["detail"]


def test_changing_the_saved_term_marks_the_calculation_outdated(wb):  # noqa: F811
    configure_workbook(wb)
    pid, _, _ = _proposal_tier2(wb, term_months=60, suffix="STALE")
    c = wb.client
    c.post(f"/api/proposals/{pid}/calculate", json={})
    assert c.get(f"/api/proposals/{pid}/calculations/latest").json()["is_stale"] is False
    assert c.patch(f"/api/proposals/{pid}", json={"contract_term_months": 36}).status_code == 200
    assert c.get(f"/api/proposals/{pid}/calculations/latest").json()["is_stale"] is True


def test_proposal_without_saved_term_keeps_the_previous_default(wb):  # noqa: F811
    configure_workbook(wb)
    pid, _, _ = _proposal_tier2(wb, term_months=None, suffix="NOTERM")
    r = wb.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 60})
    assert r.status_code == 200 and r.json()["contract_term_months"] == 60  # older proposals: request term still works


def test_contract_term_validation(wb):  # noqa: F811
    configure_workbook(wb)
    pid, _, _ = _proposal_tier2(wb, suffix="VAL")
    for bad in (0, -12, 121):
        assert wb.client.patch(f"/api/proposals/{pid}", json={"contract_term_months": bad}).status_code == 422
    assert wb.client.patch(f"/api/proposals/{pid}", json={"contract_term_months": 12}).status_code == 200


def test_subscription_and_service_discounts_never_cross(mr):  # noqa: F811
    pid, b = _proposal(mr, countries=("IN",))
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    assert _service(mr, pid, b["IN"], mr.ids.srv_in, 8).status_code == 201

    mr.client.patch(f"/api/proposals/{pid}/countries/{b['IN']}", json={"subscription_discount_pct": "10"})
    p = mr.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12}).json()["snapshot_payload"]["products"][0]
    assert (p["subscription_total_after_discount"], p["service_total_after_discount"]) == (558000, 96000)

    mr.client.patch(f"/api/proposals/{pid}/countries/{b['IN']}", json={"subscription_discount_pct": None, "service_discount_pct": "20"})
    p = mr.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12}).json()["snapshot_payload"]["products"][0]
    assert (p["subscription_total_after_discount"], p["service_total_after_discount"]) == (620000, 76800)
    assert p["service_base"] == 96000 and p["subscription_base_annual"] == 620000


def test_hundred_percent_discount_floors_at_zero_never_negative(mr):  # noqa: F811
    pid, b = _proposal(mr, countries=("IN",))
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    mr.client.patch(f"/api/proposals/{pid}/countries/{b['IN']}", json={"subscription_discount_pct": "100"})
    p = mr.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12}).json()["snapshot_payload"]
    assert p["products"][0]["subscription_total_after_discount"] == 0
    assert p["total_proposal_base_annual_reporting_currency"] == 7440       # base kept: 620,000 INR x 0.012
    assert Decimal(str(p["total_proposal_annual_reporting_currency"])) == 0
