import io
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

import qrcode
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .config import get_settings
from .db import engine, get_db, migrate_schema
from .endpoints import router as advanced_router
from .management import (
    admin_router,
    booking_summary,
    event_management_router,
    get_managed_event,
    organizer_router,
    sync_completed_events,
)
from .models import Base, Booking, Coupon, Event, Notification, Payment, Review, Ticket, User
from .schemas import (
    BookingCreate,
    BookingDetail,
    CouponApply,
    CouponCreate,
    CouponResponse,
    CouponValidate,
    CouponValidationResponse,
    EventCreate,
    EventReviewsResponse,
    EventResponse,
    LoginRequest,
    NotificationBase,
    PaymentCreate,
    PaymentResponse,
    RegisterRequest,
    ReviewCreate,
    ReviewResponse,
    TicketResponse,
    TokenResponse,
    UserProfile,
)
from .security import create_access_token, get_current_user, hash_password, require_roles, verify_password

settings = get_settings()
app = FastAPI(title="SmartEvent API", version="1.0.0")
app.include_router(event_management_router)
app.include_router(organizer_router)
app.include_router(admin_router)
app.include_router(advanced_router)
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
def list_events(
    db: Session = Depends(get_db),
    search: str = "",
    category: str = "",
    location: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
    sort: str = "date",
) -> list[Event]:
    sync_completed_events(db)
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must not be after date_to")
    popularity = (
        select(func.coalesce(func.sum(Booking.ticket_quantity), 0))
        .where(Booking.event_id == Event.id, Booking.booking_status == "CONFIRMED")
        .correlate(Event)
        .scalar_subquery()
    )
    query = select(Event)
    if search:
        query = query.where(Event.title.ilike(f"%{search}%"))
    if category:
        query = query.where(Event.category == category)
    if location:
        query = query.where(Event.location.ilike(f"%{location}%"))
    if date_from:
        query = query.where(Event.event_date >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        query = query.where(Event.event_date < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    if sort == "date":
        query = query.order_by(Event.event_date)
    elif sort == "price":
        query = query.order_by(Event.ticket_price, Event.event_date)
    elif sort == "popularity":
        query = query.order_by(popularity.desc(), Event.event_date)
    else:
        raise HTTPException(status_code=422, detail="sort must be date, popularity, or price")
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
    reservation_cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    reserved = db.scalar(
        select(func.coalesce(func.sum(Booking.ticket_quantity), 0)).where(
            Booking.event_id == event_id,
            (Booking.booking_status == "CONFIRMED")
            | (
                (Booking.booking_status == "PENDING_PAYMENT")
                & (Booking.created_at >= reservation_cutoff)
            ),
        )
    ) or 0
    return {"available_tickets": max(event.ticket_capacity - reserved, 0), "total_tickets": event.ticket_capacity}


@app.get("/api/events/{event_id}/reviews", response_model=EventReviewsResponse)
def list_event_reviews(event_id: int, db: Session = Depends(get_db)) -> EventReviewsResponse:
    if db.get(Event, event_id) is None:
        raise HTTPException(status_code=404, detail="Event not found")
    reviews = db.execute(
        select(Review, User.username)
        .join(User, Review.user_id == User.id)
        .where(Review.event_id == event_id)
        .order_by(Review.created_at.desc())
    ).all()
    average = db.scalar(select(func.avg(Review.rating)).where(Review.event_id == event_id))
    return EventReviewsResponse(
        average_rating=round(float(average), 1) if average is not None else None,
        review_count=len(reviews),
        reviews=[
            ReviewResponse(
                id=review.id,
                user_id=review.user_id,
                username=username,
                event_id=review.event_id,
                rating=review.rating,
                review_text=review.review_text,
                created_at=review.created_at,
            )
            for review, username in reviews
        ],
    )


@app.post("/api/events/{event_id}/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def create_event_review(
    event_id: int,
    payload: ReviewCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ReviewResponse:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    event_date = event.event_date
    if event_date.tzinfo is None:
        event_date = event_date.replace(tzinfo=timezone.utc)
    if event_date > datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="You can review an event after it has taken place")
    attended = db.scalar(
        select(Booking.id).where(
            Booking.user_id == current_user.id,
            Booking.event_id == event_id,
            Booking.booking_status == "CONFIRMED",
        )
    )
    if attended is None:
        raise HTTPException(status_code=403, detail="Only attendees with a confirmed booking can review this event")
    if db.scalar(select(Review.id).where(Review.user_id == current_user.id, Review.event_id == event_id)):
        raise HTTPException(status_code=409, detail="You have already reviewed this event")
    review = Review(user_id=current_user.id, event_id=event_id, **payload.model_dump())
    db.add(review)
    db.commit()
    db.refresh(review)
    return ReviewResponse(
        id=review.id,
        user_id=review.user_id,
        username=current_user.username,
        event_id=review.event_id,
        rating=review.rating,
        review_text=review.review_text,
        created_at=review.created_at,
    )


@app.put("/api/reviews/{review_id}", response_model=ReviewResponse)
def update_review(
    review_id: int,
    payload: ReviewCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ReviewResponse:
    review = db.get(Review, review_id)
    if review is None or review.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Review not found")
    for field, value in payload.model_dump().items():
        setattr(review, field, value)
    db.commit()
    db.refresh(review)
    return ReviewResponse(
        id=review.id,
        user_id=review.user_id,
        username=current_user.username,
        event_id=review.event_id,
        rating=review.rating,
        review_text=review.review_text,
        created_at=review.created_at,
    )


@app.delete("/api/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    review = db.get(Review, review_id)
    if review is None or review.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Review not found")
    db.delete(review)
    db.commit()


@app.post("/api/admin/coupons", response_model=CouponResponse, status_code=status.HTTP_201_CREATED)
def create_coupon(
    payload: CouponCreate,
    _: Annotated[User, Depends(require_roles("ADMIN"))],
    db: Session = Depends(get_db),
) -> Coupon:
    if payload.discount_type == "PERCENTAGE" and payload.discount_value > 100:
        raise HTTPException(status_code=422, detail="Percentage discounts cannot exceed 100")
    expiry_date = payload.expiry_date
    if expiry_date.tzinfo is None:
        expiry_date = expiry_date.replace(tzinfo=timezone.utc)
    if expiry_date <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Coupon expiry must be in the future")
    coupon_code = payload.coupon_code.strip().upper()
    if db.scalar(select(Coupon.id).where(Coupon.coupon_code == coupon_code)):
        raise HTTPException(status_code=409, detail="A coupon with this code already exists")
    coupon = Coupon(
        **payload.model_dump(exclude={"coupon_code", "expiry_date"}),
        coupon_code=coupon_code,
        expiry_date=expiry_date,
    )
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return coupon


def qr_image(data: str) -> str:
    image = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    image.add_data(data)
    image.make(fit=True)
    buffer = io.BytesIO()
    image.make_image(fill_color="black", back_color="white").save(buffer, "PNG")
    return "data:image/png;base64," + __import__("base64").b64encode(buffer.getvalue()).decode()


def validate_coupon(db: Session, coupon_code: str, booking_amount: float) -> tuple[Coupon, float]:
    coupon = db.scalar(select(Coupon).where(Coupon.coupon_code == coupon_code.strip().upper()))
    if coupon is None or not coupon.is_active:
        raise HTTPException(status_code=400, detail="This coupon code is invalid or inactive")
    expiry_date = coupon.expiry_date
    if expiry_date.tzinfo is None:
        expiry_date = expiry_date.replace(tzinfo=timezone.utc)
    if expiry_date <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This coupon has expired")
    if coupon.usage_limit is not None and coupon.redeemed_count >= coupon.usage_limit:
        raise HTTPException(status_code=400, detail="This coupon has reached its usage limit")
    if booking_amount < coupon.minimum_booking_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum booking amount for this coupon is ₹{coupon.minimum_booking_amount:.2f}",
        )
    discount = (
        booking_amount * coupon.discount_value / 100
        if coupon.discount_type == "PERCENTAGE"
        else coupon.discount_value
    )
    discount = round(min(discount, booking_amount), 2)
    return coupon, discount


@app.post("/api/coupons/validate", response_model=CouponValidationResponse)
def validate_coupon_endpoint(
    payload: CouponValidate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> CouponValidationResponse:
    coupon, discount = validate_coupon(db, payload.coupon_code, payload.booking_amount)
    return CouponValidationResponse(
        coupon=coupon,
        discount_amount=discount,
        final_amount=round(payload.booking_amount - discount, 2),
    )


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
    reservation_cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    reserved = db.scalar(
        select(func.coalesce(func.sum(Booking.ticket_quantity), 0)).where(
            Booking.event_id == event.id,
            (Booking.booking_status == "CONFIRMED")
            | (
                (Booking.booking_status == "PENDING_PAYMENT")
                & (Booking.created_at >= reservation_cutoff)
            ),
        )
    ) or 0
    if reserved + payload.ticket_quantity > event.ticket_capacity:
        raise HTTPException(status_code=409, detail="Not enough tickets are available")
    total_price = round(event.ticket_price * payload.ticket_quantity, 2)
    booking = Booking(
        user_id=current_user.id,
        event_id=event.id,
        ticket_quantity=payload.ticket_quantity,
        total_price=total_price,
        final_amount=total_price,
        booking_status="PENDING_PAYMENT",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@app.get("/api/bookings/{booking_id}", response_model=BookingDetail)
def get_booking(
    booking_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> Booking:
    booking = db.scalar(
        select(Booking).where(Booking.id == booking_id, Booking.user_id == current_user.id)
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


@app.post("/api/bookings/{booking_id}/coupon", response_model=BookingDetail)
def apply_coupon_to_booking(
    booking_id: int,
    payload: CouponApply,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> Booking:
    booking = db.scalar(
        select(Booking).where(Booking.id == booking_id, Booking.user_id == current_user.id)
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.booking_status != "PENDING_PAYMENT":
        raise HTTPException(status_code=409, detail="Coupons can only be applied before payment")
    coupon, discount = validate_coupon(db, payload.coupon_code, booking.total_price)
    booking.coupon_id = coupon.id
    booking.discount_amount = discount
    booking.final_amount = round(booking.total_price - discount, 2)
    db.commit()
    db.refresh(booking)
    return booking


@app.delete("/api/bookings/{booking_id}/coupon", response_model=BookingDetail)
def remove_coupon_from_booking(
    booking_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> Booking:
    booking = db.scalar(
        select(Booking).where(Booking.id == booking_id, Booking.user_id == current_user.id)
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.booking_status != "PENDING_PAYMENT":
        raise HTTPException(status_code=409, detail="Coupons can only be removed before payment")
    booking.coupon_id = None
    booking.discount_amount = 0
    booking.final_amount = booking.total_price
    db.commit()
    db.refresh(booking)
    return booking


@app.post("/api/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: PaymentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> Payment:
    booking = db.scalar(
        select(Booking).where(
            Booking.id == payload.booking_id,
            Booking.user_id == current_user.id,
        )
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.booking_status == "CONFIRMED":
        successful_payment = db.scalar(
            select(Payment)
            .where(Payment.booking_id == booking.id, Payment.payment_status == "SUCCESS")
            .order_by(Payment.created_at.desc())
        )
        if successful_payment:
            return successful_payment
    if booking.booking_status not in ("PENDING_PAYMENT", "PAYMENT_FAILED"):
        raise HTTPException(status_code=409, detail="This booking cannot be paid")
    event_date = booking.event.event_date
    if event_date.tzinfo is None:
        event_date = event_date.replace(tzinfo=timezone.utc)
    if booking.event.event_status != "ACTIVE" or event_date <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="This event is no longer accepting payment")
    created_at = booking.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if created_at < datetime.now(timezone.utc) - timedelta(minutes=15):
        booking.booking_status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=409, detail="This booking reservation has expired; please book again")
    if booking.booking_status == "PAYMENT_FAILED":
        reservation_cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
        other_reservations = db.scalar(
            select(func.coalesce(func.sum(Booking.ticket_quantity), 0)).where(
                Booking.event_id == booking.event_id,
                Booking.id != booking.id,
                (Booking.booking_status == "CONFIRMED")
                | (
                    (Booking.booking_status == "PENDING_PAYMENT")
                    & (Booking.created_at >= reservation_cutoff)
                ),
            )
        ) or 0
        if other_reservations + booking.ticket_quantity > booking.event.ticket_capacity:
            raise HTTPException(status_code=409, detail="Not enough tickets remain to retry this booking")
    if payload.simulate_failure and settings.environment.lower() == "production":
        raise HTTPException(status_code=403, detail="Payment failure simulation is disabled in production")

    payment = Payment(
        booking_id=booking.id,
        payment_method=payload.payment_method,
        payment_status="PENDING",
        amount=booking.final_amount,
    )
    db.add(payment)
    if payload.simulate_failure:
        payment.payment_status = "FAILED"
        payment.transaction_id = f"SIM-DECLINED-{uuid.uuid4().hex.upper()}"
        booking.booking_status = "PAYMENT_FAILED"
        db.add(
            Notification(
                user_id=current_user.id,
                title="Payment failed",
                message=f"Payment for booking #{booking.id} could not be completed. You can retry from your bookings.",
                type="PAYMENT",
            )
        )
        db.commit()
        db.refresh(payment)
        return payment

    if booking.coupon_id is not None:
        coupon = db.get(Coupon, booking.coupon_id)
        if coupon is None:
            raise HTTPException(status_code=409, detail="The applied coupon is no longer available")
        try:
            validate_coupon(db, coupon.coupon_code, booking.total_price)
        except HTTPException:
            raise HTTPException(status_code=409, detail="The applied coupon is no longer valid")
        update_result = db.execute(
            update(Coupon)
            .where(
                Coupon.id == coupon.id,
                (Coupon.usage_limit.is_(None) | (Coupon.redeemed_count < Coupon.usage_limit)),
            )
            .values(redeemed_count=Coupon.redeemed_count + 1)
        )
        if update_result.rowcount != 1:
            raise HTTPException(status_code=409, detail="This coupon has reached its usage limit")

    payment.payment_status = "SUCCESS"
    payment.transaction_id = f"SIM-{uuid.uuid4().hex.upper()}"
    booking.booking_status = "CONFIRMED"
    ticket_code = f"SMART-{booking.id:06d}-{secrets.token_hex(4).upper()}"
    db.add(Ticket(booking_id=booking.id, ticket_code=ticket_code, qr_code_url=qr_image(ticket_code)))
    db.add_all(
        [
            Notification(
                user_id=current_user.id,
                title="Booking confirmed",
                message=f"Your {booking.ticket_quantity} ticket(s) for {booking.event.title} are confirmed.",
                type="BOOKING",
            ),
            Notification(
                user_id=current_user.id,
                title="Payment successful",
                message=f"Payment of ₹{booking.final_amount:.2f} for booking #{booking.id} was successful.",
                type="PAYMENT",
            ),
        ]
    )
    db.commit()
    db.refresh(payment)
    return payment


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
    now = datetime.now(timezone.utc)
    reminder_bookings = db.execute(
        select(Booking, Event)
        .join(Event, Booking.event_id == Event.id)
        .where(
            Booking.user_id == current_user.id,
            Booking.booking_status == "CONFIRMED",
            Event.event_status == "ACTIVE",
            Event.event_date > now,
            Event.event_date <= now + timedelta(hours=24),
        )
    ).all()
    for booking, event in reminder_bookings:
        reminder_title = "Event reminder"
        reminder_message = f"{event.title} is coming up within the next 24 hours."
        existing = db.scalar(
            select(Notification.id).where(
                Notification.user_id == current_user.id,
                Notification.title == reminder_title,
                Notification.message == reminder_message,
            )
        )
        if existing is None:
            db.add(
                Notification(
                    user_id=current_user.id,
                    title=reminder_title,
                    message=reminder_message,
                    type="EVENT",
                )
            )
    db.commit()
    return list(db.scalars(select(Notification).where(Notification.user_id == current_user.id).order_by(Notification.created_at.desc())).all())


@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, current_user: Annotated[User, Depends(get_current_user)], db: Session = Depends(get_db)) -> dict:
    notification = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id))
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    return {"message": "Notification marked as read"}


@app.patch("/api/notifications/read-all")
def mark_all_notifications_read(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return {"message": "All notifications marked as read"}


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
