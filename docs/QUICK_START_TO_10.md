# Quick Start: Your First Week to 10/10

Ready to start? Here's your week-by-week action plan with specific commands and files to modify.

---

## 🚀 Week 1: Foundation & Quick Wins

### Day 1: Setup & Quick Wins (4 hours)

#### Morning: Fix the E2E Test
```bash
# 1. Identify the failing test
cd /home/seth/Projects/raven
npm run test:e2e -- --reporter=list

# 2. Debug specific test
npm run test:e2e:headed -- --grep "failing test name"

# 3. Common fixes:
# - Increase timeout in playwright.config.js
# - Fix selector specificity
# - Add proper wait conditions
```

**File to edit:** `e2e/specs/[failing-test].spec.js`

#### Afternoon: Security Quick Wins
```bash
# 1. Add git-secrets (prevents committing secrets)
brew install git-secrets  # or apt-get install git-secrets
cd /home/seth/Projects/raven
git secrets --install
git secrets --register-aws

# 2. Set up Dependabot (GitHub only)
# Create: .github/dependabot.yml
```

**Create file:** `.github/dependabot.yml`
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
```

---

### Day 2: JSDoc Type Annotations (6-8 hours)

Add type safety without TypeScript conversion yet.

#### Files to annotate (in priority order):

**1. backend/db.js** (most critical)
```javascript
/**
 * @typedef {Object} EventRecord
 * @property {number} id
 * @property {string} projectName
 * @property {string} eventType
 * @property {string} filePath
 * @property {number} timestamp
 */

/**
 * Insert event into database
 * @param {EventRecord} event - The event to insert
 * @returns {number} The ID of inserted event
 */
insertEvent(event) {
  // existing code
}
```

**2. backend/services/*.js** (17 files)
- Start with smallest: `pattern-matcher.js`
- Add @typedef for all interfaces
- Add @param and @return to all functions

**3. backend/routes/*.js** (29 files)
- Add JSDoc to request handlers
- Document query params, body shape, responses

**Example pattern:**
```javascript
/**
 * GET /api/events
 * @param {express.Request} req
 * @param {express.Response} res
 * @query {number} [limit=100] - Max events to return
 * @query {string} [projectName] - Filter by project
 * @returns {Promise<void>}
 */
export async function getEvents(req, res) {
  // implementation
}
```

---

### Day 3: Extract WebSocket Handlers (6-8 hours)

**Goal:** Reduce server.js by ~500-800 lines

#### Step 1: Create directory structure
```bash
cd /home/seth/Projects/raven/backend
mkdir -p socket/handlers
touch socket/handlers/agent-telemetry.js
touch socket/handlers/file-changes.js
touch socket/handlers/metrics-updates.js
touch socket/handlers/conversation-sync.js
touch socket/handlers/notifications.js
```

#### Step 2: Extract handlers

**File:** `socket/handlers/agent-telemetry.js`
```javascript
import { logger } from '../../utils/logger.js';

/**
 * Handle agent telemetry events
 * @param {Object} io - Socket.IO server instance
 * @param {Object} socket - Socket connection
 * @param {Object} services - Injected services
 */
export function setupAgentTelemetryHandler(io, socket, { db, telemetryLimiter }) {
  socket.on('agent-telemetry', async (data) => {
    try {
      // Existing handler logic from server.js
      logger.debug('Agent telemetry received', { data });

      // ... rest of handler

    } catch (error) {
      logger.error('Agent telemetry error', { error });
      socket.emit('error', { message: error.message });
    }
  });
}
```

**File:** `socket/index.js` (new file)
```javascript
import { setupAgentTelemetryHandler } from './handlers/agent-telemetry.js';
import { setupFileChangesHandler } from './handlers/file-changes.js';
import { setupMetricsHandler } from './handlers/metrics-updates.js';
import { setupConversationHandler } from './handlers/conversation-sync.js';
import { setupNotificationsHandler } from './handlers/notifications.js';

/**
 * Setup all WebSocket handlers
 * @param {Object} io - Socket.IO server
 * @param {Object} services - Service dependencies
 */
