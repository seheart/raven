/**
 * EventBus bindings — wires the central event bus to all of its consumers
 * (file events → DB + websocket + syntax/pattern checks; git status → websocket;
 * trigger fired → log).
 *
 * Lives outside server.ts so the routing/wiring file stays small. This module
 * is invoked once during startup with the dependencies it needs.
 */

import fs from 'fs/promises';
import { join } from 'path';
import type { Server as SocketIOServer } from 'socket.io';
import { EventBus } from '../modules/index.js';
import type { FileEvent, GitStatusEvent } from '../modules/index.js';
import { getDiff } from '../modules/index.js';
import { logger } from '../utils/logger.js';
import { shouldSkipDiff, capDiff } from '../utils/file-processing-helpers.js';
import { patternDetector } from '../pattern-detector.js';
import { syntaxChecker } from '../syntax-checker.js';
import { pauseManager } from '../pause-manager.js';
import type { RavenDB } from '../db.js';
import type { TriggerEngine } from '../trigger-engine.js';
import type { InsightsService } from './insights-service.js';
import type { SyntaxErrorsRepository } from '../repositories/syntax-errors-repository.js';
import type { PatternWarningsRepository } from '../repositories/pattern-warnings-repository.js';
import type { FileEventsRepository } from '../repositories/file-events-repository.js';

interface FileWatcherLike {
  getCachedContent(absolutePath: string): string | undefined;
}

interface ProjectManagerLike {
  getCachedContentForPath(absolutePath: string): string | undefined;
}

interface GitMonitorLike {
  checkStatus(): Promise<unknown>;
}

interface BindingsDeps {
  db: RavenDB;
  io: SocketIOServer;
  sessionId: string;
  projectName: string;
  watchPath: string;
  snapshotsDir: string;
  fileWatcher: FileWatcherLike;
  projectManager: ProjectManagerLike;
  gitMonitor: GitMonitorLike;
  triggerEngine: TriggerEngine;
  insightsService: InsightsService;
  syntaxErrorsRepo: SyntaxErrorsRepository;
  patternWarningsRepo: PatternWarningsRepository;
  fileEventsRepo: FileEventsRepository;
}

/**
 * Count lines the way a human would. `"a\nb\nc\n".split('\n').length` returns
 * 4 (trailing empty); `"".split('\n').length` returns 1. Both wrong for the
 * Nebula's per-line burst sizing. This counts the number of distinct lines
 * including a trailing line without a newline, and treats empty as zero.
 */
function countLines(content: string): number {
  if (content.length === 0) return 0;
  const newlines = (content.match(/\n/g) ?? []).length;
  return content.endsWith('\n') ? newlines : newlines + 1;
}

async function saveSnapshot(snapshotsDir: string, filepath: string, content: string): Promise<void> {
  try {
    const timestamp = Date.now();
    const snapshotName = `${filepath.replace(/\//g, '_')}_${timestamp}`;
    const snapshotPath = join(snapshotsDir, snapshotName);
    await fs.mkdir(snapshotsDir, { recursive: true });
    await fs.writeFile(snapshotPath, content, 'utf8');
    logger.info(`💾 Snapshot saved: ${snapshotName}`);
  } catch (error) {
    logger.error('❌ Snapshot save error:', error as Error);
  }
}

