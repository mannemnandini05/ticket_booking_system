import io
import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated

import qrcode
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import engine, get_db, migrate_schema
from .management import (
    admin_router,
    booking_summary,
    event_management_router,
    get_managed_event,
    organizer_router,
    sync_completed_events,
)
from .models import Base, Booking, Event, Notification, Ticket, User
from .schemas import BookingCreate, BookingDetail, EventCreate, EventResponse, LoginRequest, NotificationBase, RegisterRequest, TicketResponse, TokenResponse, UserProfile
from .security import create_access_token, get_current_user, hash_password, verify_password

settings = get_settings()
app = FastAPI(title="SmartEvent API", version="1.0.0")
app.include_router(event_management_router)
app.include_router(organizer_router)
app.include_router(admin_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def seed_data(db: Session) -> None:
    if db.scalar(select(Event).limit(1)) is not None:
        return
    now = datetime.now(timezone.utc)
    next_month = now.replace(day=1) + __import__("datetime").timedelta(days=32)
    events = [
        Event(title="Neon Nights: Electronic Music Festival", description="An immersive electronic music experience featuring award-winning artists, light installations, and late-night sets.", category="Music", location="Skyline Arena, Bengaluru", event_date=next_month.replace(day=14, hour=18, minute=30), ticket_price=1299, ticket_capacity=120, banner_image="https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=80"),
        Event(title="Future of AI in Product Teams", description="A practical conference on applying AI tools, responsible workflows, and product-led transformations.", category="Tech", location="Tech Hub, Pune", event_date=next_month.replace(day=3, hour=10), ticket_price=899, ticket_capacity=80, banner_image="https://images.unsplash.com/photo-1511578314322-379afb4e0fa4?auto=format&fit=crop&w=1200&q=80"),
        Event(title="City Challenge Cup", description="Fast-paced community football, street culture, and a vibrant match-day celebration.", category="Sports", location="Greenfield Stadium, Mumbai", event_date=next_month.replace(day=18, hour=16), ticket_price=599, ticket_capacity=150, banner_image="https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80"),
        Event(title="Build Better Businesses", description="A focused gathering for founders and operators exploring sustainable growth and modern leadership.", category="Business", location="The Grand Pavilion, Delhi", event_date=next_month.replace(day=2, hour=9, minute=30), ticket_price=1499, ticket_capacity=60, banner_image="https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80"),
    ]
    db.add_all(events)
    db.commit()


@app.on_event("startup")
def startup() -> None:
    migrate_schema()
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        seed_data(db)
        sync_completed_events(db)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "SmartEvent"}


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(username=payload.username, email=str(payload.email), hashed_password=hash_password(payload.password), role="USER")
    db.add(user)
    db.commit()
    db.refresh(user)
    profile = UserProfile(id=user.id, username=user.username, email=user.email, role=user.role, created_at=user.created_at)
    return TokenResponse(access_token=create_access_token(user.id, user.role), user=profile)


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    profile = UserProfile(id=user.id, username=user.username, email=user.email, role=user.role, created_at=user.created_at)
    return TokenResponse(access_token=create_access_token(user.id, user.role), user=profile)


@app.get("/api/auth/me", response_model=UserProfile)
def me(current_user: Annotated[User, Depends(get_current_user)], db: Session = Depends(get_db)) -> UserProfile:
    return UserProfile.model_validate(current_user)


@app.get("/api/events", response_model=list[EventResponse])
def list_events(db: Session = Depends(get_db), search: str = "", category: str = "") -> list[Event]:
    sync_completed_events(db)
    query = select(Event).order_by(Event.event_date)
    if search:
        query = query.where(Event.title.ilike(f"%{search}%"))
    if category:
        query = query.where(Event.category == category)
    return list(db.scalars(query).all())


