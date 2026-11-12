"""Overall discounts are set per country (business decision 2026-11-06).

Each country block stores its own overall subscription % and services % (with a justification).
The engine applies a country's % only to that country's products. Fixture prices
(tests/test_multi_region_pricing.py), worked out by hand:

  India (INR)   TA : 620,000 subscription ; services 8 d x 12,000 = 96,000
  USA   (USD)   TO : 160,000 subscription ; services 2 d x 1,200  =  2,400
  Germany (EUR) TD :  74,000 subscription
  FX: 1 INR = 0.012 USD ; 1 EUR = 1.08 USD

  Discounts: India 10% subscription + 20% services ; USA 5% subscription ; Germany none
  India : 620,000 x 0.90 + 96,000 x 0.80 = 558,000 + 76,800 = 634,800 INR -> 7,617.60 USD
  USA   : 160,000 x 0.95 + 2,400         = 152,000 +  2,400 = 154,400 USD
  Germany: 74,000 EUR (no discount)                                     -> 79,920.00 USD
  Total : 241,937.60 USD
"""

from tests.test_multi_region_pricing import _line, _proposal, _service, mr  # noqa: F401  (fixture)


def _three_countries(mr):  # noqa: F811
    pid, b = _proposal(mr)
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    assert _line(mr, pid, b["US"], "TO", 1000).status_code == 201
    assert _line(mr, pid, b["DE"], "TD", 500).status_code == 201
    assert _service(mr, pid, b["IN"], mr.ids.srv_in, 8).status_code == 201
    assert _service(mr, pid, b["US"], mr.ids.srv_us, 2).status_code == 201
    return pid, b


def _set(mr, pid, block, **fields):  # noqa: F811
    return mr.client.patch(f"/api/proposals/{pid}/countries/{block}", json=fields)


def _calc(mr, pid, **extra):  # noqa: F811
    res = mr.client.post(f"/api/proposals/{pid}/calculate", json={"contract_term_months": 12, **extra})
    assert res.status_code == 200, res.text
    return res.json()["snapshot_payload"]


def test_each_country_discount_applies_only_to_that_country(mr):  # noqa: F811
    pid, b = _three_countries(mr)
    assert _set(mr, pid, b["IN"], subscription_discount_pct="10", subscription_discount_reason="Strategic India logo",
                service_discount_pct="20", service_discount_reason="Bundled rollout").status_code == 200
    assert _set(mr, pid, b["US"], subscription_discount_pct="5", subscription_discount_reason="Multi-year").status_code == 200

    payload = _calc(mr, pid)
    p = {x["country_iso"]: x for x in payload["products"]}

    assert (p["IN"]["subscription_discount_pct"], p["IN"]["subscription_discount_amount"]) == (10, 62000)
    assert (p["IN"]["service_discount_pct"], p["IN"]["service_discount_amount"]) == (20, 19200)
    assert p["IN"]["product_native_total"] == 634800 and p["IN"]["product_reporting_total"] == 7617.6
    assert p["IN"]["subscription_discount_reason"] == "Strategic India logo"
    assert p["IN"]["service_discount_reason"] == "Bundled rollout"
    assert p["IN"]["subscription_discount_source"] == "country"

    assert (p["US"]["subscription_discount_pct"], p["US"]["service_discount_pct"]) == (5, 0)
    assert p["US"]["product_native_total"] == 154400
    assert p["US"]["service_discount_source"] is None and p["US"]["service_discount_reason"] is None

    assert (p["DE"]["subscription_discount_pct"], p["DE"]["product_native_total"]) == (0, 74000)
    assert p["DE"]["product_reporting_total"] == 79920
    assert payload["total_proposal_reporting_currency"] == 241937.6

    # Originals are kept next to the discounted amounts.
    assert p["IN"]["subscription_subtotal_before_discount"] == 620000
    assert p["IN"]["subscription_total_after_discount"] == 558000

    blocks = {cb["country_iso"]: cb for cb in payload["pricing_context"]["country_blocks"]}
    assert blocks["IN"]["subscription_discount_pct"] == 10 and blocks["DE"]["subscription_discount_pct"] is None


def test_country_discounts_and_reasons_are_stored_and_returned(mr):  # noqa: F811
    pid, b = _three_countries(mr)
    assert _set(mr, pid, b["US"], subscription_discount_pct="7.5", subscription_discount_reason="Competitive bid").status_code == 200
    countries = {c["id"]: c for c in mr.client.get(f"/api/proposals/{pid}").json()["countries"]}
    assert float(countries[b["US"]]["subscription_discount_pct"]) == 7.5
    assert countries[b["US"]]["subscription_discount_reason"] == "Competitive bid"
    assert countries[b["IN"]]["subscription_discount_pct"] is None

    # Clearing a country's discount (null) removes it.
    assert _set(mr, pid, b["US"], subscription_discount_pct=None, subscription_discount_reason=None).status_code == 200
    p = {x["country_iso"]: x for x in _calc(mr, pid)["products"]}
    assert p["US"]["subscription_discount_pct"] == 0


def test_line_discount_then_country_discount_are_applied_once_each(mr):  # noqa: F811
    pid, b = _proposal(mr, countries=("IN",))
    line = _line(mr, pid, b["IN"], "TA", 250).json()
    assert mr.client.patch(f"/api/proposals/{pid}/line-items/{line['id']}", json={"discount_pct": "10"}).status_code == 200
    assert _set(mr, pid, b["IN"], subscription_discount_pct="10").status_code == 200
    product = _calc(mr, pid)["products"][0]
    assert product["subscription_subtotal_before_discount"] == 558000  # after the 10% line discount
    assert product["subscription_total_after_discount"] == 502200      # then 10% for the country, once


def test_request_discount_cannot_stack_on_a_country_discount(mr):  # noqa: F811
    pid, b = _proposal(mr, countries=("IN", "US"))
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    assert _line(mr, pid, b["US"], "TO", 1000).status_code == 201
    assert _set(mr, pid, b["IN"], subscription_discount_pct="10").status_code == 200

    bad = mr.client.post(f"/api/proposals/{pid}/calculate", json={
        "contract_term_months": 12, "product_subscription_discounts": {"TA": "5"}})
    assert bad.status_code == 400
    assert "India" in bad.json()["detail"]

    # A country without a stored discount can still take one from the request (older API callers).
    ok = _calc(mr, pid, product_subscription_discounts={"TO": "5"})
    p = {x["country_iso"]: x for x in ok["products"]}
    assert (p["IN"]["subscription_discount_pct"], p["US"]["subscription_discount_pct"]) == (10, 5)
    assert p["US"]["subscription_discount_source"] == "request"


def test_country_discount_must_be_between_0_and_100(mr):  # noqa: F811
    pid, b = _proposal(mr, countries=("IN",))
    assert _set(mr, pid, b["IN"], subscription_discount_pct="100.01").status_code == 422
    assert _set(mr, pid, b["IN"], service_discount_pct="-1").status_code == 422
    assert _set(mr, pid, b["IN"], subscription_discount_pct="100").status_code == 200


def test_changing_a_country_discount_marks_the_saved_calculation_stale(mr):  # noqa: F811
    pid, b = _proposal(mr, countries=("IN",))
    assert _line(mr, pid, b["IN"], "TA", 250).status_code == 201
    _calc(mr, pid)
    assert mr.client.get(f"/api/proposals/{pid}/calculations/latest").json()["is_stale"] is False
    assert _set(mr, pid, b["IN"], subscription_discount_pct="3").status_code == 200
    assert mr.client.get(f"/api/proposals/{pid}/calculations/latest").json()["is_stale"] is True
