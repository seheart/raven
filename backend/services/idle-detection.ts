/**
 * Idle detection — periodic process-check + central idle-mode switching.
 *
 * Polls for the Claude CLI every 30s and:
 *   - keeps the registry's last_seen for "Claude Code" fresh while it's running
 *   - drops `is_running` for any agent stale > 5 min
 *   - flips ALL services to idle mode when no agent is active (and back)
 *
 * This is what stops every watcher and metrics collector from polling at full
 * rate when nobody's actively coding.
 */

import { execFile } from 'child_process';
import type { AgentInfo } from '../types/agent-info.js';
import { logger } from '../utils/logger.js';

const PROCESS_CHECK_INTERVAL_MS = 30_000;
const STALE_AGENT_MS = 5 * 60 * 1000;

interface IdleAware {
  setIdle(idle: boolean): void;
}

interface IdleDeps {
  agentRegistry: Map<string, AgentInfo>;
  localModelWatcher: IdleAware;
  claudeLogWatcher: IdleAware;
  codexLogWatcher: IdleAware;
  healthMonitor: IdleAware;
  metricsCollector: IdleAware;
}

export function startIdleDetection(deps: IdleDeps): ReturnType<typeof setInterval> {
  let systemIsIdle = false;

  const timer = setInterval(() => {
    execFile('pgrep', ['-x', 'claude'], (err, stdout) => {
      const agent = deps.agentRegistry.get('Claude Code');
      if (agent) {
        const running = !err && stdout.trim().length > 0;
        if (running) {
          agent.last_seen = new Date().toISOString();
          agent.is_running = true;
        } else {
          // Clear the flag so idle detection can engage; otherwise is_running
          // latches true forever after the first sighting.
          agent.is_running = false;
        }
      }

      // Anything we haven't heard from in 5 min is treated as not running.
      const now = Date.now();
      for (const a of deps.agentRegistry.values()) {
        if (a.last_seen && now - new Date(a.last_seen).getTime() > STALE_AGENT_MS) {
          a.is_running = false;
        }
      }

      const anyActive = Array.from(deps.agentRegistry.values()).some(a => a.is_running);
      const shouldBeIdle = !anyActive;
      if (shouldBeIdle !== systemIsIdle) {
        systemIsIdle = shouldBeIdle;
        logger.info(
          `🌙 System ${shouldBeIdle ? 'entering idle mode' : 'resuming active mode'} — adjusting all polling intervals`
        );
        deps.localModelWatcher.setIdle(shouldBeIdle);
        deps.claudeLogWatcher.setIdle(shouldBeIdle);
        deps.codexLogWatcher.setIdle(shouldBeIdle);
        deps.healthMonitor.setIdle(shouldBeIdle);
        deps.metricsCollector.setIdle(shouldBeIdle);
      }
    });
  }, PROCESS_CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
