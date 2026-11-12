"""Pydantic schemas for Documents, Clauses, CRM Integration & Publishing (Wave 6).

Defines request and response schemas for:
1. Clause
2. ClauseVersion
3. ProposalClause
4. Document
5. CrmFieldMapping
6. CrmSyncLog (append-only telemetry log)
7. PublishJob (asynchronous publishing task lifecycle)
"""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

from app.schemas.governance import UserResponse

# =============================================================================
# Constrained Types / Literals
# =============================================================================

ClauseCategory = Literal[
    "legal",
    "payment",
    "commercial",
    "sla",
    "compliance",
    "custom",
]

ClauseStatus = Literal["active", "inactive", "retired"]

ClauseVersionStatus = Literal["draft", "approved", "active", "superseded"]

DocumentType = Literal[
    "proposal_pdf",
    "order_form",
    "rate_card_summary",
    "msa",
    "sow",
    "custom",
]

DocumentStatus = Literal[
    "generated",
    "pending",
    "uploaded",
    "archived",
    "failed",
]

SyncDirection = Literal["inbound", "outbound", "bidirectional"]

CrmLogDirection = Literal["inbound", "outbound"]

CrmFieldMappingStatus = Literal["active", "inactive"]

CrmSyncLogStatus = Literal["success", "failed", "partial", "skipped"]

PublishJobStatus = Literal[
    "queued",
    "processing",
    "completed",
    "failed",
    "cancelled",
]


# =============================================================================
# 1. Clause Schemas
# =============================================================================

class ClauseBase(BaseModel):
    """Base fields for Clause."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique business code (e.g. 'CLS-PAY-001')",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Clause title or heading",
    )
    category: ClauseCategory = Field(
        ...,
        description="Classification: 'legal', 'payment', 'commercial', 'sla', 'compliance', 'custom'",
    )
    description: Optional[str] = Field(
        default=None,
        description="Usage guidance or editorial summary",
    )
    status: ClauseStatus = Field(
        default="active",
        description="Lifecycle status: 'active', 'inactive', 'retired'",
    )


class ClauseCreate(ClauseBase):
    """Payload for creating a clause."""

    pass


class ClauseUpdate(BaseModel):
    """Payload for updating an existing clause."""

    model_config = ConfigDict(str_strip_whitespace=True)

    code: Optional[str] = Field(None, min_length=1, max_length=50)
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[ClauseCategory] = None
    description: Optional[str] = None
    status: Optional[ClauseStatus] = None

    @field_validator("code", "title", "category", "status", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ClauseResponse(ClauseBase):
    """API response schema for a clause."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 2. ClauseVersion Schemas
# =============================================================================

class ClauseVersionBase(BaseModel):
    """Base fields for ClauseVersion snapshot."""

    model_config = ConfigDict(str_strip_whitespace=True)

    clause_id: int = Field(
        ...,
        gt=0,
        description="Clause ID referencing clauses.id",
    )
    version_no: int = Field(
        ...,
        gt=0,
        description="Sequential version integer (1, 2, 3...)",
    )
    body_text: str = Field(
        ...,
        min_length=1,
        description="Full legal text of the clause version",
    )
    status: ClauseVersionStatus = Field(
        default="active",
        description="Version status: 'draft', 'approved', 'active', 'superseded'",
    )
    created_by_user_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="User who authored this version",
    )


class ClauseVersionCreate(ClauseVersionBase):
    """Payload for authoring a new clause version."""

    pass


class ClauseVersionUpdate(BaseModel):
    """Payload for updating a clause version."""

    model_config = ConfigDict(str_strip_whitespace=True)

    body_text: Optional[str] = Field(None, min_length=1)
    status: Optional[ClauseVersionStatus] = None

    @field_validator("body_text", "status", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ClauseVersionResponse(ClauseVersionBase):
    """API response schema for a clause version."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime


class ClauseVersionDetailResponse(ClauseVersionResponse):
    """ClauseVersion response with populated Clause and author User."""

    clause: Optional[ClauseResponse] = None
    created_by_user: Optional[UserResponse] = None


class ClauseDetailResponse(ClauseResponse):
    """Clause response with associated versions list."""

    versions: list[ClauseVersionResponse] = Field(default_factory=list)


# =============================================================================
# 3. ProposalClause Schemas
# =============================================================================

class ProposalClauseBase(BaseModel):
    """Base fields for ProposalClause pinning."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: int = Field(
        ...,
        gt=0,
        description="Proposal version ID referencing proposal_versions.id",
    )
    clause_version_id: int = Field(
        ...,
        gt=0,
        description="Clause version ID referencing clause_versions.id",
    )
    sort_order: int = Field(
        default=0,
        ge=0,
        description="Sequence index for document placement (>= 0)",
    )
    custom_override_text: Optional[str] = Field(
        default=None,
        description="Discretionary override wording",
    )
    is_mandatory: bool = Field(
        default=False,
        description="Flag indicating if clause is non-negotiable",
    )


