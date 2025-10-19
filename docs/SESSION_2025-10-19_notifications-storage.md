# Raven Development Session - October 19, 2025

## Session Overview
Added two major features to Raven: Notifications system and Storage management page.

## 1. Notifications System

### What Was Built
Complete notification system that aggregates alerts from multiple sources across Raven.

### Backend Implementation
- **Database**: Added notifications table with fields: id, timestamp, type, severity, title, message, read, metadata, session_id
- **API Endpoints** (6 total):
  - `GET /api/notifications` - Retrieve with filtering (type, severity, unread_only)
  - `GET /api/notifications/stats` - Get aggregated statistics
  - `POST /api/notifications/:id/read` - Mark individual as read
  - `POST /api/notifications/mark-all-read` - Mark all as read
  - `DELETE /api/notifications/:id` - Delete individual
  - `DELETE /api/notifications` - Clear all notifications
- **Auto-notification Creation**:
  - Errors with severity='error' automatically create critical notifications
  - Trigger events automatically create warning notifications
- **Modified TriggerEngine**: Now accepts database instance and creates notifications when triggers fire
- **Real-time Updates**: WebSocket events for instant notification delivery

### Frontend Implementation
- **NotificationsPanel.svelte**: Full-featured notification management UI
  - Stats bar: total, unread, errors, triggers, performance counts
  - Filtering: by type, severity, and read/unread status
  - Pagination with "Load More"
  - Expandable details showing metadata
  - Mark as read/unread functionality
  - Delete individual or clear all
  - Real-time updates via WebSocket
- **ErrorLog.svelte**: Dedicated error log viewer
- **errorLogger.js**: Global error handler for frontend
- **Integration**: Added to App.svelte navigation, keyboard shortcut '9'

### Notification Types
- error (critical severity)
- trigger (warning severity)
- performance (planned)
- git (planned)
- agent (planned)
- file (planned)
- system (planned)

## 2. Storage Management Page

### What Was Built
Comprehensive storage dashboard showing all databases, snapshots, and files with detailed statistics.

### Backend Implementation
- **API Endpoint**: `GET /api/storage`
- **Returns**:
  - Total .raven directory size
  - All database files with sizes, record counts, table breakdowns
  - Per-table statistics showing size distribution
  - Snapshot directories with file counts and date ranges
  - Config and log file sizes
  - Active project highlighting

### Frontend Implementation
- **StoragePanel.svelte**: Detailed storage visualization
  - **Overview Section**: Total size, database count, database storage, snapshots storage
  - **Database Table**: 
    - Shows all .db files with sizes, record counts, table counts
    - Expandable rows showing table-level breakdown
    - Progress bars showing percentage each table occupies
    - Active database badge
    - Status indicators (OK/Error)
  - **Snapshots Table**: All snapshot directories with file counts, oldest/newest timestamps
  - **Other Files**: Config.toml and triggers.log sizes
  - **Actions**: Refresh button (working), placeholders for Export/Clean/Configure
  - **Auto-refresh**: Every 30 seconds
- **Integration**: Added to App.svelte navigation, keyboard shortcut '0'

### Current Storage Stats (as of session)
- **Total Size**: 22 MB
- **Databases**: 6 (raven.db + 5 project databases)
  - raven.db: 8.2 MB with 71,613 records
    - raven_metrics: 37,028 records (3.9 MB) - 48%
    - process_metrics: 34,127 records (3.9 MB) - 48%
    - events: 418 records (360 KB)
  - Project databases: 1.5 MB total (cdev, ant312, recall, echo, libre)
- **Snapshots**: 8 MB across 6 project directories
  - raven/: 379 files (7.7 MB)
- **Other**: triggers.log (11 KB), config.toml (2.2 KB)

### Growth Analysis
- **Current Rate**: ~5.5 MB/day
  - Metrics: ~43,000 records/day (collected every 2 seconds)
  - Snapshots: ~500 KB/day
