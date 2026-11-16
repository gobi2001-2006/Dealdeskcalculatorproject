"""Request / response schemas for sign-in (Phase 2 login page)."""

import re
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(..., min_length=3, max_length=255, description="Work email address")
    password: str = Field(..., min_length=1, max_length=256, description="Account password (never logged)")
    remember_me: bool = Field(False, description="The client keeps the session across browser restarts")

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        if not _EMAIL.match(v):
            raise ValueError("Enter a valid email address.")
        return v


class DemoLoginRequest(BaseModel):
    role_code: str = Field(..., min_length=1, max_length=50, description="Role code, e.g. 'sales_lead'")


class AuthUser(BaseModel):
    id: int
    full_name: str
    email: str
    region: Optional[str] = None
    roles: List[str] = Field(default_factory=list, description="Role codes")
    role_labels: List[str] = Field(default_factory=list, description="Role names for display")
    permissions: List[str] = Field(default_factory=list, description="Permission codes (server-side checks)")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Seconds until the token expires")
    user: AuthUser


class DemoRole(BaseModel):
    code: str
    label: str


class AuthConfigResponse(BaseModel):
    """What the sign-in page may offer. Nothing here is a secret."""

    password_login: bool = True
    demo_login_enabled: bool = Field(..., description="Only true when DEALDESK_DEMO_LOGIN is set (development / testing)")
    demo_roles: List[DemoRole] = Field(default_factory=list)
    microsoft_sso_enabled: bool = Field(..., description="Microsoft Entra ID sign-in is not configured in this application")
    password_reset_enabled: bool = Field(..., description="No password-reset service exists yet")
