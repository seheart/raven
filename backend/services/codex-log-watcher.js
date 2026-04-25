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
import chokidar from 'chokidar';
import { homedir } from 'os';

// Codex's apply_patch heredoc uses `*** Update File: <path>` /
// `*** Add File: <path>` / `*** Delete File: <path>` markers.
const APPLY_PATCH_TARGET = /^\*\*\* (Update|Add|Delete) File:\s*(.+)$/m;

export class CodexLogWatcher {
  constructor(eventCallback, logger) {
    this.eventCallback = eventCallback;
    this.logger = logger;
    this.codexSessionsDir = path.join(homedir(), '.codex', 'sessions');
    this.logWatcher = null;
    this.filePositions = new Map(); // filepath -> bytes read so far
    this.sessionMeta = new Map(); // filepath -> { sessionId, cwd, projectName, model }
  }

  async start() {
    this.logger.info('🔍 Starting Codex Log Watcher...');
    this.logger.info(`   Watching: ${this.codexSessionsDir}`);

    if (!fs.existsSync(this.codexSessionsDir)) {
      this.logger.warn(
        '⚠️  Codex sessions directory not found — Codex monitoring will activate when it appears.'
      );
      // Still start the watcher; chokidar will pick up the dir when it's created.
    }

    this.logWatcher = chokidar.watch(this.codexSessionsDir, {
      persistent: true,
      ignoreInitial: false,
      usePolling: true,
      interval: 100,
      binaryInterval: 100,
      awaitWriteFinish: false,
      ignorePermissionErrors: true,
      alwaysStat: true,
      depth: 4, // sessions/YYYY/MM/DD/file.jsonl
      ignored: (watchPath, stats) => {
        if (stats?.isFile()) {
          return !watchPath.endsWith('.jsonl');
        }
        return false;
      }
    });

    this.logWatcher.on('add', filepath => this.handleLogFileAdded(filepath));
    this.logWatcher.on('change', filepath => this.handleLogFileChanged(filepath));
    this.logWatcher.on('error', error =>
      this.logger.error(`❌ Codex watcher error: ${error.message}`)
    );

    this.logWatcher.on('ready', () => {
      this.logger.info('📡 Codex watcher ready');
    });

    const stats = await this.getWatchStats();
    this.logger.info('✅ Codex Log Watcher started');
    this.logger.info(`   Watching ${stats.fileCount} rollout files`);
  }