- **Projections**:
  - 30 days: ~187 MB
  - 90 days: ~500 MB
  - 1 year: ~2 GB

### Critical Discovery: No Automatic Cleanup
**IMPORTANT**: Storage is growing indefinitely with NO automatic cleanup:
- Config specifies `retention_days = 7` in config.toml
- Manual cleanup endpoint exists: `POST /api/database/clear-old/:days`
- **BUT**: Neither is enforced automatically
- No scheduled jobs, no cron tasks, no cleanup intervals
- Snapshots, metrics, logs all accumulate forever

### Recommendations Made (Not Implemented)
1. **High Priority**:
   - Add metrics retention policy (delete > 7 days)
   - Verify snapshot retention works
   - Add database stats API to dashboard
2. **Medium Priority**:
   - Project database cleanup for inactive projects
   - Compress snapshots older than 24 hours
   - Fix loose snapshot files in root directory
3. **Low Priority**:
   - Consider time-series database for metrics
   - Aggregate old metrics to hourly/daily summaries

## 3. Additional Improvements
- **timeFormat.js**: Utility for consistent date formatting across all components
- **STYLE_GUIDE.md**: Comprehensive documentation of Raven's design system
  - Color schemes for all three themes (Day/Dusk/Night)
  - Typography scale
  - Component patterns
  - Spacing and layout guidelines
- **Updated all frontend components**: Consistent styling and formatting

## 4. Future Work Discussed

### Archive/Sync Strategy
User wants to:
- Keep 7 days local
- Sync old data to server or Google Drive for historical purposes
- Raven project data only (not other projects)

Recommended approach:
- Daily export of records older than 7 days
- Compress to .db.gz archives
- POST to user's server endpoint
- Keep local archive copies in .raven/archives/
- Delete old records from live database after successful sync

Configuration approach:
```toml
[archive]
enabled = true
retention_days = 7
destination = "server"
server_url = "https://myserver.com/raven/upload"
server_auth_token = "your-secret-token"
keep_local_copies = true
```

**Decision**: Storage page built first for visibility, archiving to be implemented later.

## Files Changed
- backend/db.js - Added notifications table and methods
- backend/server.js - Added notifications, error logging, and storage endpoints
- backend/trigger-engine.js - Added database support for notification creation
- frontend/src/App.svelte - Added notifications and storage navigation
- frontend/src/lib/NotificationsPanel.svelte - New component
- frontend/src/lib/StoragePanel.svelte - New component
- frontend/src/lib/ErrorLog.svelte - New component
- frontend/src/lib/errorLogger.js - New utility
- frontend/src/lib/timeFormat.js - New utility
- docs/STYLE_GUIDE.md - New documentation
- docs/STYLE_GUIDE.html - Generated HTML version
- Plus updates to all other frontend components for consistency

## Git Commit
- Commit: 6927365
- Pushed to: github.com/seheart/raven
- Added: 5,277 insertions, 42 deletions across 24 files

## Testing Results
- ✅ Notifications API working correctly
- ✅ Error notifications auto-created
- ✅ Trigger notifications auto-created
- ✅ Stats tracking correctly
- ✅ Mark as read/unread working
- ✅ Filtering by type and unread status working
- ✅ Delete individual and clear all working
- ✅ Storage API returning comprehensive data
- ✅ Database table breakdowns accurate
- ✅ Snapshot statistics correct
- ✅ Auto-refresh working on Storage page

## Key Insights
1. Metrics dominate storage (94% of database size)
2. No retention policy enforcement is a ticking time bomb
3. Multi-project architecture creates some waste (empty databases still take space)
4. Snapshot retention config exists but isn't implemented
5. User only cares about Raven project data, other projects are incomplete

## Next Steps (When Ready)
1. Implement automatic retention/cleanup
2. Build archiving/sync system
3. Add export functionality to Storage page
4. Add cleanup button to Storage page
5. Consider aggregating old metrics instead of deleting
