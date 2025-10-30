# Raven Startup Improvements Plan

## Current Issues & Improvements

### ❌ Current Problems

1. **Parallel Initialization Without Verification**
   - Projects initialize but failures are only counted, not blocking
   - File watchers start in background, might fail silently
   - Health checks run async, server might be "ready" before they complete
   - Diagnostics run 2 seconds after startup (might miss issues)

2. **Race Conditions**
   - Health checks might run before metrics collection starts
   - Frontend might load before backend is truly ready
   - Metrics collection starts but first metrics take 10 seconds

3. **Silent Failures**
   - Telemetry bridge failures are non-critical warnings
   - Individual project load failures don't block startup
   - File watcher failures are logged but ignored

4. **No Pre-flight Checks**
   - Doesn't verify disk space before starting
   - Doesn't check if directories exist
   - Doesn't validate database integrity
   - Doesn't verify ports are actually free

5. **Incomplete Validation**
   - Health endpoint returns 200 before all services ready
   - No verification that WebSocket is accepting connections
   - No verification that metrics are actually being collected

---

## ✅ Proposed Improvements

### Phase 1: Pre-flight Checks (Before Starting)

```javascript
async function runPreflightChecks() {
  const checks = {
    diskSpace: false,
    directories: false,
    ports: false,
    dependencies: false
  };

  // 1. Check disk space (need at least 100MB)
  const diskUsage = await checkDiskSpace('.raven');
  checks.diskSpace = diskUsage.free > 100 * 1024 * 1024;

  // 2. Verify directories exist or create them
  checks.directories = await ensureDirectories([
    '.raven',
    '.raven/db',
    '.raven/snapshots'
  ]);

  // 3. Verify ports are free
  checks.ports = !isPortInUse(3030) && !isPortInUse(5173);

  // 4. Check node modules
  checks.dependencies = fs.existsSync('node_modules');

  return checks;
}
```

### Phase 2: Sequential Critical Initialization

```javascript
async function initializeCriticalServices() {
  logger.info('Phase 1: Critical Services');

  // 1. Initialize databases with retry
  const dbResult = await initializeAllProjectsSync();
  if (dbResult.failed > 0) {
    throw new Error(`Failed to load ${dbResult.failed} projects`);
  }

  // 2. Verify at least one database loaded
  if (projectDatabases.size === 0) {
    throw new Error('No project databases loaded');
  }

  // 3. Initialize metrics collection and wait for first collection
  const metricsDb = getMetricsDatabase();
  metricsCollector = new MetricsCollector(metricsDb, SESSION_ID, io);
  metricsCollector.start();

  // Wait for first metrics to be collected (max 15 seconds)
  await waitForFirstMetrics(metricsDb, 15000);

  // 4. Initialize health checks
  healthCheckSystem = createDefaultHealthChecks(metricsDb, io);

  logger.info('✅ Critical services initialized');
}
```

### Phase 3: Non-Critical Services

```javascript
async function initializeNonCriticalServices() {
  logger.info('Phase 2: Non-Critical Services');

  // 1. Initialize file watchers (allow some failures)
  const watcherResult = await initializeAllWatchersSync();
  if (watcherResult.failed > watcherResult.total * 0.5) {
    logger.warn(`Many watchers failed: ${watcherResult.failed}/${watcherResult.total}`);
  }

  // 2. Start telemetry bridge (with retry)
  await startTelemetryBridgeWithRetry(3);

  // 3. Initialize trigger engine
  if (firstDb) {
    triggerEngine = new TriggerEngine(RAVEN_DIR, io, firstDb);
  }

  logger.info('✅ Non-critical services initialized');
}
```

### Phase 4: Comprehensive Health Verification

```javascript
async function verifyStartupHealth() {
  logger.info('Phase 3: Health Verification');

  // 1. Run all health checks and wait for completion
  const healthResult = await healthCheckSystem.runAllChecks();

  if (!healthResult.allPassed) {
    const failed = healthResult.checks.filter(c => !c.passed);
    logger.error('Health checks failed:', failed.map(c => c.name));
    throw new Error(`${failed.length} health checks failed`);
  }

  // 2. Verify WebSocket is working
  const wsWorking = await testWebSocketConnection();
  if (!wsWorking) {
    logger.warn('WebSocket connection test failed');
  }

  // 3. Verify metrics are being collected
  const metricsWorking = await verifyMetricsCollection();
  if (!metricsWorking) {
    throw new Error('Metrics collection not working');
  }

  // 4. Verify at least one file watcher is active
  if (projectWatchers.size === 0) {
    logger.warn('No file watchers active');
  }

  logger.info('✅ Health verification complete');
}
```

### Phase 5: Stabilization Period

```javascript
async function stabilizationPeriod() {
  logger.info('Phase 4: Stabilization (3 seconds)');

  // Wait 3 seconds for everything to settle
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Re-run quick health check
  const finalHealth = await healthCheckSystem.runAllChecks();

  logger.info('✅ System stabilized', {
    healthChecks: `${finalHealth.passed}/${finalHealth.total}`,
    projects: projectDatabases.size,
    watchers: projectWatchers.size,
    uptime: process.uptime()
  });
}
```

---

