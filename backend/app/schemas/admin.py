"""Pydantic schemas for the Admin module (Phase 2)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AdminUserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=255)
    role: str
    region: Optional[str] = None
    is_active: bool = True


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=200)
    email: Optional[str] = Field(default=None, max_length=255)
    role: Optional[str] = None
    region: Optional[str] = None
    is_active: Optional[bool] = None


class AdminUserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    region: Optional[str]
    is_active: bool
    last_login_at: Optional[datetime]
    role: Optional[str]
    role_label: Optional[str]
    roles: list[str]


class PermissionMatrixUpdate(BaseModel):
    grants: dict[str, list[str]]


class RegionSave(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sub_regions: Optional[str] = None
    business_head_user_id: Optional[int] = None
    status: Optional[str] = None
    country_ids: Optional[list[int]] = None


class StageUpdate(BaseModel):
    stage_code: str
    approver_role: Optional[str] = None
    routing: Optional[str] = None
    is_active: Optional[bool] = None


class SlaSettings(BaseModel):
    sla_hours: Optional[int] = None
    reminder_hours: Optional[int] = None
    escalate_hours: Optional[int] = None
    escalation_role: Optional[str] = None


class WorkflowUpdate(BaseModel):
    ceilings: Optional[dict[str, Optional[float]]] = None
    test_effective_discount: Optional[bool] = None
    sla: Optional[SlaSettings] = None
    stages: Optional[list[StageUpdate]] = None


class NotificationRuleUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    recipient_roles: Optional[list[str]] = None
    subject_template: Optional[str] = Field(default=None, max_length=500)
    body_template: Optional[str] = None


class NotificationRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_code: str
    label: str
    description: Optional[str]
    is_enabled: bool
    recipient_roles: list[str]
    include_approve_links: bool
    subject_template: str
    body_template: str
    sort_order: int


class TemplatePreviewRequest(BaseModel):
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    proposal_id: Optional[int] = Field(None, gt=0, description="Proposal to preview with (default: the latest)")


class TestSendRequest(BaseModel):
    user_id: int
    proposal_id: Optional[int] = Field(None, gt=0, description="Proposal to fill the template with (default: the latest)")


class EmailLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_code: str
    proposal_id: Optional[int]
    recipient_role: Optional[str]
    recipient_name: Optional[str]
    recipient_email: Optional[str]
    cc_email: Optional[str]
    subject: str
    body: str
    status: str
    error: Optional[str]
    is_test: bool
    created_at: datetime


class SenderSettings(BaseModel):
    from_name: Optional[str] = Field(default=None, max_length=200)
    from_email: Optional[str] = Field(default=None, max_length=255)
    reply_to: Optional[str] = Field(default=None, max_length=255)
    always_cc: Optional[str] = Field(default=None, max_length=255)
    deal_desk_url: Optional[str] = Field(default=None, max_length=500)
