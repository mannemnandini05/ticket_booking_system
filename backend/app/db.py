from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from .config import Settings

settings = Settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def migrate_schema(target_engine=engine) -> None:
    inspector = inspect(target_engine)
    tables = inspector.get_table_names()
    if "users" in tables:
        columns = {column["name"] for column in inspector.get_columns("users")}
        if "role" not in columns:
            with target_engine.begin() as connection:
                connection.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'USER'"))
    if "events" in tables:
        columns = {column["name"] for column in inspector.get_columns("events")}
        with target_engine.begin() as connection:
            if "organizer_id" not in columns:
                connection.execute(text("ALTER TABLE events ADD COLUMN organizer_id INTEGER REFERENCES users(id)"))
            if "event_status" not in columns:
                connection.execute(text("ALTER TABLE events ADD COLUMN event_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
