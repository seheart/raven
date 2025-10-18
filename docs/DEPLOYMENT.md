# Raven Deployment Guide

**Version:** 0.6.0
**Architecture:** Web Application (Node.js + Svelte)
**Last Updated:** 2025-10-18

---

## 🎯 Quick Start (Development)

The fastest way to get Raven running locally:

```bash
# 1. Clone the repository
git clone https://github.com/seheart/raven.git
cd raven

# 2. Start the backend server (Terminal 1)
cd backend
npm install
npm start

# 3. Start the frontend dev server (Terminal 2)
cd frontend
npm install
npm run dev

# 4. Open your browser
# Backend:  http://localhost:3030
# Frontend: http://localhost:5173
```

**Expected output:**

```
Backend Terminal:
╔════════════════════════════════════════════════╗
║           🐦‍⬛ Raven Backend Server              ║
╠════════════════════════════════════════════════╣
║  Port:       3030                              ║
║  WebSocket:  ✅ Enabled                         ║
║  Session:    [UUID]                            ║
║  Database:   .raven/db/raven.db               ║
║  Status:     ✅ Ready to receive telemetry     ║
╚════════════════════════════════════════════════╝

Frontend Terminal:
  VITE v5.x.x  ready in XXX ms
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## 📋 System Requirements

### Development

| Component | Requirement |
|-----------|------------|
| **Node.js** | v20.x or higher |
| **npm** | v10.x or higher |
| **Operating System** | Linux, macOS, or Windows |
| **RAM** | 2GB minimum (4GB recommended) |
| **Disk Space** | 500MB for dependencies + database |

### Production

| Component | Requirement |
|-----------|------------|
| **Server** | VPS or dedicated server |
| **Node.js** | v20.x or higher (LTS recommended) |
| **Process Manager** | PM2 or systemd |
| **Reverse Proxy** | nginx or Apache (optional) |
| **SSL Certificate** | Let's Encrypt or commercial (optional) |

---

## 🚀 Production Deployment

### Option 1: Combined Server (Single Process)

Deploy both backend and frontend from a single server.

**Step 1: Build the frontend**

```bash
cd frontend
npm install
npm run build
```

This creates a `frontend/dist/` directory with static files.

**Step 2: Serve frontend from backend**

Update `backend/server.js` to serve static files:

```javascript
// Add after middleware setup (around line 26)
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static frontend files
app.use(express.static(join(__dirname, '..', 'frontend', 'dist')));

// Catch-all route for frontend (must be after API routes)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});
```

**Step 3: Start with PM2**

```bash
cd backend
npm install -g pm2
pm2 start server.js --name raven-backend
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

**Step 4: Access the application**

Visit `http://your-server-ip:3030`

### Option 2: Separate Processes (Recommended)

Run backend and frontend as separate processes.

**Backend Setup:**

```bash
cd backend
npm install --production
pm2 start server.js --name raven-backend
```

**Frontend Setup:**

```bash
cd frontend
npm install
npm run build

# Serve with nginx (see nginx config below)
# OR
# Serve with a simple HTTP server
npx http-server dist -p 5173
```

**PM2 Configuration File (`ecosystem.config.js`):**

```javascript
module.exports = {
  apps: [
    {
      name: 'raven-backend',
      script: './backend/server.js',
      cwd: '/path/to/raven',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3030
      }
    }
  ]
};
```

---

## 🌐 Nginx Reverse Proxy (Optional)

### Basic Configuration

Create `/etc/nginx/sites-available/raven`:

```nginx
server {
    listen 80;
    server_name raven.yourdomain.com;

    # Frontend (static files)
    location / {
        root /path/to/raven/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket endpoint
    location /socket.io {
        proxy_pass http://localhost:3030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3030;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/raven /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL/HTTPS Configuration (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d raven.yourdomain.com
```

Nginx will automatically update the config file with SSL settings.

---

## 🔐 Environment Variables

### Backend Variables

Create a `.env` file in the `backend/` directory:

