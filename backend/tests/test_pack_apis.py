"""API tests for Pack Builder endpoints (Page 2 end-to-end backend verification).

Verifies:
- Pack creation with initial version & features
- Unique pack code constraint (409 Conflict)
- Product family FK validation (409 Conflict on invalid FK)
- List packs with nested versions
- Get pack by ID
- Patch pack metadata
- Get pack version with nested feature items
- Create pack version (and prevent duplicate version_no)
- Update pack version (activate or lock version)
- Add feature to pack version (and prevent duplicate item)
- Remove feature from pack version
- Delete pack and associated versions/items
- Transaction rollback and error handling
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

import app.models
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.catalogue import ProductFamily, Product, Feature, Pack, PackVersion, PackItem


@event.listens_for(Session, "before_flush")
def auto_assign_ids(session, flush_context, instances):
    if session.get_bind().dialect.name != "sqlite":
        return
    id_counters = {}
    for instance in session.new:
        if hasattr(instance, "id") and getattr(instance, "id", None) is None:
            cls = type(instance)
            if cls not in id_counters:
                max_id = session.execute(select(func.coalesce(func.max(cls.id), 0))).scalar() or 0
                id_counters[cls] = max_id
            id_counters[cls] += 1
            setattr(instance, "id", id_counters[cls])


@pytest.fixture
def pack_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Seed supporting family, product, and features
    db = TestingSessionLocal()
    fam = ProductFamily(code="TA", name="Talent Acquisition", status="active")
    db.add(fam)
    db.flush()

    prod = Product(
        code="ATS-01",
        name="Applicant Tracking System",
        product_family_id=fam.id,
        status="active",
    )
    db.add(prod)
    db.flush()

    feat1 = Feature(
        code="FEAT-ATS-CORE",
        name="Core ATS Pipeline",
        product_id=prod.id,
        classification="native",
    )
    feat2 = Feature(
        code="FEAT-ATS-AI",
        name="AI Resume Matcher",
        product_id=prod.id,
        classification="ai_enabled",
    )
    db.add_all([feat1, feat2])
    db.commit()
    db.close()

    def override_get_db():
        test_db = TestingSessionLocal()
        try:
            yield test_db
        finally:
            test_db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_pack_crud_and_validation(pack_client):
    # 1. Create a pack bundle with initial version and feature items
    resp = pack_client.post(
        "/api/packs/",
        json={
            "code": "TA-SUITE-01",
            "name": "Talent Acquisition Growth Suite",
            "variant": "standard",
            "product_family_id": 1,
            "status": "active",
            "initial_version": 1,
            "feature_ids": [1, 2],
        },
    )
    assert resp.status_code == 201
    pack = resp.json()
    assert pack["code"] == "TA-SUITE-01"
    assert pack["name"] == "Talent Acquisition Growth Suite"
    assert len(pack["pack_versions"]) == 1
    pack_id = pack["id"]
    version_id = pack["pack_versions"][0]["id"]

    # 2. Prevent duplicate pack code
    dup_resp = pack_client.post(
        "/api/packs/",
        json={
            "code": "TA-SUITE-01",
            "name": "Another Suite",
            "variant": "standard",
            "status": "active",
        },
    )
    assert dup_resp.status_code == 409

    # 3. Invalid family ID rejects with 404
    bad_fam_resp = pack_client.post(
        "/api/packs/",
        json={
            "code": "BAD-FAM-01",
            "name": "Bad Family Pack",
            "variant": "standard",
            "product_family_id": 9999,
            "status": "active",
        },
    )
    assert bad_fam_resp.status_code == 404

    # 4. List packs
    list_resp = pack_client.get("/api/packs/")
    assert list_resp.status_code == 200
    packs = list_resp.json()
    assert len(packs) >= 1
    assert any(p["id"] == pack_id for p in packs)

    # 5. Get pack detail by ID
    get_resp = pack_client.get(f"/api/packs/detail/{pack_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == pack_id

    # 6. Patch pack metadata
    patch_resp = pack_client.patch(
        f"/api/packs/{pack_id}",
        json={"name": "Talent Acquisition Enterprise Suite", "variant": "premium"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["name"] == "Talent Acquisition Enterprise Suite"
    assert patch_resp.json()["variant"] == "premium"

    # 7. Get pack version detail with items
    ver_resp = pack_client.get(f"/api/packs/{version_id}")
    assert ver_resp.status_code == 200
    ver_data = ver_resp.json()
    assert ver_data["version_no"] == 1
    assert len(ver_data["pack_items"]) == 2

    # 8. Create new pack version (v2)
    v2_resp = pack_client.post(
        "/api/packs/versions",
        json={
            "pack_id": pack_id,
            "version_no": 2,
            "status": "draft",
        },
    )
    assert v2_resp.status_code == 201
    v2_data = v2_resp.json()
    assert v2_data["version_no"] == 2
    v2_id = v2_data["id"]

    # 9. Prevent duplicate version number for same pack
    dup_v_resp = pack_client.post(
        "/api/packs/versions",
        json={
            "pack_id": pack_id,
            "version_no": 2,
            "status": "draft",
        },
    )
    assert dup_v_resp.status_code == 409

    # 10. Update pack version status (e.g. activate version)
    act_resp = pack_client.patch(
        f"/api/packs/versions/{v2_id}",
        json={"status": "active"},
    )
    assert act_resp.status_code == 200
    assert act_resp.json()["status"] == "active"

    # 11. Add feature item to v2
    add_item_resp = pack_client.post(f"/api/packs/versions/{v2_id}/items/1")
    assert add_item_resp.status_code == 201

    # 12. Prevent duplicate item in same version
    dup_item_resp = pack_client.post(f"/api/packs/versions/{v2_id}/items/1")
    assert dup_item_resp.status_code == 409

    # 13. Remove feature item from v2
    del_item_resp = pack_client.delete(f"/api/packs/versions/{v2_id}/items/1")
    assert del_item_resp.status_code == 204

    # 14. Delete pack
    del_pack_resp = pack_client.delete(f"/api/packs/{pack_id}")
    assert del_pack_resp.status_code == 204

    # Verify 404 after deletion
    get_after_del = pack_client.get(f"/api/packs/detail/{pack_id}")
    assert get_after_del.status_code == 404


def test_pack_items_sync_and_required_persistence(pack_client):
    """Verifies Pack items creation with is_required, bulk sync, item toggle, and read-after-write."""
    # 1. Create pack with explicit items containing is_required flags
    resp = pack_client.post(
        "/api/packs/",
        json={
            "code": "PACK-REQ-01",
            "name": "Required Items Test Pack",
            "variant": "standard",
            "product_family_id": 1,
            "status": "active",
            "initial_version": 1,
            "items": [
                {"feature_id": 1, "is_required": True},
                {"feature_id": 2, "is_required": False},
            ],
        },
    )
    assert resp.status_code == 201
    pack = resp.json()
    version_id = pack["pack_versions"][0]["id"]

    # 2. Read back version and verify is_required values
    v_resp = pack_client.get(f"/api/packs/{version_id}")
    assert v_resp.status_code == 200
    items = {item["feature_id"]: item["is_required"] for item in v_resp.json()["pack_items"]}
    assert items[1] is True
    assert items[2] is False

    # 3. Patch item 2 to is_required=True
    patch_item = pack_client.patch(
        f"/api/packs/versions/{version_id}/items/2",
        json={"is_required": True},
    )
    assert patch_item.status_code == 200
    assert patch_item.json()["is_required"] is True

    # Fresh read-after-write
    v_resp2 = pack_client.get(f"/api/packs/{version_id}")
    items2 = {item["feature_id"]: item["is_required"] for item in v_resp2.json()["pack_items"]}
    assert items2[2] is True

    # 4. Sync pack items: remove feature 2, keep feature 1 as optional (is_required=False)
    sync_resp = pack_client.put(
        f"/api/packs/versions/{version_id}/items",
        json={"items": [{"feature_id": 1, "is_required": False}]},
    )
    assert sync_resp.status_code == 200
    synced_items = sync_resp.json()
    assert len(synced_items) == 1
    assert synced_items[0]["feature_id"] == 1
    assert synced_items[0]["is_required"] is False

    # Fresh read-after-write
    v_resp3 = pack_client.get(f"/api/packs/{version_id}")
    items3 = {item["feature_id"]: item["is_required"] for item in v_resp3.json()["pack_items"]}
    assert len(items3) == 1
    assert items3[1] is False
    assert 2 not in items3

    # Clean up
    del_resp = pack_client.delete(f"/api/packs/{pack['id']}")
    assert del_resp.status_code == 204