export function bindEventBusListeners(deps: BindingsDeps): void {
  const {
    db,
    io,
    sessionId,
    projectName,
    watchPath,
    snapshotsDir,
    fileWatcher,
    projectManager,
    gitMonitor,
    triggerEngine,
    insightsService,
    syntaxErrorsRepo,
    patternWarningsRepo,
    fileEventsRepo
  } = deps;

  // ── File change events ──────────────────────────────────────────────
  EventBus.onFileEvent(async (event: FileEvent) => {
    try {
      if (!pauseManager.shouldProcessEvent()) return;

      const eventProjectName = event.projectName || projectName;
      const eventProjectPath = event.projectPath || watchPath;

      // Build a minimal diff for change events with prior cached content.
      let diff: string | null = null;
      let linesAdded = 0;
      let linesRemoved = 0;
      const absolutePath = join(eventProjectPath, event.path);
      const oldContent =
        projectManager.getCachedContentForPath(absolutePath) ||
        fileWatcher.getCachedContent(absolutePath);

      if (event.type === 'change' && oldContent && event.content && !shouldSkipDiff(event.path)) {
        const chunks = getDiff(oldContent, event.content);
        for (const c of chunks) {
          const n = c.count ?? countLines(c.value);
          if (c.added) linesAdded += n;
          else if (c.removed) linesRemoved += n;
        }
        diff = capDiff(
          chunks
            .map(d => {
              const prefix = d.added ? '+' : d.removed ? '-' : ' ';
              return d.value
                .split('\n')
                .map(line => `${prefix}${line}`)
                .join('\n');
            })
            .join('')
        );
      } else if (event.type === 'add' && event.content) {
        linesAdded = countLines(event.content);
      } else if (event.type === 'unlink' && oldContent) {
        linesRemoved = countLines(oldContent);
      }

      // Prefix filepath with project name so it's identifiable across projects.
      const storedPath = eventProjectName ? `${eventProjectName}/${event.path}` : event.path;

      // Best-effort agent attribution from recent agent_events activity.
      let agentSource: string | null = null;
      try {
        const filePattern = `%${event.path}%`;
        const match = db.db
          .prepare(
            `SELECT agent FROM agent_events
             WHERE datetime(timestamp) > datetime('now', '-10 seconds')
               AND (
                 file LIKE ?
                 OR (event_type IN ('tool_call', 'inference')
                     AND datetime(timestamp) > datetime('now', '-5 seconds'))
               )
             ORDER BY CASE WHEN file LIKE ? THEN 0 ELSE 1 END, timestamp DESC
             LIMIT 1`
          )
          .get(filePattern, filePattern) as { agent: string } | undefined;
        if (match) agentSource = match.agent;
      } catch {
        // attribution is best-effort
      }

      const eventId = fileEventsRepo.insert(
        new Date(event.ts).toISOString(),
        storedPath,
        event.type,
        diff,
        0,
        0,
        sessionId,
        event.hash,
        event.size,
        eventProjectName,
        agentSource
      );

      // Save snapshot at the same project-prefixed path so file-diff lookups match.
      if (event.content && event.type !== 'unlink') {
        await saveSnapshot(snapshotsDir, storedPath, event.content);
      }

      logger.info(`📁 File ${event.type}: ${storedPath} (ID: ${eventId})`);

      io.emit('file-changed', {
        id: eventId,
        timestamp: new Date(event.ts).toISOString(),
        filepath: storedPath,
        change_type: event.type,
        event_size: event.size,
        file_hash: event.hash,
        project_name: eventProjectName,
        agent_source: agentSource,
        lines_added: linesAdded,
        lines_removed: linesRemoved
      });

      triggerEngine.evaluate({
        file: event.path,
        event_type: event.type,
        lines_changed: diff ? diff.split('\n').length : 0,
        event_size: event.size
      });

      // Diff risk scoring for significant changes (>50 lines) — debounced.
      if (diff && diff.split('\n').length > 50) {
        insightsService.queueDiffRisk(eventId, storedPath, diff, event.type);
      }

      // Syntax check (skip Raven's own files)
      const filePath = join(eventProjectPath, event.path);
      const isRavenFile =
        event.path.includes('raven/backend/') || event.path.includes('raven/frontend/');
      if (
        !isRavenFile &&
        syntaxChecker.isSupported(filePath) &&
        (event.type === 'change' || event.type === 'add')
      ) {
        const result = await syntaxChecker.check(filePath);
        if (!result.valid && result.errors.length > 0) {
          syntaxErrorsRepo.resolveByFile(event.path);
          for (const err of result.errors) {
            syntaxErrorsRepo.insert(
              new Date().toISOString(),
              event.path,
              err.line,
              err.column,
              err.message,
              err.severity,
              err.language,
              sessionId
            );
            logger.warn(`⚠️  Syntax error in ${event.path}:${err.line}: ${err.message}`);
          }
          io.emit('syntax-error', {
            filepath: event.path,
            errors: result.errors,
            count: result.errors.length
          });
        } else if (result.valid) {
          syntaxErrorsRepo.resolveByFile(event.path);
        }
      }

      // Pattern check
      if (event.content && (event.type === 'change' || event.type === 'add')) {
        const patternResult = patternDetector.detect(event.path, event.content);
        if (patternResult.hasIssues) {
          patternWarningsRepo.resolveByFile(event.path);
          for (const match of patternResult.matches) {
            patternWarningsRepo.insert(
              new Date().toISOString(),
              event.path,
              match.line,
              match.pattern.id,
              match.pattern.name,
              match.pattern.severity,
              match.pattern.category,
              match.match,
              match.context,
              sessionId
            );
            if (match.pattern.severity === 'critical') {
              logger.warn(
                `🚨 Critical pattern in ${event.path}:${match.line}: ${match.pattern.name}`
              );
            }
          }
          io.emit('pattern-warning', {
            filepath: event.path,
            warnings: patternResult.matches.map(m => ({
              pattern: m.pattern.name,
              severity: m.pattern.severity,
              line: m.line
            })),
            count: patternResult.matches.length
          });
        } else {
          patternWarningsRepo.resolveByFile(event.path);
        }
      }

      // Git status refresh on code file change
      if (event.path.match(/\.(js|ts|jsx|tsx|py|java|go|rs|c|cpp|h|hpp)$/)) {
        await gitMonitor.checkStatus();
      }
    } catch (error) {
      logger.error('❌ Error handling file event:', error as Error);
    }
  });

  // ── Git status events ───────────────────────────────────────────────
  EventBus.onGitStatus((status: GitStatusEvent) => {
    logger.info(
      `🔀 Git: ${status.branch} (${status.modified.length} modified, ${status.created.length} created, ${status.deleted.length} deleted)`
    );
    io.emit('git-status', status);
  });

  // Telemetry events are handled by MetricsCollector listening directly to EventBus.

  // ── Trigger-fired events ────────────────────────────────────────────
  EventBus.onTriggerFired(trigger => {
    logger.info(`🔔 Trigger fired: ${trigger.ruleName} - ${trigger.message}`);
  });
}