  async setIdle(idle) {
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
        ignored: (watchPath, stats) => {
          if (stats?.isFile()) {
            return !watchPath.endsWith('.jsonl');
          }
          return false;
        }
      });
      this.logWatcher.on('add', filepath => this.handleLogFileAdded(filepath));
      this.logWatcher.on('change', filepath => this.handleLogFileChanged(filepath));
      this.logWatcher.on('error', error =>
        this.logger.error(`❌ Codex watcher error: ${error.message}`)
      );
    } catch (err) {
      this.logger.error(`Failed to switch Codex idle mode: ${err.message}`);
    } finally {
      this._idleSwitching = false;
    }
  }

  async stop() {
    if (this.logWatcher) {
      await this.logWatcher.close();
      this.logWatcher = null;
      this.logger.info('🛑 Codex Log Watcher stopped');
    }
  }

  async handleLogFileAdded(filepath) {
    this.logger.info(`📄 New Codex session: ${path.basename(filepath)}`);
    try {
      const content = await fs.promises.readFile(filepath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      let processed = 0;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          await this.processLogEntry(entry, filepath);
          processed++;
        } catch (_err) {
          // skip malformed lines
        }
      }
      const stats = await fs.promises.stat(filepath);
      this.filePositions.set(filepath, stats.size);
      if (processed > 0) {
        this.logger.info(`   Processed ${processed} historical entries`);
      }
    } catch (error) {
      this.logger.error(`Error processing Codex file ${filepath}: ${error.message}`);
    }
  }

  async handleLogFileChanged(filepath) {
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
      let fd;
      try {
        fd = fs.openSync(filepath, 'r');
      } catch (openErr) {
        this.logger.error(`Failed to open Codex log ${filepath}: ${openErr.message}`);
        return;
      }
      try {
        fs.readSync(fd, buffer, 0, bytesToRead, lastPosition);
      } finally {
        fs.closeSync(fd);
      }

      const lastNewline = buffer.lastIndexOf(0x0a);
      if (lastNewline === -1) return;
      const completeSlice = buffer.slice(0, lastNewline + 1);
      const completeBytes = completeSlice.length;
      const lines = completeSlice.toString('utf8').split('\n');
      lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        let entry;
        try {
          entry = JSON.parse(line);
        } catch (_err) {
          continue;
        }
        try {
          await this.processLogEntry(entry, filepath);
        } catch (err) {
          this.logger.error(`Error processing Codex entry: ${err.message}`);
        }
      }

      this.filePositions.set(filepath, lastPosition + completeBytes);
    } catch (err) {
      this.logger.error(`Error processing Codex log ${filepath}: ${err.message}`);
    }
  }

  /**
   * Get the cached session info for this rollout file. Codex puts the cwd
   * and session id in the very first `session_meta` line, so callers
   * after that point have a populated record.
   */
  getSessionInfo(filepath) {
    return this.sessionMeta.get(filepath) || null;
  }

  /**
   * Build the baseEvent fields shared by every emit, given the file's
   * cached session metadata. Returns null if we haven't seen session_meta
   * yet (i.e. lines arriving before the file's header — shouldn't happen
   * with append-only writes, but be defensive).
   */
  baseEventFor(filepath, timestamp) {
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

  async processLogEntry(entry, filepath) {
    const timestamp = entry.timestamp || new Date().toISOString();
    const type = entry.type;
    const payload = entry.payload || {};

    // First line of every rollout — cache the session header.
    if (type === 'session_meta') {
      const cwd = payload.cwd || homedir();
      this.sessionMeta.set(filepath, {
        sessionId: payload.id || path.basename(filepath, '.jsonl'),
        cwd,
        projectName: path.basename(cwd),
        model: payload.model || null
      });
      return;
    }

    // turn_context refreshes the active model.
    if (type === 'turn_context') {
      const meta = this.sessionMeta.get(filepath);
      if (meta && payload.model) {
        meta.model = payload.model;
      }
      return;
    }

    const baseEvent = this.baseEventFor(filepath, timestamp);
    if (!baseEvent) return;

    if (type === 'event_msg') {
      const evt = payload.type;

      if (evt === 'user_message') {
        await this.eventCallback({
          ...baseEvent,
          type: 'user_message',
          content: (payload.message || '').slice(0, 500),
          eventCategory: 'conversation'
        });
        return;
      }

      if (evt === 'agent_message') {
        await this.eventCallback({
          ...baseEvent,
          type: 'assistant_text',
          content: (payload.message || '').slice(0, 500),
          eventCategory: 'conversation'
        });
        return;
      }
      // task_started / task_complete / token_count / review_mode are
      // intentionally not emitted in v1.
      return;
    }

    if (type === 'response_item') {
      const sub = payload.type;

      if (sub === 'function_call') {
        await this.handleFunctionCall(payload, baseEvent);
        return;
      }

      if (sub === 'message') {
        const role = payload.role;
        const text = Array.isArray(payload.content)
          ? payload.content
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

  async handleFunctionCall(payload, baseEvent) {
    const name = payload.name || 'unknown';
    let args = {};
    try {
      args =
        typeof payload.arguments === 'string'
          ? JSON.parse(payload.arguments)
          : payload.arguments || {};
    } catch (_err) {
      args = {};
    }

    const cmd = typeof args.cmd === 'string' ? args.cmd : '';

    // Detect apply_patch — Codex's mechanism for editing files.
    if (cmd) {
      const patchTarget = APPLY_PATCH_TARGET.exec(cmd);
      if (patchTarget) {
        const action = patchTarget[1]; // Update | Add | Delete
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

    // Always emit the tool call so the activity feed shows Codex working.
    await this.eventCallback({
      ...baseEvent,
      type: 'tool_call',
      tool: name,
      file: cmd ? cmd.slice(0, 100) : null,
      eventCategory: 'agent_event'
    });
  }

  async getWatchStats() {
    const files = [];
    try {
      const walk = dir => {
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
      this.logger.error(`Error walking Codex sessions: ${err.message}`);
    }
    return { fileCount: files.length, files };
  }

  getActiveProjects() {
    const seen = new Map();
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

export default CodexLogWatcher;
