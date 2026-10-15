"""
Advanced endpoints for Module 12-17 features:
- Enhanced search and filtering
- Payment method management
- Notification statistics
- Featured events and trending
- User preferences
"""

import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .management import get_managed_event, notify_event_attendees
from .models import Booking, Event, EventUpdate, EventView, Notification, Payment, Review, User, Wishlist
from .schemas import (
    ChatRequest,
    ChatResponse,
    EventCardResponse,
    EventUpdateCreate,
    EventUpdateResponse,
    EventResponse,
    FeaturedEventsResponse,
    NotificationStats,
    PaymentMethodResponse,
    SearchFiltersRequest,
    UserProfile,
    UserProfileUpdate,
    UserPreferences,
)
from .security import get_current_user, get_optional_current_user, require_roles

router = APIRouter(prefix="/api/v2", tags=["advanced"])
settings = get_settings()
MEDIA_DIR = Path(__file__).resolve().parent / "uploads"
PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024


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
        "tickets_available": max(0, event.ticket_capacity - event.reserved_tickets),
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
        select(func.count(Booking.id))
        .select_from(Booking)
        .join(Event, Booking.event_id == Event.id)
        .where(
            Booking.user_id == current_user.id,
            Booking.booking_status == "CONFIRMED",
            Event.event_date > now,
        )
    ) or 0

    # Past bookings
    past = db.scalar(
        select(func.count(Booking.id))
        .select_from(Booking)
        .join(Event, Booking.event_id == Event.id)
        .where(
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


@router.get("/profile", response_model=UserProfile)
def get_profile(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.put("/profile", response_model=UserProfile)
def update_profile(
    payload: UserProfileUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> User:
    username = payload.username.strip()
    existing = db.scalar(
        select(User.id).where(User.username == username, User.id != current_user.id)
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="That username is already in use")
    current_user.username = username
    current_user.profile_picture_url = payload.profile_picture_url
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/profile/picture", response_model=UserProfile)
def upload_profile_picture(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    image_types = {
        "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
        "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
        "image/webp": (
            ".webp",
            lambda data: len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP",
        ),
    }
    image_type = image_types.get(image.content_type or "")
    if image_type is None:
        raise HTTPException(status_code=415, detail="Upload a PNG, JPEG, or WebP image")
    content = image.file.read(PROFILE_IMAGE_MAX_BYTES + 1)
    if len(content) > PROFILE_IMAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Profile images must be 2 MB or smaller")
    extension, validate_signature = image_type
    if not validate_signature(content):
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid image")
    profile_directory = MEDIA_DIR / "profiles"
    profile_directory.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    (profile_directory / filename).write_bytes(content)
    current_user.profile_picture_url = f"/media/profiles/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/profile/activity", response_model=dict)
def get_profile_activity(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    summary = get_bookings_summary(current_user, db)
    views = db.scalar(
        select(func.coalesce(func.sum(EventView.view_count), 0)).where(
            EventView.user_id == current_user.id
        )
    ) or 0
    saved = db.scalar(
        select(func.count(Wishlist.id)).where(Wishlist.user_id == current_user.id)
    ) or 0
    return {**summary, "events_viewed": int(views), "saved_events": int(saved)}


@router.post("/events/{event_id}/views", status_code=status.HTTP_204_NO_CONTENT)
def record_event_view(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    if db.get(Event, event_id) is None:
        raise HTTPException(status_code=404, detail="Event not found")
    view = db.scalar(
        select(EventView).where(
            EventView.user_id == current_user.id, EventView.event_id == event_id
        )
    )
    if view is None:
        db.add(EventView(user_id=current_user.id, event_id=event_id))
    else:
        view.view_count += 1
        view.viewed_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/recommendations", response_model=list[EventResponse])
def get_recommendations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    limit: int = Query(6, ge=1, le=20),
) -> list[Event]:
    now = datetime.now(timezone.utc)
    viewed = db.scalars(
        select(EventView).where(EventView.user_id == current_user.id)
    ).all()
    booked = db.scalars(
        select(Booking).where(
            Booking.user_id == current_user.id, Booking.booking_status == "CONFIRMED"
        )
    ).all()
    category_scores: dict[str, int] = {}
    location_scores: dict[str, int] = {}
    excluded_ids = {booking.event_id for booking in booked}
    excluded_ids.update(view.event_id for view in viewed)
    for view in viewed:
        category_scores[view.event.category] = category_scores.get(view.event.category, 0) + view.view_count
        location_scores[view.event.location] = location_scores.get(view.event.location, 0) + view.view_count
    for booking in booked:
        category_scores[booking.event.category] = category_scores.get(booking.event.category, 0) + 3
        location_scores[booking.event.location] = location_scores.get(booking.event.location, 0) + 2

    popularity = (
        select(func.coalesce(func.sum(Booking.ticket_quantity), 0))
        .where(Booking.event_id == Event.id, Booking.booking_status == "CONFIRMED")
        .correlate(Event)
        .scalar_subquery()
    )
    candidates = db.execute(
        select(Event)
        .add_columns(popularity.label("popularity"))
        .where(Event.event_status == "ACTIVE", Event.event_date > now)
        .order_by(popularity.desc(), Event.event_date)
        .limit(100)
    ).all()
    ranked = sorted(
        (
            (event, int(event_popularity or 0))
            for event, event_popularity in candidates
            if event.id not in excluded_ids
        ),
        key=lambda candidate: (
            -(
                category_scores.get(candidate[0].category, 0) * 3
                + location_scores.get(candidate[0].location, 0) * 2
                + min(candidate[1], 50) * 0.1
            ),
            candidate[0].event_date,
        ),
    )
    return [event for event, _ in ranked[:limit]]


@router.get("/trending", response_model=list[EventResponse])
def get_trending_events(
    db: Session = Depends(get_db),
    limit: int = Query(6, ge=1, le=20),
) -> list[Event]:
    now = datetime.now(timezone.utc)
    popularity = (
        select(func.coalesce(func.sum(Booking.ticket_quantity), 0))
        .where(Booking.event_id == Event.id, Booking.booking_status == "CONFIRMED")
        .correlate(Event)
        .scalar_subquery()
    )
    return list(
        db.scalars(
            select(Event)
            .where(Event.event_status == "ACTIVE", Event.event_date > now)
            .order_by(popularity.desc(), Event.event_date)
            .limit(limit)
        ).all()
    )


@router.get("/wishlist", response_model=list[dict])
def list_wishlist(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[dict]:
    items = db.scalars(
        select(Wishlist)
        .where(Wishlist.user_id == current_user.id)
        .order_by(Wishlist.created_at.desc())
    ).all()
    return [
        {
            "id": item.id,
            "event_id": item.event_id,
            "created_at": item.created_at,
            "event": EventResponse.model_validate(item.event),
        }
        for item in items
    ]


@router.post("/wishlist/{event_id}", status_code=status.HTTP_201_CREATED)
def add_to_wishlist(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    item = db.scalar(
        select(Wishlist).where(
            Wishlist.user_id == current_user.id, Wishlist.event_id == event_id
        )
    )
    if item is None:
        item = Wishlist(user_id=current_user.id, event_id=event_id)
        db.add(item)
        db.commit()
        db.refresh(item)
    return {"event_id": item.event_id, "saved": True}


@router.delete("/wishlist/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_wishlist(
    event_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> None:
    db.execute(
        delete(Wishlist).where(
            Wishlist.user_id == current_user.id, Wishlist.event_id == event_id
        )
    )
    db.commit()


@router.get("/events/{event_id}/updates", response_model=list[EventUpdateResponse])
def list_event_updates(event_id: int, db: Session = Depends(get_db)) -> list[EventUpdate]:
    if db.get(Event, event_id) is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return list(
        db.scalars(
            select(EventUpdate)
            .where(EventUpdate.event_id == event_id)
            .order_by(EventUpdate.created_at.desc())
        ).all()
    )


@router.post(
    "/events/{event_id}/updates",
    response_model=EventUpdateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_event_update(
    event_id: int,
    payload: EventUpdateCreate,
    current_user: Annotated[User, Depends(require_roles("ORGANIZER", "ADMIN"))],
    db: Session = Depends(get_db),
) -> EventUpdate:
    event = get_managed_event(event_id, current_user, db)
    announcement = EventUpdate(
        event_id=event.id,
        message=payload.message.strip(),
        important=payload.important,
    )
    db.add(announcement)
    notify_event_attendees(
        db,
        event,
        "Important event announcement" if announcement.important else "Live event update",
        f"{event.title}: {announcement.message}",
    )
    db.commit()
    db.refresh(announcement)
    return announcement


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: Annotated[User | None, Depends(get_optional_current_user)],
    db: Session = Depends(get_db),
) -> ChatResponse:
    message = payload.message.strip()
    lowered = message.casefold()
    asks_for_bookings = bool(
        re.search(r"\b(my|show|view|list).{0,24}\b(bookings?|tickets?)\b", lowered)
    )
    if asks_for_bookings and current_user:
        bookings = db.scalars(
            select(Booking)
            .where(Booking.user_id == current_user.id)
            .order_by(Booking.created_at.desc())
            .limit(8)
        ).all()
        if not bookings:
            return ChatResponse(reply="You do not have any bookings yet. Browse events to find your next experience.")
        details = "; ".join(
            f"#{booking.id}: {booking.event.title} — {booking.booking_status}, {booking.ticket_quantity} ticket(s)"
            for booking in bookings
        )
        return ChatResponse(reply=f"Here are your recent bookings: {details}")
    if asks_for_bookings:
        return ChatResponse(reply="Sign in to see your bookings and tickets.")
    if re.search(r"\b(ticket|payment|booking|refund|coupon|help|support)\b", lowered) and not any(
        word in lowered for word in ("find", "suggest", "recommend", "event", "trending", "weekend")
    ):
        return ChatResponse(
            reply="For booking help, open My bookings to check payment status or retry a failed payment. Tickets are available under My tickets after payment succeeds."
        )

    now = datetime.now(timezone.utc)
    if not settings.ai_api_base_url or not settings.ai_api_key:
        category_terms = {
            "music": "Music",
            "concert": "Music",
            "tech": "Tech",
            "technology": "Tech",
            "sport": "Sports",
            "business": "Business",
        }
        requested_category = next(
            (category for term, category in category_terms.items() if term in lowered),
            None,
        )
        known_locations = db.scalars(select(Event.location).distinct()).all()
        requested_location = next(
            (
                location
                for location in known_locations
                if any(
                    token.casefold() in lowered
                    for token in location.replace(",", " ").split()
                    if len(token) > 3
                )
            ),
            None,
        )
        asks_nearby = any(
            term in lowered for term in ("near me", "nearby", "close to me")
        )
        events_query = select(Event).where(
            Event.event_status == "ACTIVE", Event.event_date > now
        )
        if requested_category:
            events_query = events_query.where(Event.category == requested_category)
        if requested_location:
            events_query = events_query.where(
                Event.location.ilike(f"%{requested_location}%")
            )
        if "weekend" in lowered:
            days_until_saturday = (5 - now.weekday()) % 7
            days_until_saturday = days_until_saturday or 7
            weekend_start = (now + timedelta(days=days_until_saturday)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            weekend_end = weekend_start + timedelta(days=2)
            events_query = events_query.where(
                Event.event_date >= weekend_start, Event.event_date < weekend_end
            )
        matching_events = db.scalars(
            events_query.order_by(Event.event_date).limit(5)
        ).all()
        if asks_nearby and requested_location is None:
            reply = (
                "I don't have access to your location. Try asking for events in a city, such as 'Find events in Bengaluru'."
            )
        elif matching_events:
            reply = "The AI service is not configured, so these matches use your category and date terms:"
        else:
            reply = (
                "I couldn't find a matching upcoming event. Try another category or date range."
                if requested_category or "weekend" in lowered
                else "The AI assistant is not configured. Set AI_API_BASE_URL and AI_API_KEY in backend/.env, or ask about trending events or booking help."
            )
        return ChatResponse(
            reply=reply,
            events=[]
            if asks_nearby and requested_location is None
            else [_build_event_card(event) for event in matching_events],
        )

    candidates = db.scalars(
        select(Event)
        .where(Event.event_status == "ACTIVE", Event.event_date > now)
        .order_by(Event.event_date)
        .limit(12)
    ).all()
    event_context = [
        {
            "id": event.id,
            "title": event.title,
            "category": event.category,
            "location": event.location,
            "date": event.event_date.isoformat(),
            "price": event.ticket_price,
        }
        for event in candidates
    ]
    try:
        response = httpx.post(
            f"{settings.ai_api_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.ai_api_key}"},
            json={
                "model": settings.ai_model,
                "temperature": 0.3,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are SmartEvent's event discovery and support assistant. Answer concisely. Recommend only from the supplied event list; never claim to book, cancel, refund, or modify accounts. Direct users to the app for account actions. You may use the event list for location, category, date, and price recommendations.",
                    },
                    {
                        "role": "user",
                        "content": f"User request: {message}\nPublic upcoming events: {event_context}",
                    },
                ],
            },
            timeout=settings.ai_timeout_seconds,
        )
        response.raise_for_status()
        reply = response.json()["choices"][0]["message"]["content"]
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="The AI assistant timed out. Please try again.") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail="The configured AI provider rejected the request.") from exc
    except (httpx.RequestError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="The configured AI provider returned an invalid response.") from exc
    return ChatResponse(reply=reply, events=[])


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