export function setupWebSocketHandlers(io, services) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Setup all handlers
    setupAgentTelemetryHandler(io, socket, services);
    setupFileChangesHandler(io, socket, services);
    setupMetricsHandler(io, socket, services);
    setupConversationHandler(io, socket, services);
    setupNotificationsHandler(io, socket, services);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}
```

#### Step 3: Update server.js
```javascript
// In server.js, replace all WebSocket handler code with:
import { setupWebSocketHandlers } from './socket/index.js';

// After creating io instance:
const services = { db, telemetryLimiter, metricsCollector, triggerEngine };
setupWebSocketHandlers(io, services);
```

**Expected result:** server.js reduces from 2362 → ~1700 lines

---

### Day 4: Code Quality Automation Setup (6-8 hours)

#### 1. Install Husky and lint-staged
```bash
cd /home/seth/Projects/raven
npm install --save-dev husky lint-staged

# Initialize Husky
npx husky init

# Create pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"
```

**Create file:** `.lintstagedrc.json`
```json
{
  "backend/**/*.js": [
    "eslint --fix",
    "prettier --write"
  ],
  "frontend/**/*.{js,svelte}": [
    "eslint --fix",
    "prettier --write"
  ],
  "**/*.{json,md}": [
    "prettier --write"
  ]
}
```

#### 2. Add custom ESLint rules

**File:** `backend/.eslintrc.json`
```json
{
  "extends": "eslint:recommended",
  "rules": {
    "no-console": ["error", { "allow": ["warn", "error"] }],
    "max-lines": ["warn", { "max": 300 }],
    "max-lines-per-function": ["warn", { "max": 50 }],
    "complexity": ["warn", { "max": 10 }],
    "no-magic-numbers": ["warn", {
      "ignore": [0, 1, -1],
      "ignoreArrayIndexes": true
    }]
  }
}
```

#### 3. Add pre-push test hook
```bash
npx husky add .husky/pre-push "npm test"
```

---

### Day 5: Performance Monitoring Setup (4-6 hours)

#### Option A: Open Source (Recommended to start)

**Install prom-client**
```bash
cd /home/seth/Projects/raven/backend
npm install prom-client
```

**Create file:** `backend/middleware/metrics.js`
```javascript
import promClient from 'prom-client';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 200, 500, 1000]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);

export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path;

    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);

    httpRequestTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });

  next();
};

export { register };
```

**Add to server.js:**
```javascript
import { metricsMiddleware, register } from './middleware/metrics.js';

app.use(metricsMiddleware);

// Add metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Visualize with Grafana (optional):**
```bash
# docker-compose.yml (add these services)
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
```

---

## 📅 Week 2-3: Deep Refactoring

### Week 2: Complete Server.js Decomposition

**Days 6-7: Create ServerBootstrap class**

**File:** `backend/core/bootstrap.js`
```javascript
import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { logger } from '../utils/logger.js';
import { setupMiddleware } from './middleware-setup.js';
import { setupRoutes } from './route-setup.js';
import { setupWebSocketHandlers } from '../socket/index.js';
import { initializeServices } from './service-initializer.js';

export class ServerBootstrap {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer);
    this.services = {};
  }

  async start() {
    try {
      // 1. Initialize services
      logger.info('Initializing services...');
      this.services = await initializeServices(this.config);

      // 2. Setup middleware
      logger.info('Setting up middleware...');
      setupMiddleware(this.app, this.config);

      // 3. Setup routes
      logger.info('Setting up routes...');
      setupRoutes(this.app, this.services);

      // 4. Setup WebSocket
      logger.info('Setting up WebSocket...');
      setupWebSocketHandlers(this.io, this.services);

      // 5. Start server
      const port = this.config.port || 3030;
      await new Promise((resolve) => {
        this.httpServer.listen(port, () => {
          logger.info(`Server running on port ${port}`);
          resolve();
        });
      });

    } catch (error) {
      logger.error('Failed to start server', { error });
      throw error;
    }
  }

  async stop() {
    logger.info('Shutting down server...');
    await this.services.shutdown();
    this.httpServer.close();
  }
}
```

**Days 8-10: Migrate all config to files**

