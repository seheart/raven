# Troubleshooting Guide

Common issues and solutions for Raven AI Agent Monitor.

## 🚨 Build & Startup Issues

### "Cannot find module './dist/modules/git.js'"

**Cause:** TypeScript files not compiled to JavaScript.

**Solution:**
```bash
cd backend
npm run build
cd ..
./start.sh
```

**Prevention:** The postinstall hook should build automatically. If you're seeing this, run:
```bash
cd backend
npm install  # Should trigger postinstall → build
```

---

### "better_sqlite3.node was compiled against different Node.js version"

**Cause:** Native module compiled for different Node.js version.

**Solution:**
```bash
cd backend
npm rebuild better-sqlite3

# Or rebuild all native modules:
npm rebuild
cd ..
./start.sh
```

**Why it happens:** Native modules (C++ addons) must be compiled for your specific Node.js version.

---

### "lsof: command not found"

**Cause:** System tool not installed (cosmetic warning only).

**Impact:** Non-critical - startup script still works

**Solution (optional):**
```bash
# Arch Linux
sudo pacman -S lsof

# Ubuntu/Debian
sudo apt-get install lsof

# macOS (should be pre-installed)
# If missing: brew install lsof
```

**Note:** The startup script now has fallbacks for `ss` and `netstat`, so this warning can be safely ignored.

---

### "Backend failed to start (check /tmp/raven-backend.log)"

**Cause:** Various backend startup issues.

**Diagnosis:**
```bash
# Check the log for errors
tail -50 /tmp/raven-backend.log

# Common issues to look for:
# 1. Port 3030 already in use
# 2. Database permissions
# 3. Missing dependencies
# 4. TypeScript not compiled
```

**Solutions:**

**Port in use:**
```bash
# Find what's using port 3030
lsof -i :3030
# OR
ss -tlnp | grep 3030

# Kill the process
kill -9 <PID>
```

**Database permissions:**
```bash
# Check .raven directory
ls -la .raven/db/
chmod -R 755 .raven/
```

**Missing dependencies:**
```bash
cd backend
rm -rf node_modules
npm install
```

---

### "Frontend failed to start (check /tmp/raven-frontend.log)"

**Cause:** Frontend Vite server issues.

**Diagnosis:**
```bash
tail -50 /tmp/raven-frontend.log
```

**Common fixes:**
```bash
# 1. Port 5173 in use
lsof -i :5173 && kill -9 <PID>

# 2. Missing node_modules
cd frontend
rm -rf node_modules
npm install

# 3. Stale Vite cache
rm -rf frontend/.vite
rm -rf frontend/node_modules/.vite
```

---

## 📦 Dependency Issues

### "Module not found" errors

**Solution:**
```bash
# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Both
cd backend && npm install && cd .. && cd frontend && npm install && cd ..
```

---

### npm install hangs or fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete lock files and reinstall
rm package-lock.json
rm -rf node_modules
npm install
```

---

### "EACCES: permission denied"

**Cause:** npm trying to install global packages without permission.

**Solution:**
```bash
# Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Or use sudo (not recommended)
sudo npm install
```

---

## 🗄️ Database Issues

### "database is locked"

**Cause:** Multiple processes accessing the same database file.

**Solution:**
```bash
# Stop Raven completely
./stop.sh

# Wait a moment
sleep 2

# Start fresh
./start.sh
```

---

### "no such table: events"

**Cause:** Database not initialized or corrupted.

**Solution:**
```bash
# Backup first
cp -r .raven/db .raven/db.backup

# Delete database (will recreate)
rm .raven/db/raven.db*

# Restart (will initialize fresh database)
./restart.sh
```

---

### Database growing too large

**Solution:**
```bash
# Check size
ls -lh .raven/db/raven.db

# Optimize database (run VACUUM)
sqlite3 .raven/db/raven.db "VACUUM;"

# Or use storage API
curl -X POST http://localhost:3030/api/storage/optimize
```

---

## 🌐 Network & Connection Issues

### Cannot access http://localhost:5173

**Checks:**
```bash
# 1. Is frontend running?
curl http://localhost:5173
ps aux | grep vite

# 2. Is port correct?
cat /tmp/raven-frontend.log | grep "Local:"

# 3. Firewall blocking?
# Temporarily disable firewall to test
```

---

### WebSocket connection failed

**Symptoms:** Real-time updates not working

**Checks:**
```bash
# Backend running and healthy?
curl http://localhost:3030/health

# WebSocket endpoint accessible?
wscat -c ws://localhost:3030