class ProposalClauseCreate(ProposalClauseBase):
    """Payload for associating a clause version to a proposal version."""

    pass


class ProposalClauseUpdate(BaseModel):
    """Payload for updating a proposal-clause association."""

    model_config = ConfigDict(str_strip_whitespace=True)

    sort_order: Optional[int] = Field(None, ge=0)
    custom_override_text: Optional[str] = None
    is_mandatory: Optional[bool] = None

    @field_validator("sort_order", "is_mandatory", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class ProposalClauseResponse(ProposalClauseBase):
    """API response schema for a proposal clause association."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime


class ProposalClauseDetailResponse(ProposalClauseResponse):
    """ProposalClause response with populated ClauseVersion."""

    clause_version: Optional[ClauseVersionResponse] = None


# =============================================================================
# 4. Document Schemas
# =============================================================================

class DocumentBase(BaseModel):
    """Base fields for Document."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: int = Field(
        ...,
        gt=0,
        description="Proposal version ID referencing proposal_versions.id",
    )
    doc_type: DocumentType = Field(
        ...,
        description="Document kind: 'proposal_pdf', 'order_form', etc.",
    )
    file_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Display file name (e.g. 'Proposal_Acme_v1.pdf')",
    )
    storage_path: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Cloud object storage URI",
    )
    mime_type: str = Field(
        default="application/pdf",
        min_length=1,
        max_length=100,
        description="MIME type header",
    )
    file_size_bytes: Optional[int] = Field(
        default=None,
        ge=0,
        description="File size in bytes (>= 0)",
    )
    status: DocumentStatus = Field(
        default="generated",
        description="Status: 'generated', 'pending', 'uploaded', 'archived', 'failed'",
    )
    created_by_user_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="User who generated or uploaded this document",
    )


class DocumentCreate(DocumentBase):
    """Payload for registering a document."""

    pass


class DocumentUpdate(BaseModel):
    """Payload for updating document metadata."""

    model_config = ConfigDict(str_strip_whitespace=True)

    file_name: Optional[str] = Field(None, min_length=1, max_length=255)
    storage_path: Optional[str] = Field(None, min_length=1, max_length=500)
    mime_type: Optional[str] = Field(None, min_length=1, max_length=100)
    file_size_bytes: Optional[int] = Field(None, ge=0)
    status: Optional[DocumentStatus] = None

    @field_validator("file_name", "storage_path", "mime_type", "status", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class DocumentResponse(DocumentBase):
    """API response schema for a document."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime


class DocumentDetailResponse(DocumentResponse):
    """Document response with populated creator User."""

    created_by_user: Optional[UserResponse] = None


# =============================================================================
# 5. CrmFieldMapping Schemas
# =============================================================================

class CrmFieldMappingBase(BaseModel):
    """Base fields for CRM field mapping."""

    model_config = ConfigDict(str_strip_whitespace=True)

    crm_provider: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="CRM provider identifier: 'hubspot', 'salesforce', 'zoho'",
    )
    internal_entity: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Deal Desk entity name (e.g. 'deals', 'customers')",
    )
    internal_field: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Entity attribute name (e.g. 'code', 'target_close_date')",
    )
    external_object: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="CRM object (e.g. 'deal', 'company', 'contact')",
    )
    external_field: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="CRM property name (e.g. 'dealname', 'amount')",
    )
    sync_direction: SyncDirection = Field(
        default="outbound",
        description="Direction: 'inbound', 'outbound', 'bidirectional'",
    )
    status: CrmFieldMappingStatus = Field(
        default="active",
        description="Status: 'active', 'inactive'",
    )


class CrmFieldMappingCreate(CrmFieldMappingBase):
    """Payload for creating a CRM field mapping."""

    pass


class CrmFieldMappingUpdate(BaseModel):
    """Payload for updating a CRM field mapping."""

    model_config = ConfigDict(str_strip_whitespace=True)

    crm_provider: Optional[str] = Field(None, min_length=1, max_length=50)
    internal_entity: Optional[str] = Field(None, min_length=1, max_length=100)
    internal_field: Optional[str] = Field(None, min_length=1, max_length=100)
    external_object: Optional[str] = Field(None, min_length=1, max_length=100)
    external_field: Optional[str] = Field(None, min_length=1, max_length=100)
    sync_direction: Optional[SyncDirection] = None
    status: Optional[CrmFieldMappingStatus] = None

    @field_validator(
        "crm_provider",
        "internal_entity",
        "internal_field",
        "external_object",
        "external_field",
        "sync_direction",
        "status",
        mode="before",
    )
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class CrmFieldMappingResponse(CrmFieldMappingBase):
    """API response schema for a CRM field mapping."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


# =============================================================================
# 6. CrmSyncLog Schemas (Append-only / Telemetry log)
# =============================================================================

class CrmSyncLogBase(BaseModel):
    """Base fields for CRM sync log entry."""

    model_config = ConfigDict(str_strip_whitespace=True)

    crm_provider: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="CRM system (e.g. 'hubspot')",
    )
    entity_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Entity synchronized (e.g. 'deals', 'customers')",
    )
    entity_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Internal entity record ID as string",
    )
    external_record_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="CRM record ID returned by external API",
    )
    direction: CrmLogDirection = Field(
        ...,
        description="'inbound' or 'outbound'",
    )
    status: CrmSyncLogStatus = Field(
        ...,
        description="'success', 'failed', 'partial', 'skipped'",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Sanitized error description on sync failure",
    )
    payload_snapshot: Optional[dict[str, Any]] = Field(
        default=None,
        description="Redacted synchronization payload",
    )
    request_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Correlation request ID for distributed tracing",
    )


