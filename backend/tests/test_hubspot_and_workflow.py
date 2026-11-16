"""Tests for HubSpot integration and Proposal Workflow endpoints."""

import os
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.hubspot_service import is_hubspot_configured

client = TestClient(app)


def test_hubspot_status_unconfigured(monkeypatch):
    monkeypatch.delenv("HUBSPOT_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("HUBSPOT_API_KEY", raising=False)
    assert not is_hubspot_configured()

    resp = client.get("/api/integrations/hubspot/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False
    assert data["is_mock"] is True
    assert "Mock CRM mode" in data["message"]


def test_hubspot_status_configured(monkeypatch):
    monkeypatch.setenv("HUBSPOT_ACCESS_TOKEN", "pat-na1-test-token-12345")
    assert is_hubspot_configured()

    resp = client.get("/api/integrations/hubspot/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["is_mock"] is False
    assert "live CRM credentials" in data["message"]


def test_hubspot_deals_unconfigured(monkeypatch):
    monkeypatch.delenv("HUBSPOT_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("HUBSPOT_API_KEY", raising=False)

    resp = client.get("/api/integrations/hubspot/deals")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False
    assert data["is_mock"] is True
    # In mock development mode, sample deals are available
    assert len(data["deals"]) >= 5
    deal_names = [d["deal_name"] for d in data["deals"]]
    assert any("Amazon" in name for name in deal_names)


def test_hubspot_deal_details_unconfigured(monkeypatch):
    monkeypatch.delenv("HUBSPOT_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("HUBSPOT_API_KEY", raising=False)

    resp = client.get("/api/integrations/hubspot/deals/HS-1001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["hubspot_deal_id"] == "HS-1001"
    assert "Amazon" in data["deal_name"]
    assert len(data["contacts"]) >= 1
    assert data["contacts"][0]["name"] == "Rajesh Kumar"


def test_hubspot_sample_searches_step3(monkeypatch):
    """Verify searches for: Global Workforce Deal, Amazon, 18452209731, Gulf Crest Bank, 18452213307."""
    monkeypatch.delenv("HUBSPOT_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("HUBSPOT_API_KEY", raising=False)

    # 1. Global Workforce Deal
    r1 = client.get("/api/integrations/hubspot/deals", params={"query": "Global Workforce Deal"})
    assert r1.status_code == 200
    d1 = r1.json()["deals"]
    assert len(d1) >= 1
    assert d1[0]["hubspot_deal_id"] == "18452209731"

    # 2. Amazon
    r2 = client.get("/api/integrations/hubspot/deals", params={"query": "Amazon"})
    assert r2.status_code == 200
    d2 = r2.json()["deals"]
    assert any(d["hubspot_deal_id"] == "18452209731" for d in d2)

    # 3. 18452209731
    r3 = client.get("/api/integrations/hubspot/deals", params={"query": "18452209731"})
    assert r3.status_code == 200
    d3 = r3.json()["deals"]
    assert len(d3) == 1
    assert d3[0]["hubspot_deal_id"] == "18452209731"

    # 4. Gulf Crest Bank
    r4 = client.get("/api/integrations/hubspot/deals", params={"query": "Gulf Crest Bank"})
    assert r4.status_code == 200
    d4 = r4.json()["deals"]
    assert len(d4) == 1
    assert d4[0]["hubspot_deal_id"] == "18452213307"

    # 5. 18452213307
    r5 = client.get("/api/integrations/hubspot/deals", params={"query": "18452213307"})
    assert r5.status_code == 200
    d5 = r5.json()["deals"]
    assert len(d5) == 1
    assert d5[0]["hubspot_deal_id"] == "18452213307"


def test_gulf_crest_bank_details_and_structure_step6(monkeypatch):
    """Verify Gulf Crest Bank details: UAE, AED, Middle East, GCC, products, and contacts."""
    monkeypatch.delenv("HUBSPOT_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("HUBSPOT_API_KEY", raising=False)

    resp = client.get("/api/integrations/hubspot/deals/18452213307")
    assert resp.status_code == 200
    deal = resp.json()

    assert deal["hubspot_deal_id"] == "18452213307"
    assert "Gulf Crest Bank" in deal["deal_name"]
    assert deal["currency"] == "AED"
    assert deal["country"] == "United Arab Emirates"
    assert deal["region"] == "Middle East"
    assert deal["sub_region"] == "GCC"
    assert "Adrenalin Core HCM" in deal["products"]
    assert "Payroll Middle East" in deal["products"]

    contacts = deal["contacts"]
    assert len(contacts) >= 2
    primary = [c for c in contacts if c["is_primary"]]
    assert len(primary) == 1
    assert primary[0]["name"] == "Omar Al Haddad"
    assert primary[0]["email"] == "omar.alhaddad@gulfcrest.com"



def test_proposal_content_workflow_endpoints(pg_client):
    """Test get/update content, readiness, and submit workflow against pg_client if configured."""
    # Create or fetch a proposal via client
    # First get proposals
    resp = pg_client.get("/api/proposals")
    if resp.status_code != 200 or not resp.json():
        pytest.skip("No proposals in test database to test content workflow")

    prop_id = resp.json()[0]["id"]

    # 1. Get content
    resp = pg_client.get(f"/api/proposals/{prop_id}/content")
    assert resp.status_code == 200
    data = resp.json()
    assert "sections" in data
    assert "executive_summary" in data["sections"]

    # 2. Update content with structured JSON
    structured_sections = {
        "executive_summary": {
            "customer_introduction": "Amazon Global Workforce Engagement Overview.",
            "customer_objectives": "Streamline global HR operations across India and UAE.",
            "value_proposition": "AI-first talent transformation with unified payroll.",
            "conclusion": "Accelerate time-to-value and ensure 100% statutory compliance.",
        },
        "scope_of_work": {
            "license": "Adrenalin HCM Cloud Edition for 5,000 employees.",
            "implementation_plan": "Phase 1 to 5 delivery across 20 weeks.",
            "implementation_approach": "Adrenalin Rollout Methodology (ARM).",
            "in_scope": "Core HCM, Payroll, Leave & Attendance.",
            "out_of_scope": "Legacy database scraping without APIs.",
        },
        "customization_integration": {
            "none_required": False,
            "items": [
                {
                    "id": "1",
                    "type": "Customization",
                    "title": "Shift Roster Workflow",
                    "module": "Workforce",
                    "system": "Core HCM",
                    "description": "Multi-tier approval for plant shift rosters",
                    "effort_days": 8,
                    "chargeable": True,
                },
                {
                    "id": "2",
                    "type": "Integration",
                    "title": "Active Directory SSO",
                    "module": "Security",
                    "system": "Azure AD",
                    "description": "SAML 2.0 user provisioning",
                    "effort_days": 5,
                    "chargeable": True,
                },
            ],
        },
        "terms_conditions": {
            "commercial_tc": "All prices exclusive of statutory VAT/GST. Net 30 payment.",
            "payment_milestones": [
                {"milestone": "Advance", "percentage": 20},
                {"milestone": "Blueprint", "percentage": 30},
                {"milestone": "UAT", "percentage": 30},
                {"milestone": "Go-Live", "percentage": 20},
            ],
            "payment_terms_text": "Net 30 days from milestone signoff.",
            "change_request_rates": [
                {"role": "Functional Consultant", "rate_per_day": 25000, "currency": "INR"},
                {"role": "Project Manager", "rate_per_day": 35000, "currency": "INR"},
            ],
            "proposal_validity_days": 45,
            "terms_of_proposal": "Standard Order Acceptance within 3 working days.",
        },
        "fitment_document": {
            "fitment_text": "96% standard product fitment.",
            "customer_requirements": "Multi-country payroll and shift management.",
            "solution_fitment": "Standard HCM suite covers all functional requirements.",
            "remarks": "Tier 4 Azure data center hosting.",
        },
    }
    resp = pg_client.put(f"/api/proposals/{prop_id}/content", json={"sections": structured_sections})
    assert resp.status_code == 200
    updated = resp.json()
    assert isinstance(updated["sections"]["executive_summary"], dict)
    assert updated["sections"]["executive_summary"]["customer_introduction"] == "Amazon Global Workforce Engagement Overview."
    assert updated["sections"]["customization_integration"]["items"][0]["title"] == "Shift Roster Workflow"

    # 3. Test Attachment upload, list, download, delete
    sample_file_bytes = b"Sample Fitment Analysis Document Content for DOCX/PDF export."
    upload_resp = pg_client.post(
        f"/api/proposals/{prop_id}/attachments",
        files={"file": ("Fitment_Matrix_Amazon.docx", sample_file_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert upload_resp.status_code == 201
    att_data = upload_resp.json()
    assert att_data["file_name"] == "Fitment_Matrix_Amazon.docx"
    doc_id = att_data["id"]

    # List attachments
    list_resp = pg_client.get(f"/api/proposals/{prop_id}/attachments")
    assert list_resp.status_code == 200
    att_list = list_resp.json()
    assert any(a["id"] == doc_id for a in att_list)

    # Download attachment
    down_resp = pg_client.get(f"/api/proposals/{prop_id}/attachments/{doc_id}")
    assert down_resp.status_code == 200
    assert down_resp.content == sample_file_bytes

    # Delete attachment
    del_resp = pg_client.delete(f"/api/proposals/{prop_id}/attachments/{doc_id}")
    assert del_resp.status_code == 200

    # 4. Check readiness
    resp = pg_client.get(f"/api/proposals/{prop_id}/readiness")
    assert resp.status_code == 200
    readiness = resp.json()
    assert "checklist" in readiness
    assert len(readiness["checklist"]) == 8

    # 5. Check approval route
    resp = pg_client.get(f"/api/proposals/{prop_id}/approval-route")
    assert resp.status_code == 200
    route = resp.json()
    assert "approval_stages" in route
    assert len(route["approval_stages"]) >= 1


def test_docx_generation_with_all_five_content_sections():
    """Verify that Word export generator populates all 5 narrative sections and tables."""
    from unittest.mock import MagicMock, patch
    import docx
    from app.services.proposal_export_service import generate_proposal_docx

    mock_db = MagicMock()
    mock_export_data = {
        "proposal_id": 101,
        "proposal_code": "PROP-AMZ-2026",
        "customer_name": "Amazon Inc",
        "customer_tier": "Tier 1",
        "deployments": ["Cloud SaaS (Azure)"],
        "countries": ["India", "UAE"],
        "pricing_models": ["Platform + Subscription"],
        "total_headcount": 5000,
        "contract_term_months": 36,
        "contract_term_years": 3.0,
        "contract_duration_display": "36 Months (3.0 Years)",
        "proposal_date": "2026-11-14",
        "reporting_currency": "INR",
        "snapshot_id": 999,
        "countries_grouped": [],
        "products_commercials": [],
        "has_license_amc": False,
        "has_platform_subscription": True,
        "has_pepm": False,
        "all_service_lines": [],
        "total_license_reporting": 0.0,
        "total_amc_reporting": 0.0,
        "total_platform_reporting": 1200000.0,
        "total_sub_recurring_reporting": 3600000.0,
        "total_pepm_reporting": 0.0,
        "total_services": 800000.0,
        "total_services_gross_reporting": 800000.0,
        "total_discounts_reporting": 0.0,
        "annual_fcv": 1600000.0,
        "fcv": 5600000.0,
        "fx_rounding_adjustment": 0.0,
    }

    mock_content = {
        "proposal_id": 101,
        "sections": {
            "executive_summary": {
                "customer_introduction": "Amazon Enterprise Digital HR Modernization.",
                "customer_objectives": "Automate multi-country compliance across India & UAE.",
                "value_proposition": "AI-first HCM platform with connected talent architecture.",
                "conclusion": "Drive measurable business outcomes for 5,000 employees.",
            },
            "scope_of_work": {
                "license": "Adrenalin HCM Cloud Edition covering India and UAE.",
                "implementation_plan": "20-week phased rollout across 5 key gateways.",
                "implementation_approach": "Adrenalin Rollout Methodology (ARM).",
                "in_scope": "• Core HCM\n• Global Payroll\n• Mobile ESS/MSS",
                "out_of_scope": "• Legacy data scraping\n• On-premise server hosting",
            },
            "customization_integration": {
                "none_required": False,
                "items": [
                    {
                        "id": "1",
                        "type": "Customization",
                        "title": "Shift Roster Custom Workflow",
                        "module": "Workforce",
                        "system": "Core HCM",
                        "description": "Multi-tier shift signoff",
                        "effort_days": 8,
                        "chargeable": True,
                    },
                    {
                        "id": "2",
                        "type": "Integration",
                        "title": "Okta SSO Connector",
                        "module": "Security",
                        "system": "Okta",
                        "description": "SAML 2.0 user sync",
                        "effort_days": 5,
                        "chargeable": True,
                    },
                ],
            },
            "terms_conditions": {
                "commercial_tc": "Exclusive of statutory taxes. Net 30 payment terms.",
                "payment_milestones": [
                    {"milestone": "Advance Kickoff", "percentage": 20},
                    {"milestone": "Blueprint Signoff", "percentage": 30},
                    {"milestone": "UAT Completion", "percentage": 30},
                    {"milestone": "Go-Live Acceptance", "percentage": 20},
                ],
                "payment_terms_text": "Net 30 days from deliverable signoff.",
                "change_request_rates": [
                    {"role": "Functional Consultant", "rate_per_day": 25000, "currency": "INR"},
                    {"role": "Project Manager", "rate_per_day": 35000, "currency": "INR"},
                ],
                "proposal_validity_days": 45,
                "terms_of_proposal": "Order Acceptance issued within 3-5 working days.",
            },
            "fitment_document": {
                "fitment_text": "96% out-of-the-box functional fitment.",
                "customer_requirements": "Multi-country payroll and mobile self-service.",
                "solution_fitment": "Fully verified against client technical RFP.",
                "remarks": "Hosted on Tier 4 Microsoft Azure cloud.",
            },
        },
        "attachments": [
            {
                "id": 1,
                "file_name": "Amazon_RFP_Fitment_Matrix.xlsx",
                "file_size_bytes": 154200,
                "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "status": "uploaded",
            }
        ],
    }

    with patch("app.services.proposal_export_service.extract_proposal_export_data", return_value=mock_export_data), \
         patch("app.services.proposal_workflow_service.get_proposal_content_sections", return_value=mock_content):
        docx_stream = generate_proposal_docx(proposal_id=101, db=mock_db)
        doc = docx.Document(docx_stream)
        full_text = "\n".join(p.text for p in doc.paragraphs)
        all_table_text = "\n".join(c.text for t in doc.tables for r in t.rows for c in r.cells)

        # 1. Executive Summary
        assert "Amazon Enterprise Digital HR Modernization." in full_text
        assert "Automate multi-country compliance across India & UAE." in full_text
        assert "AI-first HCM platform with connected talent architecture." in full_text

        # 2. Scope of Work
        assert "Adrenalin HCM Cloud Edition covering India and UAE." in full_text
        assert "20-week phased rollout across 5 key gateways." in full_text
        assert "Core HCM" in all_table_text

        # 3. Customization & Integration
        assert "Shift Roster Custom Workflow" in all_table_text
        assert "Okta SSO Connector" in all_table_text

        # 4. Terms & Conditions
        assert "Proposal Validity: This commercial proposal and associated software licensing terms are valid for 45 calendar days" in full_text
        assert "Exclusive of statutory taxes. Net 30 payment terms." in full_text
        assert "Functional Consultant" in all_table_text
        assert "Advance Kickoff" in all_table_text

        # 5. Fitment Document & Attachments
        assert "96% out-of-the-box functional fitment." in full_text
        assert "Amazon_RFP_Fitment_Matrix.xlsx" in all_table_text


def test_list_master_roles_endpoint():
    """Verify GET /api/masters/roles returns distinct active roles from master tables."""
    from unittest.mock import MagicMock
    from app.db.session import get_db

    mock_db = MagicMock()
    # Mock ServiceRate query
    mock_db.query.return_value.filter.return_value.distinct.return_value.all.return_value = [
        ("Functional Consultant",),
        ("Technical Consultant",),
    ]
    # Mock Role query
    role_obj = MagicMock()
    role_obj.id = 1
    role_obj.code = "admin"
    role_obj.name = "System Administrator"
    mock_db.query.return_value.all.return_value = [role_obj]

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        resp = client.get("/api/masters/roles")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        names = [r["name"] for r in data]
        assert "Functional Consultant" in names
        assert "System Administrator" in names
    finally:
        app.dependency_overrides.pop(get_db, None)
