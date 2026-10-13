"""
Advanced endpoints for Module 12-17 features:
- Enhanced search and filtering
- Payment method management
- Notification statistics
- Featured events and trending
- User preferences
"""

from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Booking, Event, Notification, Payment, Review, User
from .schemas import (
    EventCardResponse,
    FeaturedEventsResponse,
    NotificationStats,
    PaymentMethodResponse,
    SearchFiltersRequest,
    UserPreferences,
)
from .security import get_current_user

router = APIRouter(prefix="/api/v2", tags=["advanced"])


def _build_event_card(event: Event) -> EventCardResponse:
    """Convert Event model to EventCardResponse."""
    return EventCardResponse(
        id=event.id,
        title=event.title,
        category=event.category,
        location=event.location,
        event_date=event.event_date,
        ticket_price=event.ticket_price,
        banner_image=event.banner_image,
        average_rating=event.average_rating,
        review_count=event.review_count,
        lifecycle_status=event.lifecycle_status,
    )


@router.get("/search", response_model=list[EventCardResponse])
def advanced_search(
    db: Session = Depends(get_db),
    q: str = Query("", min_length=0, max_length=200),
    category: str | None = Query(None),
    location: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    sort: str = Query("date", regex="^(date|price|popularity|rating)$"),
    price_min: float | None = Query(None, ge=0),
    price_max: float | None = Query(None, ge=0),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[EventCardResponse]:
    """
    Advanced event search with multiple filters.
    
    - **q**: Search query for event title/description
    - **category**: Filter by category (Music, Tech, Sports, Business)
    - **location**: Filter by location
    - **date_from/date_to**: Date range filter
    - **sort**: Sort by date, price, popularity, or rating
    - **price_min/price_max**: Price range filter
    """
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must not be after date_to")

    if price_min is not None and price_max is not None and price_min > price_max:
        raise HTTPException(status_code=422, detail="price_min must not exceed price_max")

    # Calculate popularity using confirmed bookings count
    popularity = (
        select(func.coalesce(func.count(Booking.id), 0))
        .where(Booking.event_id == Event.id, Booking.booking_status == "CONFIRMED")
        .correlate(Event)
        .scalar_subquery()
    )

    query = select(Event).where(Event.event_status == "ACTIVE")

    # Text search
    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(
                Event.title.ilike(search_term),
                Event.description.ilike(search_term),
            )
        )

    # Category filter
    if category:
        query = query.where(Event.category == category)

    # Location filter
    if location:
        query = query.where(Event.location.ilike(f"%{location}%"))

    # Date range filter
    if date_from:
        query = query.where(
            Event.event_date >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc)
        )
    if date_to:
        query = query.where(
            Event.event_date < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
        )

    # Price range filter
    if price_min is not None:
        query = query.where(Event.ticket_price >= price_min)
    if price_max is not None:
        query = query.where(Event.ticket_price <= price_max)

    # Sorting
    if sort == "date":
        query = query.order_by(Event.event_date)
    elif sort == "price":
        query = query.order_by(Event.ticket_price)
    elif sort == "popularity":
        query = query.order_by(popularity.desc())
    elif sort == "rating":
        # Events with higher average ratings come first
        query = query.order_by(
            func.coalesce(
                (
                    select(func.avg(Review.rating))
                    .where(Review.event_id == Event.id)
                    .correlate(Event)
                    .scalar_subquery()
                ),
                0,
            ).desc(),
            Event.event_date,
        )

    # Apply limit and offset for pagination
    query = query.limit(limit).offset(offset)
    events = db.scalars(query).all()
    return [_build_event_card(event) for event in events]


@router.get("/featured", response_model=FeaturedEventsResponse)
def get_featured_events(db: Session = Depends(get_db)) -> FeaturedEventsResponse:
    """
    Get featured, trending, and upcoming events for the home page.
    
    - **Featured**: Events with highest ratings
    - **Trending**: Events with most recent bookings
    - **Upcoming**: Events happening soon
    """
    now = datetime.now(timezone.utc)
    upcoming_start = now + timedelta(days=1)
    upcoming_end = now + timedelta(days=30)

    # Featured: High-rated events
    featured_query = select(Event).where(Event.event_status == "ACTIVE").order_by(
        func.coalesce(
            (
                select(func.avg(Review.rating))
                .where(Review.event_id == Event.id)
                .correlate(Event)
                .scalar_subquery()
            ),
            0,
        ).desc(),
        Event.created_at.desc(),
    ).limit(5)

    # Trending: Recent bookings
    trending_query = (
        select(Event)
        .where(Event.event_status == "ACTIVE")
        .join(Booking, Booking.event_id == Event.id)
        .where(Booking.booking_status == "CONFIRMED")
        .group_by(Event.id)
        .order_by(func.count(Booking.id).desc(), Event.event_date)
        .limit(5)
    )

    # Upcoming: Events in next 30 days
    upcoming_query = (
        select(Event)
        .where(
            and_(
                Event.event_status == "ACTIVE",
                Event.event_date >= upcoming_start,
                Event.event_date <= upcoming_end,
            )
        )
        .order_by(Event.event_date)
        .limit(5)
    )

    featured = [_build_event_card(e) for e in db.scalars(featured_query).all()]
    trending = [_build_event_card(e) for e in db.scalars(trending_query).all()]
    upcoming = [_build_event_card(e) for e in db.scalars(upcoming_query).all()]

    return FeaturedEventsResponse(featured=featured, trending=trending, upcoming=upcoming)