# Check browser console for errors
```

**Solution:**
```bash
# Restart Raven
./restart.sh

# Clear browser cache
# Press Ctrl+Shift+Delete in browser
```

---

## 🧪 Testing Issues

### Tests failing after update

**Solution:**
```bash
cd backend

# Clear jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules
npm install

# Run tests
npm test
```

---

### "Cannot find module" in tests

**Cause:** Test imports using wrong paths.

**Check:**
```bash
# Tests should use .js extensions for ESM
import { func } from './module.js';  // ✅ Correct
import { func } from './module';      // ❌ Wrong for ESM
```

---

## 🎨 Frontend Issues

### UI not updating / stale data

**Solution:**
```bash
# 1. Hard refresh
# Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)

# 2. Clear browser cache
# Browser DevTools → Application → Clear storage

# 3. Restart backend (may be WebSocket issue)
./restart.sh
```

---

### Vite HMR (Hot Module Replacement) not working

**Solution:**
```bash
cd frontend

# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

---

## 🔧 Development Issues

### ESLint errors blocking commits

**Cause:** Pre-commit hooks running linting.

**Quick fix (not recommended):**
```bash
git commit --no-verify -m "message"
```

**Proper fix:**
```bash
# Fix linting errors
cd backend && npm run lint:fix && cd ..
cd frontend && npm run lint:fix && cd ..

# Then commit
git commit -m "message"
```

---

### TypeScript compilation errors

**Diagnosis:**
```bash
cd backend
npm run type-check
```

**Common fixes:**
```bash
# Update @types packages
npm install --save-dev @types/node@latest

# Clear TypeScript cache
rm -rf dist
npm run build
```

---

## 🚀 Performance Issues

### Slow startup

**Causes & Solutions:**

1. **First-time build:** Normal - TypeScript compilation takes time
2. **Large database:** Run VACUUM to optimize
3. **Too many files watched:** Adjust ignore patterns in config

---

### High memory usage

**Diagnosis:**
```bash
# Check Raven process memory
ps aux | grep "node.*raven" | awk '{print $6}'

# Monitor in real-time
watch -n 1 'ps aux | grep "node.*raven"'
```

**Solutions:**
```bash
# 1. Restart Raven
./restart.sh

# 2. Reduce retention period
# Edit backend/.env:
SNAPSHOT_TTL_DAYS=7  # Reduce from 30

# 3. Clean old events
curl -X POST http://localhost:3030/api/storage/clean
```

---

## 📝 Logging Issues

### Can't find logs

**Log locations:**
- Backend: `/tmp/raven-backend.log`
- Frontend: `/tmp/raven-frontend.log`
- Bridge: `/tmp/claude-telemetry-bridge.log`

**View logs:**
```bash
# Real-time
tail -f /tmp/raven-backend.log

# Last 100 lines
tail -100 /tmp/raven-backend.log

# Search logs
grep -i "error" /tmp/raven-backend.log
```

---

### Logs filling disk

**Solution:**
```bash
# Clear logs
> /tmp/raven-backend.log
> /tmp/raven-frontend.log
> /tmp/claude-telemetry-bridge.log

# Or rotate logs
mv /tmp/raven-backend.log /tmp/raven-backend.log.old
./restart.sh
```

---

## 🆘 Last Resort: Nuclear Option

If nothing else works, start completely fresh:

```bash
# 1. Stop Raven
./stop.sh

# 2. Backup data
cp -r .raven ~/raven-data-backup-$(date +%Y%m%d)

# 3. Clean everything
rm -rf backend/node_modules backend/dist backend/package-lock.json
rm -rf frontend/node_modules frontend/dist frontend/package-lock.json
rm -rf node_modules package-lock.json

# 4. Reinstall
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 5. Start fresh
./start.sh
```

---

## 📚 Additional Resources

- [UPDATING.md](UPDATING.md) - Update procedures
- [docs/SETUP.md](docs/SETUP.md) - Installation guide
- [docs/TESTING.md](docs/TESTING.md) - Running tests
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guide
- [GitHub Issues](https://github.com/seheart/raven/issues) - Report bugs

---

## 💬 Getting Help

Still stuck?

1. **Check GitHub Issues:** https://github.com/seheart/raven/issues
2. **Create new issue:** Include:
   - Raven version (`git describe --tags`)
   - Node.js version (`node --version`)
   - OS and version
   - Error messages from logs
   - Steps to reproduce

---

**Last Updated:** v1.3.0
**Date:** October 26, 2025
