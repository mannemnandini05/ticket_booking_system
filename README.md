# SmartEvent

SmartEvent is a full-stack event discovery and ticket booking application. Browse and search events, create an account, book available tickets, and access digital tickets with QR codes.

## Features

- Search events and filter by category
- Register and sign in with role-based access
- Check ticket availability and book tickets
- View booking history and download QR-code tickets
- View booking notifications
- Create and manage events as an organizer
- Monitor organizer ticket sales, bookings, and revenue
- Review platform analytics and manage user roles as an administrator

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

The frontend uses `http://127.0.0.1:8000/api` by default. To use a different API base URL, create `frontend/.env` and set:

```dotenv
VITE_API_URL=http://127.0.0.1:8000/api
```

## Configuration

Backend settings can be configured in `backend/.env`. The provided `backend/.env.example` contains the database URL and allowed frontend origin. Set a unique, strong `SECRET_KEY` before deploying outside local development.

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
