/**
 * Conversation Sync Service
 *
 * Automatically monitors Claude Code session files and imports
 * conversations into Raven's database in real-time.
 *
 * This ensures the Conversations panel always shows current data.
 */

import { watch } from 'fs';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';

export class ConversationSync {
  constructor(db, sessionId, io, projectPath) {
    this.db = db;
    this.sessionId = sessionId;
    this.io = io;
    this.projectPath = projectPath;
    this.projectName = basename(projectPath);

    // Find Claude Code project directory
    const homePath = homedir();
    const projectKey = projectPath.replace(/\//g, '-');
    this.claudeProjectDir = join(homePath, '.claude', 'projects', projectKey);

    this.watcher = null;
    this.processedLines = new Map(); // Track processed lines per file
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncedCount = 0;
  }

  /**
   * Start monitoring Claude Code session files
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Conversation sync already running');
      return;
    }

    // Check if Claude project directory exists
    if (!existsSync(this.claudeProjectDir)) {
      logger.warn(`Claude project directory not found: ${this.claudeProjectDir}`);
      logger.info('Conversations will not auto-sync. Use manual import if needed.');
      return;
    }

    try {
      // Process existing session files first
      await this.processExistingFiles();

      // Start watching for new changes
      this.watcher = watch(this.claudeProjectDir, { recursive: false }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          this.handleFileChange(join(this.claudeProjectDir, filename));
        }
      });

      this.isRunning = true;
      this.lastSyncTime = new Date();

      logger.info(`✓ Conversation sync started for ${this.projectName}`);
      logger.info(`  Watching: ${this.claudeProjectDir}`);
      logger.info(`  Synced: ${this.syncedCount} conversations`);
    } catch (error) {
      logger.error('Failed to start conversation sync:', error);
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.isRunning = false;
    logger.info(`Conversation sync stopped for ${this.projectName}`);
  }

  /**
   * Process all existing session files
   */
  async processExistingFiles() {
    try {
      const files = require('fs').readdirSync(this.claudeProjectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          path: join(this.claudeProjectDir, f),
          mtime: statSync(join(this.claudeProjectDir, f)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime); // Most recent first

      // Process only the most recent session file (likely active session)
      if (files.length > 0) {
        const recentFile = files[0];
        const daysSinceModified = (Date.now() - recentFile.mtime) / (1000 * 60 * 60 * 24);

        // Only process if modified within last 7 days
        if (daysSinceModified <= 7) {
          await this.processFile(recentFile.path, true);
        } else {
          logger.info(`Skipping old session file (${daysSinceModified.toFixed(1)} days old)`);
        }
      }
    } catch (error) {
      logger.error('Error processing existing files:', error);
    }
  }

  /**
   * Handle file change event
   */
  async handleFileChange(filepath) {
    try {
      // Debounce - wait a bit for file writes to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.processFile(filepath, false);
    } catch (error) {
      logger.error(`Error processing file ${filepath}:`, error);
    }
  }

  /**
   * Process a session file and import conversations
   */
  async processFile(filepath, isInitial = false) {
    try {
      if (!existsSync(filepath)) return;

      const content = readFileSync(filepath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // Track which lines we've already processed
      const sessionFile = basename(filepath);
      const processedCount = this.processedLines.get(sessionFile) || 0;

      // Only process new lines
      const newLines = lines.slice(processedCount);
      if (newLines.length === 0) return;

      let imported = 0;
      const claudeSessionId = sessionFile.replace('.jsonl', '');

      for (const line of newLines) {
        try {
          const entry = JSON.parse(line);

          // Skip if not a conversation entry
          if (!entry.type || !['user_message', 'assistant_text', 'tool_call', 'tool_result'].includes(entry.type)) {
            continue;
          }

          // Insert into database
          const timestamp = entry.timestamp || new Date().toISOString();
          const eventType = entry.type;
          const content = entry.content || entry.text || null;
          const toolName = entry.tool?.name || entry.tool_name || null;
          const toolInput = entry.tool?.input || entry.input ? JSON.stringify(entry.tool?.input || entry.input) : null;
          const toolOutput = entry.output || entry.result || null;
          const isError = entry.error || false;
          const parentUuid = entry.parent_uuid || null;
          const metadata = entry.metadata ? JSON.stringify(entry.metadata) : null;

          this.db.insertConversation(
            timestamp,
            claudeSessionId,
            eventType,
            content,
            toolName,
            toolInput,
            toolOutput,
            isError,
            parentUuid,
            metadata,
            this.projectName,
            this.sessionId
          );

          imported++;
          this.syncedCount++;
        } catch (parseError) {
          // Skip malformed lines
          continue;
        }
      }

      // Update processed line count
      this.processedLines.set(sessionFile, lines.length);

      if (imported > 0) {
        logger.info(`✓ Imported ${imported} conversation(s) from ${sessionFile}`);

        // Emit WebSocket event to refresh frontend
        if (this.io) {
          this.io.emit('conversation', {
            imported,
            sessionFile,
            project: this.projectName
          });
        }

        this.lastSyncTime = new Date();
      }

      // Log initial sync
      if (isInitial && imported > 0) {
        logger.info(`  Initial sync complete: ${imported} conversation(s)`);
      }
    } catch (error) {
      logger.error(`Error processing file ${filepath}:`, error);
    }
  }

  /**
   * Get sync status for health checks
   */
  getStatus() {
    return {
      running: this.isRunning,
      projectName: this.projectName,
      claudeProjectDir: this.claudeProjectDir,
      exists: existsSync(this.claudeProjectDir),
      lastSyncTime: this.lastSyncTime,
      syncedCount: this.syncedCount
    };
  }

  /**
   * Force a sync of all recent conversations
   */
  async forceSync() {
    logger.info('Forcing conversation sync...');
    this.processedLines.clear();
    await this.processExistingFiles();
  }
}
