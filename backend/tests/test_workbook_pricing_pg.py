"""calculation explained.xlsx examples against a REAL local PostgreSQL database (opt-in `pg` tests).

Schema comes from the Alembic migrations (including the License Fee + AMC alignment in
d0e1f2a3b4c5) and master data from the DEV seed, so this also proves the migrated configuration
prices the workbook correctly. TEST_DATABASE_URL must be local and contain "test"; never Neon.
"""

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CustomerTier, DeploymentModel, PricingModel, UnitOfMeasure
from tests.test_workbook_pricing import LICENSE, PEPM, PLATFORM, QTY, YEARS

pytestmark = pytest.mark.pg


@pytest.fixture()
def pg_wb(pg_engine, pg_client, pg_seed_ids):
    with Session(pg_engine) as s:
        tiers = []
        for i in (1, 2, 3):
            t = s.execute(select(CustomerTier).where(CustomerTier.name == f"WB PG Tier {i}")).scalars().first()
            if t is None:
                t = CustomerTier(name=f"WB PG Tier {i}", employee_min=900000 + i * 1000, employee_max=900000 + i * 1000 + 999,
                                 valid_from=date(2026, 1, 1))
                s.add(t)
                s.flush()
            tiers.append(t.id)
        code = lambda model, c: s.execute(select(model).where(model.code == c)).scalars().one().id  # noqa: E731
        ids = {
            "tiers": tiers,
            "uom": {"ESS": code(UnitOfMeasure, "employee"), "NON": code(UnitOfMeasure, "active_employees_non_ess")},
            "pm": {"platform": code(PricingModel, "platform_subscription"), "pepm": code(PricingModel, "pepm"),
                   "license": code(PricingModel, "license_amc")},
            "dep": {"shared_cloud": code(DeploymentModel, "shared_cloud"), "on_premise": code(DeploymentModel, "on_premise")},
        }
        s.commit()
    seed = pg_seed_ids

    def save(dep, pm, uom, tiers_payload):
        r = pg_client.put("/api/rates/rate-cards/target", json={
            "rate_card_version_id": seed.rate_card_version_id, "country_id": seed.india_id,
            "deployment_model_id": ids["dep"][dep], "pricing_model_id": ids["pm"][pm],
            "pack_version_id": seed.pack_version_id, "uom_id": ids["uom"][uom], "tier_fees": tiers_payload})
        assert r.status_code == 200, r.text

    save("shared_cloud", "platform", "ESS", [{"tier_id": t, "fixed_fee": str(PLATFORM["ESS"]["fee"][i]),
                                              "unit_rate": str(PLATFORM["ESS"]["rate"][i])} for i, t in enumerate(tiers)])
    for uom in ("ESS", "NON"):
        save("shared_cloud", "pepm", uom, [{"tier_id": t, "unit_rate": str(PEPM[uom]["rate"][i])} for i, t in enumerate(tiers)])
    for uom in ("ESS", "NON"):
        save("on_premise", "license", uom, [{"tier_id": t, "unit_rate": str(LICENSE[uom]["fee"][i]),
                                             "amc_percentage": str(LICENSE[uom]["amc"][i])} for i, t in enumerate(tiers)])

    def price(tier_idx, dep, pm, uom, qty):
        n = f"PG-{dep}-{pm}-{uom}-{tier_idx}"
        cust = pg_client.post("/api/customers/", json={"code": n, "name": n, "country_id": seed.india_id,
                                                       "customer_tier_id": tiers[tier_idx]}).json()
        deal = pg_client.post("/api/deals/", json={"code": n, "name": n, "customer_id": cust["id"], "owner_user_id": seed.user_id}).json()
        prop = pg_client.post("/api/proposals/", json={"code": n, "deal_id": deal["id"], "currency_id": seed.inr_id,
                                                       "created_by_user_id": seed.user_id,
                                                       "rate_card_version_id": seed.rate_card_version_id}).json()
        assert pg_client.post(f"/api/proposals/{prop['id']}/countries", json={
            "country_id": seed.india_id, "deployment_model_id": ids["dep"][dep], "pricing_model_id": ids["pm"][pm],
            "is_primary_deployment": True}).status_code == 201
        line = pg_client.post(f"/api/proposals/{prop['id']}/line-items", json={
            "pack_version_id": seed.pack_version_id, "uom_id": ids["uom"][uom], "quantity": str(qty)})
        assert line.status_code == 201, line.text
        res = pg_client.post(f"/api/proposals/{prop['id']}/calculate", json={"contract_term_months": YEARS * 12})
        assert res.status_code == 200, res.text
        return res.json()["snapshot_payload"]["all_subscription_line_items"][0]

    return price


@pytest.mark.parametrize("tier", [0, 1, 2])
def test_pg_platform_subscription_ess(pg_wb, tier):
    li = pg_wb(tier, "shared_cloud", "platform", "ESS", QTY[tier])
    assert li["contract_subscription_before_discount"] == PLATFORM["ESS"]["combined"][tier]


@pytest.mark.parametrize("uom", ["ESS", "NON"])
@pytest.mark.parametrize("tier", [0, 1, 2])
def test_pg_pepm(pg_wb, uom, tier):
    # Seeded master data + migration a3b4c5d6e7f8: PEPM accepts both ESS and non-ESS.
    li = pg_wb(tier, "shared_cloud", "pepm", uom, QTY[tier])
    assert li["contract_subscription_before_discount"] == PEPM[uom]["total"][tier]


@pytest.mark.parametrize("uom", ["ESS", "NON"])
@pytest.mark.parametrize("tier", [0, 1, 2])
def test_pg_license_amc(pg_wb, uom, tier):
    li = pg_wb(tier, "on_premise", "license", uom, QTY[tier])
    assert li["contract_subscription_before_discount"] == LICENSE[uom]["total"][tier]
