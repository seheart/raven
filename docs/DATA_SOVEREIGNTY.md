# Data Sovereignty & Storage Architecture

**Raven's Core Philosophy: Your Data, Your Control**

---

## Why Raven is Different

Most developer tools today follow the "cloud-first" model: your data lives on someone else's servers, governed by their terms of service, subject to their pricing changes, and vulnerable to their service outages or business decisions.

**Raven takes a different approach.**

We believe developers should have **complete control** over their development data:
- ✅ **Local-first** - Raven runs entirely on your machine
- ✅ **Your server** - Backups go to infrastructure you own
- ✅ **Your rules** - No terms of service, no rate limits, no API restrictions
- ✅ **Your privacy** - No third parties ever see your code or activity
- ✅ **Your timeline** - Access your data anytime, even if Raven disappears

---

## The Problem with Cloud Services

### Google Drive / Dropbox
**Why we don't support them:**
- ❌ **Database corruption** - SQLite requires atomic writes; cloud sync causes conflicts
- ❌ **File locking issues** - Multiple sync clients create `.conflicted` copies
- ❌ **Privacy concerns** - Your code/data passes through their servers
- ❌ **Terms of Service** - They can ban your account, delete your data
- ❌ **Vendor lock-in** - Difficult to migrate away

### Commercial Cloud Storage (AWS S3, Google Cloud Storage, etc.)
**Why we avoid them:**
- ❌ **Costs add up** - Egress fees, API calls, storage tiers
- ❌ **Vendor lock-in** - Proprietary APIs, different pricing models
- ❌ **Complexity** - IAM policies, regions, access keys, SDKs
- ❌ **Privacy** - Data stored on their infrastructure
- ❌ **Service dependency** - If they change terms or pricing, you're stuck

---

## Raven's Approach: Developer-Owned Infrastructure

### Primary Storage: Local SQLite Databases

**Location:** `~/.raven/` or `<project>/.raven/`

Raven stores all data in **SQLite databases** on your local machine:

```
.raven/
├── db/
│   ├── raven.db         # Main project database
│   ├── cdev.db          # Another project
│   └── recall.db        # Recall project
├── snapshots/           # Historical snapshots
│   ├── raven/
│   │   └── 2025-10-20_113045/
│   └── cdev/
└── config/              # Configuration files
```

**Why SQLite?**
- ✅ **Zero configuration** - No database server to install
- ✅ **Single file** - Easy to backup, copy, migrate
- ✅ **Fast** - Faster than client-server databases for local access
- ✅ **Reliable** - Used by billions of devices (iOS, Android, browsers)
- ✅ **Portable** - Works on any platform
- ✅ **Self-contained** - No dependencies, no external processes

---

## Storage Architecture

### 1. Events Database

**Schema:**
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  timestamp TEXT,
  event_type TEXT,
  file TEXT,
  details TEXT
);

CREATE TABLE agent_events (
  id INTEGER PRIMARY KEY,
  timestamp TEXT,
  event_type TEXT,
  file TEXT,
  agent_name TEXT,
  metadata TEXT
);
```

**Purpose:** Records every file change, agent interaction, and system event.

**Retention:** Configurable (default: unlimited, can set retention policy)

**Size:** ~1-2 MB per day for typical development activity

---

### 2. Metrics Database

**Schema:**
```sql
CREATE TABLE raven_metrics (
  id INTEGER PRIMARY KEY,
  timestamp TEXT,
  project TEXT,
  cpu_percent REAL,
  memory_percent REAL,
  disk_usage_mb REAL
);

