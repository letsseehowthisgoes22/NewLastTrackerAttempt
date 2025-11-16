# Simple Deployment Guide

**Easy steps to move your local changes to production**

---

## 🚀 Quick Deployment (5 Steps)

### Step 1: Make Sure Everything Works Locally ✅
```bash
# Test your changes at http://localhost:5173
# Make sure everything works before deploying
```

### Step 2: Commit Your Changes
```bash
cd /Users/bobbytredinnick/Documents/Dev-Projects/LastIYTTrackingAttempt

# Make sure you're on Sandbox branch
git checkout Sandbox

# Commit your changes
git add .
git commit -m "Description of what you changed"

# Push to GitHub
git push origin Sandbox
```

### Step 3: SSH to Production Server
```bash
ssh root@64.23.144.61
# (or whatever your server IP/hostname is)
```

### Step 4: Pull Your Changes
```bash
# Find project directory (common locations):
cd /root/compass
# OR
cd /var/www/compass
# OR wherever your project is

# Make sure you're NOT on LIVE-snapshot branch
git checkout server-improvements
# or whatever branch you deploy from

# Pull your Sandbox changes
git fetch origin
git merge origin/Sandbox
```

### Step 5: Restart Services
```bash
# If using Docker:
docker-compose down
docker-compose build
docker-compose up -d

# OR if using manual setup:
# Restart backend service
# Rebuild frontend: cd frontend && npm run build
```

**Done!** Your changes are now live. ✅

---

## 📋 Pre-Deployment Checklist

Before deploying, verify:

- [ ] Changes work locally (tested at http://localhost:5173)
- [ ] All changes committed to `Sandbox` branch
- [ ] Changes pushed to GitHub
- [ ] You have SSH access to production server
- [ ] You know where the project is located on server

---

## ⚠️ Important Notes

1. **Always test locally first** - Never deploy untested code
2. **Deploy during low-traffic hours** if possible
3. **Keep `LIVE-snapshot` branch untouched** - It's your safety net
4. **Backup first** if making major changes:
   ```bash
   # On server
   git checkout LIVE-snapshot
   git tag backup-$(date +%Y%m%d)
   git push origin backup-$(date +%Y%m%d)
   ```

---

## 🔄 Rollback (If Something Goes Wrong)

If you need to quickly rollback:

```bash
# SSH to server
ssh root@64.23.144.61

# Navigate to project
cd /path/to/project

# Switch to LIVE-snapshot (last known good version)
git checkout LIVE-snapshot

# Rebuild and restart
docker-compose down && docker-compose up -d
```

Production is now back to the last stable version.

---

## 🎯 Common Deployment Scenarios

### Small Change (Bug Fix, UI Update)
1. Fix locally ✅
2. Test locally ✅
3. Commit and push ✅
4. SSH, pull, restart ✅
5. **Time: ~5 minutes**

### New Feature
1. Develop and test locally ✅
2. Commit and push ✅
3. SSH, pull, restart ✅
4. Verify on production ✅
5. **Time: ~10 minutes**

### Major Update
1. Test thoroughly locally ✅
2. Backup production (create tag) ✅
3. Deploy during low-traffic hours ✅
4. Monitor for issues ✅
5. Rollback if needed ✅
6. **Time: ~20-30 minutes**

---

## 💡 Tips for Easy Deployment

1. **Test everything locally first** - Catch bugs before production
2. **Commit frequently** - Small commits are easier to deploy and rollback
3. **Use descriptive commit messages** - Easier to track what changed
4. **Deploy during off-hours** - Less impact if issues arise
5. **Keep deployment simple** - If it's complicated, document it

---

## 🚨 Emergency Deployment

If you need to deploy a critical fix immediately:

1. **Fix locally** (if possible, test quickly)
2. **Commit and push**
3. **SSH to server**
4. **Pull latest**
5. **Restart services**
6. **Monitor logs** for errors

**Time: 2-3 minutes** (if everything is tested)

---

## ✅ Summary

**Deploying is easy:**
1. Commit to `Sandbox` ✅
2. Push to GitHub ✅
3. SSH and pull ✅
4. Restart services ✅

**That's it!** Your changes are live.

The key is: **Test locally, deploy confidently**. 🚀

