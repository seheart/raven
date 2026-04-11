// Performance Monitor - extracted from server.js
// Starts an interval that emits performance alerts with a startup grace period

/**
 * Start performance monitoring loop.
 * @param {object} deps
 * @param {import('socket.io').Server} deps.io - Socket.IO server instance
 * @param {object} deps.logger - Logger with info/warn/error
 * @param {object} deps.limits - LIMITS constants from config
 * @returns {{ stop: () => void }} Stop handle
 */
export function startPerformanceMonitor({ io, logger, limits }) {
  let lastPerformanceAlert = 0;
  const serverStartTime = Date.now();

  const intervalId = setInterval(async () => {
    try {
      const os = await import('os');
      const now = Date.now();

      // Skip performance checks during startup grace period (prevents false positives)
      if (now - serverStartTime < limits.TIMEOUTS.STARTUP_GRACE_PERIOD_MS) {
        return;
      }

      // Skip if we recently sent an alert (avoid spam)
      if (now - lastPerformanceAlert < limits.TIMEOUTS.PERFORMANCE_ALERT_COOLDOWN_MS) {
        return;
      }

      // Memory usage
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryPercent = (usedMemory / totalMemory) * 100;

      // Process memory
      const processMemory = process.memoryUsage();
      const heapPercent = (processMemory.heapUsed / processMemory.heapTotal) * 100;

      // Check for critical conditions
      if (memoryPercent > 90) {
        io.emit('performance-alert', {
          type: 'memory',
          severity: 'critical',
          title: 'Critical System Memory',
          message: `System memory usage is critically high: ${memoryPercent.toFixed(1)}%`,
          value: memoryPercent.toFixed(1)
        });
        lastPerformanceAlert = now;
        logger.warn(`⚠️ Critical system memory: ${memoryPercent.toFixed(1)}%`);
      } else if (heapPercent > 90) {
        io.emit('performance-alert', {
          type: 'heap',
          severity: 'warning',
          title: 'High Heap Memory',
          message: `Process heap usage is high: ${heapPercent.toFixed(1)}%`,
          value: heapPercent.toFixed(1)
        });
        lastPerformanceAlert = now;
        logger.warn(`⚠️ High heap usage: ${heapPercent.toFixed(1)}%`);
      } else if (memoryPercent > 85) {
        io.emit('performance-alert', {
          type: 'memory',
          severity: 'warning',
          title: 'High System Memory',
          message: `System memory usage is high: ${memoryPercent.toFixed(1)}%`,
          value: memoryPercent.toFixed(1)
        });
        lastPerformanceAlert = now;
      }
    } catch (error) {
      logger.error('Performance monitoring error:', error);
    }
  }, limits.TIMEOUTS.PERFORMANCE_MONITOR_INTERVAL_MS);

  return {
    stop: () => clearInterval(intervalId)
  };
}
