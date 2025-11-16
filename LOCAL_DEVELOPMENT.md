# Local Development Setup Guide

**IYT Compass - Transport Tracking Application**

This guide explains how to set up and run the application locally on your development machine, completely separate from production.

---

## 📋 Prerequisites

1. **Node.js** (v20 or higher) - [Download](https://nodejs.org/)
2. **Python** (v3.12 or higher) - [Download](https://www.python.org/downloads/)
3. **Poetry** (Python dependency manager) - [Installation Guide](https://python-poetry.org/docs/#installation)
4. **PostgreSQL** (v15 or higher) - [Download](https://www.postgresql.org/download/)

---

## 🗄️ Database Setup

### 1. Install PostgreSQL

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download installer from https://www.postgresql.org/download/windows/

### 2. Create Local Database

```bash
# Create database user (if needed)
createuser -P iyt_user

# Create development database
createdb iyt_transport_dev

# Or using psql:
psql postgres
CREATE DATABASE iyt_transport_dev;
CREATE USER iyt_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE iyt_transport_dev TO iyt_user;
\q
```

---

## 🔧 Environment Variables Setup

### Frontend (.env.development)

Create `frontend/.env.development` file:

```bash
# Backend API URL (FastAPI runs on port 8000 locally)
VITE_API_URL=http://localhost:8000

# WebSocket URL (defaults to VITE_API_URL if not set)
VITE_WS_URL=http://localhost:8000

# Google Maps API Key (required for address autocomplete)
# Get your key from: https://console.cloud.google.com/
# Make sure to restrict it to http://localhost:5173/* for development
VITE_GOOGLE_MAPS_API_KEY=AIzaSyApqAzsIpHvp2ekouOOm8NzM2elKfrvJzw
```

### Backend (.env.development)

Create `backend/.env.development` file:

```bash
# Database connection (local PostgreSQL)
# Format: postgresql://username:password@host:port/database_name
DATABASE_URL=postgresql://iyt_user:your_password@localhost:5432/iyt_transport_dev

# JWT Secret (use a strong random string - generate with: openssl rand -hex 32)
# This should be DIFFERENT from production
JWT_SECRET=local_dev_jwt_secret_change_me_openssl_rand_hex_32

# JWT Algorithm
JWT_ALGORITHM=HS256

# AviationStack API Key (for flight tracking)
# Get your key from: https://aviationstack.com/
AVIATIONSTACK_API_KEY=58ff5459d54a5321e967da782fed23b2

# CORS Origins (comma-separated)
# Frontend runs on http://localhost:5173 locally
CORS_ORIGINS=http://localhost:5173
```

**Note:** These `.env.development` files are in `.gitignore` and won't be committed to Git.

---

## 🚀 Running the Application Locally

### Step 1: Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
poetry install

# Copy .env.development to .env (for local development)
cp .env.development .env

# Edit .env with your local database credentials
# (Make sure DATABASE_URL matches your PostgreSQL setup)

# Initialize the database schema
poetry run python -c "from app.database import init_db; init_db()"
```

### Step 2: Start Backend Server

```bash
# From backend/ directory
poetry run uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload

# You should see:
# INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
# INFO:     Started reloader process
# INFO:     Started server process
# INFO:     Waiting for application startup.
# INFO:     Application startup complete.
```

The backend API will be available at:
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/healthz

**Important:** The server must use `socket_app` (not `app`) to enable WebSocket support for real-time features.

### Step 3: Frontend Setup

Open a **new terminal window**:

```bash
# Navigate to frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Copy .env.development to .env.local (Vite automatically loads .env.local)
cp .env.development .env.local

# Edit .env.local with your Google Maps API key
```

### Step 4: Start Frontend Development Server

```bash
# From frontend/ directory
npm run dev

# You should see:
# VITE v6.x.x  ready in xxx ms
# ➜  Local:   http://localhost:5173/
# ➜  Network: use --host to expose
```

The frontend will be available at: **http://localhost:5173**

---

## 🧪 Testing Local Development

### 1. Verify Backend is Running

```bash
# Check health endpoint
curl http://localhost:8000/healthz

# Should return: {"status":"ok"}
```

### 2. Verify Frontend Connects to Backend

1. Open http://localhost:5173 in your browser
2. Open browser DevTools (F12) → Console tab
3. Look for any CORS or connection errors
4. Try logging in with test credentials (see below)

### 3. Test Accounts

The database initialization creates these test accounts:

- **Admin**: `admin@iyt.com` / `admin123`
- **Agent**: `agent@iyt.com` / `agent123`
- **Parent**: `parent@iyt.com` / `parent123`
- **Clinician**: `clinician@iyt.com` / `clinician123`

**Or use passcode login:**
- Role: `admin` / Passcode: `admin123`
- Role: `agent` / Passcode: `agent123`
- etc.

---

## 🔍 Troubleshooting

### Backend Issues

**Port 8000 already in use:**
```bash
# Find what's using port 8000
lsof -i :8000

# Kill the process or use a different port:
poetry run uvicorn app.main:socket_app --host 0.0.0.0 --port 8001 --reload
# Then update frontend .env.development: VITE_API_URL=http://localhost:8001
```

**Database connection errors:**
- Verify PostgreSQL is running: `psql -U iyt_user -d iyt_transport_dev`
- Check DATABASE_URL in `backend/.env` matches your setup
- Ensure database exists: `createdb iyt_transport_dev`

**Missing dependencies:**
```bash
cd backend
poetry install
```

### Frontend Issues

**Port 5173 already in use:**
- Vite will automatically try the next port (5174, 5175, etc.)
- Or specify a different port: `npm run dev -- --port 3000`

**API connection errors:**
- Verify backend is running on port 8000
- Check `frontend/.env.local` has correct `VITE_API_URL`
- Check browser console for CORS errors (backend should allow localhost:5173)

**Missing dependencies:**
```bash
cd frontend
npm install
```

**Google Maps not working:**
- Verify `VITE_GOOGLE_MAPS_API_KEY` is set in `.env.local`
- Check Google Cloud Console: API key must allow `http://localhost:5173/*`

---

## 📝 Development Workflow

1. **Make changes** to code in `Sandbox` branch
2. **Test locally** using the steps above
3. **Commit changes** to `Sandbox` branch
4. **When ready for production**, follow `DEPLOYMENT_WORKFLOW.md`

---

## 🚫 Important Notes

- **NEVER commit `.env` or `.env.development` files** - they contain sensitive credentials
- **Local development is completely isolated** from production
- **Database is separate** - local changes don't affect production
- **Test thoroughly** before deploying to production
- **Never touch the `LIVE-snapshot` branch** - it's a production backup

---

## 📚 Additional Resources

- **Backend API Docs**: http://localhost:8000/docs (when backend is running)
- **FastAPI Documentation**: https://fastapi.tiangolo.com/
- **React Documentation**: https://react.dev/
- **Vite Documentation**: https://vitejs.dev/

