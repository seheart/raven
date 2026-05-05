/**
 * CodexLogWatcher - Watches OpenAI Codex CLI session rollouts.
 *
 * Mirrors ClaudeLogWatcher but for Codex's JSONL "rollout" files at
 * ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl.
 *
 * Emits the same event shape ClaudeLogWatcher does (eventCategory:
 * agent_event | conversation | file_change) so server.ts can handle
 * Codex through the same dispatcher with a different agent name.
 *
 * v1 covers: tool calls (exec_command / update_plan), file edits via
 * apply_patch, user/assistant messages. Token usage and latency are
 * deliberately deferred — Codex's usage shape is different and worth
 * a second pass once we've seen real volume.
 */

import fs from 'fs';
import path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import { homedir } from 'os';

interface MinimalLogger {
  debug: (msg: string, meta?: object) => void;
  info: (msg: string, meta?: object) => void;
  warn: (msg: string, meta?: object) => void;
  error: (msg: string, meta?: object) => void;
}

interface SessionMeta {
  sessionId: string;
  cwd: string;
  projectName: string;
  model: string | null;
}

interface BaseEvent {
  projectName: string;
  projectPath: string;
  sessionId: string;
  timestamp: string;
  source: 'codex';
}

export interface CodexEvent extends Partial<BaseEvent> {
  type: string;
  content?: string;
  tool?: string;
  file?: string;
  path?: string;
  eventCategory: 'conversation' | 'agent_event' | 'file_change';
}

export type CodexEventCallback = (event: CodexEvent) => Promise<void> | void;

export interface CodexWatcherOptions {
  positionsFile?: string | null;
}

interface SessionMetaPayload {
  id?: string;
  cwd?: string;
  model?: string;
}

interface TurnContextPayload {
  model?: string;
}

interface EventMsgPayload {
  type?: string;
  message?: string;
}

interface ResponseItemContentBlock {
  type?: string;
  text?: string;
}

interface ResponseItemPayload {
  type?: string;
  role?: string;
  content?: ResponseItemContentBlock[];
  name?: string;
  arguments?: string | Record<string, unknown>;
}

interface CodexLogEntry {
  type?: string;
  timestamp?: string;
  payload?: SessionMetaPayload | TurnContextPayload | EventMsgPayload | ResponseItemPayload;
}

const APPLY_PATCH_TARGET = /^\*\*\* (Update|Add|Delete) File:\s*(.+)$/m;

export class CodexLogWatcher {
  private eventCallback: CodexEventCallback;
  private logger: MinimalLogger;
  private codexSessionsDir: string;
  private logWatcher: FSWatcher | null;
  private filePositions: Map<string, number>;
  private sessionMeta: Map<string, SessionMeta>;
  private positionsFile: string | null;
  private positionsSaveTimer: NodeJS.Timeout | null;
  private _currentIdle: boolean | undefined;
  private _idleSwitching: boolean | undefined;

  constructor(eventCallback: CodexEventCallback, logger: MinimalLogger, options: CodexWatcherOptions = {}) {
    this.eventCallback = eventCallback;
    this.logger = logger;
    this.codexSessionsDir = path.join(homedir(), '.codex', 'sessions');
    this.logWatcher = null;
    this.filePositions = new Map();
    this.sessionMeta = new Map();
    this.positionsFile = options.positionsFile || null;
    this.positionsSaveTimer = null;
  }

