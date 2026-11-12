
"""Phase E: rule-level regression tests for the pricing engine and proposal service.

These run on the in-memory SQLite fixtures (no PostgreSQL needed) and reuse the
worked-example fixture from test_pricing_engine.py. They pin the behaviours fixed
during the Phase E audit:

  * exactly-one-row rate resolution (no tier fallback, ambiguity rejected)
  * no client-supplied price / rate bypasses the rate card
  * one service discount per product, never per service line
  * single native currency per product total
  * FX: effective-dated rate, direction convention, inversion flagged and traced
  * calculation snapshots are immutable; non-draft versions are not mutated
  * a pack and a standalone feature can never be charged twice
"""

from datetime import date
from decimal import Decimal

import pytest

from app.models.catalogue import Feature, Pack, PackItem, PackVersion
from app.models.master_data import Currency, FxRate
from app.models.proposals import (
    CalculationSnapshot,
    ProposalCountry,
    ProposalLineItem,
    ProposalServiceLine,
    SnapshotImmutableError,
)
from app.models.rate_card import RateCard, ServiceRate
from app.services.pricing_engine import (
    AmbiguousRateCardMatchError,
    CurrencyMismatchError,
    InvalidDiscountError,
)

# Reuse the worked-example fixtures (db, client, engine) defined for the Phase D tests.
from tests.test_pricing_engine import client, db, engine  # noqa: F401


def _clone_rate_card(db, **overrides):
    rc = db._test_rc
    values = dict(
        rate_card_version_id=rc.rate_card_version_id, country_id=rc.country_id,
        deployment_model_id=rc.deployment_model_id, pricing_model_id=rc.pricing_model_id,
        tier_id=rc.tier_id, uom_id=rc.uom_id, feature_id=rc.feature_id, currency_id=rc.currency_id,
        fixed_fee=Decimal("1000"), unit_rate=Decimal("1"),
    )
    values.update(overrides)
    clone = RateCard(**values)
    db.add(clone)
    db.flush()
    return clone


# ---------------------------------------------------------------------------
# Rate-card resolution
# ---------------------------------------------------------------------------

def test_ambiguous_rate_cards_are_rejected_until_dimensions_disambiguate(engine, db):
    _clone_rate_card(db, deployment_model_id=2)  # same dims except deployment model
    common = dict(
        rate_card_version_id=db._test_rcv.id, pack_version_id=None, feature_id=db._test_feat_ta.id,
        country_id=db._test_india.id, tier_id=db._test_tier.id, uom_id=db._test_uom.id,
    )
    with pytest.raises(AmbiguousRateCardMatchError) as err:
        engine._find_rate_card(**common)
    assert "deployment model" in str(err.value).lower()

    original = engine._find_rate_card(deployment_model_id=1, pricing_model_id=1, **common)
    assert original is not None and original.id == db._test_rc.id
    other = engine._find_rate_card(deployment_model_id=2, pricing_model_id=1, **common)
    assert other is not None and other.id != db._test_rc.id


def test_calculation_uses_deployment_and_pricing_model_from_country_block(engine, db):
    cheap = _clone_rate_card(db, deployment_model_id=2, fixed_fee=Decimal("0"), unit_rate=Decimal("1"))
    block = db.query(ProposalCountry).filter_by(proposal_id=db._test_proposal.id).one()
    block.deployment_model_id, block.pricing_model_id = 2, 1
    db.flush()
    result = engine.calculate_proposal(proposal_id=db._test_proposal.id)
    line = result["snapshot_payload"]["products"][0]["line_items"][0]
    assert line["rate_card_id"] == cheap.id
    assert result["snapshot_payload"]["pricing_context"]["deployment_model_id"] == 2


def test_calculation_requires_a_country_block(engine, db):
    from app.services.pricing_engine import MissingConfigurationError

    db.query(ProposalCountry).filter_by(proposal_id=db._test_proposal.id).delete()
    db.flush()
    db.expire_all()
    with pytest.raises(MissingConfigurationError, match="no country"):
        engine.calculate_proposal(proposal_id=db._test_proposal.id)


# ---------------------------------------------------------------------------
# Discounts
# ---------------------------------------------------------------------------

def test_discount_for_unknown_product_code_is_rejected_not_ignored(engine, db):
    with pytest.raises(InvalidDiscountError, match="not on this proposal"):
        engine.calculate_proposal(proposal_id=db._test_proposal.id, product_discounts={"TYPO": Decimal("5")})


def test_legacy_individual_service_line_discount_is_rejected(engine, db):
    db._test_svc_line.discount_pct = Decimal("10")
    db.flush()
    with pytest.raises(InvalidDiscountError, match="individual service-line discounts"):
        engine.calculate_proposal(proposal_id=db._test_proposal.id)