@app.get("/api/events/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)) -> Event:
    sync_completed_events(db)
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@app.get("/api/events/{event_id}/availability")
def event_availability(event_id: int, db: Session = Depends(get_db)) -> dict:
    sync_completed_events(db)
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.event_status != "ACTIVE":
        raise HTTPException(status_code=409, detail="This event is no longer available for booking")
    reserved = db.scalar(select(func.coalesce(func.sum(Booking.ticket_quantity), 0)).where(Booking.event_id == event_id, Booking.booking_status == "CONFIRMED")) or 0
    return {"available_tickets": max(event.ticket_capacity - reserved, 0), "total_tickets": event.ticket_capacity}


def qr_image(data: str) -> str:
    image = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    image.add_data(data)
    image.make(fit=True)
    buffer = io.BytesIO()
    image.make_image(fill_color="black", back_color="white").save(buffer, "PNG")
    return "data:image/png;base64," + __import__("base64").b64encode(buffer.getvalue()).decode()


@app.post("/api/bookings", response_model=BookingDetail, status_code=status.HTTP_201_CREATED)
def create_booking(payload: BookingCreate, current_user: Annotated[User, Depends(get_current_user)], db: Session = Depends(get_db)) -> Booking:
    sync_completed_events(db)
    event = db.get(Event, payload.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.event_status != "ACTIVE":
        raise HTTPException(status_code=409, detail="This event is no longer available for booking")
    event_date = event.event_date.replace(tzinfo=timezone.utc) if event.event_date.tzinfo is None else event.event_date
    if event_date <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="This event has already started")
    reserved = db.scalar(select(func.coalesce(func.sum(Booking.ticket_quantity), 0)).where(Booking.event_id == event.id, Booking.booking_status == "CONFIRMED")) or 0
    if reserved + payload.ticket_quantity > event.ticket_capacity:
        raise HTTPException(status_code=409, detail="Not enough tickets are available")
    booking = Booking(user_id=current_user.id, event_id=event.id, ticket_quantity=payload.ticket_quantity, total_price=event.ticket_price * payload.ticket_quantity, booking_status="CONFIRMED")
    db.add(booking)
    db.flush()
    ticket_code = f"SMART-{booking.id:06d}-{secrets.token_hex(4).upper()}"
    ticket = Ticket(booking_id=booking.id, ticket_code=ticket_code, qr_code_url=qr_image(ticket_code))
    db.add(ticket)
    db.commit()
    db.refresh(booking)
    notification = Notification(user_id=current_user.id, title="Booking confirmed", message=f"Your {payload.ticket_quantity} ticket(s) for {event.title} are confirmed.", type="BOOKING")
    db.add(notification)
    db.commit()
    return booking


@app.get("/api/bookings", response_model=list[BookingDetail])
def list_bookings(current_user: Annotated[User, Depends(get_current_user)], db: Session = Depends(get_db)) -> list[Booking]:
    query = select(Booking).where(Booking.user_id == current_user.id).options()
    return list(db.scalars(query.order_by(Booking.created_at.desc())).all())


@app.get("/api/tickets", response_model=list[TicketResponse])
def list_tickets(current_user: Annotated[User, Depends(get_current_user)], db: Session = Depends(get_db)) -> list[Ticket]:
    query = select(Ticket).join(Booking).where(Booking.user_id == current_user.id).order_by(Booking.created_at.desc())
    return list(db.scalars(query).all())


@app.get("/api/tickets/{ticket_id}", response_model=TicketResponse)
def get_ticket(ticket_id: int, current_user: Annotated[User, Depends(get_current_user)], db: Session = Depends(get_db)) -> Ticket:
    ticket = db.scalar(select(Ticket).join(Booking).where(Ticket.id == ticket_id, Booking.user_id == current_user.id))
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@app.get("/api/notifications", response_model=list[NotificationBase])
def list_notifications(current_user: Annotated[User, Depends(get_current_user)], db: Session = Depends(get_db)) -> list[Notification]:
    return list(db.scalars(select(Notification).where(Notification.user_id == current_user.id).order_by(Notification.created_at.desc())).all())


@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, current_user: Annotated[User, Depends(get_current_user)], db: Session = Depends(get_db)) -> dict:
    notification = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id))
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    return {"message": "Notification marked as read"}


@app.get("/api/events/{event_id}/bookings")
def booking_count(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    event = get_managed_event(event_id, current_user, db)
    sold, booking_count, _ = booking_summary(db, event.id)
    return {"booked_tickets": sold, "booking_count": booking_count}


@app.get("/api/category-options")
def category_options() -> list[str]:
    return ["Music", "Tech", "Sports", "Business"]


@app.exception_handler(HTTPException)
def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
