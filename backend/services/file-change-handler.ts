/**
 * File Change Handler Service
 * Handles all file change events (create, edit, delete) with proper error handling,
 * diff generation, database persistence, and WebSocket event emission.
 *
 * Extracted from server.js to improve modularity and maintainability.
 */

import fs from 'fs';
import { relative, join, dirname } from 'path';
import { createHash } from 'crypto';
import * as Diff from 'diff';
import { gzip } from 'zlib';
import { promisify } from 'util';
import * as si from 'systeminformation';
import type {
  ISOTimestamp,
  ProjectName,
  ChangeType,
  SHA256Hash,
  FileChangeHandlerOptions,
  SystemMetricsResult,
  RavenDatabase,
  SessionActivity
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';
import { detectProjectFromPath } from '../utils/project-utils.js';
import {
  isBinaryFile,
  checkFileExists,
  validateFileSize,
  readBinaryFile,
  readTextFile,
  generateFileDiff,
  generateDeleteDiff,
  calculateDiffStats,
  handleFileReadError,
  emitFileTooLargeEvent,
  detectLanguage as detectLang
} from '../utils/file-processing-helpers.js';

const gzipAsync = promisify(gzip);
const MAX_FILE_SIZE_BYTES = LIMITS.FILE.MAX_SIZE_BYTES;

/**
 * Event data structure for database insertion
 */
interface EventData {
  timestamp: ISOTimestamp;
  relPath: string;
  eventType: ChangeType;
  diff: string | null;
  cpuPercent: number;
  memPercent: number;
  fileHash: SHA256Hash | null;
  eventSize: number;
  projectName: ProjectName;
}

/**
 * FileChangeHandler class
 * Manages file change events for all projects with proper locking and error handling
 */
export class FileChangeHandler {
  private projectPaths: Map<ProjectName, string>;
  private projectDatabases: Map<ProjectName, RavenDatabase>;
  private projectSnapshotDirs: Map<ProjectName, string>;
  private fileCache: Map<string, string>;
  private io: FileChangeHandlerOptions['io'];
  private SESSION_ID: string;
  private fileProcessingLock: FileChangeHandlerOptions['fileProcessingLock'];
  private developerDB: FileChangeHandlerOptions['developerDB'];
  private sessionTracker: FileChangeHandlerOptions['sessionTracker'];
  private addToFileCache: FileChangeHandlerOptions['addToFileCache'];
  private emitGitStatusUpdate: FileChangeHandlerOptions['emitGitStatusUpdate'];

  /**
   * Create a FileChangeHandler instance
   * @param options - Configuration options
   */
  constructor(options: FileChangeHandlerOptions) {
    this.projectPaths = options.projectPaths;
    this.projectDatabases = options.projectDatabases;
    this.projectSnapshotDirs = options.projectSnapshotDirs;
    this.fileCache = options.fileCache;
    this.io = options.io;
    this.SESSION_ID = options.SESSION_ID;
    this.fileProcessingLock = options.fileProcessingLock;
    this.developerDB = options.developerDB;
    this.sessionTracker = options.sessionTracker;
    this.addToFileCache = options.addToFileCache;
    this.emitGitStatusUpdate = options.emitGitStatusUpdate;
  }

  /**
   * Calculate SHA256 hash of content
   * @param content - Content to hash
   * @returns Hex encoded hash
   */
  calculateFileHash(content: string): SHA256Hash {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate unified diff between old and new content
   * @param oldContent - Original content
   * @param newContent - New content
   * @returns Unified diff
   */
  generateDiff(oldContent: string, newContent: string): string {
    // Optimized: Use minimal context (3 lines) instead of default to reduce diff size
    return Diff.createPatch('file', oldContent, newContent, '', '', { context: 3 });
  }

  /**
   * Detect programming language from file extension
   * @param filepath - File path to analyze
   * @returns Language identifier
   */
  detectLanguage(filepath: string): string {
    return detectLang(filepath);
  }

  /**
   * Save a snapshot of file content for recovery purposes
   * @param filepath - Absolute file path
   * @param content - File content to snapshot
   * @param projectName - Name of the project
   * @returns Path to saved snapshot or null on error
   */
  async saveSnapshot(
    filepath: string,
    content: string,
    projectName: ProjectName
  ): Promise<string | null> {
    try {
      const projectPath = this.projectPaths.get(projectName);
      const snapshotsDir = this.projectSnapshotDirs.get(projectName);

      if (!projectPath || !snapshotsDir) {
        logger.warn(`No snapshot directory for project ${projectName}`);
        return null;
      }

      const relPath = relative(projectPath, filepath);
      const timestamp = Date.now();
      const snapshotFilename = `${relPath.replace(/\//g, '_')}_${timestamp}.gz`;
      const snapshotPath = join(snapshotsDir, snapshotFilename);

      // Create directory if it doesn't exist
      await fs.promises.mkdir(dirname(snapshotPath), { recursive: true });

      // Compress and save
      const compressed = await gzipAsync(content);
      await fs.promises.writeFile(snapshotPath, compressed);

      logger.debug(`💾 Snapshot saved: [${projectName}] ${snapshotFilename}`);
      return snapshotPath;
    } catch (error) {
      logger.error(`❌ Snapshot save error [${projectName}]:`, error as any);
      return null;
    }
  }

  /**
   * Collect system metrics (CPU and memory usage)
   * @returns CPU and memory percentages
   */
  async collectSystemMetrics(): Promise<SystemMetricsResult> {
    let cpuPercent = 0;
    let memPercent = 0;

    try {
      const cpuLoad = await si.currentLoad();
      const memInfo = await si.mem();
      cpuPercent = cpuLoad.currentLoad || 0;
      memPercent = (memInfo.used / memInfo.total) * 100;
    } catch (metricsError) {
      const error = metricsError as Error;
      logger.warn('Failed to collect system metrics, using defaults:', error.message);
    }

    return { cpuPercent, memPercent };
  }

  /**
   * Run syntax and pattern checks asynchronously
   * @param filepath - File path to check
   * @param content - File content
   * @param db - Database instance
   * @param projectName - Project name
   */
  async runSafetyChecks(
    filepath: string,
    content: string,
    db: RavenDatabase,
    projectName: ProjectName
  ): Promise<void> {
    if (!content) return;

    setImmediate(async () => {
      try {
        const { SyntaxChecker } = (await import('./syntax-checker.js')) as any;
        const { PatternChecker } = (await import('./pattern-checker.js')) as any;

        const syntaxChecker = new SyntaxChecker(db, this.SESSION_ID, this.io, projectName);
        const patternChecker = new PatternChecker(db, this.SESSION_ID, this.io, projectName);

        await Promise.all([
          syntaxChecker
            .checkFile(filepath)
            .catch((err: Error) => logger.error(`Syntax check failed for ${filepath}:`, err)),
          patternChecker
            .checkFile(filepath)
            .catch((err: Error) => logger.error(`Pattern check failed for ${filepath}:`, err))
        ]);
      } catch (error) {
        logger.error('Error running safety checks:', error as any);
      }
    });
  }

  /**
   * Insert event into database
   * @param db - Database instance
   * @param eventData - Event data to insert
   * @returns Success status and event ID
   */
  async insertEventToDatabase(
    db: RavenDatabase,
    eventData: EventData
  ): Promise<{ success: boolean; eventId: number | null }> {
    try {
      const eventId = db.insertEvent(
        eventData.timestamp,
        eventData.relPath,
        eventData.eventType,
        eventData.diff,
        eventData.cpuPercent,
        eventData.memPercent,
        this.SESSION_ID,
        eventData.fileHash,
        eventData.eventSize,
        eventData.projectName
      );

      logger.info(
        `📁 [${eventData.projectName}] File ${eventData.eventType}: ${eventData.relPath} (${eventData.eventSize} bytes)`
      );

      return { success: true, eventId };
    } catch (dbError) {
      logger.error(`Database insert failed [${eventData.projectName}]:`, dbError as any);
      return { success: false, eventId: null };
    }
  }

  /**
   * Log to developer persona database
   * @param projectName - Project name
   * @param filepath - File path
   * @param eventType - Event type
   * @param diff - Diff content
   * @param timestamp - Timestamp
   */
  async logToDeveloperDB(
    projectName: ProjectName,
    filepath: string,
    eventType: ChangeType,
    diff: string | null,
    timestamp: ISOTimestamp
  ): Promise<void> {
    if (!this.developerDB) return;

    try {
      const language = this.detectLanguage(filepath);
      const { linesAdded, linesRemoved } = calculateDiffStats(diff);

      this.developerDB.logCodePattern({
        project: projectName,
        language,
        file_type: filepath.split('.').pop() || '',
        edit_type: eventType === 'create' ? 'create' : eventType === 'delete' ? 'delete' : 'modify',
        lines_added: linesAdded,
        lines_removed: linesRemoved,
        timestamp
      });
    } catch (devDbError) {
      logger.error(`Failed to log to developer DB [${projectName}]:`, devDbError as any);
    }
  }

  /**
   * Emit WebSocket events for file change
   * @param success - Whether database insert succeeded
   * @param eventId - Event ID from database
   * @param eventData - Event data
   */
  emitFileChangeEvent(success: boolean, eventId: number | null, eventData: EventData): void {
    if (success && eventId) {
      this.io.emit('file-changed', {
        id: eventId,
        timestamp: eventData.timestamp,
        project: eventData.projectName,
        filepath: eventData.relPath,
        change_type: eventData.eventType,
        event_size: eventData.eventSize,
        file_hash: eventData.fileHash
      });
    } else {
      logger.warn(
        `File change tracked but not persisted: [${eventData.projectName}] ${eventData.relPath}`
      );
      this.io.emit('file-changed-untracked', {
        timestamp: eventData.timestamp,
        project: eventData.projectName,
        filepath: eventData.relPath,
        change_type: eventData.eventType,
        error: 'Database insert failed'
      });
    }
  }

  /**
   * Handle file change events (create, edit, delete)
   * @param eventType - Type of change: 'create', 'edit', or 'delete'
   * @param filepath - Absolute path to the changed file
   */
  async handleFileChange(eventType: ChangeType, filepath: string): Promise<void> {
    // Acquire lock for this file to prevent race conditions
    const release = await this.fileProcessingLock.acquire(filepath);

    try {
      // Detect which project this file belongs to
      const projectName = detectProjectFromPath(filepath, this.projectPaths);
      if (!projectName) {
        logger.warn(`⚠️  Could not determine project for file: ${filepath}`);
        return;
      }

      // Get project-specific resources
      const projectPath = this.projectPaths.get(projectName);
      const db = this.projectDatabases.get(projectName);

      if (!db || !projectPath) {
        logger.error(`❌ Project resources not found for ${projectName}`);
        return;
      }

      const relPath = relative(projectPath, filepath);
      const timestamp = new Date().toISOString();

      let diff: string | null = null;
      let fileHash: SHA256Hash | null = null;
      let eventSize = 0;
      let content = '';

      // Handle create and edit events
      if (eventType === 'create' || eventType === 'edit') {
        // Check if file exists
        if (!checkFileExists(filepath, projectName, relPath)) {
          return await this.handleFileChange('delete', filepath);
        }

        // Validate file size
        const sizeValidation = await validateFileSize(filepath, projectName, relPath);
        if (!sizeValidation.valid) {
          if (sizeValidation.size > 0) {
            emitFileTooLargeEvent(this.io, projectName, relPath, sizeValidation.size);
          }
          return;
        }

        const fileSizeBytes = sizeValidation.size;

        // Double-check file still exists
        if (!checkFileExists(filepath, projectName, relPath)) {
          return await this.handleFileChange('delete', filepath);
        }

        // Handle binary vs text files
        if (isBinaryFile(filepath)) {
          const result = (await readBinaryFile(
            filepath,
            projectName,
            relPath,
            this.calculateFileHash.bind(this)
          )) as any;

          if (!result.success) {
            if (result.oversized) {
              emitFileTooLargeEvent(this.io, projectName, relPath, result.size);
            } else if (result.error) {
              const errorAction = handleFileReadError(result.error, projectName, relPath, this.io);
              if (errorAction.shouldConvertToDelete) {
                return await this.handleFileChange('delete', filepath);
              }
            }
            return;
          }

          fileHash = result.hash;
          eventSize = result.size;
          diff = null;
        } else {
          const result = (await readTextFile(
            filepath,
            projectName,
            relPath,
            this.calculateFileHash.bind(this)
          )) as any;

          if (!result.success) {
            if (result.oversized) {
              emitFileTooLargeEvent(this.io, projectName, relPath, result.size);
            } else if (result.error) {
              const errorAction = handleFileReadError(result.error, projectName, relPath, this.io);
              if (errorAction.shouldConvertToDelete) {
                return await this.handleFileChange('delete', filepath);
              }
            }
            return;
          }

          content = result.content || '';
          fileHash = result.hash;
          eventSize = result.size;

          // Generate diff
          diff = generateFileDiff(
            eventType,
            content,
            this.fileCache,
            filepath,
            this.generateDiff.bind(this)
          );

          // Save snapshot
          await this.saveSnapshot(filepath, content, projectName);

          // Update cache (only for smaller files)
          if (fileSizeBytes < MAX_FILE_SIZE_BYTES / 2) {
            this.addToFileCache(filepath, content);
          }
        }

        // Run safety checks asynchronously
        if (content) {
          await this.runSafetyChecks(filepath, content, db, projectName);
        }
      } else if (eventType === 'delete') {
        // Handle delete events
        const deleteResult = generateDeleteDiff(this.fileCache, filepath);
        diff = deleteResult.diff;
        eventSize = deleteResult.size;

        // Remove from cache
        this.fileCache.delete(filepath);

        // Clear errors and warnings
        db.clearSyntaxErrors(filepath);
        db.clearPatternWarnings(filepath);
      }

      // Collect system metrics
      const { cpuPercent, memPercent } = await this.collectSystemMetrics();

      // Insert into database
      const eventData: EventData = {
        timestamp,
        relPath,
        eventType,
        diff,
        cpuPercent,
        memPercent,
        fileHash,
        eventSize,
        projectName
      };

      const { success, eventId } = await this.insertEventToDatabase(db, eventData);

      // Track session activity
      if (success && this.sessionTracker) {
        const activity: SessionActivity = {
          change_type: eventType,
          diff,
          filepath: relPath,
          agent: null,
          risk_score: 0
        };
        this.sessionTracker.recordActivity(projectName, activity);
      }

      // Log to developer DB
      await this.logToDeveloperDB(projectName, filepath, eventType, diff, timestamp);

      // Emit WebSocket events
      this.emitFileChangeEvent(success, eventId, eventData);

      // Update git status
      if (this.emitGitStatusUpdate) {
        this.emitGitStatusUpdate(projectName);
      }
    } finally {
      release();
    }
  }
}
