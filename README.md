# SmartEvent

SmartEvent is a full-stack event discovery and ticket booking application. Browse and search events, create an account, book available tickets, and access digital tickets with QR codes.

## Features

- Search events and filter by category
- Register and sign in
- Check ticket availability and book tickets
- View booking history and download QR-code tickets
- View booking notifications

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

Backend settings can be configured in `backend/.env`. The provided `backend/.env.example` contains the database URL, secret key, and allowed frontend origin. Set a unique, strong `SECRET_KEY` before deploying outside local development.

## Project layout

```text
backend/
  app/                 FastAPI application
  requirements.txt     Python dependencies
  .env.example         Backend configuration template
frontend/
  src/                 React application
  package.json         Frontend scripts and dependencies
images/                Project image assets
```
