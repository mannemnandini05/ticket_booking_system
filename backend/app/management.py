from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Booking, Event, Notification, User
from .schemas import (
    AdminAnalytics,
    AdminBookingResponse,
    BookingDetail,
    EventCreate,
    EventResponse,
    EventUpdate,
    OrganizerAnalytics,
    OrganizerEventAnalytics,
    UserAdminView,
    UserRoleUpdate,
)
from .security import require_roles

organizer_router = APIRouter(prefix="/api/organizer", tags=["organizer"])
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])
event_management_router = APIRouter(prefix="/api/events", tags=["event management"])


def get_managed_event(event_id: int, user: User, db: Session) -> Event:
    sync_completed_events(db)
    event = db.get(Event, event_id)
    if event is None or (user.role != "ADMIN" and event.organizer_id != user.id):
        raise HTTPException(status_code=404, detail="Event not found")
    return event


def booking_summary(db: Session, event_id: int) -> tuple[int, int, float]:
    sold, bookings, revenue = db.execute(
        select(
            func.coalesce(func.sum(Booking.ticket_quantity), 0),
            func.count(Booking.id),
            func.coalesce(func.sum(Booking.total_price), 0),
        ).where(Booking.event_id == event_id, Booking.booking_status == "CONFIRMED")
    ).one()
    return int(sold), int(bookings), float(revenue)


def event_field_changed(event: Event, field: str, value) -> bool:
    current = getattr(event, field)
    if isinstance(current, datetime) and current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    if isinstance(value, datetime) and value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return current != value


def sync_completed_events(db: Session) -> None:
    today = datetime.now(timezone.utc).date()
    events = db.scalars(
        select(Event).where(Event.event_status == "ACTIVE")
    ).all()
    changed = False
    for event in events:
        event_date = event.event_date
        if event_date.tzinfo is None:
            event_date = event_date.replace(tzinfo=timezone.utc)
        if event_date.date() < today:
            event.event_status = "COMPLETED"
            changed = True
    if changed:
        db.commit()


def notify_event_attendees(db: Session, event: Event, title: str, message: str) -> None:
    attendee_ids = db.scalars(
        select(Booking.user_id)
        .where(Booking.event_id == event.id, Booking.booking_status == "CONFIRMED")
        .distinct()
    ).all()
    db.add_all(
        Notification(user_id=user_id, title=title, message=message, type="EVENT")
        for user_id in attendee_ids
    )


def date_window(
    date_from: date | None, date_to: date | None
) -> tuple[datetime | None, datetime | None]:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must not be after date_to")
    start = datetime.combine(date_from, time.min, tzinfo=timezone.utc) if date_from else None
    end = (
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc)
        if date_to
        else None
    )
    return start, end


def apply_date_window(query, start: datetime | None, end: datetime | None):
    if start:
        query = query.where(Booking.created_at >= start)
    if end:
        query = query.where(Booking.created_at < end)
    return query


