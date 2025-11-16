# Quick Start - Run Locally

Copy and paste these commands in order:

## 1. Navigate to Project Directory
```bash
cd /Users/bobbytredinnick/Documents/Dev-Projects/LastIYTTrackingAttempt
```

## 2. Set Up Environment Files (First Time Only)
```bash
./setup-local-dev.sh
```

## 3. Copy Environment Files to Active Locations
```bash
cp frontend/.env.development frontend/.env.local
cp backend/.env.development backend/.env
```

## 4. Start Backend Server
```bash
cd backend
poetry install
poetry run python -c "from app.database import init_db; init_db()"
poetry run uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

Keep this terminal window open. In a **NEW terminal window**, run:

## 5. Start Frontend (New Terminal)
```bash
cd /Users/bobbytredinnick/Documents/Dev-Projects/LastIYTTrackingAttempt/frontend
npm install
npm run dev
```

## 6. Open Browser
Visit: **http://localhost:5173**

## Test Login
- **Admin**: Role `admin` / Passcode `admin123`
- **Agent**: Role `agent` / Passcode `agent123`
- **Parent**: Role `parent` / Passcode `parent123`
- **Clinician**: Role `clinician` / Passcode `clinician123`

