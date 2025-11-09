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
import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';
import { detectProjectFromPath } from '../utils/project-utils.js';
import { AnomalyDetector } from './anomaly-detector.js';
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
 * FileChangeHandler class
 * Manages file change events for all projects with proper locking and error handling
 */
export class FileChangeHandler {
  /**
   * Create a FileChangeHandler instance
   * @param {object} options - Configuration options
   * @param {Map} options.projectPaths - Map of project names to paths
   * @param {Map} options.projectDatabases - Map of project names to database instances
   * @param {Map} options.projectGitMonitors - Map of project names to git monitors
   * @param {Map} options.projectSnapshotDirs - Map of project names to snapshot directories
   * @param {Map} options.fileCache - LRU cache for file contents
   * @param {object} options.io - Socket.IO instance for event emission
   * @param {string} options.SESSION_ID - Session identifier
   * @param {object} options.fileProcessingLock - Lock manager for file operations
   * @param {object} options.developerDB - Developer database instance
   * @param {object} options.sessionTracker - Session tracking service
   * @param {Function} options.addToFileCache - Function to add content to cache
   * @param {Function} options.emitGitStatusUpdate - Function to emit git status updates
   */
  constructor(options) {
    this.projectPaths = options.projectPaths;
    this.projectDatabases = options.projectDatabases;
    this.projectGitMonitors = options.projectGitMonitors;
    this.projectSnapshotDirs = options.projectSnapshotDirs;
    this.fileCache = options.fileCache;
    this.io = options.io;
    this.SESSION_ID = options.SESSION_ID;
    this.fileProcessingLock = options.fileProcessingLock;
    this.developerDB = options.developerDB;
    this.sessionTracker = options.sessionTracker;
    this.addToFileCache = options.addToFileCache;
    this.emitGitStatusUpdate = options.emitGitStatusUpdate;

    // Initialize anomaly detectors for each project
    this.anomalyDetectors = new Map();
    this.initializeAnomalyDetectors();
  }

  /**
   * Initialize anomaly detectors for all projects
   */
  initializeAnomalyDetectors() {
    for (const [projectName, db] of this.projectDatabases.entries()) {
      try {
        const detector = new AnomalyDetector(db);
        detector.startPeriodicUpdates();
        this.anomalyDetectors.set(projectName, detector);
        logger.info(`Anomaly detector initialized for project: ${projectName}`);
      } catch (error) {
        logger.error(`Failed to initialize anomaly detector for ${projectName}:`, error);
      }
    }
  }

  /**
   * Cleanup anomaly detectors
   */
  cleanup() {
    for (const detector of this.anomalyDetectors.values()) {
      detector.stopPeriodicUpdates();
    }
    this.anomalyDetectors.clear();
  }

  /**
   * Calculate SHA256 hash of content
   * @param {string} content - Content to hash
   * @returns {string} - Hex encoded hash
   */
  calculateFileHash(content) {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate unified diff between old and new content
   * @param {string} oldContent - Original content
   * @param {string} newContent - New content
   * @returns {string} - Unified diff
   */
  generateDiff(oldContent, newContent) {
    // Optimized: Use minimal context (3 lines) instead of default to reduce diff size
    return Diff.createPatch('file', oldContent, newContent, '', '', { context: 3 });
  }

  /**
   * Detect programming language from file extension
   * @param {string} filepath - File path to analyze
   * @returns {string} - Language identifier
   */
  detectLanguage(filepath) {
    return detectLang(filepath);
  }

  /**
   * Save a snapshot of file content for recovery purposes
   * @param {string} filepath - Absolute file path
   * @param {string} content - File content to snapshot
   * @param {string} projectName - Name of the project
   * @returns {Promise<string|null>} - Path to saved snapshot or null on error
   */
  async saveSnapshot(filepath, content, projectName) {
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
      logger.error(`❌ Snapshot save error [${projectName}]:`, error);
      return null;
    }
  }

  /**
   * Collect system metrics (CPU and memory usage)
   * @returns {Promise<{cpuPercent: number, memPercent: number}>}
   */
  async collectSystemMetrics() {
    let cpuPercent = 0;
    let memPercent = 0;

    try {
      const cpuLoad = await si.currentLoad();
      const memInfo = await si.mem();
      cpuPercent = cpuLoad.currentLoad || 0;
      memPercent = (memInfo.used / memInfo.total) * 100;
    } catch (metricsError) {
      logger.warn('Failed to collect system metrics, using defaults:', metricsError.message);
    }

    return { cpuPercent, memPercent };
  }

  /**
   * Run syntax and pattern checks asynchronously
   * @param {string} filepath - File path to check
   * @param {string} content - File content
   * @param {object} db - Database instance
   * @param {string} projectName - Project name
   */
  async runSafetyChecks(filepath, content, db, projectName) {
    if (!content) return;

    setImmediate(async () => {
      try {
        const { SyntaxChecker } = await import('./syntax-checker.js');
        const { PatternChecker } = await import('./pattern-checker.js');

        const syntaxChecker = new SyntaxChecker(db, this.SESSION_ID, this.io, projectName);
        const patternChecker = new PatternChecker(db, this.SESSION_ID, this.io, projectName);

        await Promise.all([
          syntaxChecker
            .checkFile(filepath)
            .catch(err => logger.error(`Syntax check failed for ${filepath}:`, err)),
          patternChecker
            .checkFile(filepath)
            .catch(err => logger.error(`Pattern check failed for ${filepath}:`, err))
        ]);
      } catch (error) {
        logger.error('Error running safety checks:', error);
      }
    });
  }

