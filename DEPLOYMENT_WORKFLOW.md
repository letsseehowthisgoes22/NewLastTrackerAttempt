# Deployment Workflow Guide

**IYT Compass - Transport Tracking Application**

This guide explains the workflow for deploying changes from the `Sandbox` branch to production.

---

## 🏗️ Branch Structure

- **`LIVE-snapshot`** ⚠️ **DO NOT TOUCH** - Production backup (read-only)
- **`server-improvements`** - Exact backup of what's currently live on server
- **`Sandbox`** - Active development branch (where all work happens)

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All changes tested locally and working
- [ ] Code committed to `Sandbox` branch
- [ ] No hardcoded localhost URLs in production code
- [ ] Environment variables documented (but not committed)
- [ ] Database migrations reviewed (if any)
- [ ] Backend tests pass (if you have tests)
- [ ] Frontend builds successfully: `npm run build`

---

## 🚀 Deployment Workflow

### Step 1: Verify Current Branch

```bash
# Make sure you're on Sandbox branch
git checkout Sandbox
git status

# Should show: "On branch Sandbox"
# Make sure all changes are committed
git add .
git commit -m "Your commit message"
```

### Step 2: Create Deployment Branch (Optional but Recommended)

```bash
# Create a deployment branch from Sandbox
git checkout -b deploy-production-$(date +%Y%m%d)

# Or use a descriptive name:
git checkout -b deploy-production-v1.2.3
```

This creates a snapshot of exactly what you're deploying, making it easy to rollback if needed.

### Step 3: Push to Remote

```bash
# Push Sandbox branch (or your deployment branch)
git push origin Sandbox

# If you created a deployment branch:
git push origin deploy-production-YYYYMMDD
```

### Step 4: SSH into DigitalOcean Server

```bash
# SSH into your production server
ssh root@your-server-ip

# Or using a hostname:
ssh root@compass.interactiveyouthtransport.com
```

### Step 5: Navigate to Project Directory

```bash
# Find where the project is located (common locations):
cd /var/www/compass
# OR
cd /root/compass
# OR
cd ~/compass

# Check current status
git status
git branch
```

### Step 6: Update Code on Server

**⚠️ IMPORTANT:** Make sure you're NOT on `LIVE-snapshot` branch!

```bash
# Verify current branch (should NOT be LIVE-snapshot)
git branch

# If you need to switch:
git checkout server-improvements
# OR create a production branch if you're deploying from a deployment branch:
git checkout -b production

# Pull latest changes from Sandbox
git fetch origin
git merge origin/Sandbox

# OR if deploying from a specific deployment branch:
git merge origin/deploy-production-YYYYMMDD

# Resolve any merge conflicts if they occur
```

### Step 7: Update Environment Variables (If Needed)

If you added new environment variables:

```bash
# Edit production environment files
# Frontend:
nano frontend/.env.production

# Backend:
nano backend/.env.production

# Add any new variables (never commit these files!)
```

### Step 8: Rebuild and Restart Services

#### If using Docker Compose:

```bash
# Navigate to project root
cd /path/to/project

# Pull latest code changes
git pull origin Sandbox

# Rebuild containers
docker-compose build

# Restart services
docker-compose down
docker-compose up -d

# Check logs
docker-compose logs -f backend
docker-compose logs -f web
```

#### If using manual setup:

**Backend:**
```bash
cd backend

# Install/update dependencies
poetry install

# Restart backend service
# If using systemd:
sudo systemctl restart compass-backend

# If running manually:
# Stop current process (Ctrl+C or kill)
# Start new process:
poetry run uvicorn app.main:socket_app --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend

# Install/update dependencies
npm install

# Build for production
npm run build

# If using Nginx, restart it:
sudo systemctl restart nginx

# If using a process manager like PM2:
pm2 restart compass-frontend
```

### Step 9: Verify Deployment

```bash
# Check backend health
curl https://compass.interactiveyouthtransport.com/api/healthz

# Check if services are running
docker-compose ps  # If using Docker
# OR
sudo systemctl status compass-backend  # If using systemd

# Check logs for errors
docker-compose logs backend | tail -50
docker-compose logs web | tail -50
```

### Step 10: Test Production Site

