from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not value.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may contain letters, numbers, underscores, and hyphens")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    role: Literal["USER", "ORGANIZER", "ADMIN"]
    created_at: datetime


class UserAdminView(UserProfile):
    pass


class UserRoleUpdate(BaseModel):
    role: Literal["USER", "ORGANIZER", "ADMIN"]


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    category: str
    location: str
    event_date: datetime
    organizer_id: int | None
    event_status: Literal["ACTIVE", "CANCELLED", "COMPLETED"]
    lifecycle_status: Literal["UPCOMING", "ONGOING", "COMPLETED", "CANCELLED"]
    ticket_price: float
    ticket_capacity: int
    banner_image: str | None
    created_at: datetime


class EventCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10)
    category: Literal["Music", "Tech", "Sports", "Business"]
    location: str = Field(min_length=2, max_length=160)
    event_date: datetime
    ticket_price: float = Field(ge=0)
    ticket_capacity: int = Field(gt=0)
    banner_image: str | None = None


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, min_length=10)
    category: Literal["Music", "Tech", "Sports", "Business"] | None = None
    location: str | None = Field(default=None, min_length=2, max_length=160)
    event_date: datetime | None = None
    ticket_price: float | None = Field(default=None, ge=0)
    ticket_capacity: int | None = Field(default=None, gt=0)
    banner_image: str | None = None

    @field_validator("title", "description", "category", "location", "event_date", "ticket_price", "ticket_capacity")
    @classmethod
    def reject_null_required_fields(cls, value):
        if value is None:
            raise ValueError("This field cannot be null")
        return value


class BookingCreate(BaseModel):
    event_id: int
    ticket_quantity: int = Field(gt=0, le=10)


class BookingBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    ticket_quantity: int
    total_price: float
    booking_status: str
    created_at: datetime


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    booking_id: int
    ticket_code: str
    qr_code_url: str
    created_at: datetime
    booking: "TicketBookingInfo"


class TicketBookingInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ticket_quantity: int
    event: EventResponse


class BookingDetail(BookingBase):
    event: EventResponse
    ticket: TicketResponse | None


class AdminBookingResponse(BookingDetail):
    user: UserProfile


class NotificationBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class OrganizerEventAnalytics(BaseModel):
    event_id: int
    title: str
    event_status: Literal["ACTIVE", "CANCELLED", "COMPLETED"]
    lifecycle_status: Literal["UPCOMING", "ONGOING", "COMPLETED", "CANCELLED"]
    ticket_capacity: int
    tickets_sold: int
    tickets_remaining: int
    booking_count: int
    revenue: float


class OrganizerAnalytics(BaseModel):
    total_events: int
    total_tickets_sold: int
    total_tickets_remaining: int
    total_bookings: int
    total_revenue: float
    events: list[OrganizerEventAnalytics]


class AdminAnalytics(BaseModel):
    total_users: int
    total_events: int
    total_tickets_sold: int
    total_bookings: int
    total_revenue: float
    daily_ticket_sales: list[dict]
    monthly_booking_trends: list[dict]
    popular_events: list[dict]
    top_revenue_events: list[dict]