  /**
   * Insert event into database
   * @param {object} db - Database instance
   * @param {object} eventData - Event data to insert
   * @returns {Promise<{success: boolean, eventId: number|null}>}
   */
  async insertEventToDatabase(db, eventData) {
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
        eventData.eventSize
      );

      // Update with anomaly data if present
      if (eventData.anomaly && eventId) {
        const stmt = db.prepareStatement(`
          UPDATE events
          SET is_anomaly = ?,
              anomaly_score = ?,
              anomaly_confidence = ?,
              anomaly_reasons = ?,
              risk_level = ?,
              agent = ?,
              agent_confidence = ?
          WHERE id = ?
        `);

        stmt.run(
          eventData.anomaly.isAnomaly ? 1 : 0,
          eventData.anomaly.score || null,
          eventData.anomaly.confidence || null,
          eventData.anomaly.reasons ? JSON.stringify(eventData.anomaly.reasons) : null,
          eventData.anomaly.riskLevel || null,
          eventData.agent || null,
          eventData.agentConfidence || null,
          eventId
        );
      }

      const anomalyFlag = eventData.anomaly?.isAnomaly ? ' ⚠️  ANOMALY' : '';
      logger.info(
        `📁 [${eventData.projectName}] File ${eventData.eventType}: ${eventData.relPath} (${eventData.eventSize} bytes)${anomalyFlag}`
      );

      return { success: true, eventId };
    } catch (dbError) {
      logger.error(`Database insert failed [${eventData.projectName}]:`, dbError);
      return { success: false, eventId: null };
    }
  }

  /**
   * Log to developer persona database
   * @param {string} projectName - Project name
   * @param {string} filepath - File path
   * @param {string} eventType - Event type
   * @param {string} diff - Diff content
   * @param {string} timestamp - Timestamp
   */
  async logToDeveloperDB(projectName, filepath, eventType, diff, timestamp) {
    if (!this.developerDB) return;

    try {
      const language = this.detectLanguage(filepath);
      const { linesAdded, linesRemoved } = calculateDiffStats(diff);

      this.developerDB.logCodePattern({
        project: projectName,
        language,
        file_type: filepath.split('.').pop(),
        edit_type: eventType === 'create' ? 'create' : eventType === 'delete' ? 'delete' : 'modify',
        lines_added: linesAdded,
        lines_removed: linesRemoved,
        timestamp
      });
    } catch (devDbError) {
      logger.error(`Failed to log to developer DB [${projectName}]:`, devDbError);
    }
  }

  /**
   * Emit WebSocket events for file change
   * @param {boolean} success - Whether database insert succeeded
   * @param {number|null} eventId - Event ID from database
   * @param {object} eventData - Event data
   */
  emitFileChangeEvent(success, eventId, eventData) {
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
   * @param {string} eventType - Type of change: 'create', 'edit', or 'delete'
   * @param {string} filepath - Absolute path to the changed file
   * @returns {Promise<void>}
   */
  async handleFileChange(eventType, filepath) {
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

      let diff = null;
      let fileHash = null;
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
          const result = await readBinaryFile(
            filepath,
            projectName,
            relPath,
            this.calculateFileHash.bind(this)
          );

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
          const result = await readTextFile(
            filepath,
            projectName,
            relPath,
            this.calculateFileHash.bind(this)
          );

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

          content = result.content;
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

      // Run anomaly detection
      let anomalyResult = null;
      const detector = this.anomalyDetectors.get(projectName);
      if (detector) {
        try {
          anomalyResult = detector.analyzeEvent({
            filepath: relPath,
            change_type: eventType,
            event_size: eventSize,
            diff
          });

          if (anomalyResult.isAnomaly) {
            logger.warn(`🚨 Anomaly detected [${projectName}]`, {
              file: relPath,
              score: anomalyResult.score,
              riskLevel: anomalyResult.riskLevel,
              reasons: anomalyResult.reasons.map(r => r.message)
            });

            // Emit anomaly notification via WebSocket
            this.io.emit('anomaly-detected', {
              project: projectName,
              filepath: relPath,
              timestamp,
              score: anomalyResult.score,
              confidence: anomalyResult.confidence,
              riskLevel: anomalyResult.riskLevel,
              reasons: anomalyResult.reasons
            });
          }
        } catch (anomalyError) {
          logger.error(`Anomaly detection failed for ${relPath}:`, anomalyError);
        }
      }

      // Insert into database
      const eventData = {
        timestamp,
        relPath,
        eventType,
        diff,
        cpuPercent,
        memPercent,
        fileHash,
        eventSize,
        projectName,
        anomaly: anomalyResult,
        agent: null, // Will be populated by agent detector (Feature 2)
        agentConfidence: null
      };

      const { success, eventId } = await this.insertEventToDatabase(db, eventData);

      // Track session activity
      if (success && this.sessionTracker) {
        this.sessionTracker.recordActivity(projectName, {
          change_type: eventType,
          diff,
          filepath: relPath,
          agent: null,
          risk_score: 0
        });
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