```bash
# Server Configuration
PORT=3030
NODE_ENV=production

# Database
DB_PATH=../.raven/db/raven.db

# CORS (if frontend is on different domain)
CORS_ORIGIN=https://raven.yourdomain.com

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true

# Metrics Collection
METRICS_INTERVAL_MS=1000

# Session ID (optional - auto-generated if not set)
# SESSION_ID=custom-session-id
```

Load with `dotenv`:

```bash
npm install dotenv
```

Update `backend/server.js`:

```javascript
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 3030;
```

### Frontend Variables

Create a `.env` file in the `frontend/` directory:

```bash
# API Base URL
VITE_API_URL=http://localhost:3030

# WebSocket URL
VITE_WS_URL=ws://localhost:3030

# Production
# VITE_API_URL=https://raven.yourdomain.com
# VITE_WS_URL=wss://raven.yourdomain.com
```

Access in Svelte:

```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3030';
```

---

## 🐳 Docker Deployment (Optional)

### Dockerfile (Backend)

Create `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3030

CMD ["node", "server.js"]
```

### Dockerfile (Frontend)

Create `frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### Docker Compose

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3030:3030"
    volumes:
      - ./.raven:/app/.raven
    environment:
      - NODE_ENV=production
      - PORT=3030
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
```

**Deploy:**

```bash
docker-compose up -d
```

---

## 📊 Monitoring & Health Checks

### Health Check Endpoint

```bash
curl http://localhost:3030/health
```

**Expected Response:**

```json
{
  "status": "healthy",
  "session_id": "3dd27d94-d98d-4169-a061-85299c6ac4cc",
  "uptime": 12345.67,
  "active_agents": 0,
  "database": "/path/to/raven.db"
}
```

### PM2 Monitoring

```bash
pm2 status
pm2 logs raven-backend
pm2 monit
```

### Log Files

Backend logs are written to:
- Console (stdout/stderr)
- PM2 logs: `~/.pm2/logs/`
- Custom log file (if enabled in config.toml)

---

## 🔧 Configuration Files

### Backend Configuration

Edit `.raven/config.toml` to customize:

```toml
[monitoring]
watch_path = "../test_workspace"  # Directory to monitor
debounce_ms = 50                   # File change debounce

[metrics]
enabled = true
interval_seconds = 2               # Metrics collection interval

[triggers.large_edit]
file = "*.js"
lines_changed = ">100"
message = "Large edit detected: {file}"
```

### Frontend Configuration

Edit `frontend/vite.config.js` for build settings:

```javascript
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3030',
      '/socket.io': {
        target: 'ws://localhost:3030',
        ws: true
      }
    }
  }
});
```

---

## 🛠️ Troubleshooting

### Backend Won't Start

**Error:** `Error: listen EADDRINUSE: address already in use :::3030`

**Solution:**

```bash
# Find process using port 3030
lsof -i :3030

# Kill the process
kill -9 <PID>

# OR change port in backend/server.js
const PORT = 3031;
```

### Frontend Can't Connect to Backend

**Error:** `Failed to fetch` or WebSocket connection errors

**Solution:**

1. Check backend is running: `curl http://localhost:3030/health`
2. Verify CORS settings in `backend/server.js`
3. Check frontend API URL in `.env` or code
4. Check browser console for errors

### Database Errors

**Error:** `SQLite database locked`

**Solution:**

```bash
# Close all connections to database
pm2 stop raven-backend

# Check for lock files
ls -la .raven/db/

# Remove lock files (if safe)
rm .raven/db/raven.db-shm
rm .raven/db/raven.db-wal

# Restart
pm2 start raven-backend
```

### High Memory Usage

**Issue:** Backend using >500MB RAM

**Solution:**

1. Check metrics collection interval (default: 1s)
2. Reduce interval in `.raven/config.toml`:
   ```toml
   [metrics]
   interval_seconds = 5  # Slower collection
   ```