@event_management_router.post(
    "", response_model=EventResponse, status_code=status.HTTP_201_CREATED
)
def create_event(
    payload: EventCreate,
    organizer: Annotated[User, Depends(require_roles("ORGANIZER"))],
    db: Session = Depends(get_db),
) -> Event:
    event_date = payload.event_date
    if event_date.tzinfo is None:
        event_date = event_date.replace(tzinfo=timezone.utc)
    if event_date <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Event date must be in the future")
    event = Event(
        **payload.model_dump(exclude={"event_date"}),
        event_date=event_date,
        organizer_id=organizer.id,
        event_status="ACTIVE",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@event_management_router.patch("/{event_id}", response_model=EventResponse)
def update_event(
    event_id: int,
    payload: EventUpdate,
    current_user: Annotated[User, Depends(require_roles("ORGANIZER", "ADMIN"))],
    db: Session = Depends(get_db),
) -> Event:
    event = get_managed_event(event_id, current_user, db)
    if event.event_status != "ACTIVE":
        raise HTTPException(status_code=409, detail="Only active events can be updated")
    changes = payload.model_dump(exclude_unset=True)
    if "event_date" in changes:
        event_date = changes["event_date"]
        if event_date.tzinfo is None:
            event_date = event_date.replace(tzinfo=timezone.utc)
        if event_date <= datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Event date must be in the future")
        changes["event_date"] = event_date
    sold, _, _ = booking_summary(db, event.id)
    if changes.get("ticket_capacity", event.ticket_capacity) < sold:
        raise HTTPException(
            status_code=409,
            detail="Ticket capacity cannot be lower than tickets already sold",
        )
    changed_fields = [
        field
        for field, value in changes.items()
        if event_field_changed(event, field, value)
    ]
    if changed_fields:
        for field in changed_fields:
            setattr(event, field, changes[field])
        db.flush()
        notify_event_attendees(
            db,
            event,
            "Event updated",
            f"{event.title} has been updated. Review the event details before attending.",
        )
        db.commit()
        db.refresh(event)
    return event


@event_management_router.patch("/{event_id}/cancel", response_model=EventResponse)
def cancel_event(
    event_id: int,
    current_user: Annotated[User, Depends(require_roles("ORGANIZER", "ADMIN"))],
    db: Session = Depends(get_db),
) -> Event:
    event = get_managed_event(event_id, current_user, db)
    if event.event_status == "COMPLETED":
        raise HTTPException(status_code=409, detail="Completed events cannot be cancelled")
    if event.event_status != "CANCELLED":
        event.event_status = "CANCELLED"
        notify_event_attendees(
            db,
            event,
            "Event cancelled",
            f"{event.title} has been cancelled.",
        )
        db.commit()
        db.refresh(event)
    return event


@organizer_router.get("/events", response_model=list[EventResponse])
def list_organizer_events(
    organizer: Annotated[User, Depends(require_roles("ORGANIZER"))],
    db: Session = Depends(get_db),
) -> list[Event]:
    sync_completed_events(db)
    return list(
        db.scalars(
            select(Event)
            .where(Event.organizer_id == organizer.id)
            .order_by(Event.event_date)
        ).all()
    )


@organizer_router.get("/events/{event_id}/bookings", response_model=list[BookingDetail])
def list_event_bookings(
    event_id: int,
    organizer: Annotated[User, Depends(require_roles("ORGANIZER"))],
    db: Session = Depends(get_db),
) -> list[Booking]:
    get_managed_event(event_id, organizer, db)
    return list(
        db.scalars(
            select(Booking)
            .where(Booking.event_id == event_id)
            .order_by(Booking.created_at.desc())
        ).all()
    )


@organizer_router.get("/analytics", response_model=OrganizerAnalytics)
def organizer_analytics(
    organizer: Annotated[User, Depends(require_roles("ORGANIZER"))],
    db: Session = Depends(get_db),
) -> OrganizerAnalytics:
    sync_completed_events(db)
    events = list(
        db.scalars(
            select(Event)
            .where(Event.organizer_id == organizer.id)
            .order_by(Event.event_date)
        ).all()
    )
    rows = []
    total_sold = total_bookings = 0
    total_revenue = 0.0
    for event in events:
        sold, bookings, revenue = booking_summary(db, event.id)
        total_sold += sold
        total_bookings += bookings
        total_revenue += revenue
        rows.append(
            OrganizerEventAnalytics(
                event_id=event.id,
                title=event.title,
                event_status=event.event_status,
                lifecycle_status=event.lifecycle_status,
                ticket_capacity=event.ticket_capacity,
                tickets_sold=sold,
                tickets_remaining=max(event.ticket_capacity - sold, 0),
                booking_count=bookings,
                revenue=revenue,
            )
        )
    return OrganizerAnalytics(
        total_events=len(events),
        total_tickets_sold=total_sold,
        total_tickets_remaining=sum(row.tickets_remaining for row in rows),
        total_bookings=total_bookings,
        total_revenue=total_revenue,
        events=rows,
    )


@admin_router.get("/users", response_model=list[UserAdminView])
def list_users(
    _: Annotated[User, Depends(require_roles("ADMIN"))],
    db: Session = Depends(get_db),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.desc())).all())