1. Visit https://compass.interactiveyouthtransport.com
2. Test login functionality
3. Test core features (create trip, view trips, etc.)
4. Check browser console for errors
5. Test on mobile device if applicable

---

## 🔄 Rollback Procedure

If something goes wrong and you need to rollback:

### Option 1: Git Rollback (Recommended)

```bash
# SSH into server
ssh root@your-server-ip

# Navigate to project
cd /path/to/project

# Check git log to find previous working commit
git log --oneline

# Reset to previous commit (replace COMMIT_HASH with actual hash)
git reset --hard COMMIT_HASH

# Rebuild and restart
docker-compose build
docker-compose down
docker-compose up -d
```

### Option 2: Use LIVE-snapshot Branch

```bash
# On server, switch to LIVE-snapshot (only for emergency rollback!)
git checkout LIVE-snapshot

# Rebuild and restart
docker-compose build
docker-compose down
docker-compose up -d
```

⚠️ **Warning:** Only use `LIVE-snapshot` for emergency rollbacks. Don't make changes on it.

---

## 📝 Post-Deployment Tasks

1. **Update server-improvements branch:**
   ```bash
   # On server
   git checkout server-improvements
   git merge production  # or whatever branch you deployed
   git push origin server-improvements
   ```

2. **Create a backup of LIVE-snapshot:**
   ```bash
   # On your local machine
   git checkout LIVE-snapshot
   git pull origin LIVE-snapshot
   git tag backup-$(date +%Y%m%d)
   git push origin backup-$(date +%Y%m%d)
   ```

3. **Document the deployment:**
   - Note what was deployed
   - Note any issues encountered
   - Note any configuration changes made

---

## 🔒 Security Checklist

Before deploying, verify:

- [ ] No API keys or secrets in code
- [ ] Environment variables are set on server (not in code)
- [ ] SSL/HTTPS is properly configured
- [ ] Database credentials are secure
- [ ] CORS is properly configured for production domain only
- [ ] Rate limiting is enabled (if applicable)

---

## 🚨 Emergency Procedures

### If Production Site is Down:

1. **Check server status:**
   ```bash
   ssh root@your-server-ip
   docker-compose ps  # or systemctl status
   ```

2. **Check logs:**
   ```bash
   docker-compose logs -f
   # or
   journalctl -u compass-backend -f
   ```

3. **Quick rollback:**
   ```bash
   git checkout LIVE-snapshot
   docker-compose down && docker-compose up -d
   ```

4. **If database issues:**
   ```bash
   # Check database connection
   psql -U username -d database_name
   
   # Check if database is running
   sudo systemctl status postgresql
   ```

---

## 📞 Contact Information

If you encounter issues during deployment:

1. Check server logs first
2. Review recent commits for breaking changes
3. Consider rolling back to previous working version
4. Document the issue for future reference

---

## 🎯 Best Practices

1. **Always test locally first** - Don't deploy untested code
2. **Deploy during low-traffic hours** - Less impact if issues occur
3. **Have a rollback plan** - Know how to revert quickly
4. **Keep deployment branches** - Makes it easier to track what's deployed
5. **Document deployments** - Note what changed and when
6. **Never modify LIVE-snapshot** - It's your safety net
7. **Backup before major changes** - Create tags or branches before big deployments

---

## 🔍 Troubleshooting Common Issues

### Docker Issues

**Containers won't start:**
```bash
docker-compose logs backend
docker-compose logs web
docker ps -a  # Check all containers
```

**Port conflicts:**
```bash
netstat -tulpn | grep :80
netstat -tulpn | grep :443
netstat -tulpn | grep :8000
```

### Database Issues

**Connection errors:**
- Verify DATABASE_URL in `backend/.env.production`
- Check PostgreSQL is running: `sudo systemctl status postgresql`
- Verify firewall rules allow database connections

### Frontend Issues

**Build fails:**
```bash
cd frontend
npm install
npm run build
# Check error messages
```

**404 errors on routes:**
- Verify Nginx configuration for SPA routing
- Check that `dist/` folder has built files

---

## 📚 Additional Resources

- **DigitalOcean Documentation**: https://www.digitalocean.com/docs/
- **Docker Documentation**: https://docs.docker.com/
- **Nginx Documentation**: https://nginx.org/en/docs/