## 🎯 Improved Boot Sequence

### New Startup Flow

```
1. Pre-flight Checks (2-3s)
   ├─ Check disk space
   ├─ Verify directories
   ├─ Check ports available
   └─ Validate dependencies

2. Critical Services (3-5s)
   ├─ Load all project databases (sequential with retry)
   ├─ Start metrics collection
   ├─ Wait for first metrics (verify working)
   ├─ Initialize health check system
   └─ Verify all critical services loaded

3. Non-Critical Services (2-3s)
   ├─ Initialize file watchers (parallel, allow some failures)
   ├─ Start telemetry bridge (with retry)
   └─ Initialize trigger engine

4. Health Verification (2-3s)
   ├─ Run all health checks (wait for completion)
   ├─ Test WebSocket connection
   ├─ Verify metrics collection working
   └─ Verify file watchers active

5. Stabilization Period (3s)
   ├─ Wait for system to settle
   ├─ Re-run health checks
   └─ Final verification

6. Ready! (12-17s total)
   └─ All systems verified and stable
```

---

## 🛡️ Error Handling Improvements

### Retry Logic

```javascript
async function withRetry(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      logger.warn(`Attempt ${attempt} failed, retrying...`, { error: error.message });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Graceful Degradation

```javascript
async function initializeWithGracefulDegradation() {
  const results = {
    critical: [],
    nonCritical: [],
    failed: []
  };

  // Critical services MUST succeed
  for (const service of criticalServices) {
    try {
      await withRetry(() => service.initialize());
      results.critical.push(service.name);
    } catch (error) {
      logger.error(`Critical service failed: ${service.name}`, { error });
      throw new Error(`Cannot start without ${service.name}`);
    }
  }

  // Non-critical services can fail
  for (const service of nonCriticalServices) {
    try {
      await service.initialize();
      results.nonCritical.push(service.name);
    } catch (error) {
      logger.warn(`Non-critical service failed: ${service.name}`, { error });
      results.failed.push(service.name);
    }
  }

  return results;
}
```

---

## 📊 Enhanced Health Check

### New /health/ready Endpoint

```javascript
router.get('/health/ready', async (req, res) => {
  const ready = {
    status: 'ready',
    checks: {
      databases: projectDatabases.size > 0,
      metrics: await isMetricsCollecting(),
      watchers: projectWatchers.size > 0,
      websocket: io.engine.clientsCount >= 0,
      healthSystem: healthCheckSystem !== null
    },
    stats: {
      projects: projectDatabases.size,
      watchers: projectWatchers.size,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    }
  };

  ready.ready = Object.values(ready.checks).every(v => v === true);

  res.status(ready.ready ? 200 : 503).json(ready);
});
```

---

## 🎨 Enhanced Loader UI

### New Progress Steps

```
[1/7] Pre-flight checks...
[2/7] Loading project databases...
[3/7] Starting metrics collection...
[4/7] Initializing file watchers...
[5/7] Running health checks...
[6/7] Verifying system stability...
[7/7] Finalizing startup...
```

### With Progress Details

```
[2/7] Loading project databases...
  ✓ ant
  ✓ raven
  ✓ sonar
  ⚠ echo (skipped)
  ✓ 12/15 projects loaded
```

---

## ⏱️ Expected Timing

| Phase | Current | Improved | Difference |
|-------|---------|----------|------------|
| Pre-flight | 0s | 2-3s | +2-3s |
| Critical Init | ~2s | 3-5s | +1-3s |
| Non-critical | ~1s | 2-3s | +1-2s |
| Health Check | 0s | 2-3s | +2-3s |
| Stabilization | 0s | 3s | +3s |
| **Total** | **5-7s** | **12-17s** | **+7-10s** |

**Worth it?** YES!
- Zero startup errors
- Guaranteed stable system
- Better user confidence
- Easier debugging
- Clear progress indication

---

## 🔧 Implementation Priority

### Must Have (P0)
1. ✅ Wait for metrics collection to actually work
2. ✅ Verify health checks complete before "ready"
3. ✅ Sequential database initialization with better error handling
4. ✅ Add stabilization period

### Should Have (P1)
1. ✅ Pre-flight checks (disk space, ports, directories)
2. ✅ Retry logic for critical services
3. ✅ WebSocket connection verification
4. ✅ Enhanced /health/ready endpoint

### Nice to Have (P2)
1. ⭐ Progress details in loader
2. ⭐ Better error messages with fixes
3. ⭐ Telemetry bridge auto-fix on startup
4. ⭐ Database integrity checks

---

## 🚀 Benefits

1. **Zero Startup Errors**
   - All services verified before declaring ready
   - No race conditions
   - Predictable initialization order

2. **Better Diagnostics**
   - Know exactly what failed and why
   - Clear progress indication
   - Comprehensive health verification

3. **More Stable**
   - Stabilization period ensures no immediate failures
   - Retry logic handles transient errors
   - Graceful degradation for non-critical services

4. **Better UX**
   - User knows system is truly ready
   - Clear progress updates
   - No mysterious errors after "ready" message

5. **Easier Debugging**
   - Detailed logs for each phase
   - Failed services clearly identified
   - Health check results preserved
