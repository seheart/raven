# Updating Raven

This guide helps you update Raven after pulling new changes from GitHub.

## 🔄 Standard Update Process

After running `git pull`, follow these steps:

```bash
# 1. Update backend dependencies and rebuild
cd backend
npm install  # Automatically runs 'npm run build' via postinstall hook
cd ..

# 2. Update frontend dependencies
cd frontend
npm install
cd ..

# 3. Restart Raven
./restart.sh
```

## ⚡ Quick Update (Most Cases)

In most cases, the simplified process works:

```bash
git pull origin master
./restart.sh
```

The start script will automatically detect if the backend needs rebuilding and handle it for you.

## 🔧 Troubleshooting Updates

### "Cannot find module './dist/modules/git.js'"

**Cause:** Backend TypeScript not compiled after update.

**Fix:**
```bash
cd backend
npm run build
cd ..
./start.sh
```

### "better_sqlite3.node was compiled against different Node.js version"

**Cause:** Node.js version changed, native modules need rebuilding.

**Fix:**
```bash
cd backend
npm rebuild better-sqlite3
# Or rebuild all native modules:
npm rebuild
cd ..
./start.sh
```

### "Module not found" or other dependency errors

**Cause:** New dependencies added in update.

**Fix:**
```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
./restart.sh
```

### Database Migration Needed

**Cause:** Database schema changes in update.

**Fix:**
```bash
cd backend
node run-migrations.js up
cd ..
./restart.sh
```

Check `CHANGELOG.md` for migration requirements in each release.

## 📋 After Major Version Updates

For major version updates (e.g., v1.x.x → v2.0.0), follow the extended process:

```bash
# 1. Stop Raven
./stop.sh

# 2. Backup your data
cp -r .raven/db .raven/db.backup-$(date +%Y%m%d)

# 3. Pull updates
git pull origin master

# 4. Clean install dependencies
cd backend
rm -rf node_modules package-lock.json
npm install
cd ../frontend
rm -rf node_modules package-lock.json
npm install
cd ..

# 5. Run migrations
cd backend && node run-migrations.js up && cd ..

# 6. Start Raven
./start.sh
```

## 🆕 What's New?

Check these files to see what changed:

- `CHANGELOG.md` - Detailed change log
- `README.md` - Updated features and documentation
- Release notes on GitHub

## 🐛 Still Having Issues?

1. Check the logs:
   ```bash
   tail -f /tmp/raven-backend.log
   tail -f /tmp/raven-frontend.log
   ```

2. See `docs/TROUBLESHOOTING.md` for common issues

3. Create an issue on GitHub: https://github.com/seheart/raven/issues

## 📝 Version History

To see your current version:

```bash
# Backend version
cd backend && node -e "console.log(require('./package.json').version)"

# Check git tag
git describe --tags
```

## 🔐 Environment Changes

If the update adds new environment variables:

1. Check `backend/.env.example` for new variables
2. Update your `backend/.env` file accordingly
3. Restart Raven

## ♻️ Clean Slate (Nuclear Option)

If all else fails, start fresh (preserves your data):

```bash
# 1. Backup data
cp -r .raven/db ~/raven-backup

# 2. Clean everything
./stop.sh
rm -rf backend/node_modules backend/dist
rm -rf frontend/node_modules frontend/dist

# 3. Reinstall
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 4. Start fresh
./start.sh
```

---

**Last Updated:** v1.3.0
**Effective From:** October 26, 2025
