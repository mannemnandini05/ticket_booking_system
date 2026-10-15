# SmartEvent

SmartEvent is a full-stack event discovery and ticket booking application. Browse and search events, create an account, book available tickets, and access digital tickets with QR codes.

## Features

- Search events and filter by category, location, and date range; sort by date, price, or popularity
- Register and sign in with role-based access
- Check ticket availability, apply discounts, and complete simulated payments
- View booking history and download QR-code tickets
- Receive booking, payment, event reminder, and event update notifications
- Review attended events and see average attendee ratings
- Create and manage events as an organizer
- Monitor organizer ticket sales, bookings, and revenue
- Review platform analytics and manage user roles as an administrator
- Track live ticket availability, save events, and receive personalized recommendations
- View organizer announcements and manage profile details
- Ask the event assistant for recommendations and booking guidance

## Tech stack

- **Frontend:** React, Vite, and Axios
- **Backend:** FastAPI, SQLAlchemy, and SQLite

## Requirements

- Python 3.10 or later
- Node.js and npm

## Run locally

Start the backend first.

### Backend

In PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

The API is available at `http://127.0.0.1:8000`. Interactive API documentation is at `http://127.0.0.1:8000/docs`.

On startup, the backend creates the SQLite database and seeds sample events if the database has no events.

### Frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (by default, `http://localhost:5173`).

During local development, Vite proxies `/api` requests to the backend at `http://127.0.0.1:8000`, avoiding browser CORS and loopback-host mismatches. To use a separately hosted API, create `frontend/.env` and set:

```dotenv
VITE_API_URL=http://127.0.0.1:8000/api
```

## Configuration

Backend settings can be configured in `backend/.env`. The provided `backend/.env.example` contains the database URL and allowed frontend origin. Set a unique, strong `SECRET_KEY` before deploying outside local development.

The optional chatbot uses an OpenAI-compatible chat-completions API. Configure `AI_API_BASE_URL` (for example, `https://api.openai.com/v1`), `AI_API_KEY`, and optionally `AI_MODEL` in `backend/.env`; never commit the key. Without provider configuration, local booking lookups and basic ticket-help guidance remain available, while AI-generated event discovery requests return a clear configuration error.

## Roles and initial administrator

Every new registration receives the `USER` role; signup requests cannot assign elevated roles. An administrator can promote or demote accounts on the **Admin → Users** page. Promoted users must sign out and back in to receive a token with their new role.

To bootstrap the first administrator:

1. Register the account normally and start the backend at least once.
2. In a backend terminal with the virtual environment active, run:

   ```powershell
   python -m app.bootstrap_admin admin@example.com
   ```

3. Sign out and sign back in with that account. It can then promote accounts to `ORGANIZER` or `ADMIN`.

The application generates a random signing key for local development if `SECRET_KEY` is unset. Before deployment, set `ENVIRONMENT=production` and configure a unique, persistent `SECRET_KEY` of at least 32 characters in `backend/.env`; production startup fails if the secret is missing. A persistent value keeps tokens valid across restarts and avoids shared development secrets.

## Phase 2 API

All endpoints are under `/api`. Protected endpoints require the bearer token returned by registration or login.

- **Organizer:** `POST /events`, `GET /organizer/events`, `PATCH /events/{id}`, `PATCH /events/{id}/cancel`, `GET /organizer/events/{id}/bookings`, `GET /organizer/analytics`
- **Administrator:** `GET /admin/users`, `PATCH /admin/users/{id}/role`, `GET /admin/events`, `GET /admin/bookings`, `GET /admin/analytics`

Admin analytics accepts optional `date_from` and `date_to` query parameters in `YYYY-MM-DD` format. Organizer ownership is checked on every event-management request. Event status is persisted as `ACTIVE`, `CANCELLED`, or `COMPLETED`; the API derives `UPCOMING` or `ONGOING` from the event date and transitions active events to completed after their event date.

The backend migrates existing SQLite databases on startup, assigning existing accounts the `USER` role and existing events the `ACTIVE` status. It adds nullable organizer ownership for Phase 1 events, which remain manageable only by administrators.

## Payments, coupons, reviews, and discovery

Ticket bookings reserve inventory for 15 minutes while payment is pending. The backend uses a simulated payment processor by default; it does not collect or store card credentials. A successful payment confirms the booking and creates the QR ticket, while a declined test payment can be retried from **My bookings**. The checkout UI exposes a failure simulation control only in Vite development mode, and the API refuses simulated failures in production.

Administrators can create promotional codes using `POST /api/admin/coupons`. Authenticated users validate a code with `POST /api/coupons/validate` and apply it to a pending booking with `POST /api/bookings/{booking_id}/coupon`. Discounts and final amounts are computed server-side; coupon usage is consumed only after successful payment.

Event feedback is available from an event page after the event date for users with a confirmed booking. Attendees can create, edit, or delete their own review; `GET /api/events/{event_id}/reviews` returns reviews and the average rating. Event discovery accepts `search`, `category`, `location`, `date_from`, `date_to`, and `sort` (`date`, `popularity`, or `price`) query parameters.

Notification reminders are generated when a user loads notifications if they have a confirmed booking for an event starting within the next 24 hours. Booking confirmations, payment outcomes, event changes, and cancellations create notification records. Notifications can be marked individually or all at once.

## Phase 4: real-time and personalization

Event availability is refreshed every five seconds on the event page, and announcements are refreshed every ten seconds. Booking reservations are claimed with a conditional atomic database update, included in availability, and released after payment failure or reservation expiry to prevent overselling. Signed-in browsing activity and confirmed bookings inform category/location recommendations. Wishlist and event announcement APIs are under `/api/v2`; profile edits, validated PNG/JPEG/WebP uploads (2 MB maximum), and a booking/activity summary are also available there. Event search supports `price_min` and `price_max` in addition to the existing filters.

Organizers and administrators can mark event announcements as important; these appear with a distinct highlight and use a separate attendee notification title.

The floating assistant handles booking lookups locally for authenticated users. Other event discovery prompts are sent to the configured AI provider with only the user's prompt and a limited list of public upcoming event details; credentials, account profile data, and booking records are not sent to the provider.

## Run tests

From the project root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
cd ..\frontend
npm run build
```

## Project layout

```text
backend/
  app/                 FastAPI application
  requirements.txt     Python dependencies
  .env.example         Backend configuration template
frontend/
  src/
    components/        Shared navigation, cards, and route guards
    context/           Authentication and notification state
    pages/             Discovery, booking, account, and dashboards
  package.json         Frontend scripts and dependencies
images/                Project image assets
```
