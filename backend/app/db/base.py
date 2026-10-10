from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Standard naming convention for PostgreSQL constraints and indexes
naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """SQLAlchemy 2.x base class for all Adrenalin Deal Desk database models."""

    metadata = MetaData(naming_convention=naming_convention)
