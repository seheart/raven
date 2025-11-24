# Server.ts Refactoring Guide

## Overview

The `server.ts` file currently contains 4,073 lines with 144 API endpoints. This guide provides a systematic approach to refactor it into modular route files for better maintainability.

## Current Status

### ✅ Completed

- Created `routes/agents.ts` - Agent monitoring routes (6 endpoints)
- Created `routes/events.ts` - Event tracking routes (7 endpoints)
- Created `routes/live-session.ts` - Live session routes (already exists)
- Created `middleware/auth.js` - JWT authentication
- Created `middleware/async-handler.ts` - Error handling wrapper
- Created `utils/request-helpers.ts` - Common parsing utilities

### 📋 Remaining Route Groups

Based on analysis of `server.ts`, here are the remaining route groups to extract:

1. **Health & Monitoring** (~10 endpoints)
   - `/api/health`
   - `/api/dashboard-stats`
   - `/api/rate-limit-status`
   - `/api/monitoring/*`

2. **Metrics** (~8 endpoints)
   - `/api/metrics`
   - `/api/system-metrics`
   - `/api/metrics/timeseries`
   - `/api/correlations`

3. **Analytics** (~15 endpoints)
   - `/api/analysis/*`
   - `/api/historical-trends/*`
   - `/api/developer-insights/*`

4. **Projects** (~5 endpoints)
   - `/api/projects/*`
   - `/api/project-health/*`

5. **Integrations** (~12 endpoints)
   - `/api/integrations/*`
   - `/api/integrations/github/*`
   - `/api/integrations/slack/*`

6. **Sync** (~6 endpoints)
   - `/api/sync/*`

7. **Storage & Export** (~8 endpoints)
   - `/api/storage/*`
   - `/api/export/*`
   - `/api/vacuum`

8. **Patterns & Intelligence** (~8 endpoints)
   - `/api/patterns/*`
   - `/api/observations`
   - `/api/memory/*`

9. **Errors & Logs** (~5 endpoints)
   - `/api/errors`
   - `/api/error-logs/*`

10. **Miscellaneous** (~remaining endpoints)
    - Stub implementations
    - Feature toggles
    - etc.

## Refactoring Pattern

### 1. Create New Route Module

```typescript
// backend/routes/[domain].ts
import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseLimit, parseDateRange } from '../utils/request-helpers.js';
import { authenticate, authorize } from '../middleware/auth.js';

export function create[Domain]Router(db: RavenDB, ...otherDeps): Router {
  const router = express.Router();

  // Define routes using asyncHandler
  router.get(
    '/endpoint',
    authenticate, // Optional: add auth
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseLimit(req);
      // ... implementation
      res.json(data);
    })
  );

  return router;
}
```

### 2. Import and Mount in server.ts

```typescript
// In server.ts
import { createAgentsRouter } from './routes/agents.js';
import { createEventsRouter } from './routes/events.js';

// After service initialization
const agentsRouter = createAgentsRouter(db, agentRegistry);
const eventsRouter = createEventsRouter(db);

// Mount routers
app.use('/api', agentsRouter);
app.use('/api', eventsRouter);
```

### 3. Benefits of This Pattern

- **Modularity**: Each domain has its own file
- **Testability**: Easy to unit test individual routers
- **Dependency Injection**: Services passed as parameters
- **Error Handling**: Automatic via `asyncHandler`
- **Code Reuse**: Helper utilities eliminate duplication
- **Type Safety**: Full TypeScript support

## Step-by-Step Migration Process

### For Each Route Group:

1. **Identify Routes**

   ```bash
   # Find all routes for a domain (e.g., "health")
   grep "^app\.(get|post|put|delete)\('/api/health" backend/server.ts
   ```

2. **Extract Route Logic**
   - Copy route implementations from `server.ts`
   - Replace `app.get` with `router.get`
   - Wrap handlers with `asyncHandler`
   - Replace inline parsing with helper functions
   - Remove try/catch blocks (handled by asyncHandler)

