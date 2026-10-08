import unittest
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.db import get_db, migrate_schema
from app.main import app
from app.models import Base, Booking, Event, Notification, User
from app.security import hash_password


class PhaseTwoApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)

        def override_get_db():
            with Session(self.engine) as db:
                yield db

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        with Session(self.engine) as db:
            self.users = {}
            for role in ("USER", "ORGANIZER", "ORGANIZER_2", "ADMIN"):
                suffix = role.lower()
                user = User(
                    username=suffix,
                    email=f"{suffix}@example.com",
                    hashed_password=hash_password("phase2-password"),
                    role="ORGANIZER" if role == "ORGANIZER_2" else role,
                )
                db.add(user)
                db.flush()
                self.users[role] = user.id
            self.event = Event(
                title="Test event",
                description="A sufficiently long test event description.",
                category="Music",
                location="Test venue",
                event_date=datetime.now(timezone.utc) + timedelta(days=10),
                ticket_price=25,
                ticket_capacity=5,
                organizer_id=self.users["ORGANIZER"],
                event_status="ACTIVE",
            )
            db.add(self.event)
            db.commit()
            self.event_id = self.event.id
        self.tokens = {}

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()
        self.engine.dispose()

    def headers(self, role):
        if role not in self.tokens:
            suffix = role.lower()
            response = self.client.post(
                "/api/auth/login",
                json={"email": f"{suffix}@example.com", "password": "phase2-password"},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.tokens[role] = response.json()["access_token"]
        return {"Authorization": f"Bearer {self.tokens[role]}"}

    def test_tokens_include_role_and_registration_cannot_assign_one(self):
        response = self.client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "phase2-password",
                "role": "ADMIN",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["user"]["role"], "USER")
        claims = jwt.decode(
            response.json()["access_token"],
            get_settings().secret_key,
            algorithms=[get_settings().algorithm],
        )
        self.assertEqual(claims["role"], "USER")

    def test_user_cannot_create_events_or_view_admin_data(self):
        headers = self.headers("USER")
        event_response = self.client.post(
            "/api/events",
            json={
                "title": "Another event",
                "description": "A sufficiently long event description.",
                "category": "Tech",
                "location": "Test city",
                "event_date": (datetime.now(timezone.utc) + timedelta(days=20)).isoformat(),
                "ticket_price": 20,
                "ticket_capacity": 20,
            },
            headers=headers,
        )
        self.assertEqual(event_response.status_code, 403)
        self.assertEqual(self.client.get("/api/admin/users", headers=headers).status_code, 403)

    def test_organizer_ownership_and_attendee_notifications(self):
        organizer_headers = self.headers("ORGANIZER")
        other_organizer_headers = self.headers("ORGANIZER_2")
        user_headers = self.headers("USER")

        other_update = self.client.patch(
            f"/api/events/{self.event_id}",
            json={"title": "Unauthorized change"},
            headers=other_organizer_headers,
        )
        self.assertEqual(other_update.status_code, 404)

        booking = self.client.post(
            "/api/bookings",
            json={"event_id": self.event_id, "ticket_quantity": 2},
            headers=user_headers,
        )
        self.assertEqual(booking.status_code, 201, booking.text)
        event_bookings = self.client.get(
            f"/api/organizer/events/{self.event_id}/bookings",
            headers=organizer_headers,
        )
        self.assertEqual(event_bookings.status_code, 200, event_bookings.text)
        self.assertEqual(event_bookings.json()[0]["ticket_quantity"], 2)
        organizer_analytics = self.client.get(
            "/api/organizer/analytics",
            headers=organizer_headers,
        )
        self.assertEqual(organizer_analytics.status_code, 200, organizer_analytics.text)
        self.assertEqual(organizer_analytics.json()["total_tickets_sold"], 2)
        tickets = self.client.get("/api/tickets", headers=user_headers)
        self.assertEqual(tickets.status_code, 200, tickets.text)
        self.assertEqual(tickets.json()[0]["booking"]["event"]["title"], "Test event")

        update = self.client.patch(
            f"/api/events/{self.event_id}",
            json={"title": "Updated test event"},
            headers=organizer_headers,
        )
        self.assertEqual(update.status_code, 200, update.text)
        unchanged_update = self.client.patch(
            f"/api/events/{self.event_id}",
            json={"title": "Updated test event"},
            headers=organizer_headers,
        )
        self.assertEqual(unchanged_update.status_code, 200, unchanged_update.text)

        cancel = self.client.patch(
            f"/api/events/{self.event_id}/cancel",
            headers=organizer_headers,
        )
        self.assertEqual(cancel.status_code, 200, cancel.text)
        self.assertEqual(cancel.json()["event_status"], "CANCELLED")
        self.assertEqual(cancel.json()["lifecycle_status"], "CANCELLED")

        with Session(self.engine) as db:
            notifications = db.query(Notification).filter_by(user_id=self.users["USER"]).all()
            self.assertEqual(len(notifications), 3)
            self.assertEqual(
                {item.title for item in notifications},
                {"Booking confirmed", "Event updated", "Event cancelled"},
            )

        rejected_booking = self.client.post(
            "/api/bookings",
            json={"event_id": self.event_id, "ticket_quantity": 1},
            headers=user_headers,
        )
        self.assertEqual(rejected_booking.status_code, 409)

    def test_admin_analytics_and_role_changes(self):
        admin_headers = self.headers("ADMIN")
        previous_user_headers = self.headers("USER")
        users = self.client.get("/api/admin/users", headers=admin_headers)
        self.assertEqual(users.status_code, 200, users.text)
        self.assertEqual(len(users.json()), 4)

        response = self.client.patch(
            f"/api/admin/users/{self.users['USER']}/role",
            json={"role": "ORGANIZER"},
            headers=admin_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["role"], "ORGANIZER")
        self.assertEqual(
            self.client.get("/api/organizer/analytics", headers=previous_user_headers).status_code,
            401,
        )

        self.assertEqual(self.client.get("/api/admin/events", headers=admin_headers).status_code, 200)
        self.assertEqual(self.client.get("/api/admin/bookings", headers=admin_headers).status_code, 200)

        booking = self.client.post(
            "/api/bookings",
            json={"event_id": self.event_id, "ticket_quantity": 2},
            headers=self.headers("ORGANIZER_2"),
        )
        self.assertEqual(booking.status_code, 201, booking.text)
        analytics = self.client.get("/api/admin/analytics", headers=admin_headers)
        self.assertEqual(analytics.status_code, 200, analytics.text)
        self.assertEqual(analytics.json()["total_users"], 4)
        self.assertEqual(analytics.json()["total_events"], 1)
        self.assertEqual(analytics.json()["total_tickets_sold"], 2)
        self.assertEqual(analytics.json()["total_bookings"], 1)
        admin_bookings = self.client.get("/api/admin/bookings", headers=admin_headers)
        self.assertEqual(admin_bookings.status_code, 200, admin_bookings.text)
        self.assertEqual(admin_bookings.json()[0]["user"]["username"], "organizer_2")

    def test_migrates_existing_phase_one_database_columns(self):
        legacy_engine = create_engine("sqlite://")
        with legacy_engine.begin() as connection:
            connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE events (id INTEGER PRIMARY KEY)"))
        migrate_schema(legacy_engine)
        self.assertIn("role", {column["name"] for column in inspect(legacy_engine).get_columns("users")})
        event_columns = {column["name"] for column in inspect(legacy_engine).get_columns("events")}
        self.assertIn("organizer_id", event_columns)
        self.assertIn("event_status", event_columns)
        legacy_engine.dispose()

    def test_production_requires_a_strong_secret(self):
        with self.assertRaises(ValueError):
            Settings(environment="production")
        with self.assertRaises(ValueError):
            Settings(environment="production", secret_key="too-short")
        self.assertGreaterEqual(len(Settings().secret_key), 32)

    def test_event_lifecycle_is_derived_and_persisted_as_completed(self):
        past_event = Event(
            title="Past event",
            description="A sufficiently long event description.",
            category="Tech",
            location="Test venue",
            event_date=datetime.now(timezone.utc) - timedelta(days=2),
            ticket_price=10,
            ticket_capacity=10,
            event_status="ACTIVE",
        )
        with Session(self.engine) as db:
            db.add(past_event)
            db.commit()
            past_event_id = past_event.id
        response = self.client.get(f"/api/events/{past_event_id}")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["event_status"], "COMPLETED")
        self.assertEqual(response.json()["lifecycle_status"], "COMPLETED")


if __name__ == "__main__":
    unittest.main()
