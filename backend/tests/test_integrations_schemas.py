"""Unit tests for Pydantic v2 Integrations schemas (Wave 6).

Validates:
1. Clause schemas (categories, statuses, update null guards, detail response).
2. ClauseVersion schemas (positive version_no, status, immutable snapshot behavior, detail response).
3. ProposalClause schemas (non-negative sort_order, overrides, mandatory flag, detail response).
4. Document schemas (doc_type, status, non-negative file_size_bytes, detail response).
5. CrmFieldMapping schemas (sync_direction, provider, status, update null guards).
6. CrmSyncLog schemas (append-only telemetry, direction, status, JSON payload snapshot).
7. PublishJob schemas (job_type, lifecycle statuses, non-negative retry_count, detail response).
8. Schema exports from app.schemas.integrations and app.schemas.
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.integrations import (
    ClauseCategory,
    ClauseCreate,
    ClauseDetailResponse,
    ClauseResponse,
    ClauseStatus,
    ClauseUpdate,
    ClauseVersionCreate,
    ClauseVersionDetailResponse,
    ClauseVersionResponse,
    ClauseVersionStatus,
    ClauseVersionUpdate,
    CrmFieldMappingCreate,
    CrmFieldMappingResponse,
    CrmFieldMappingStatus,
    CrmFieldMappingUpdate,
    CrmLogDirection,
    CrmSyncLogCreate,
    CrmSyncLogResponse,
    CrmSyncLogStatus,
    DocumentCreate,
    DocumentDetailResponse,
    DocumentResponse,
    DocumentStatus,
    DocumentType,
    DocumentUpdate,
    ProposalClauseCreate,
    ProposalClauseDetailResponse,
    ProposalClauseResponse,
    ProposalClauseUpdate,
    PublishJobCreate,
    PublishJobDetailResponse,
    PublishJobResponse,
    PublishJobStatus,
    PublishJobUpdate,
    SyncDirection,
)


class MockORMObject:
    """Simulates SQLAlchemy ORM model instances for testing from_attributes."""

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


# =============================================================================
# 1. Clause Schema Tests
# =============================================================================

@pytest.mark.parametrize("category", [
    "legal",
    "payment",
    "commercial",
    "sla",
    "compliance",
    "custom",
])
def test_clause_create_valid_categories(category):
    c = ClauseCreate(
        code=f"CLS-{category.upper()}-001",
        title=f"{category.capitalize()} Clause",
        category=category,
        description="Standard contractual clause",
        status="active",
    )
    assert c.code == f"CLS-{category.upper()}-001"
    assert c.category == category
    assert c.status == "active"


def test_clause_create_invalid_category():
    with pytest.raises(ValidationError):
        ClauseCreate(
            code="CLS-INV-001",
            title="Invalid",
            category="confidential",  # not in allowed literal
        )


def test_clause_create_missing_required():
    with pytest.raises(ValidationError):
        ClauseCreate(code="CLS-01", title="Title")  # missing category


def test_clause_string_length_limits():
    with pytest.raises(ValidationError):
        ClauseCreate(code="A" * 51, title="Valid", category="legal")
    with pytest.raises(ValidationError):
        ClauseCreate(code="CLS-1", title="A" * 201, category="legal")


def test_clause_update_null_guards():
    up = ClauseUpdate(title="Updated Title")
    assert up.title == "Updated Title"

    with pytest.raises(ValidationError) as exc:
        ClauseUpdate(code=None)
    assert "code cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ClauseUpdate(title=None)
    assert "title cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ClauseUpdate(category=None)
    assert "category cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ClauseUpdate(status=None)
    assert "status cannot be null" in str(exc.value)

    # description is nullable
    up_desc = ClauseUpdate(description=None)
    assert up_desc.description is None


def test_clause_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=1,
        code="CLS-PAY-001",
        title="Payment Terms",
        category="payment",
        description="Net 30 terms",
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = ClauseResponse.model_validate(orm)
    assert resp.id == 1
    assert resp.code == "CLS-PAY-001"


def test_clause_detail_response_nested():
    now = datetime.now(timezone.utc)
    v_orm = MockORMObject(
        id=10,
        clause_id=1,
        version_no=1,
        body_text="Invoices are payable within 30 days.",
        status="active",
        created_by_user_id=2,
        created_at=now,
    )
    clause_orm = MockORMObject(
        id=1,
        code="CLS-PAY-001",
        title="Payment Terms",
        category="payment",
        description=None,
        status="active",
        created_at=now,
        updated_at=now,
        versions=[v_orm],
    )
    detail = ClauseDetailResponse.model_validate(clause_orm)
    assert detail.id == 1
    assert len(detail.versions) == 1
    assert detail.versions[0].version_no == 1


# =============================================================================
# 2. ClauseVersion Schema Tests
# =============================================================================

@pytest.mark.parametrize("status", [
    "draft",
    "approved",
    "active",
    "superseded",
])
def test_clause_version_create_valid_statuses(status):
    cv = ClauseVersionCreate(
        clause_id=1,
        version_no=1,
        body_text="All intellectual property rights remain with vendor.",
        status=status,
        created_by_user_id=5,
    )
    assert cv.clause_id == 1
    assert cv.version_no == 1
    assert cv.status == status


def test_clause_version_invalid_version_no():
    # version_no must be > 0
    with pytest.raises(ValidationError):
        ClauseVersionCreate(
            clause_id=1,
            version_no=0,
            body_text="Text",
        )
    with pytest.raises(ValidationError):
        ClauseVersionCreate(
            clause_id=1,
            version_no=-1,
            body_text="Text",
        )


def test_clause_version_invalid_ids():
    with pytest.raises(ValidationError):
        ClauseVersionCreate(clause_id=0, version_no=1, body_text="Text")
    with pytest.raises(ValidationError):
        ClauseVersionCreate(clause_id=1, version_no=1, body_text="Text", created_by_user_id=-1)


def test_clause_version_update_null_guards():
    up = ClauseVersionUpdate(status="superseded")
    assert up.status == "superseded"

    with pytest.raises(ValidationError) as exc:
        ClauseVersionUpdate(status=None)
    assert "status cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ClauseVersionUpdate(body_text=None)
    assert "body_text cannot be null" in str(exc.value)


def test_clause_version_detail_response_nested():
    now = datetime.now(timezone.utc)
    c_orm = MockORMObject(
        id=1,
        code="CLS-IP-001",
        title="IP Rights",
        category="legal",
        description=None,
        status="active",
        created_at=now,
        updated_at=now,
    )
    u_orm = MockORMObject(
        id=5,
        email="legal@adrenalin.com",
        full_name="Legal Counsel",
        is_active=True,
        region=None,
        hubspot_owner_id=None,
        last_login_at=None,
        created_at=now,
        updated_at=now,
    )
    cv_orm = MockORMObject(
        id=10,
        clause_id=1,
        version_no=1,
        body_text="Standard IP clause.",
        status="active",
        created_by_user_id=5,
        created_at=now,
        clause=c_orm,
        created_by_user=u_orm,
    )
    detail = ClauseVersionDetailResponse.model_validate(cv_orm)
    assert detail.id == 10
    assert detail.clause.code == "CLS-IP-001"
    assert detail.created_by_user.email == "legal@adrenalin.com"


# =============================================================================
# 3. ProposalClause Schema Tests
# =============================================================================

def test_proposal_clause_create_valid():
    pc = ProposalClauseCreate(
        proposal_version_id=100,
        clause_version_id=10,
        sort_order=2,
        custom_override_text="Modified payment period to 45 days.",
        is_mandatory=True,
    )
    assert pc.proposal_version_id == 100
    assert pc.clause_version_id == 10
    assert pc.sort_order == 2
    assert pc.is_mandatory is True


def test_proposal_clause_sort_order_non_negative():
    with pytest.raises(ValidationError):
        ProposalClauseCreate(
            proposal_version_id=100,
            clause_version_id=10,
            sort_order=-1,
        )


def test_proposal_clause_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        ProposalClauseUpdate(sort_order=None)
    assert "sort_order cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        ProposalClauseUpdate(is_mandatory=None)
    assert "is_mandatory cannot be null" in str(exc.value)

    # custom_override_text can be set to None
    up = ProposalClauseUpdate(custom_override_text=None)
    assert up.custom_override_text is None


def test_proposal_clause_detail_response_nested():
    now = datetime.now(timezone.utc)
    cv_orm = MockORMObject(
        id=10,
        clause_id=1,
        version_no=1,
        body_text="Clause text",
        status="active",
        created_by_user_id=None,
        created_at=now,
    )
    pc_orm = MockORMObject(
        id=50,
        proposal_version_id=100,
        clause_version_id=10,
        sort_order=1,
        custom_override_text=None,
        is_mandatory=False,
        created_at=now,
        clause_version=cv_orm,
    )
    detail = ProposalClauseDetailResponse.model_validate(pc_orm)
    assert detail.id == 50
    assert detail.clause_version.version_no == 1


# =============================================================================
# 4. Document Schema Tests
# =============================================================================

@pytest.mark.parametrize("doc_type", [
    "proposal_pdf",
    "order_form",
    "rate_card_summary",
    "msa",
    "sow",
    "custom",
])
def test_document_create_valid_types(doc_type):
    doc = DocumentCreate(
        proposal_version_id=100,
        doc_type=doc_type,
        file_name=f"{doc_type}_2026.pdf",
        storage_path=f"s3://dealdesk-docs/2026/{doc_type}.pdf",
        mime_type="application/pdf",
        file_size_bytes=1048576,
        status="generated",
        created_by_user_id=1,
    )
    assert doc.doc_type == doc_type
    assert doc.file_size_bytes == 1048576


def test_document_invalid_type_or_status():
    with pytest.raises(ValidationError):
        DocumentCreate(
            proposal_version_id=100,
            doc_type="spreadsheet",  # invalid
            file_name="quote.xlsx",
            storage_path="s3://path",
        )
    with pytest.raises(ValidationError):
        DocumentCreate(
            proposal_version_id=100,
            doc_type="proposal_pdf",
            file_name="quote.pdf",
            storage_path="s3://path",
            status="deleted",  # invalid
        )


def test_document_file_size_non_negative():
    with pytest.raises(ValidationError):
        DocumentCreate(
            proposal_version_id=100,
            doc_type="proposal_pdf",
            file_name="quote.pdf",
            storage_path="s3://path",
            file_size_bytes=-5,
        )


def test_document_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        DocumentUpdate(file_name=None)
    assert "file_name cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        DocumentUpdate(status=None)
    assert "status cannot be null" in str(exc.value)

    # file_size_bytes is nullable
    up = DocumentUpdate(file_size_bytes=None)
    assert up.file_size_bytes is None


def test_document_detail_response_nested():
    now = datetime.now(timezone.utc)
    u_orm = MockORMObject(
        id=1,
        email="author@adrenalin.com",
        full_name="Document Author",
        is_active=True,
        region=None,
        hubspot_owner_id=None,
        last_login_at=None,
        created_at=now,
        updated_at=now,
    )
    doc_orm = MockORMObject(
        id=77,
        proposal_version_id=100,
        doc_type="proposal_pdf",
        file_name="proposal.pdf",
        storage_path="s3://path/to/proposal.pdf",
        mime_type="application/pdf",
        file_size_bytes=500000,
        status="generated",
        created_by_user_id=1,
        created_at=now,
        created_by_user=u_orm,
    )
    detail = DocumentDetailResponse.model_validate(doc_orm)
    assert detail.id == 77
    assert detail.created_by_user.email == "author@adrenalin.com"


# =============================================================================
# 5. CrmFieldMapping Schema Tests
# =============================================================================

def test_crm_field_mapping_create_valid():
    cfm = CrmFieldMappingCreate(
        crm_provider="hubspot",
        internal_entity="deals",
        internal_field="amount",
        external_object="deal",
        external_field="amount",
        sync_direction="bidirectional",
        status="active",
    )
    assert cfm.crm_provider == "hubspot"
    assert cfm.sync_direction == "bidirectional"


def test_crm_field_mapping_invalid_direction():
    with pytest.raises(ValidationError):
        CrmFieldMappingCreate(
            crm_provider="hubspot",
            internal_entity="deals",
            internal_field="amount",
            external_object="deal",
            external_field="amount",
            sync_direction="peer_to_peer",  # invalid
        )


def test_crm_field_mapping_update_null_guards():
    with pytest.raises(ValidationError) as exc:
        CrmFieldMappingUpdate(crm_provider=None)
    assert "crm_provider cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        CrmFieldMappingUpdate(status=None)
    assert "status cannot be null" in str(exc.value)


def test_crm_field_mapping_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=1,
        crm_provider="salesforce",
        internal_entity="customers",
        internal_field="name",
        external_object="account",
        external_field="Name",
        sync_direction="inbound",
        status="active",
        created_at=now,
        updated_at=now,
    )
    resp = CrmFieldMappingResponse.model_validate(orm)
    assert resp.id == 1
    assert resp.crm_provider == "salesforce"


# =============================================================================
# 6. CrmSyncLog Schema Tests (Append-only Telemetry)
# =============================================================================

def test_crm_sync_log_create_valid():
    log = CrmSyncLogCreate(
        crm_provider="hubspot",
        entity_type="deals",
        entity_id="deal_101",
        external_record_id="hs_deal_9999",
        direction="outbound",
        status="success",
        payload_snapshot={"amount": 50000, "dealstage": "contractsent"},
        request_id="req-sync-001",
    )
    assert log.crm_provider == "hubspot"
    assert log.direction == "outbound"
    assert log.status == "success"
    assert log.payload_snapshot["amount"] == 50000


def test_crm_sync_log_invalid_status_or_direction():
    with pytest.raises(ValidationError):
        CrmSyncLogCreate(
            crm_provider="hubspot",
            entity_type="deals",
            entity_id="101",
            direction="internal",  # invalid
            status="success",
        )
    with pytest.raises(ValidationError):
        CrmSyncLogCreate(
            crm_provider="hubspot",
            entity_type="deals",
            entity_id="101",
            direction="outbound",
            status="aborted",  # invalid
        )


def test_crm_sync_log_response_from_orm():
    now = datetime.now(timezone.utc)
    orm = MockORMObject(
        id=88,
        crm_provider="hubspot",
        entity_type="customers",
        entity_id="cust_5",
        external_record_id="comp_123",
        direction="inbound",
        status="partial",
        error_message="Optional field 'industry' unrecognized",
        payload_snapshot=None,
        request_id=None,
        synced_at=now,
    )
    resp = CrmSyncLogResponse.model_validate(orm)
    assert resp.id == 88
    assert resp.status == "partial"
    assert resp.synced_at == now


# =============================================================================
# 7. PublishJob Schema Tests
# =============================================================================

@pytest.mark.parametrize("status", [
    "queued",
    "processing",
    "completed",
    "failed",
    "cancelled",
])
def test_publish_job_create_valid_statuses(status):
    job = PublishJobCreate(
        proposal_version_id=200,
        job_type="publish_proposal",
        status=status,
        idempotency_key=f"idem-key-{status}",
        retry_count=0,
    )
    assert job.proposal_version_id == 200
    assert job.status == status


def test_publish_job_invalid_status():
    with pytest.raises(ValidationError):
        PublishJobCreate(
            proposal_version_id=200,
            status="paused",  # invalid
        )


def test_publish_job_non_negative_retry_count():
    with pytest.raises(ValidationError):
        PublishJobCreate(
            proposal_version_id=200,
            retry_count=-1,
        )


def test_publish_job_update_null_guards():
    up = PublishJobUpdate(status="completed", retry_count=2)
    assert up.status == "completed"
    assert up.retry_count == 2

    with pytest.raises(ValidationError) as exc:
        PublishJobUpdate(status=None)
    assert "status cannot be null" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        PublishJobUpdate(retry_count=None)
    assert "retry_count cannot be null" in str(exc.value)

    # document_id, error_details, completed_at are nullable
    up_null = PublishJobUpdate(error_details=None, document_id=None, completed_at=None)
    assert up_null.document_id is None


def test_publish_job_detail_response_nested():
    now = datetime.now(timezone.utc)
    doc_orm = MockORMObject(
        id=77,
        proposal_version_id=200,
        doc_type="proposal_pdf",
        file_name="proposal.pdf",
        storage_path="s3://path",
        mime_type="application/pdf",
        file_size_bytes=100,
        status="generated",
        created_by_user_id=1,
        created_at=now,
    )
    user_orm = MockORMObject(
        id=1,
        email="publisher@test.com",
        full_name="Publisher User",
        is_active=True,
        region=None,
        hubspot_owner_id=None,
        last_login_at=None,
        created_at=now,
        updated_at=now,
    )
    job_orm = MockORMObject(
        id=999,
        proposal_version_id=200,
        job_type="publish_proposal",
        status="completed",
        idempotency_key="idem-key-1",
        retry_count=0,
        error_details=None,
        document_id=77,
        requested_by_user_id=1,
        completed_at=now,
        created_at=now,
        updated_at=now,
        document=doc_orm,
        requested_by_user=user_orm,
    )
    detail = PublishJobDetailResponse.model_validate(job_orm)
    assert detail.id == 999
    assert detail.document.file_name == "proposal.pdf"
    assert detail.requested_by_user.email == "publisher@test.com"


# =============================================================================
# 8. Schema Registry Exports
# =============================================================================

def test_integrations_schemas_exported_from_module():
    import app.schemas.integrations as integ

    assert hasattr(integ, "ClauseCreate")
    assert hasattr(integ, "ClauseVersionCreate")
    assert hasattr(integ, "ProposalClauseCreate")
    assert hasattr(integ, "DocumentCreate")
    assert hasattr(integ, "CrmFieldMappingCreate")
    assert hasattr(integ, "CrmSyncLogCreate")
    assert hasattr(integ, "PublishJobCreate")


def test_integrations_schemas_exported_from_root():
    import app.schemas as schemas

    assert hasattr(schemas, "ClauseCreate")
    assert hasattr(schemas, "ClauseVersionCreate")
    assert hasattr(schemas, "ProposalClauseCreate")
    assert hasattr(schemas, "DocumentCreate")
    assert hasattr(schemas, "CrmFieldMappingCreate")
    assert hasattr(schemas, "CrmSyncLogCreate")
    assert hasattr(schemas, "PublishJobCreate")

    # Prior waves preserved
    assert hasattr(schemas, "CurrencyCreate")
    assert hasattr(schemas, "PackCreate")
    assert hasattr(schemas, "RateCardCreate")
    assert hasattr(schemas, "RoleCreate")