3. **Handle Dependencies**
   - Identify what each route needs (db, services, registries)
   - Pass dependencies as function parameters
   - Example: `createHealthRouter(db, metricsCollector, dataFlowHealthMonitor)`

4. **Update server.ts**
   - Import the new router
   - Create router instance with dependencies
   - Mount with `app.use('/api', router)`
   - Comment out or remove old routes

5. **Test**

   ```bash
   # Run tests
   npm test

   # Test specific endpoints
   curl http://localhost:9100/api/[endpoint]
   ```

6. **Commit**
   ```bash
   git add backend/routes/[domain].ts backend/server.ts
   git commit -m "refactor: Extract [domain] routes to separate module"
   ```

## Migration Checklist

Use this checklist to track progress:

- [x] agents routes
- [x] events routes
- [x] live-session routes (already existed)
- [ ] health routes
- [ ] metrics routes
- [ ] analytics routes
- [ ] projects routes
- [ ] integrations routes
- [ ] sync routes
- [ ] storage routes
- [ ] patterns routes
- [ ] errors routes
- [ ] miscellaneous routes

## Example: Before and After

### Before (server.ts)

```typescript
app.get('/api/agent-stats', cacheMiddleware(3000), (req: Request, res: Response) => {
  try {
    const stats = db.getAgentStats();
    return res.json(stats);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
```

### After (routes/agents.ts)

```typescript
router.get(
  '/agent-stats',
  cacheMiddleware(3000),
  asyncHandler(async (req: Request, res: Response) => {
    const stats = db.getAgentStats();
    res.json(stats);
  })
);
```

## Testing Strategy

### 1. Unit Tests for Route Modules

```typescript
// backend/__tests__/routes/agents.test.ts
import { createAgentsRouter } from '../../routes/agents.js';

describe('Agents Router', () => {
  let router, db, agentRegistry;

  beforeEach(() => {
    db = createMockDB();
    agentRegistry = new Map();
    router = createAgentsRouter(db, agentRegistry);
  });

  test('GET /agents-status returns agent list', async () => {
    // ... test implementation
  });
});
```

### 2. Integration Tests

- Ensure all routes still work after migration
- Test with real database
- Verify WebSocket functionality

### 3. Load Tests

- Ensure no performance regression
- Test rate limiting still works

## Common Pitfalls to Avoid

1. **Don't forget dependencies**: Routes may depend on services, registries, or other state
2. **Preserve middleware order**: Auth/cache middleware must be in correct position
3. **Handle WebSocket routes carefully**: Some routes may interact with Socket.IO
4. **Test thoroughly**: Each extracted module should have tests
5. **Commit frequently**: Small, incremental commits are easier to review/revert

## Final server.ts Structure

After complete refactoring, `server.ts` should be ~500 lines:

```typescript
// Imports
import express from 'express';
import { createAgentsRouter } from './routes/agents.js';
// ... other router imports

// Configuration
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
// ... other middleware

// Initialize Services
const db = new RavenDB(DB_PATH);
const metricsCollector = new MetricsCollector(...);
// ... other services

// Mount Routers
app.use('/api', createAgentsRouter(db, agentRegistry));
app.use('/api', createEventsRouter(db));
// ... other routers

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// Server Startup
httpServer.listen(PORT, () => {
  // ... startup logic
});
```

## Questions?

If you encounter issues during refactoring:

1. Check if dependencies are passed correctly
2. Verify TypeScript types are correct
3. Ensure imports use `.js` extension (ES modules)
4. Test each route after extraction
5. Refer to existing route modules as examples

## Progress Tracking

Estimate: ~2-3 hours per route group (~10 groups) = 20-30 hours total

Track your progress:

- Update the checklist above as you complete each module
- Run tests after each module
- Keep server.ts route count decreasing
- Goal: Reduce server.ts from 4,073 lines to ~500 lines
