# Metrics Collection Monitoring Guide

## Overview

Raven collects system metrics (CPU, memory, network) every 10 seconds and stores them in the project database. These metrics are essential for monitoring system health and detecting performance issues.

## How Metrics Collection Works

1. **MetricsCollector Service** (`backend/metrics-collector.js`)
   - Started automatically when the Raven server starts
   - Collects metrics every 10 seconds (configurable via `METRICS_INTERVAL_MS` env var)
   - Stores metrics in the `raven_metrics` table

2. **Database Location**
   - Metrics are stored in the **first project database** (alphabetically)
   - Usually `~/.raven/db/<first-project>.db`
   - Check with: `ls -t ~/.raven/db/*.db | head -1`

3. **Health Checks**
   - Metrics are considered "stale" if older than 5 minutes
   - Health check runs automatically every 30 seconds
   - Accessible via API at `/api/health-checks`

## How to Check if Metrics Collection is Running

### Method 1: Use the Health Check Script (Recommended)

```bash
cd /home/seth/Projects/raven
./scripts/check-metrics-health.sh
```

This script will:
- ✓ Verify Raven is running
- ✓ Check API health status
- ✓ Query database directly for latest metrics
- ✓ Show age of latest metric
- ✓ Count recent activity

### Method 2: Query the API

```bash
curl -s http://localhost:3030/api/health-checks | jq '.checks[] | select(.name == "System Metrics Collection")'
```

Expected output when healthy:
```json
{
  "name": "System Metrics Collection",
  "category": "system",
  "passed": true,
  "message": "System metrics collection active (latest: 0m ago)"
}
```

### Method 3: Check the Database Directly

First, find which database stores metrics:
```bash
FIRST_DB=$(ls -t ~/.raven/db/*.db | head -1)
echo "Metrics database: $FIRST_DB"
```

Then check latest metrics:
```bash
sqlite3 "$FIRST_DB" "SELECT timestamp, cpu_percent, memory_percent FROM raven_metrics ORDER BY timestamp DESC LIMIT 5;"
```

Check recent activity:
```bash
sqlite3 "$FIRST_DB" "SELECT COUNT(*) FROM raven_metrics WHERE timestamp > datetime('now', '-5 minutes');"
```

### Method 4: Check the Web UI

1. Open Raven at http://localhost:5173
2. Navigate to the **Dashboard** or **Project Health** section
3. Look for the "System Metrics Collection" status
4. Should show a green checkmark if active

## Troubleshooting

### Metrics Collection Stopped

If you see: `❌ Latest system metrics are X minutes old - metrics collection may be stalled`

**Solution:**
```bash
cd /home/seth/Projects/raven
raven restart
```

Then verify it's working:
```bash
./scripts/check-metrics-health.sh
```

### No Metrics in Database

**Check if MetricsCollector started:**
```bash
grep "Starting real-time metrics collector" /tmp/raven-backend.log
```

**Check for errors:**
```bash
grep -i "error.*metric" /tmp/raven-backend.log
```

### Wrong Database Being Checked

Metrics are always stored in the **first** project database from the Map. To check which one:
```bash
ls -lt ~/.raven/db/*.db | head -3
```

The most recently modified database is usually receiving the metrics.

## Setting Up Automated Monitoring

### Option 1: Cron Job

Add to your crontab (`crontab -e`):
```bash
# Check metrics health every 15 minutes
*/15 * * * * /home/seth/Projects/raven/scripts/check-metrics-health.sh || echo "Metrics collection failed" | mail -s "Raven Alert" your@email.com
```

### Option 2: Systemd Timer

Create `/etc/systemd/user/raven-metrics-check.service`:
```ini
[Unit]
Description=Raven Metrics Health Check

[Service]
Type=oneshot
ExecStart=/home/seth/Projects/raven/scripts/check-metrics-health.sh
```

Create `/etc/systemd/user/raven-metrics-check.timer`:
```ini
[Unit]
Description=Run Raven Metrics Health Check every 15 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
```

Enable it:
```bash
systemctl --user daemon-reload
systemctl --user enable --now raven-metrics-check.timer
```

### Option 3: Watch Mode

For continuous monitoring during development:
```bash
watch -n 30 ./scripts/check-metrics-health.sh
```

## Understanding the Health Check

The health check looks for:

1. **Timestamp Freshness**: Latest metric must be < 5 minutes old
2. **Collection Rate**: ~6 metrics per minute (every 10 seconds)
3. **Database Writes**: Successfully writing to the database
4. **Session ID**: Matches current Raven session

## Configuration

### Change Collection Interval

Edit `~/.raven/config.toml` or set environment variable:
```bash
export METRICS_INTERVAL_MS=5000  # Collect every 5 seconds
```

Then restart:
```bash
raven restart
```

### Change Health Check Threshold

Edit `backend/health-checks.js:364`:
```javascript
if (ageMinutes > 5) {  // Change this threshold
```

## Metrics Storage

### Table Schema

```sql
CREATE TABLE raven_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  cpu_percent REAL,
  memory_percent REAL,
  memory_used_mb INTEGER,
  memory_total_mb INTEGER,
  network_rx_bytes INTEGER,
  network_tx_bytes INTEGER,
  session_id TEXT
);
```

### Querying Metrics

**CPU usage over last hour:**
```sql
SELECT timestamp, cpu_percent
FROM raven_metrics
WHERE timestamp > datetime('now', '-1 hour')
ORDER BY timestamp;
```

**Average memory usage:**
```sql
SELECT AVG(memory_percent) as avg_memory
FROM raven_metrics
WHERE timestamp > datetime('now', '-1 day');
```

**Metrics by session:**
```sql
SELECT session_id, COUNT(*) as count,
       MIN(timestamp) as start,
       MAX(timestamp) as end
FROM raven_metrics
GROUP BY session_id
ORDER BY start DESC;
```

## Related Files

- `backend/metrics-collector.js` - Main metrics collection service
- `backend/health-checks.js:353-388` - Health check implementation
- `backend/server.js:1939-1942` - MetricsCollector initialization
- `backend/db.js:436-444` - Database queries for metrics
- `scripts/check-metrics-health.sh` - Health check script

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Metrics stopped after server restart | MetricsCollector not initialized | `raven restart` |
| No metrics in raven.db | Metrics go to first DB (alphabetically) | Check `ant.db` or other project DBs |
| Health check shows stale | Server has been idle/sleeping | Normal - restart if actively using |
| High database size | Too many metrics stored | Implement cleanup/retention policy |

## Best Practices

1. **Run health check regularly** - Use cron or systemd timer
2. **Monitor database size** - Metrics can accumulate quickly
3. **Check after system sleep** - Restart Raven after system wake
4. **Set appropriate intervals** - 10s is good for development, consider 30-60s for production
5. **Backup metrics database** - Contains valuable historical data