@router.get("/categories", response_model=dict)
def get_categories() -> dict:
    """Get available event categories."""
    return {
        "categories": [
            {"id": "Music", "name": "Music", "icon": "music"},
            {"id": "Tech", "name": "Technology", "icon": "code"},
            {"id": "Sports", "name": "Sports", "icon": "activity"},
            {"id": "Business", "name": "Business", "icon": "briefcase"},
        ]
    }


@router.get("/payment-methods", response_model=list[PaymentMethodResponse])
def get_payment_methods() -> list[PaymentMethodResponse]:
    """Get available payment methods."""
    return [
        PaymentMethodResponse(
            method="CARD",
            display_name="Credit/Debit Card",
            icon="credit-card",
            enabled=True,
        ),
        PaymentMethodResponse(
            method="UPI",
            display_name="UPI",
            icon="smartphone",
            enabled=True,
        ),
        PaymentMethodResponse(
            method="NET_BANKING",
            display_name="Net Banking",
            icon="globe",
            enabled=True,
        ),
    ]


@router.get("/notifications/stats", response_model=NotificationStats)
def get_notification_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> NotificationStats:
    """Get user's notification statistics."""
    unread_count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    ) or 0

    total_count = db.scalar(
        select(func.count(Notification.id)).where(Notification.user_id == current_user.id)
    ) or 0

    return NotificationStats(unread_count=unread_count, total_count=total_count)


@router.get("/user/preferences", response_model=UserPreferences)
def get_user_preferences(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> UserPreferences:
    """Get user's notification and display preferences."""
    # For now, return defaults. Can be extended to store in database
    return UserPreferences()


@router.put("/user/preferences", response_model=UserPreferences)
def update_user_preferences(
    preferences: UserPreferences,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> UserPreferences:
    """Update user's notification and display preferences."""
    # Can be extended to persist preferences in database
    return preferences


@router.get("/events/{event_id}/stats", response_model=dict)
def get_event_stats(
    event_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """Get event statistics for display on event detail page."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Booking stats
    confirmed_bookings = db.scalar(
        select(func.count(Booking.id)).where(
            Booking.event_id == event_id,
            Booking.booking_status == "CONFIRMED",
        )
    ) or 0

    tickets_sold = db.scalar(
        select(func.coalesce(func.sum(Booking.ticket_quantity), 0)).where(
            Booking.event_id == event_id,
            Booking.booking_status == "CONFIRMED",
        )
    ) or 0

    # Reviews and ratings
    avg_rating = db.scalar(
        select(func.avg(Review.rating)).where(Review.event_id == event_id)
    ) or 0
    review_count = db.scalar(
        select(func.count(Review.id)).where(Review.event_id == event_id)
    ) or 0

    return {
        "booking_count": confirmed_bookings,
        "tickets_sold": tickets_sold,
        "tickets_available": max(0, event.ticket_capacity - tickets_sold),
        "avg_rating": round(avg_rating, 1) if avg_rating else None,
        "review_count": review_count,
        "occupancy_percent": round((tickets_sold / event.ticket_capacity) * 100, 1)
        if event.ticket_capacity > 0
        else 0,
    }


@router.get("/bookings/summary", response_model=dict)
def get_bookings_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    """Get user's booking summary statistics."""
    now = datetime.now(timezone.utc)

    # Upcoming bookings
    upcoming = db.scalar(
        select(func.count(Booking.id)).where(
            Booking.user_id == current_user.id,
            Booking.booking_status == "CONFIRMED",
            Event.event_date > now,
        )
    ) or 0

    # Past bookings
    past = db.scalar(
        select(func.count(Booking.id)).where(
            Booking.user_id == current_user.id,
            Booking.booking_status == "CONFIRMED",
            Event.event_date <= now,
        )
    ) or 0

    # Total spent
    total_spent = db.scalar(
        select(func.coalesce(func.sum(Booking.final_amount), 0)).where(
            Booking.user_id == current_user.id,
            Booking.booking_status == "CONFIRMED",
        )
    ) or 0

    return {
        "upcoming_bookings": upcoming,
        "past_bookings": past,
        "total_spent": round(total_spent, 2),
    }


@router.post("/payments/simulate-callback")
def simulate_payment_callback(
    booking_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    status: str = Query(..., regex="^(SUCCESS|FAILED)$"),
) -> dict:
    """
    Simulate payment gateway callback for testing.
    In production, this would be replaced with actual webhook handling.
    """
    # This would integrate with real payment webhooks
    return {"status": "simulated", "booking_id": booking_id, "payment_status": status}
