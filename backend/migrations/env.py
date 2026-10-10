import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Load environment variables from backend/.env
load_dotenv(backend_dir / ".env")

# Import the model registry so all models are loaded into Base.metadata
from app.models import Base  # noqa: E402

# Alembic Config object
config = context.config

# Interpret config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """Retrieve database URL from environment or configuration."""
    url = os.getenv("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
    return url or ""


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Emits DDL statements directly to output/script without a live database connection.
    Useful for generating SQL scripts (`alembic upgrade head --sql`).
    """
    url = get_url()
    # If no database URL is set in offline mode, fall back to PostgreSQL dialect
    if not url:
        url = "postgresql+psycopg://"

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Creates an Engine and associates a connection with the context.
    """
    url = get_url()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is missing. Please configure it in backend/.env"
        )

    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
