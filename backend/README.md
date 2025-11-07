# Backend - IYT Transport Tracker

## Setup

1. Install dependencies:
```bash
poetry install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your database credentials and JWT secret.

4. Initialize the database:
```bash
poetry run python -c "from app.database import init_db; init_db()"
```

## Running the Server

**IMPORTANT:** The server must be run with `socket_app` (not `app`) to enable WebSocket support:

```bash
poetry run uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

This serves the Socket.IO ASGI application which wraps the FastAPI app and enables real-time WebSocket connections for live location tracking.

## API Documentation

Once running, visit:
- API Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/healthz

## WebSocket Events

The server supports WebSocket connections for real-time location updates:

- `subscribe_trip` - Subscribe to updates for a specific trip
- `unsubscribe_trip` - Unsubscribe from trip updates
- `location_update` - Receive real-time location updates

See `app/websocket.py` for implementation details.
