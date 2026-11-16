"""Set (or reset) the sign-in password of an existing user.

Usage (from the backend folder, with DATABASE_URL pointing at the target database):

    python -m scripts.set_user_password --email name@myadrenalin.com

The password is typed at a hidden prompt (twice); it is never taken from the command line,
never printed and never stored in plain text: only its bcrypt hash is saved in users.password_hash.

Users are created on Admin -> Users without a usable password (they cannot sign in with a password
until an administrator runs this script, or until SSO is configured).
"""

from __future__ import annotations

import argparse
import getpass
import sys
from urllib.parse import urlparse

from sqlalchemy import func, select

MIN_LENGTH = 8  # technical minimum for this tool; change with your security policy


def main() -> None:
    parser = argparse.ArgumentParser(description="Set a user's sign-in password.")
    parser.add_argument("--email", required=True, help="Email of an existing user")
    args = parser.parse_args()

    from app.db.session import get_database_url, get_sessionmaker
    from app.models.governance import User
    from app.services.authentication import hash_password, normalize_email

    parsed = urlparse(get_database_url().replace("postgresql+psycopg", "postgresql", 1))
    print(f"Database: {parsed.hostname}/{(parsed.path or '').lstrip('/')}")

    email = normalize_email(args.email)
    with get_sessionmaker()() as db:
        user = db.execute(select(User).where(func.lower(User.email) == email)).scalars().first()
        if user is None:
            sys.exit(f"No user with email {email}. Create the user on Admin -> Users first.")
        if not user.is_active:
            sys.exit(f"{email} is inactive. Activate the user on Admin -> Users first.")

        password = getpass.getpass(f"New password for {user.full_name} <{email}>: ")
        if len(password) < MIN_LENGTH:
            sys.exit(f"The password must be at least {MIN_LENGTH} characters.")
        if getpass.getpass("Repeat the password: ") != password:
            sys.exit("The passwords do not match. Nothing was changed.")

        user.password_hash = hash_password(password)
        db.commit()
    print(f"Password set for {email}. They can now sign in on the login page.")


if __name__ == "__main__":
    main()