def test_discounts_apply_at_their_own_level_exactly_once(engine, db):
    """Line 5% -> product subscription 10% -> product service 20%, each applied once."""
    result = engine.calculate_proposal(
        proposal_id=db._test_proposal.id,
        product_discounts={"TA": Decimal("10")},
        product_service_discounts={"TA": Decimal("20")},
    )
    product = result["snapshot_payload"]["products"][0]
    # 620,000 -5% = 589,000 -10% = 530,100 ; services 144,000 -20% = 115,200
    assert Decimal(str(product["subscription_total_after_discount"])) == Decimal("530100.00")
    assert Decimal(str(product["service_total_after_discount"])) == Decimal("115200.00")
    assert Decimal(str(product["product_native_total"])) == Decimal("645300.00")


# ---------------------------------------------------------------------------
# Currencies and FX
# ---------------------------------------------------------------------------

def test_mixed_native_currencies_in_one_product_are_rejected(engine, db):
    usd_rate = ServiceRate(
        role_name="Offshore Consultant", country_id=db._test_india.id, currency_id=db._test_usd.id,
        hourly_rate=Decimal("20"), hours_per_day=Decimal("8"), valid_from=date(2026, 1, 1),
    )
    db.add(usd_rate)
    db.flush()
    db.add(ProposalServiceLine(
        proposal_version_id=db._test_version.id, service_rate_id=usd_rate.id, role_name="Offshore Consultant",
        days_or_hours=Decimal("2"), rate_applied=Decimal("0"), extended_amount=Decimal("0"),
        currency_id=db._test_usd.id,
    ))
    db.flush()
    with pytest.raises(CurrencyMismatchError, match="mixes currencies"):
        engine.calculate_proposal(proposal_id=db._test_proposal.id)


def test_fx_direction_inversion_and_trace_are_recorded(engine, db):
    """Fixture rate is 1 USD = 83 INR. INR -> USD has no direct rate, so the reverse row is used
    and the snapshot says so explicitly (never a silent inversion)."""
    db._test_proposal.currency_id = db._test_usd.id
    db.flush()
    result = engine.calculate_proposal(proposal_id=db._test_proposal.id)
    product = result["snapshot_payload"]["products"][0]
    fx_row = db.query(FxRate).one()

    assert product["fx_inverted"] is True
    assert product["fx_rate_id"] == fx_row.id
    assert product["fx_effective_date"] == "2026-01-01"
    assert "inverted" in product["currency_pair"]
    expected_multiplier = (Decimal("1") / Decimal("83")).quantize(Decimal("0.00000001"))
    assert Decimal(str(product["fx_rate_multiplier"])) == expected_multiplier
    assert Decimal(str(product["product_reporting_total"])) == (Decimal("733000") * expected_multiplier).quantize(Decimal("0.01"))
    # Native amounts are preserved next to the converted ones.
    assert Decimal(str(product["product_native_total"])) == Decimal("733000.00")
    assert product["native_currency_code"] == "INR" and product["reporting_currency_code"] == "USD"


def test_direct_fx_rate_wins_and_future_dated_rates_are_ignored(engine, db):
    inr, usd = db._test_inr, db._test_usd
    direct = FxRate(from_currency_id=inr.id, to_currency_id=usd.id, effective_date=date(2026, 1, 1),
                    rate=Decimal("0.01200000"), rate_source="test")
    future = FxRate(from_currency_id=inr.id, to_currency_id=usd.id, effective_date=date(2999, 1, 1),
                    rate=Decimal("9.99000000"))
    db.add_all([direct, future])
    db.flush()
    fx = engine._resolve_fx(inr.id, usd.id)
    assert fx["inverted"] is False
    assert fx["fx_rate_id"] == direct.id
    assert fx["multiplier"] == Decimal("0.01200000")


# ---------------------------------------------------------------------------
# Snapshots and lifecycle
# ---------------------------------------------------------------------------

def test_snapshot_cannot_be_modified_or_deleted_through_the_orm(engine, db):
    engine.calculate_proposal(proposal_id=db._test_proposal.id)
    snapshot = db.query(CalculationSnapshot).one()
    snapshot.snapshot_payload = {"tampered": True}
    with pytest.raises(SnapshotImmutableError):
        db.flush()
    db.rollback()

    snapshot = db.query(CalculationSnapshot).one()
    db.delete(snapshot)
    with pytest.raises(SnapshotImmutableError):
        db.flush()
    db.rollback()


def test_non_draft_version_line_amounts_are_not_overwritten(engine, db):
    version = db._test_version
    version.status = "locked"
    db.flush()
    before = db._test_line_item.extended_amount
    result = engine.calculate_proposal(proposal_id=db._test_proposal.id, version_id=version.id)
    assert result["snapshot_id"] is not None  # a snapshot is still recorded
    db.refresh(db._test_line_item)
    assert db._test_line_item.extended_amount == before


