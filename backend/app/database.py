"""Database module maintaining backward compatibility with existing imports."""

from typing import Any
from app.db.base import Base
from app.db.session import (
    get_database_url,
    get_db,
    get_engine,
    get_sessionmaker,
    test_db_connection,
)

__all__ = [
    "Base",
    "get_db",
    "test_db_connection",
    "get_engine",
    "get_sessionmaker",
    "get_database_url",
    "engine",
    "SessionLocal",
]


def __getattr__(name: str) -> Any:
    if name == "engine":
        return get_engine()
    if name == "SessionLocal":
        return get_sessionmaker()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