CREATE TABLE process_metrics (
  id INTEGER PRIMARY KEY,
  timestamp TEXT,
  project TEXT,
  process_name TEXT,
  cpu_percent REAL,
  memory_mb REAL
);
```

**Purpose:** System performance metrics collected every 2 seconds.

**Retention:** Default 7 days (configurable)

**Size:** ~3-4 MB per day (metrics are the largest data source)

---

### 3. Error Logs

**Schema:**
```sql
CREATE TABLE error_logs (
  id INTEGER PRIMARY KEY,
  timestamp TEXT,
  severity TEXT,
  message TEXT,
  component TEXT,
  error_type TEXT,
  stack TEXT
);
```

**Purpose:** Application errors and warnings.

**Retention:** 30 days default

**Size:** Minimal (~100 KB per day typical)

---

### 4. Snapshots

**Location:** `.raven/snapshots/<project>/<timestamp>/`

**Purpose:** Point-in-time backups of project state.

**Contents:**
- Database snapshot (SQLite file)
- File list at that moment
- Git commit hash (if applicable)
- Metadata (timestamp, project, size)

**Frequency:** Configurable (default: manual only)

**Size:** Depends on database size (typically 5-20 MB per snapshot)

---

## Data Growth & Management

### Typical Storage Usage

**Active Development (per project):**
- Day 1: 2-5 MB
- Week 1: 10-30 MB
- Month 1: 100-150 MB
- Year 1: 1-2 GB (with retention policies)

**With No Retention Policy:**
- Metrics alone: ~1.5 GB/year
- Events: ~500 MB/year
- Snapshots: Varies (depends on frequency)

### Retention Policies

**Configuration:** `~/.raven/config/retention.json`

```json
{
  "metrics": {
    "enabled": true,
    "days": 7
  },
  "events": {
    "enabled": false,
    "days": 365
  },
  "snapshots": {
    "enabled": true,
    "keep_last": 10
  }
}
```

**Default Behavior:**
- Metrics: Keep last 7 days
- Events: Keep forever
- Snapshots: Keep last 10
- Errors: Keep last 30 days

---

## Long-Term Storage: Your Own Server

### The Philosophy

**Why Your Own Server?**

1. **Full Control**
   - You decide retention policies
   - You decide access controls
   - You decide backup strategies
   - No one can lock you out

2. **Privacy**
   - Your development data never touches third-party services
   - No data mining, no analytics, no surveillance
   - Compliant with any privacy policy (yours)

3. **Cost-Effective**
   - $5/month VPS can store years of Raven data
   - No surprise egress fees
   - No per-GB charges
   - No API call limits

4. **Portable**
   - SSH + rsync work everywhere
   - No proprietary APIs to learn
   - Easy to migrate between providers
   - Works with any Linux server (cloud, home, NAS)

5. **Simple**
   - No SDKs to install
   - No IAM policies to configure
   - No regions to worry about
   - Standard Unix tools you already know

---

## Server Sync: How It Works

### Architecture

```
┌────────────────────────────────────────────┐
│  Your Development Machine                  │
│  ┌──────────────────────────────────────┐ │
│  │  Raven (Local)                       │ │
│  │  ~/.raven/db/*.db                    │ │
│  │  ~/.raven/snapshots/                 │ │
│  └──────────────┬───────────────────────┘ │
└─────────────────┼──────────────────────────┘
                  │
                  │ SSH + rsync (encrypted)
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Your VPS (DigitalOcean, Linode, etc.)    │
│  ┌──────────────────────────────────────┐ │
│  │  /home/you/raven-backups/            │ │
│  │    ├── raven/                        │ │
│  │    │   ├── db/                       │ │
│  │    │   └── snapshots/                │ │
│  │    ├── cdev/                         │ │
│  │    └── recall/                       │ │
│  └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

### Process

1. **Snapshot Creation** (optional)
   - Before sync, Raven can create a snapshot
   - Ensures database consistency
   - Snapshot includes timestamp and metadata

2. **File Selection**
   - By default: databases (.db files) + snapshots
   - Configurable: can include/exclude specific files
   - Ignores temporary files and logs

3. **Transfer via rsync**
   - Only uploads changed data (incremental)
   - Compressed during transfer
   - Atomic operations (no partial files)
   - Verifies checksums after transfer

4. **Verification**
   - Confirms successful upload
   - Logs sync status (time, size, success/failure)
   - Updates UI with last sync time

5. **Server Storage**
   - Files stored on your VPS
   - Organized by project
   - Full access anytime via SSH/SFTP

---

## Server Requirements

### Minimum VPS Specs

**For 1-3 projects:**
- CPU: 1 core (shared)
- RAM: 512 MB
- Storage: 10 GB
- Cost: $5/month

**Recommended VPS Specs:**
- CPU: 1-2 cores
- RAM: 1 GB
- Storage: 25-50 GB
- Cost: $5-10/month

### Supported Providers

**Any Linux VPS works.** Popular choices:

- **DigitalOcean** - $6/month (1GB RAM, 25GB SSD)
- **Linode** - $5/month (1GB RAM, 25GB SSD)
- **Vultr** - $5/month (1GB RAM, 25GB SSD)
- **Hetzner** - €4/month (2GB RAM, 40GB SSD) - Europe
- **Your home server** - Any Linux machine with SSH

**Or use existing infrastructure:**
- Development server you already rent
- Company server (if permitted)
- Home lab / Raspberry Pi
- NAS device with SSH (Synology, TrueNAS)

---

## Security

### SSH Key Authentication

Raven uses **SSH key authentication** (not passwords):

1. Generate dedicated key pair:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/raven-sync -C "raven-backup"
   ```

2. Copy public key to server:
   ```bash
   ssh-copy-id -i ~/.ssh/raven-sync.pub user@your-server.com
   ```

3. Configure Raven with key path (automatic)

**Benefits:**
- ✅ No passwords stored anywhere
- ✅ Can revoke key anytime
- ✅ Separate key per machine/purpose
- ✅ Industry-standard security

### Encrypted Transfer

- All data transferred over SSH (encrypted)
- No plaintext data exposed
- TLS 1.3 / SSH protocol security

### Access Control

**On your VPS:**
- Create dedicated user for Raven backups
- Limit write access to backup directory only
- Use `chroot` or `rbash` for extra isolation (optional)

**Example:**
```bash
# Create backup user
sudo useradd -m -s /bin/bash raven-backup

# Set up directory
sudo mkdir -p /home/raven-backup/backups
sudo chown raven-backup:raven-backup /home/raven-backup/backups

# Add your SSH key
sudo -u raven-backup mkdir /home/raven-backup/.ssh
sudo -u raven-backup bash -c 'cat > /home/raven-backup/.ssh/authorized_keys'
# (paste your public key)
```

---

## Data Portability

### Accessing Your Data

**From any machine with SSH:**
```bash
# List backups
ssh you@your-server.com "ls -lh raven-backups/"

# Download specific project
rsync -avz you@your-server.com:raven-backups/raven/ ./raven-backup/

# Download everything
rsync -avz you@your-server.com:raven-backups/ ./all-backups/
```

### Migrating Servers

**Easy migration** (no vendor lock-in):

1. On new server: Create backup directory
2. Transfer data: `rsync old-server:backups/ new-server:backups/`
3. Update Raven settings: Change server IP/hostname
4. Done!

### Restoring Data

**To restore a project:**

1. Download from server:
   ```bash
   rsync -avz you@server.com:raven-backups/raven/ ~/.raven/
   ```

2. Restart Raven - automatically detects restored data

**To restore specific database:**

1. Download single file:
   ```bash
   scp you@server.com:raven-backups/raven/db/raven.db ~/.raven/db/
   ```

2. Raven uses it immediately

---

## Comparison: Raven vs. Alternatives

| Feature | Raven | GitHub Copilot | Cloud IDEs |
|---------|-------|----------------|------------|
| **Data Storage** | Local SQLite | GitHub (Microsoft) | Cloud (their servers) |
| **Backups** | Your VPS | N/A | Their cloud |
| **Privacy** | 100% private | Code sent to OpenAI | Code on their servers |
| **Cost** | Free + $5 VPS | $10-20/month | $10-50/month |
| **Vendor Lock-in** | None | Microsoft | High |
| **Works Offline** | Yes | No | No |
| **Data Access** | Anytime (SSH) | Via GitHub | Via their UI |
| **Retention** | Forever (your choice) | GitHub's policy | Their policy |

---

## Future: Self-Hosted Recall Integration

**Coming soon:** Integration with self-hosted Recall instances.

When Recall adds server mode, you'll be able to:
- Run Recall on your VPS
- Sync Raven data directly to Recall server
- Query historical data from anywhere
- Share recall database across machines
- Keep all processing on your infrastructure

**Philosophy remains the same:** Your server, your data, your control.

---

## FAQ

### Why not support cloud services as an option?

**Short answer:** Complexity and philosophy mismatch.

**Long answer:** Supporting cloud services means:
- Maintaining SDKs for each provider (AWS, GCP, Azure, etc.)
- Handling authentication (IAM, service accounts, API keys)
- Managing different APIs and pricing models
- Adding configuration complexity
- Creating vendor lock-in for users
- Compromising on privacy and control

SSH + rsync is universal, simple, and gives you complete control.

### What if I don't have a server?

**Three options:**

1. **Get a cheap VPS** - $5/month gives you years of storage
2. **Use existing infrastructure** - Development server, home lab, NAS
3. **Wait for features** - We may add local network sync (sync to another machine on your LAN)

### Can I use AWS S3 if I really want to?

**Technically yes, manually:**

You could set up your VPS to sync to S3, but that's your choice on your server. Raven won't support it directly because:
- Adds complexity
- Requires proprietary SDKs
- Compromises on control
- Creates vendor lock-in

If you want cloud storage, do it on your terms via your VPS.

### How much storage do I need?

**Conservative estimate:**
- 1 project, 1 year, no retention: ~2 GB
- 1 project, 1 year, with 7-day retention: ~500 MB
- 5 projects, 1 year, with retention: ~2-3 GB

**A $5 VPS with 25GB storage** can hold:
- 5-10 years of active development (with retention)
- Or 10-20 projects for 1 year each

### What if my VPS provider shuts down?

**No problem:**
1. Spin up new VPS at different provider (30 minutes)
2. Migrate data with rsync (1 command)
3. Update Raven settings (2 fields)
4. Continue working

**No data lost, no vendor lock-in, no stress.**

### Is SSH secure enough?

**Yes.** SSH is the industry standard for secure remote access:
- Used by every tech company (Google, Meta, Amazon, etc.)
- Battle-tested for 25+ years
- Modern encryption (Ed25519, ChaCha20)
- Better than most cloud APIs

If you trust GitHub with SSH keys, you can trust your own server with Raven.

---

## Conclusion

Raven's data storage philosophy is simple:

> **Your code, your data, your infrastructure, your control.**

We believe developers should own their development data completely, without compromise. By using local SQLite databases and SSH-based server sync, Raven gives you:

- ✅ **Complete privacy** - no third parties ever touch your data
- ✅ **Full control** - decide retention, access, and backup policies
- ✅ **Portability** - move between providers in minutes
- ✅ **Simplicity** - standard Unix tools, no SDKs, no complexity
- ✅ **Cost-effective** - $5/month for years of storage
- ✅ **Future-proof** - works forever, regardless of vendor changes

**Raven doesn't just monitor your code—it respects it.**

---

## Next Steps

Ready to set up server sync?

1. Read: [Server Sync Setup Guide](./SERVER_SYNC_SETUP.md)
2. Configure: System > Storage > Server Sync
3. Test: Click "Test Connection"
4. Sync: Click "Sync Now"

Questions? Check the [Troubleshooting Guide](./TROUBLESHOOTING.md) or open an issue on GitHub.

---

*"The cloud is just someone else's computer." - Why trust theirs when you can use yours?*