def test_failed_calculation_writes_nothing(engine, db):
    snapshots_before = db.query(CalculationSnapshot).count()
    with pytest.raises(InvalidDiscountError):
        engine.calculate_proposal(proposal_id=db._test_proposal.id, product_discounts={"TA": Decimal("101")})
    assert db.query(CalculationSnapshot).count() == snapshots_before


def test_country_block_without_lines_is_flagged_and_unassigned_lines_stay_primary(engine, db):
    db.add(ProposalCountry(proposal_id=db._test_proposal.id, country_id=db._test_usa.id))
    db.flush()
    db.expire_all()
    result = engine.calculate_proposal(proposal_id=db._test_proposal.id)
    payload = result["snapshot_payload"]
    assert any("nothing is priced for that country" in w for w in payload["warnings"])
    assert payload["pricing_context"]["country_id"] == db._test_india.id
    # Lines with no country block are priced by the primary country (India, INR).
    assert {li["country_id"] for li in payload["all_subscription_line_items"]} == {db._test_india.id}
    assert len(payload["pricing_context"]["country_blocks"]) == 2


def test_worked_example_values_survive_json_round_trip_exactly(engine, db):
    """Money is computed in Decimal; the JSON snapshot values must round-trip without loss."""
    result = engine.calculate_proposal(proposal_id=db._test_proposal.id)
    stored = db.query(CalculationSnapshot).one().snapshot_payload
    product = stored["products"][0]
    for key, expected in {
        "subscription_subtotal_before_discount": "589000.00",
        "service_subtotal_before_discount": "144000.00",
        "product_native_total": "733000.00",
    }.items():
        assert Decimal(str(product[key])) == Decimal(expected), key
    assert Decimal(str(result["total_proposal_reporting_currency"])) == Decimal("733000.00")


# ---------------------------------------------------------------------------
# Double charging (API level)
# ---------------------------------------------------------------------------

def _make_pack_with(db, feature_ids, code):
    pack = Pack(code=code, name=code, variant="standard", status="active")
    db.add(pack)
    db.flush()
    pv = PackVersion(pack_id=pack.id, version_no=1, status="active")
    db.add(pv)
    db.flush()
    for feature_id in feature_ids:
        db.add(PackItem(pack_version_id=pv.id, feature_id=feature_id))
    db.flush()
    return pv


def test_pack_containing_an_existing_standalone_feature_is_rejected(client, db):
    # The fixture proposal already has a standalone line for the TA feature.
    pv = _make_pack_with(db, [db._test_feat_ta.id], "PK-OVERLAP")
    resp = client.post(f"/api/proposals/{db._test_proposal.id}/line-items", json={
        "pack_version_id": pv.id, "uom_id": db._test_uom.id, "quantity": "10"})
    assert resp.status_code == 409, resp.text
    assert "standalone" in resp.json()["detail"]


def test_standalone_feature_already_inside_a_chosen_pack_is_rejected(client, db):
    other = Feature(product_id=db._test_prod_ta.id, code="TA-002", name="Other", classification="native", status="active")
    db.add(other)
    db.flush()
    pv = _make_pack_with(db, [other.id], "PK-OTHER")
    ok = client.post(f"/api/proposals/{db._test_proposal.id}/line-items", json={
        "pack_version_id": pv.id, "uom_id": db._test_uom.id, "quantity": "10"})
    assert ok.status_code == 201, ok.text
    dup = client.post(f"/api/proposals/{db._test_proposal.id}/line-items", json={
        "feature_id": other.id, "uom_id": db._test_uom.id, "quantity": "10"})
    assert dup.status_code == 409, dup.text
    assert "already included in pack" in dup.json()["detail"]


def test_same_feature_twice_is_rejected(client, db):
    resp = client.post(f"/api/proposals/{db._test_proposal.id}/line-items", json={
        "feature_id": db._test_feat_ta.id, "uom_id": db._test_uom.id, "quantity": "10"})
    assert resp.status_code == 409, resp.text


def test_unexpected_errors_are_not_reported_as_conflicts(client, db, monkeypatch):
    """A genuine bug must surface as a generic 500, not as a 409 carrying exception text."""
    from fastapi.testclient import TestClient

    from app.main import app
    from app.services import customer_service

    def boom(**_kwargs):
        raise RuntimeError("secret internal detail: SELECT * FROM customers")

    monkeypatch.setattr("app.api.routes.customers.create_customer", boom)
    with TestClient(app, raise_server_exceptions=False) as safe_client:
        resp = safe_client.post("/api/customers/", json={
            "code": "X", "name": "X", "country_id": db._test_india.id, "status": "active"})
    assert resp.status_code == 500
    assert "secret internal detail" not in resp.text and "SELECT" not in resp.text
    assert customer_service  # imported for clarity of intent
