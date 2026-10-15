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
        if "profile_picture_url" not in columns:
            with target_engine.begin() as connection:
                connection.execute(text("ALTER TABLE users ADD COLUMN profile_picture_url TEXT"))
    if "events" in tables:
        columns = {column["name"] for column in inspector.get_columns("events")}
        with target_engine.begin() as connection:
            if "organizer_id" not in columns:
                connection.execute(text("ALTER TABLE events ADD COLUMN organizer_id INTEGER REFERENCES users(id)"))
            if "event_status" not in columns:
                connection.execute(text("ALTER TABLE events ADD COLUMN event_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'"))
            if "reserved_tickets" not in columns:
                connection.execute(text("ALTER TABLE events ADD COLUMN reserved_tickets INTEGER NOT NULL DEFAULT 0"))
    if "bookings" in tables:
        columns = {column["name"] for column in inspector.get_columns("bookings")}
        with target_engine.begin() as connection:
            if "coupon_id" not in columns:
                connection.execute(text("ALTER TABLE bookings ADD COLUMN coupon_id INTEGER REFERENCES coupons(id)"))
            if "discount_amount" not in columns:
                connection.execute(text("ALTER TABLE bookings ADD COLUMN discount_amount FLOAT NOT NULL DEFAULT 0"))
            if "final_amount" not in columns:
                connection.execute(text("ALTER TABLE bookings ADD COLUMN final_amount FLOAT NOT NULL DEFAULT 0"))
                connection.execute(text("UPDATE bookings SET final_amount = total_price"))
    if "event_updates" in tables:
        columns = {column["name"] for column in inspector.get_columns("event_updates")}
        if "important" not in columns:
            with target_engine.begin() as connection:
                connection.execute(text("ALTER TABLE event_updates ADD COLUMN important BOOLEAN NOT NULL DEFAULT 0"))
    if "notifications" in tables:
        columns = {column["name"] for column in inspector.get_columns("notifications")}
        if "type" in columns and "notification_type" not in columns:
            with target_engine.begin() as connection:
                connection.execute(text("ALTER TABLE notifications RENAME COLUMN type TO notification_type"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