@admin_router.patch("/users/{user_id}/role", response_model=UserAdminView)
def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    admin: Annotated[User, Depends(require_roles("ADMIN"))],
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id and payload.role != "ADMIN":
        raise HTTPException(status_code=409, detail="You cannot change your own administrator role")
    if user.role == "ADMIN" and payload.role != "ADMIN":
        admin_count = db.scalar(select(func.count(User.id)).where(User.role == "ADMIN")) or 0
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="The last administrator cannot be demoted")
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@admin_router.get("/events", response_model=list[EventResponse])
def list_all_events(
    _: Annotated[User, Depends(require_roles("ADMIN"))],
    db: Session = Depends(get_db),
) -> list[Event]:
    sync_completed_events(db)
    return list(db.scalars(select(Event).order_by(Event.event_date.desc())).all())


@admin_router.get("/bookings", response_model=list[AdminBookingResponse])
def list_all_bookings(
    _: Annotated[User, Depends(require_roles("ADMIN"))],
    db: Session = Depends(get_db),
) -> list[Booking]:
    return list(
        db.scalars(select(Booking).order_by(Booking.created_at.desc())).all()
    )


@admin_router.get("/analytics", response_model=AdminAnalytics)
def admin_analytics(
    _: Annotated[User, Depends(require_roles("ADMIN"))],
    db: Session = Depends(get_db),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> AdminAnalytics:
    sync_completed_events(db)
    start, end = date_window(date_from, date_to)
    booking_filter = apply_date_window(
        select(Booking).where(Booking.booking_status == "CONFIRMED"), start, end
    )
    bookings = list(db.scalars(booking_filter).all())
    total_sold = sum(booking.ticket_quantity for booking in bookings)
    total_revenue = sum(booking.total_price for booking in bookings)

    daily = db.execute(
        apply_date_window(
            select(
                func.date(Booking.created_at),
                func.sum(Booking.ticket_quantity),
            ).where(Booking.booking_status == "CONFIRMED"),
            start,
            end,
        )
        .group_by(func.date(Booking.created_at))
        .order_by(func.date(Booking.created_at))
    ).all()
    monthly = db.execute(
        apply_date_window(
            select(
                func.strftime("%Y-%m", Booking.created_at),
                func.count(Booking.id),
            ).where(Booking.booking_status == "CONFIRMED"),
            start,
            end,
        )
        .group_by(func.strftime("%Y-%m", Booking.created_at))
        .order_by(func.strftime("%Y-%m", Booking.created_at))
    ).all()
    event_rows = db.execute(
        apply_date_window(
            select(
                Event.id,
                Event.title,
                func.coalesce(func.sum(Booking.ticket_quantity), 0),
                func.coalesce(func.sum(Booking.total_price), 0),
            )
            .outerjoin(
                Booking,
                (Booking.event_id == Event.id)
                & (Booking.booking_status == "CONFIRMED"),
            ),
            start,
            end,
        )
        .group_by(Event.id)
    ).all()
    popular = sorted(event_rows, key=lambda row: row[2], reverse=True)[:5]
    top_revenue = sorted(event_rows, key=lambda row: row[3], reverse=True)[:5]
    return AdminAnalytics(
        total_users=db.scalar(select(func.count(User.id))) or 0,
        total_events=db.scalar(select(func.count(Event.id))) or 0,
        total_tickets_sold=total_sold,
        total_bookings=len(bookings),
        total_revenue=total_revenue,
        daily_ticket_sales=[
            {"date": str(day), "tickets_sold": int(count)} for day, count in daily
        ],
        monthly_booking_trends=[
            {"month": str(month), "bookings": int(count)} for month, count in monthly
        ],
        popular_events=[
            {"event_id": event_id, "title": title, "tickets_sold": int(count)}
            for event_id, title, count, _ in popular
        ],
        top_revenue_events=[
            {"event_id": event_id, "title": title, "revenue": float(revenue)}
            for event_id, title, _, revenue in top_revenue
        ],
    )