  async loadPositions(): Promise<void> {
    if (!this.positionsFile) return;
    try {
      const raw = await fs.promises.readFile(this.positionsFile, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        for (const [filepath, position] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof position === 'number' && position >= 0) {
            this.filePositions.set(filepath, position);
          }
        }
        this.logger.info(
          `   Restored ${this.filePositions.size} log positions from ${path.basename(this.positionsFile)}`
        );
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') {
        this.logger.warn(`Could not load Codex log positions: ${e.message}`);
      }
    }
  }

  async savePositions(): Promise<void> {
    if (!this.positionsFile) return;
    try {
      const payload = Object.fromEntries(this.filePositions);
      await fs.promises.mkdir(path.dirname(this.positionsFile), { recursive: true });
      await fs.promises.writeFile(this.positionsFile, JSON.stringify(payload), 'utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not save Codex log positions: ${msg}`);
    }
  }

  async start(): Promise<void> {
    this.logger.info('🔍 Starting Codex Log Watcher...');
    this.logger.info(`   Watching: ${this.codexSessionsDir}`);

    if (!fs.existsSync(this.codexSessionsDir)) {
      this.logger.warn(
        '⚠️  Codex sessions directory not found — Codex monitoring will activate when it appears.'
      );
    }

    await this.loadPositions();
    this.positionsSaveTimer = setInterval(() => {
      this.savePositions().catch(() => {});
    }, 30000);
    this.positionsSaveTimer.unref?.();

    this.logWatcher = chokidar.watch(this.codexSessionsDir, {
      persistent: true,
      ignoreInitial: false,
      usePolling: true,
      interval: 100,
      binaryInterval: 100,
      awaitWriteFinish: false,
      ignorePermissionErrors: true,
      alwaysStat: true,
      depth: 4,
      ignored: (watchPath: string, stats?: fs.Stats) => {
        if (stats?.isFile()) {
          return !watchPath.endsWith('.jsonl');
        }
        return false;
      }
    });

    this.logWatcher.on('add', (filepath: string) => this.handleLogFileAdded(filepath));
    this.logWatcher.on('change', (filepath: string) => this.handleLogFileChanged(filepath));
    this.logWatcher.on('error', error =>
      this.logger.error(`❌ Codex watcher error: ${error instanceof Error ? error.message : String(error)}`)
    );

    this.logWatcher.on('ready', () => {
      this.logger.info('📡 Codex watcher ready');
    });

    const stats = await this.getWatchStats();
    this.logger.info('✅ Codex Log Watcher started');
    this.logger.info(`   Watching ${stats.fileCount} rollout files`);
  }

  async setIdle(idle: boolean): Promise<void> {
    if (!this.logWatcher) return;
    if (this._currentIdle === idle) return;
    if (this._idleSwitching) return;
    this._idleSwitching = true;

    const newInterval = idle ? 5000 : 100;
    this._currentIdle = idle;
    this.logger.info(
      `Codex Log Watcher: switching to ${idle ? 'idle' : 'active'} polling (${newInterval}ms)`
    );

    try {
      await this.logWatcher.close();
      this.logWatcher = chokidar.watch(this.codexSessionsDir, {
        persistent: true,
        ignoreInitial: true,
        usePolling: true,
        interval: newInterval,
        binaryInterval: newInterval,
        awaitWriteFinish: false,
        ignorePermissionErrors: true,
        alwaysStat: true,
        depth: 4,
        ignored: (watchPath: string, stats?: fs.Stats) => {
          if (stats?.isFile()) {
            return !watchPath.endsWith('.jsonl');
          }
          return false;
        }
      });
      this.logWatcher.on('add', (filepath: string) => this.handleLogFileAdded(filepath));
      this.logWatcher.on('change', (filepath: string) => this.handleLogFileChanged(filepath));
      this.logWatcher.on('error', error =>
        this.logger.error(`❌ Codex watcher error: ${error instanceof Error ? error.message : String(error)}`)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to switch Codex idle mode: ${msg}`);
    } finally {
      this._idleSwitching = false;
    }
  }

  async stop(): Promise<void> {
    if (this.positionsSaveTimer) {
      clearInterval(this.positionsSaveTimer);
      this.positionsSaveTimer = null;
    }
    await this.savePositions();
    if (this.logWatcher) {
      await this.logWatcher.close();
      this.logWatcher = null;
      this.logger.info('🛑 Codex Log Watcher stopped');
    }
  }

  async handleLogFileAdded(filepath: string): Promise<void> {
    this.logger.info(`📄 Codex session: ${path.basename(filepath)}`);
    try {
      const stats = await fs.promises.stat(filepath);
      const startPosition = this.filePositions.get(filepath) || 0;
      const effectiveStart = stats.size < startPosition ? 0 : startPosition;

      // We always need session_meta to be parsed so subsequent events have a
      // base. If we're resuming from a non-zero position, scan a small chunk
      // from the top to recover the session header before jumping ahead.
      if (effectiveStart > 0 && !this.sessionMeta.has(filepath)) {
        const headerSize = Math.min(stats.size, 65536);
        const headBuffer = Buffer.alloc(headerSize);
        const fdHead = fs.openSync(filepath, 'r');
        try {
          fs.readSync(fdHead, headBuffer, 0, headerSize, 0);
        } finally {
          fs.closeSync(fdHead);
        }
        const headLines = headBuffer.toString('utf8').split('\n');
        for (const line of headLines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line) as CodexLogEntry;
            if (entry?.type === 'session_meta' || entry?.type === 'turn_context') {
              await this.processLogEntry(entry, filepath);
            }
            if (this.sessionMeta.has(filepath)) break;
          } catch (_err) {
            // skip malformed lines
          }
        }
      }

      if (effectiveStart >= stats.size) {
        this.filePositions.set(filepath, stats.size);
        return;
      }

      const buffer = Buffer.alloc(stats.size - effectiveStart);
      const fd = fs.openSync(filepath, 'r');
      try {
        fs.readSync(fd, buffer, 0, buffer.length, effectiveStart);
      } finally {
        fs.closeSync(fd);
      }
      const lines = buffer
        .toString('utf8')
        .split('\n')
        .filter(line => line.trim());
      let processed = 0;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as CodexLogEntry;
          await this.processLogEntry(entry, filepath);
          processed++;
        } catch (_err) {
          // skip malformed lines
        }
      }
      this.filePositions.set(filepath, stats.size);
      if (processed > 0) {
        this.logger.info(
          `   Ingested ${processed} new entries` +
            (effectiveStart > 0 ? ` (resumed from byte ${effectiveStart})` : '')
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error processing Codex file ${filepath}: ${msg}`);
    }
  }

  async handleLogFileChanged(filepath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(filepath);
      const lastPosition = this.filePositions.get(filepath) || 0;

      if (stats.size < lastPosition) {
        this.filePositions.set(filepath, 0);
        return;
      }
      if (stats.size === lastPosition) return;

      const bytesToRead = stats.size - lastPosition;
      const buffer = Buffer.alloc(bytesToRead);
      let fd: number;
      try {
        fd = fs.openSync(filepath, 'r');
      } catch (openErr) {
        const msg = openErr instanceof Error ? openErr.message : String(openErr);
        this.logger.error(`Failed to open Codex log ${filepath}: ${msg}`);
        return;
      }
      try {
        fs.readSync(fd, buffer, 0, bytesToRead, lastPosition);
      } finally {
        fs.closeSync(fd);
      }

      const lastNewline = buffer.lastIndexOf(0x0a);
      if (lastNewline === -1) return;
      const completeSlice = buffer.subarray(0, lastNewline + 1);
      const completeBytes = completeSlice.length;
      const lines = completeSlice.toString('utf8').split('\n');
      lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        let entry: CodexLogEntry;
        try {
          entry = JSON.parse(line) as CodexLogEntry;
        } catch (_err) {
          continue;
        }
        try {
          await this.processLogEntry(entry, filepath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Error processing Codex entry: ${msg}`);
        }
      }

      this.filePositions.set(filepath, lastPosition + completeBytes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error processing Codex log ${filepath}: ${msg}`);
    }
  }

  /**
   * Get the cached session info for this rollout file. Codex puts the cwd
   * and session id in the very first `session_meta` line, so callers
   * after that point have a populated record.
   */
  getSessionInfo(filepath: string): SessionMeta | null {
    return this.sessionMeta.get(filepath) || null;
  }

  /**
   * Build the baseEvent fields shared by every emit, given the file's
   * cached session metadata. Returns null if we haven't seen session_meta
   * yet.
   */
  baseEventFor(filepath: string, timestamp: string): BaseEvent | null {
    const meta = this.sessionMeta.get(filepath);
    if (!meta) return null;
    return {
      projectName: meta.projectName,
      projectPath: meta.cwd,
      sessionId: meta.sessionId,
      timestamp,
      source: 'codex'
    };
  }

  async processLogEntry(entry: CodexLogEntry, filepath: string): Promise<void> {
    const timestamp = entry.timestamp || new Date().toISOString();
    const type = entry.type;
    const payload = entry.payload || {};

    if (type === 'session_meta') {
      const meta = payload as SessionMetaPayload;
      const cwd = meta.cwd || homedir();
      this.sessionMeta.set(filepath, {
        sessionId: meta.id || path.basename(filepath, '.jsonl'),
        cwd,
        projectName: path.basename(cwd),
        model: meta.model || null
      });
      return;
    }

    if (type === 'turn_context') {
      const turn = payload as TurnContextPayload;
      const meta = this.sessionMeta.get(filepath);
      if (meta && turn.model) {
        meta.model = turn.model;
      }
      return;
    }

    const baseEvent = this.baseEventFor(filepath, timestamp);
    if (!baseEvent) return;

    if (type === 'event_msg') {
      const msg = payload as EventMsgPayload;
      const evt = msg.type;

      if (evt === 'user_message') {
        await this.eventCallback({
          ...baseEvent,
          type: 'user_message',
          content: (msg.message || '').slice(0, 500),
          eventCategory: 'conversation'
        });
        return;
      }

      if (evt === 'agent_message') {
        await this.eventCallback({
          ...baseEvent,
          type: 'assistant_text',
          content: (msg.message || '').slice(0, 500),
          eventCategory: 'conversation'
        });
        return;
      }
      // task_started / task_complete / token_count / review_mode are
      // intentionally not emitted in v1.
      return;
    }

    if (type === 'response_item') {
      const item = payload as ResponseItemPayload;
      const sub = item.type;

      if (sub === 'function_call') {
        await this.handleFunctionCall(item, baseEvent);
        return;
      }

      if (sub === 'message') {
        const role = item.role;
        const text = Array.isArray(item.content)
          ? item.content
              .filter(c => c?.type === 'input_text' || c?.type === 'output_text')
              .map(c => c.text || '')
              .join('\n')
          : '';
        if (!text) return;

        if (role === 'user') {
          await this.eventCallback({
            ...baseEvent,
            type: 'user_message',
            content: text.slice(0, 500),
            eventCategory: 'conversation'
          });
        } else if (role === 'assistant') {
          await this.eventCallback({
            ...baseEvent,
            type: 'assistant_text',
            content: text.slice(0, 500),
            eventCategory: 'conversation'
          });
        }
        return;
      }
      // function_call_output / reasoning are skipped — they don't
      // map cleanly to existing categories and would just add noise.
    }
  }

  async handleFunctionCall(payload: ResponseItemPayload, baseEvent: BaseEvent): Promise<void> {
    const name = payload.name || 'unknown';
    let args: Record<string, unknown> = {};
    try {
      args =
        typeof payload.arguments === 'string'
          ? (JSON.parse(payload.arguments) as Record<string, unknown>)
          : (payload.arguments as Record<string, unknown>) || {};
    } catch (_err) {
      args = {};
    }

    const cmd = typeof args.cmd === 'string' ? args.cmd : '';

    if (cmd) {
      const patchTarget = APPLY_PATCH_TARGET.exec(cmd);
      if (patchTarget) {
        const action = patchTarget[1];
        const filePath = patchTarget[2].trim();
        const fileEventType = action === 'Add' ? 'add' : action === 'Delete' ? 'delete' : 'change';
        await this.eventCallback({
          ...baseEvent,
          type: fileEventType,
          path: filePath,
          tool: 'apply_patch',
          eventCategory: 'file_change'
        });
      }
    }

    await this.eventCallback({
      ...baseEvent,
      type: 'tool_call',
      tool: name,
      file: cmd ? cmd.slice(0, 100) : undefined,
      eventCategory: 'agent_event'
    });
  }

  async getWatchStats(): Promise<{ fileCount: number; files: string[] }> {
    const files: string[] = [];
    try {
      const walk = (dir: string): void => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.name.endsWith('.jsonl')) {
            files.push(fullPath);
          }
        }
      };
      walk(this.codexSessionsDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error walking Codex sessions: ${msg}`);
    }
    return { fileCount: files.length, files };
  }

  getActiveProjects(): Array<{ projectPath: string; projectName: string; sessionId: string }> {
    const seen = new Map<string, { projectPath: string; projectName: string; sessionId: string }>();
    for (const meta of this.sessionMeta.values()) {
      if (!seen.has(meta.cwd)) {
        seen.set(meta.cwd, {
          projectPath: meta.cwd,
          projectName: meta.projectName,
          sessionId: meta.sessionId
        });
      }
    }
    return Array.from(seen.values());
  }
}