class CrmSyncLogCreate(CrmSyncLogBase):
    """Payload for recording a CRM sync log event."""

    synced_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp of sync execution (defaults to current time if omitted)",
    )


class CrmSyncLogResponse(CrmSyncLogBase):
    """API response schema for a CRM sync log record."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    synced_at: datetime


# =============================================================================
# 7. PublishJob Schemas (Async job lifecycle)
# =============================================================================

class PublishJobBase(BaseModel):
    """Base fields for PublishJob task tracking."""

    model_config = ConfigDict(str_strip_whitespace=True)

    proposal_version_id: int = Field(
        ...,
        gt=0,
        description="Proposal version ID referencing proposal_versions.id",
    )
    job_type: str = Field(
        default="publish_proposal",
        min_length=1,
        max_length=50,
        description="Job classification ('publish_proposal', 'generate_contract', etc.)",
    )
    status: PublishJobStatus = Field(
        default="queued",
        description="'queued', 'processing', 'completed', 'failed', 'cancelled'",
    )
    idempotency_key: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Unique idempotency key preventing duplicate jobs",
    )
    retry_count: int = Field(
        default=0,
        ge=0,
        description="Retry attempts count (>= 0)",
    )
    error_details: Optional[str] = Field(
        default=None,
        description="Error trace or message on failure",
    )
    document_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="Generated document ID on completion",
    )
    requested_by_user_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="User requesting publishing action",
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp of job completion or failure",
    )


class PublishJobCreate(PublishJobBase):
    """Payload for enqueuing a publishing job."""

    pass


class PublishJobUpdate(BaseModel):
    """Payload for updating job status and results."""

    model_config = ConfigDict(str_strip_whitespace=True)

    status: Optional[PublishJobStatus] = None
    retry_count: Optional[int] = Field(None, ge=0)
    error_details: Optional[str] = None
    document_id: Optional[int] = Field(None, gt=0)
    completed_at: Optional[datetime] = None

    @field_validator("status", "retry_count", mode="before")
    @classmethod
    def reject_null_for_non_nullable(cls, v: Any, info: Any) -> Any:
        if v is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return v


class PublishJobResponse(PublishJobBase):
    """API response schema for a publish job."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)

    id: int
    created_at: datetime
    updated_at: datetime


class PublishJobDetailResponse(PublishJobResponse):
    """PublishJob response with populated Document and User entities."""

    document: Optional[DocumentResponse] = None
    requested_by_user: Optional[UserResponse] = None
