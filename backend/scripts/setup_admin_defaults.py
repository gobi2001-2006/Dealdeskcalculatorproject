"""Apply the APPROVED initial Admin setup (v3.1 specification) to a database.

    python -m scripts.setup_admin_defaults            # shows what would be written, writes nothing
    python -m scripts.setup_admin_defaults --apply    # writes it

Only fills what is missing: role descriptions, the role-permission matrix (roles that have no
grants yet), approval stages and notification rules. Anything an Admin already configured is kept.
Discount ceilings, SLA, regions, users and sender settings are never written: the Admin enters them.

The values themselves live in app/services/admin_setup.py (approved 2026-11-17).
"""

from __future__ import annotations

import argparse
from urllib.parse import urlparse


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply the approved initial Admin setup.")
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    args = parser.parse_args()

    from app.db.session import get_database_url, get_sessionmaker
    from app.services import admin_setup

    parsed = urlparse(get_database_url().replace("postgresql+psycopg", "postgresql", 1))
    print(f"Database: {parsed.hostname}/{(parsed.path or '').lstrip('/')}")
    with get_sessionmaker()() as db:
        counts = admin_setup.apply(db, overwrite=False)
        print("Rows to create:", counts)
        if args.apply:
            db.commit()
            print("Applied.")
        else:
            db.rollback()
            print("Dry run: nothing written. Re-run with --apply to write.")


if __name__ == "__main__":
    main()
