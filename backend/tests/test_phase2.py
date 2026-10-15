import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

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
        payment = self.client.post(
            "/api/payments",
            json={"booking_id": booking.json()["id"], "payment_method": "CARD"},
            headers=user_headers,
        )
        self.assertEqual(payment.status_code, 201, payment.text)
        self.assertEqual(payment.json()["payment_status"], "SUCCESS")
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
            self.assertEqual(len(notifications), 4)
            self.assertEqual(
                {item.title for item in notifications},
                {"Booking confirmed", "Payment successful", "Event updated", "Event cancelled"},
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
        payment = self.client.post(
            "/api/payments",
            json={"booking_id": booking.json()["id"], "payment_method": "UPI"},
            headers=self.headers("ORGANIZER_2"),
        )
        self.assertEqual(payment.status_code, 201, payment.text)
        analytics = self.client.get("/api/admin/analytics", headers=admin_headers)
        self.assertEqual(analytics.status_code, 200, analytics.text)
        self.assertEqual(analytics.json()["total_users"], 4)
        self.assertEqual(analytics.json()["total_events"], 1)
        self.assertEqual(analytics.json()["total_tickets_sold"], 2)
        self.assertEqual(analytics.json()["total_bookings"], 1)
        admin_bookings = self.client.get("/api/admin/bookings", headers=admin_headers)
        self.assertEqual(admin_bookings.status_code, 200, admin_bookings.text)
        self.assertEqual(admin_bookings.json()[0]["user"]["username"], "organizer_2")

    def test_simulated_payment_failure_retry_and_coupon_discount(self):
        admin_headers = self.headers("ADMIN")
        user_headers = self.headers("USER")
        coupon = self.client.post(
            "/api/admin/coupons",
            json={
                "coupon_code": "WELCOME10",
                "discount_type": "PERCENTAGE",
                "discount_value": 10,
                "minimum_booking_amount": 20,
                "expiry_date": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
                "usage_limit": 1,
            },
            headers=admin_headers,
        )
        self.assertEqual(coupon.status_code, 201, coupon.text)
        booking = self.client.post(
            "/api/bookings",
            json={"event_id": self.event_id, "ticket_quantity": 2},
            headers=user_headers,
        )
        self.assertEqual(booking.status_code, 201, booking.text)
        booking_id = booking.json()["id"]
        applied = self.client.post(
            f"/api/bookings/{booking_id}/coupon",
            json={"coupon_code": "welcome10"},
            headers=user_headers,
        )
        self.assertEqual(applied.status_code, 200, applied.text)
        self.assertEqual(applied.json()["discount_amount"], 5)
        self.assertEqual(applied.json()["final_amount"], 45)
        failed = self.client.post(
            "/api/payments",
            json={"booking_id": booking_id, "payment_method": "CARD", "simulate_failure": True},
            headers=user_headers,
        )
        self.assertEqual(failed.status_code, 201, failed.text)
        self.assertEqual(failed.json()["payment_status"], "FAILED")
        self.assertTrue(failed.json()["transaction_id"])
        retried = self.client.post(
            "/api/payments",
            json={"booking_id": booking_id, "payment_method": "UPI"},
            headers=user_headers,
        )
        self.assertEqual(retried.status_code, 201, retried.text)
        self.assertEqual(retried.json()["payment_status"], "SUCCESS")
        self.assertEqual(retried.json()["amount"], 45)
        confirmed = self.client.get(f"/api/bookings/{booking_id}", headers=user_headers)
        self.assertEqual(confirmed.json()["booking_status"], "CONFIRMED")
        self.assertIsNotNone(confirmed.json()["ticket"])
        exhausted = self.client.post(
            "/api/coupons/validate",
            json={"coupon_code": "WELCOME10", "booking_amount": 50},
            headers=user_headers,
        )
        self.assertEqual(exhausted.status_code, 400)

    def test_event_reviews_require_attendance_and_support_owner_edits(self):
        user_headers = self.headers("USER")
        other_headers = self.headers("ORGANIZER_2")
        unauthorised = self.client.post(
            f"/api/events/{self.event_id}/reviews",
            json={"rating": 5, "review_text": "Great"},
            headers=user_headers,
        )
        self.assertEqual(unauthorised.status_code, 403)

        booking = self.client.post(
            "/api/bookings",
            json={"event_id": self.event_id, "ticket_quantity": 1},
            headers=user_headers,
        )
        self.assertEqual(booking.status_code, 201, booking.text)
        payment = self.client.post(
            "/api/payments",
            json={"booking_id": booking.json()["id"], "payment_method": "CARD"},
            headers=user_headers,
        )
        self.assertEqual(payment.status_code, 201, payment.text)
        with Session(self.engine) as db:
            event = db.get(Event, self.event_id)
            event.event_date = datetime.now(timezone.utc) - timedelta(days=1)
            db.commit()
        review = self.client.post(
            f"/api/events/{self.event_id}/reviews",
            json={"rating": 5, "review_text": "A wonderful event."},
            headers=user_headers,
        )
        self.assertEqual(review.status_code, 201, review.text)
        review_id = review.json()["id"]
        wrong_owner_edit = self.client.put(
            f"/api/reviews/{review_id}",
            json={"rating": 3, "review_text": "Changed"},
            headers=other_headers,
        )
        self.assertEqual(wrong_owner_edit.status_code, 404)
        updated = self.client.put(
            f"/api/reviews/{review_id}",
            json={"rating": 4, "review_text": "Updated feedback"},
            headers=user_headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        summary = self.client.get(f"/api/events/{self.event_id}/reviews")
        self.assertEqual(summary.json()["average_rating"], 4)
        self.assertEqual(summary.json()["review_count"], 1)
        self.assertEqual(
            self.client.delete(f"/api/reviews/{review_id}", headers=user_headers).status_code,
            204,
        )

    def test_event_search_filters_and_sorting(self):
        response = self.client.get(
            "/api/events",
            params={
                "search": "Test",
                "category": "Music",
                "location": "venue",
                "date_from": datetime.now(timezone.utc).date().isoformat(),
                "sort": "price",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([event["id"] for event in response.json()], [self.event_id])
        invalid = self.client.get("/api/events", params={"sort": "unsupported"})
        self.assertEqual(invalid.status_code, 422)

    def test_migrates_existing_phase_one_database_columns(self):
        legacy_engine = create_engine("sqlite://")
        with legacy_engine.begin() as connection:
            connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE events (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE event_updates (id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL, message TEXT NOT NULL, created_at DATETIME NOT NULL)"))
            connection.execute(text("CREATE TABLE notifications (id INTEGER PRIMARY KEY, type VARCHAR(20) NOT NULL)"))
        migrate_schema(legacy_engine)
        self.assertIn("role", {column["name"] for column in inspect(legacy_engine).get_columns("users")})
        self.assertIn("profile_picture_url", {column["name"] for column in inspect(legacy_engine).get_columns("users")})
        event_columns = {column["name"] for column in inspect(legacy_engine).get_columns("events")}
        self.assertIn("organizer_id", event_columns)
        self.assertIn("event_status", event_columns)
        self.assertIn("reserved_tickets", event_columns)
        update_columns = {column["name"] for column in inspect(legacy_engine).get_columns("event_updates")}
        self.assertIn("important", update_columns)
        notification_columns = {column["name"] for column in inspect(legacy_engine).get_columns("notifications")}
        self.assertIn("notification_type", notification_columns)
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

    def test_phase_four_profile_wishlist_activity_and_chat(self):
        user_headers = self.headers("USER")
        self.assertEqual(
            self.client.post(
                f"/api/v2/events/{self.event_id}/views", headers=user_headers
            ).status_code,
            204,
        )
        profile_update = self.client.put(
            "/api/v2/profile",
            json={"username": "updated_user", "profile_picture_url": "https://example.com/avatar.png"},
            headers=user_headers,
        )
        self.assertEqual(profile_update.status_code, 200, profile_update.text)
        self.assertEqual(profile_update.json()["username"], "updated_user")
        self.assertEqual(profile_update.json()["profile_picture_url"], "https://example.com/avatar.png")
        activity = self.client.get("/api/v2/profile/activity", headers=user_headers)
        self.assertEqual(activity.status_code, 200, activity.text)
        self.assertEqual(activity.json()["events_viewed"], 1)
        recommended_event = Event(
            title="Recommended technology event",
            description="A sufficiently long technology event description.",
            category="Tech",
            location="Test venue",
            event_date=datetime.now(timezone.utc) + timedelta(days=15),
            ticket_price=30,
            ticket_capacity=10,
            event_status="ACTIVE",
        )
        with Session(self.engine) as db:
            db.add(recommended_event)
            db.commit()
            recommended_event_id = recommended_event.id
        recommendations = self.client.get("/api/v2/recommendations", headers=user_headers)
        self.assertEqual(recommendations.status_code, 200, recommendations.text)
        self.assertEqual(recommendations.json()[0]["id"], recommended_event_id)

        saved = self.client.post(
            f"/api/v2/wishlist/{self.event_id}", headers=user_headers
        )
        self.assertEqual(saved.status_code, 201, saved.text)
        wishlist = self.client.get("/api/v2/wishlist", headers=user_headers)
        self.assertEqual(wishlist.status_code, 200, wishlist.text)
        self.assertEqual(wishlist.json()[0]["event"]["id"], self.event_id)
        self.assertEqual(
            self.client.delete(
                f"/api/v2/wishlist/{self.event_id}", headers=user_headers
            ).status_code,
            204,
        )

        chat = self.client.post(
            "/api/v2/chat", json={"message": "Help with ticket issues"}
        )
        self.assertEqual(chat.status_code, 200, chat.text)
        self.assertIn("My bookings", chat.json()["reply"])
        private_chat = self.client.post(
            "/api/v2/chat", json={"message": "Show my bookings"}
        )
        self.assertEqual(private_chat.status_code, 200, private_chat.text)
        self.assertIn("Sign in", private_chat.json()["reply"])
        discovery_chat = self.client.post(
            "/api/v2/chat", json={"message": "Suggest music events"}
        )
        self.assertEqual(discovery_chat.status_code, 200, discovery_chat.text)
        self.assertIn("not configured", discovery_chat.json()["reply"])
        self.assertEqual(discovery_chat.json()["events"][0]["id"], self.event_id)
        nearby_chat = self.client.post(
            "/api/v2/chat", json={"message": "Find events near me"}
        )
        self.assertEqual(nearby_chat.status_code, 200, nearby_chat.text)
        self.assertIn("Bengaluru", nearby_chat.json()["reply"])
        self.assertEqual(nearby_chat.json()["events"], [])
        location_chat = self.client.post(
            "/api/v2/chat", json={"message": "Find events in Test venue"}
        )
        self.assertEqual(location_chat.status_code, 200, location_chat.text)
        self.assertEqual(location_chat.json()["events"][0]["id"], self.event_id)

    def test_phase_four_profile_picture_upload_validation(self):
        user_headers = self.headers("USER")
        with TemporaryDirectory() as directory, patch(
            "app.endpoints.MEDIA_DIR", Path(directory)
        ):
            uploaded = self.client.post(
                "/api/v2/profile/picture",
                headers=user_headers,
                files={
                    "image": (
                        "avatar.webp",
                        b"RIFF\x00\x00\x00\x00WEBPimage-data",
                        "image/webp",
                    )
                },
            )
            self.assertEqual(uploaded.status_code, 200, uploaded.text)
            image_url = uploaded.json()["profile_picture_url"]
            self.assertRegex(image_url, r"^/media/profiles/[a-f0-9]+\.webp$")
            self.assertTrue(
                (Path(directory) / "profiles" / Path(image_url).name).is_file()
            )
            invalid_type = self.client.post(
                "/api/v2/profile/picture",
                headers=user_headers,
                files={"image": ("avatar.txt", b"not an image", "text/plain")},
            )
            self.assertEqual(invalid_type.status_code, 415)

    def test_phase_four_reservations_are_atomic_and_released_on_failure(self):
        user_headers = self.headers("USER")
        booking = self.client.post(
            "/api/bookings",
            json={"event_id": self.event_id, "ticket_quantity": 5},
            headers=user_headers,
        )
        self.assertEqual(booking.status_code, 201, booking.text)
        availability = self.client.get(f"/api/events/{self.event_id}/availability")
        self.assertEqual(availability.json()["available_tickets"], 0)
        rejected = self.client.post(
            "/api/bookings",
            json={"event_id": self.event_id, "ticket_quantity": 1},
            headers=user_headers,
        )
        self.assertEqual(rejected.status_code, 409)
        failed_payment = self.client.post(
            "/api/payments",
            json={
                "booking_id": booking.json()["id"],
                "payment_method": "CARD",
                "simulate_failure": True,
            },
            headers=user_headers,
        )
        self.assertEqual(failed_payment.status_code, 201, failed_payment.text)
        availability = self.client.get(f"/api/events/{self.event_id}/availability")
        self.assertEqual(availability.json()["available_tickets"], 5)

    def test_phase_four_expired_reservations_are_released(self):
        user_headers = self.headers("USER")
        booking = self.client.post(
            "/api/bookings",
            json={"event_id": self.event_id, "ticket_quantity": 2},
            headers=user_headers,
        )
        self.assertEqual(booking.status_code, 201, booking.text)
        with Session(self.engine) as db:
            pending_booking = db.get(Booking, booking.json()["id"])
            pending_booking.created_at = datetime.now(timezone.utc) - timedelta(minutes=16)
            db.commit()
        availability = self.client.get(f"/api/events/{self.event_id}/availability")
        self.assertEqual(availability.status_code, 200, availability.text)
        self.assertEqual(availability.json()["available_tickets"], 5)
        with Session(self.engine) as db:
            self.assertEqual(db.get(Booking, booking.json()["id"]).booking_status, "EXPIRED")

    def test_phase_four_event_announcements_and_price_filters(self):
        organizer_headers = self.headers("ORGANIZER")
        created = self.client.post(
            f"/api/v2/events/{self.event_id}/updates",
            json={"message": "Doors open at 6 PM", "important": True},
            headers=organizer_headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertTrue(created.json()["important"])
        denied = self.client.post(
            f"/api/v2/events/{self.event_id}/updates",
            json={"message": "Unauthorized announcement"},
            headers=self.headers("ORGANIZER_2"),
        )
        self.assertEqual(denied.status_code, 404)
        updates = self.client.get(f"/api/v2/events/{self.event_id}/updates")
        self.assertEqual(updates.status_code, 200, updates.text)
        self.assertEqual(updates.json()[0]["message"], "Doors open at 6 PM")
        self.assertTrue(updates.json()[0]["important"])
        filtered = self.client.get("/api/events", params={"price_min": 26})
        self.assertEqual(filtered.status_code, 200, filtered.text)
        self.assertEqual(filtered.json(), [])
        invalid_range = self.client.get(
            "/api/events", params={"price_min": 30, "price_max": 20}
        )
        self.assertEqual(invalid_range.status_code, 422)


if __name__ == "__main__":
    unittest.main()
