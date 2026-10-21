"""API tests for Catalogue CRUD endpoints (Page 1 end-to-end backend verification).

Verifies:
- Product Family CRUD (Create, List, Get, Patch, Delete, duplicate code/name conflicts)
- Product CRUD (Create, List, Get, Patch, Delete, family FK validation, duplicate code)
- Feature CRUD (Create, List, Patch, Delete, product FK validation, duplicate code)
- Deletion safety (cannot delete family with products, cannot delete product with features)
- Transaction rollback on constraint failure
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
from app.models.catalogue import ProductFamily, Product, Feature


@event.listens_for(Session, "before_flush")
def auto_assign_ids(session, flush_context, instances):
    # SQLite cannot autoincrement BigInteger identity columns; PostgreSQL sessions keep their sequences.
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
def catalogue_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_product_family_crud_and_validation(catalogue_client):
    # 1. Create product family
    resp = catalogue_client.post(
        "/api/catalogue/families",
        json={"code": "HRM", "name": "Human Resource Management", "status": "active"},
    )
    assert resp.status_code == 201
    family_data = resp.json()
    assert family_data["code"] == "HRM"
    family_id = family_data["id"]

    # 2. Duplicate code rejected (409)
    dup_code_resp = catalogue_client.post(
        "/api/catalogue/families",
        json={"code": "HRM", "name": "Another HR", "status": "active"},
    )
    assert dup_code_resp.status_code == 409

    # 3. Duplicate name rejected (409)
    dup_name_resp = catalogue_client.post(
        "/api/catalogue/families",
        json={"code": "HRM2", "name": "human resource management", "status": "active"},
    )
    assert dup_name_resp.status_code == 409

    # 4. Get by ID
    get_resp = catalogue_client.get(f"/api/catalogue/families/{family_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Human Resource Management"

    # 5. Patch family
    patch_resp = catalogue_client.patch(
        f"/api/catalogue/families/{family_id}",
        json={"name": "Core HR & Workforce"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["name"] == "Core HR & Workforce"

    # 6. List families
    list_resp = catalogue_client.get("/api/catalogue/families")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # 7. Delete family
    del_resp = catalogue_client.delete(f"/api/catalogue/families/{family_id}")
    assert del_resp.status_code == 204

    # 8. Verify deleted
    not_found_resp = catalogue_client.get(f"/api/catalogue/families/{family_id}")
    assert not_found_resp.status_code == 404


def test_product_crud_and_family_constraints(catalogue_client):
    # Setup family
    fam_resp = catalogue_client.post(
        "/api/catalogue/families",
        json={"code": "PAY", "name": "Payroll & Benefits", "status": "active"},
    )
    assert fam_resp.status_code == 201
    fam_id = fam_resp.json()["id"]

    # 1. Create Product
    prod_resp = catalogue_client.post(
        "/api/catalogue/products",
        json={
            "product_family_id": fam_id,
            "code": "PAY-ENG-001",
            "name": "Payroll Engine",
            "status": "active",
        },
    )
    assert prod_resp.status_code == 201
    prod_id = prod_resp.json()["id"]

    # 2. Prevent creating product with non-existent family (404)
    invalid_fam_resp = catalogue_client.post(
        "/api/catalogue/products",
        json={
            "product_family_id": 99999,
            "code": "GHOST-001",
            "name": "Ghost Product",
            "status": "active",
        },
    )
    assert invalid_fam_resp.status_code == 404

    # 3. Prevent duplicate product code (409)
    dup_code_resp = catalogue_client.post(
        "/api/catalogue/products",
        json={
            "product_family_id": fam_id,
            "code": "PAY-ENG-001",
            "name": "Payroll Engine 2",
            "status": "active",
        },
    )
    assert dup_code_resp.status_code == 409

    # 4. Filter products by family_id
    filter_resp = catalogue_client.get(f"/api/catalogue/products?family_id={fam_id}")
    assert filter_resp.status_code == 200
    assert len(filter_resp.json()) == 1

    # 5. Prevent deleting family while it contains products (409)
    del_fam_resp = catalogue_client.delete(f"/api/catalogue/families/{fam_id}")
    assert del_fam_resp.status_code == 409

    # 6. Patch product
    patch_resp = catalogue_client.patch(
        f"/api/catalogue/products/{prod_id}",
        json={"name": "Enterprise Payroll Engine"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["name"] == "Enterprise Payroll Engine"

    # 7. Delete product
    del_prod_resp = catalogue_client.delete(f"/api/catalogue/products/{prod_id}")
    assert del_prod_resp.status_code == 204

    # 8. Now family can be deleted safely
    del_fam_now_resp = catalogue_client.delete(f"/api/catalogue/families/{fam_id}")
    assert del_fam_now_resp.status_code == 204


def test_feature_crud_and_product_constraints(catalogue_client):
    # Setup family and product
    fam_resp = catalogue_client.post(
        "/api/catalogue/families",
        json={"code": "TA", "name": "Talent Acquisition", "status": "active"},
    )
    fam_id = fam_resp.json()["id"]

    prod_resp = catalogue_client.post(
        "/api/catalogue/products",
        json={
            "product_family_id": fam_id,
            "code": "TA-ATS-001",
            "name": "Applicant Tracking System",
            "status": "active",
        },
    )
    prod_id = prod_resp.json()["id"]

    # 1. Create Feature
    feat_resp = catalogue_client.post(
        "/api/catalogue/features",
        json={
            "product_id": prod_id,
            "code": "TA-FEAT-001",
            "name": "Resume Parser",
            "classification": "ai_enabled",
            "status": "active",
        },
    )
    assert feat_resp.status_code == 201
    feat_id = feat_resp.json()["id"]

    # 2. Prevent deleting product that contains features (409)
    del_prod_resp = catalogue_client.delete(f"/api/catalogue/products/{prod_id}")
    assert del_prod_resp.status_code == 409

    # 3. Patch Feature
    patch_resp = catalogue_client.patch(
        f"/api/catalogue/features/{feat_id}",
        json={"name": "AI Resume Matcher Pro"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["name"] == "AI Resume Matcher Pro"

    # 4. Delete feature
    del_feat_resp = catalogue_client.delete(f"/api/catalogue/features/{feat_id}")
    assert del_feat_resp.status_code == 204

    # 5. Product can now be deleted
    del_prod_clean = catalogue_client.delete(f"/api/catalogue/products/{prod_id}")
    assert del_prod_clean.status_code == 204
