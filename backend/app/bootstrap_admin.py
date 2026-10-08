import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import engine, migrate_schema
from .models import Base, User


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote an existing SmartEvent user to administrator.")
    parser.add_argument("email", help="Email address of the account to promote")
    email = parser.parse_args().email

    migrate_schema()
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            parser.error(f"No account found for {email!r}; register the account before promoting it.")
        if user.role != "ADMIN":
            user.role = "ADMIN"
            db.commit()
        print(f"{user.email} has administrator access. Sign in again to refresh the role in the token.")


if __name__ == "__main__":
    main()
