# Safe Local Development Guide

**How to develop locally without risking production**

This guide explains how to work on improving the production app locally, test changes safely, and deploy only when ready.

---

## 🛡️ Isolation Guarantee

**Your local development is 100% isolated from production:**

1. **Separate Database**: Local uses `iyt_transport_dev`, production has its own database
2. **Separate URLs**: Local uses `localhost:8000`, production uses its domain
3. **Separate Branch**: Work in `Sandbox` branch, production uses `LIVE-snapshot`
4. **Separate Environment Files**: `.env.local` vs `.env.production`
5. **No Auto-Deploy**: Changes only affect production when you explicitly deploy

---

## 📁 File Structure Overview

```
IYT Compass/
├── Sandbox branch (your work) ✅
│   ├── frontend/.env.local          → localhost URLs
│   ├── backend/.env                 → local database
│   └── [all your changes]
│
├── LIVE-snapshot branch ⚠️ NEVER TOUCH
│   └── Production backup (read-only)
│
└── Production Server (DigitalOcean)
    ├── frontend/.env.production     → production URLs
    └── backend/.env.production      → production database
```

---

## 🚀 Safe Development Workflow

### Step 1: Start Local Development

```bash
# Terminal 1 - Backend
cd /Users/bobbytredinnick/Documents/Dev-Projects/LastIYTTrackingAttempt/backend
poetry run uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 - Frontend
cd /Users/bobbytredinnick/Documents/Dev-Projects/LastIYTTrackingAttempt/frontend
npm run dev
```

**What's isolated:**
- Backend connects to local database: `iyt_transport_dev`
- Frontend connects to: `http://localhost:8000`
- Production server: **Completely untouched**

### Step 2: Make Changes

Work on any features, fix bugs, experiment:

```bash
# Make changes in Sandbox branch
git checkout Sandbox  # Already on it
# Edit files...
git add .
git commit -m "Your changes"
```

**Safe because:**
- Changes only exist in `Sandbox` branch
- Production is still running from `LIVE-snapshot` branch
- Nothing deploys automatically

### Step 3: Test Locally

1. Open http://localhost:5173
2. Test all features
3. Break things, experiment, try ideas
4. Fix errors as needed

**Why it's safe:**
- Local database: Separate from production
- Local URLs: Never touch production
- Can reset local database without affecting production

### Step 4: Reset Local Database (If Needed)

If you mess up your local database and want a fresh start:

```bash
cd backend
poetry run python -c "from app.database import init_db; init_db()"
```

**Safe because:**
- Only affects `iyt_transport_dev` (local)
- Production database: **Completely untouched**

### Step 5: Deploy to Production (Only When Ready)

**Follow `DEPLOYMENT_WORKFLOW.md` for detailed steps.**

Quick summary:
1. Test everything locally first ✅
2. Commit to `Sandbox` branch ✅
3. SSH to production server
4. Pull `Sandbox` branch changes
5. Rebuild and restart

**Only after:**
- ✅ All tests pass locally
- ✅ You've reviewed the changes
- ✅ You're ready to deploy

---

## 🔒 What's Protected

### Files You Can Safely Modify:
- ✅ Any files in `Sandbox` branch
- ✅ `frontend/.env.local` (local only, not committed)
- ✅ `backend/.env` (local only, not committed)
- ✅ Local database `iyt_transport_dev`

### Files That Are Protected:
- ⚠️ `LIVE-snapshot` branch → **NEVER TOUCH**
- ⚠️ Production server files → Only change when deploying
- ⚠️ Production database → Never touched by local dev
- ⚠️ `.env.production` files → Only on production server

---

## 🧪 Testing Checklist

Before deploying to production, test locally:

- [ ] Backend starts without errors
- [ ] Frontend connects to backend
- [ ] Can log in with test accounts
- [ ] Can create/view trips
- [ ] Location tracking works
- [ ] Chat works
- [ ] Flight tracking works (if applicable)
- [ ] No console errors
- [ ] No database errors

---

## 🔄 Common Workflows

### Adding a New Feature

1. **Work locally in Sandbox:**
   ```bash
   git checkout Sandbox
   # Make changes
   git commit -m "Add new feature"
   ```

2. **Test thoroughly locally:**
   - Use http://localhost:5173
   - Test all scenarios
   - Fix bugs

3. **Deploy when ready:**
   - Follow `DEPLOYMENT_WORKFLOW.md`
   - Production only gets the tested code

### Fixing a Bug

1. **Reproduce locally:**
   - Create test data in local database
   - Verify bug exists locally

2. **Fix in Sandbox:**
   ```bash
   git checkout Sandbox
   # Fix the bug
   git commit -m "Fix: bug description"
   ```

3. **Test fix locally:**
   - Verify bug is fixed
   - Test related features still work

4. **Deploy fix:**
   - Follow deployment workflow
   - Production gets the fix

### Experimenting/Risking

1. **Create experimental branch (optional):**
   ```bash
   git checkout -b experiment/new-idea
   # Try risky changes
   ```

2. **Test in isolation:**
   - Local database won't affect production
   - Can reset anytime

3. **If it works:**
   - Merge back to `Sandbox`
   - Deploy when ready

4. **If it breaks:**
   - Reset local database
   - Delete branch
   - Production: **Never affected**

---

## 🚨 Emergency Rollback

If something goes wrong locally:

### Reset Local Database:
```bash
cd backend
poetry run python -c "from app.database import init_db; init_db()"
```

### Reset Code Changes:
```bash
git checkout Sandbox
git reset --hard origin/Sandbox  # Careful: loses uncommitted changes
```

### Start Fresh:
```bash
# Reinstall dependencies
cd backend && poetry install
cd ../frontend && npm install

# Restart services
```

**Production is still safe** - these commands only affect local environment.

---

## 📝 Key Principles

1. **Always work in `Sandbox` branch** - Never `LIVE-snapshot`
2. **Test locally first** - Never deploy untested code
3. **Use environment variables** - `.env.local` for local, `.env.production` for production
4. **Separate databases** - Local vs production never mix
5. **Explicit deployment** - Production only changes when you deploy

---

## ✅ Safety Checklist

Before making any changes:

- [ ] You're on `Sandbox` branch (not `LIVE-snapshot`)
- [ ] Local environment files are configured (`.env.local`)
- [ ] Backend connects to local database
- [ ] Frontend uses localhost URLs
- [ ] Production is running normally (check via browser)
- [ ] You understand what you're changing

---

## 🎯 Summary

**You can safely:**
- ✅ Break things locally
- ✅ Experiment with risky changes
- ✅ Reset your local database
- ✅ Try new ideas
- ✅ Fix bugs and add features

**Production is protected because:**
- ✅ Separate branch (`Sandbox` vs `LIVE-snapshot`)
- ✅ Separate database (local vs production)
- ✅ Separate URLs (localhost vs production domain)
- ✅ Separate environment files
- ✅ No automatic deployment
- ✅ Manual deployment process only

**When you're ready to deploy:**
- Follow `DEPLOYMENT_WORKFLOW.md`
- Production gets only tested, reviewed changes
- You control when production updates

---

You're completely safe to experiment and improve the app locally! 🚀