**File:** `backend/config/server-config.js`
```javascript
export const serverConfig = {
  port: process.env.PORT || 3030,

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  },

  rateLimit: {
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100
    },
    telemetry: {
      windowMs: 15 * 60 * 1000,
      max: 10
    }
  },

  websocket: {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
    }
  },

  database: {
    path: process.env.DB_PATH || '.raven/raven.db',
    options: {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    }
  },

  monitoring: {
    metricsInterval: 5000,
    logWatcherPollInterval: 100
  }
};
```

**Final server.js target (<200 lines):**
```javascript
import { ServerBootstrap } from './core/bootstrap.js';
import { loadConfig } from './config/loader.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    // Load configuration
    const config = await loadConfig();

    // Create and start server
    const server = new ServerBootstrap(config);
    await server.start();

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Fatal error during startup', { error });
    process.exit(1);
  }
}

main();
```

---

### Week 3: TypeScript Conversion Begins

**Days 11-15: Convert utilities to TypeScript**

```bash
# 1. Install TypeScript
cd /home/seth/Projects/raven/backend
npm install --save-dev typescript @types/node @types/express

# 2. Initialize tsconfig.json
npx tsc --init
```

**File:** `backend/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": false
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Convert first file:** `backend/utils/logger.js` → `logger.ts`
```typescript
import winston from 'winston';

interface LoggerConfig {
  level: string;
  format: winston.Logform.Format;
  transports: winston.transport[];
}

const config: LoggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
};

export const logger = winston.createLogger(config);
```

**Gradually convert 1-2 files per day:**
1. utils/cache.js → cache.ts
2. utils/validation.js → validation.ts
3. services/pattern-matcher.js → pattern-matcher.ts
4. (continue with smallest files first)

---

## 🎯 Success Metrics After Week 1

Check these after your first week:

```bash
# 1. Test coverage
npm run test:e2e
# Expected: 41/41 passing ✓

# 2. Security scan
npm audit
# Expected: 0 vulnerabilities ✓

# 3. Line count
wc -l backend/server.js
# Expected: <2000 lines (from 2362)

# 4. Metrics endpoint
curl http://localhost:3030/metrics
# Expected: Prometheus metrics output ✓

# 5. Pre-commit hook
git commit -m "test"
# Expected: Runs ESLint + Prettier ✓
```

---

## 💡 Pro Tips

### 1. Work in branches
```bash
git checkout -b refactor/decompose-server
# Make changes
git commit -m "refactor: extract WebSocket handlers"
git push origin refactor/decompose-server
# Create PR, review, merge
```

### 2. Test continuously
```bash
# Run tests in watch mode while developing
npm run test:backend -- --watch
```

### 3. Use git bisect for debugging
```bash
# If tests break, find the breaking commit
git bisect start
git bisect bad HEAD
git bisect good <last-known-good-commit>
```

### 4. Commit small, commit often
```bash
# Good: Small, focused commits
git commit -m "refactor: extract agent telemetry handler"
git commit -m "refactor: extract file changes handler"

# Bad: Giant commits
git commit -m "refactor: everything"
```

---

## 🚨 Troubleshooting

### Tests failing after refactor?
```bash
# 1. Check imports
npm run test:backend -- --verbose

# 2. Clear cache
rm -rf backend/node_modules/.cache

# 3. Reinstall dependencies
npm ci
```

### Server won't start?
```bash
# Check logs
tail -f backend/logs/combined.log

# Common issues:
# - Port already in use: Kill process on port 3030
# - Database locked: Close other Raven instances
# - Missing dependencies: npm install
```

### Git hooks not working?
```bash
# Reinstall hooks
rm -rf .husky
npx husky init
npx husky add .husky/pre-commit "npx lint-staged"
```

---

## 📚 Resources

### Read these first:
1. **Clean Code** (Ch 3: Functions) - Max 50 lines per function
2. **Refactoring** by Martin Fowler - Systematic refactoring techniques
3. **You Don't Know JS: Types & Grammar** - TypeScript preparation

### Bookmark these:
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- ESLint Rules: https://eslint.org/docs/latest/rules/
- SonarQube: https://docs.sonarqube.org/

---

**You've got this! Start with Day 1 and work through systematically. Small daily progress compounds into massive improvements.** 🚀

**Questions? Check ROADMAP_TO_10.md for the comprehensive plan or open an issue.**
