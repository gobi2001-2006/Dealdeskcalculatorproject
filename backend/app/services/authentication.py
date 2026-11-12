"""Authentication & Security Service.

Implements:
1. Secure password hashing and verification using bcrypt with salt rounds.
2. Email normalization.
3. Secret redaction helper for audit logging.
4. JWT token generation and verification.
"""

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
import jwt

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "adrenalin-dealdesk-insecure-dev-secret-change-in-prod-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours

SENSITIVE_FIELD_PATTERNS = {
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "authorization",
    "credential",
}


def normalize_email(email: str) -> str:
    """Normalize user email to lowercase and stripped whitespace."""
    if not email:
        raise ValueError("Email cannot be empty")
    return email.strip().lower()


def hash_password(plain_password: str) -> str:
    """Hash plaintext password using bcrypt with standard work factor."""
    if not plain_password or len(plain_password.strip()) == 0:
        raise ValueError("Password cannot be empty")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plaintext password against bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(
    data: dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create signed HS256 JWT access token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate JWT access token."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as e:
        raise ValueError("Invalid or expired authentication token") from e


def redact_sensitive_data(payload: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Recursively redact passwords, tokens, and credentials from audit payloads."""
    if payload is None:
        return None
    if not isinstance(payload, dict):
        return payload

    sanitized: dict[str, Any] = {}
    for key, value in payload.items():
        key_lower = key.lower()
        if any(pat in key_lower for pat in SENSITIVE_FIELD_PATTERNS):
            sanitized[key] = "[REDACTED]"
        elif isinstance(value, dict):
            sanitized[key] = redact_sensitive_data(value)
        elif isinstance(value, list):
            sanitized[key] = [
                redact_sensitive_data(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            sanitized[key] = value
    return sanitized