3. Limit database size:
   ```bash
   # Clean old metrics
   sqlite3 .raven/db/raven.db "DELETE FROM raven_metrics WHERE timestamp < datetime('now', '-7 days');"
   ```

### WebSocket Disconnections

**Issue:** WebSocket keeps disconnecting

**Solution:**

1. Check nginx timeout settings (if using reverse proxy)
2. Add to nginx config:
   ```nginx
   proxy_read_timeout 86400;
   proxy_send_timeout 86400;
   ```
3. Check firewall rules
4. Increase Socket.IO timeout in `backend/server.js`:
   ```javascript
   const io = new Server(httpServer, {
     pingTimeout: 60000,
     pingInterval: 25000
   });
   ```

---

## 📦 Backup & Restore

### Backup Database

```bash
# Create backup
sqlite3 .raven/db/raven.db ".backup .raven/db/raven.db.backup"

# OR copy file (stop backend first)
pm2 stop raven-backend
cp .raven/db/raven.db .raven/db/raven.db.backup.$(date +%Y%m%d)
pm2 start raven-backend
```

### Restore Database

```bash
pm2 stop raven-backend
cp .raven/db/raven.db.backup .raven/db/raven.db
pm2 start raven-backend
```

### Automated Backups (Cron)

Add to crontab:

```bash
crontab -e

# Daily backup at 2 AM
0 2 * * * cd /path/to/raven && sqlite3 .raven/db/raven.db ".backup .raven/db/backups/raven.db.$(date +\%Y\%m\%d)"
```

---

## 🚀 Performance Optimization

### Backend Optimizations

1. **Enable gzip compression:**

```javascript
import compression from 'compression';
app.use(compression());
```

2. **Add database indexes:**

```sql
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_agent_events_timestamp ON agent_events(timestamp);
CREATE INDEX idx_raven_metrics_timestamp ON raven_metrics(timestamp);
```

3. **Limit query results:**

```javascript
// Already implemented in server.js
const limit = parseInt(req.query.limit) || 100;
```

### Frontend Optimizations

1. **Build with production flags:**

```bash
npm run build -- --mode production
```

2. **Enable code splitting** (already configured in Vite)

3. **Use lazy loading for components** (implement if needed)

---

## 📈 Scaling Considerations

### Current Limits

- **Concurrent WebSocket Clients:** 100+
- **Events/Second:** ~1000
- **Database Size:** Tested up to 50MB
- **Memory Usage:** 50-150MB backend, 30-50MB frontend

### Future Scaling Options

1. **Horizontal Scaling:**
   - Run multiple backend instances
   - Use Redis for session storage
   - Load balance with nginx

2. **Database Scaling:**
   - Migrate to PostgreSQL for larger datasets
   - Implement data archiving
   - Add read replicas

3. **Caching:**
   - Redis for API responses
   - CDN for frontend assets

---

## 📝 Security Checklist

- [ ] Change default ports in production
- [ ] Enable HTTPS/SSL
- [ ] Set up firewall rules
- [ ] Implement authentication (JWT/OAuth)
- [ ] Rate limit API endpoints
- [ ] Secure database file permissions (chmod 600)
- [ ] Enable audit logging
- [ ] Regular security updates (npm audit)
- [ ] Backup encryption
- [ ] Environment variable protection

---

## 🔗 Additional Resources

- **Documentation:** [docs/](.)
- **Architecture:** [ARCHITECTURE.md](../ARCHITECTURE.md)
- **Setup Guide:** [SETUP.md](SETUP.md)
- **Testing Guide:** [TESTING.md](TESTING.md)
- **Feature Audit:** [FEATURES.md](FEATURES.md)

---

## 📞 Support

For deployment issues:
1. Check this guide
2. Review [ARCHITECTURE.md](../ARCHITECTURE.md)
3. Check GitHub Issues
4. Contact maintainer

---

**Last Updated:** 2025-10-18
**Version:** 0.6.0
**Architecture:** Web Application (Node.js + Svelte)
