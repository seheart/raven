/**
 * Raven Backend Type Definitions
 * Comprehensive type safety for the entire application
 */

import type { Database, Statement } from 'better-sqlite3';

// ==================== Core Types ====================

/**
 * ISO 8601 timestamp string
 */
export type ISOTimestamp = string;

/**
 * SHA256 hash string
 */
export type SHA256Hash = string;

/**
 * Project name identifier
 */
export type ProjectName = string;

/**
 * Session identifier (UUID)
 */
export type SessionID = string;

// ==================== Database Types ====================

/**
 * Database statement preparation function
 */
export type PrepareStatementFn = (sql: string) => Statement;

/**
 * Database connection instance
 */
export interface DatabaseConnection {
  db: Database;
  closed: boolean;
  prepareStatement: PrepareStatementFn;
}

// ==================== Event Types ====================

/**
 * File change event types
 */
export type ChangeType = 'create' | 'edit' | 'delete';

/**
 * File event record from database
 */
export interface FileEvent {
  id: number;
  timestamp: ISOTimestamp;
  filepath: string;
  change_type: ChangeType;
  diff: string | null;
  cpu: number;
  mem: number;
  session_id: SessionID | null;
  file_hash: SHA256Hash | null;
  event_size: number;
}

/**
 * Event insertion parameters
 */
export interface InsertEventParams {
  timestamp: ISOTimestamp;
  filepath: string;
  change_type: ChangeType;
  diff: string | null;
  cpu: number;
  mem: number;
  session_id: SessionID;
  file_hash: SHA256Hash | null;
  event_size: number;
}

/**
 * Event statistics
 */
export interface EventStats {
  total_events: number;
  unique_files: number;
  unique_sessions: number;
  creates: number;
  edits: number;
  deletes: number;
  avg_event_size: number;
  total_event_size: number;
}

/**
 * Top modified file entry
 */
export interface TopModifiedFile {
  filepath: string;
  change_count: number;
}

/**
 * Longest edit entry
 */
export interface LongestEdit {
  id: number;
  timestamp: ISOTimestamp;
  filepath: string;
  change_type: ChangeType;
  diff_length: number;
  diff_preview: string;
  cpu: number;
  mem: number;
  session_id: SessionID | null;
}

// ==================== Agent Types ====================

/**
 * Agent event types
 */
export type AgentEventType = string;

/**
 * Agent event record from database
 */
export interface AgentEvent {
  id: number;
  timestamp: ISOTimestamp;
  agent: string;
  event_type: AgentEventType;
  file: string | null;
  lines_changed: number | null;
  duration_ms: number | null;
  message: string;
  metadata: string | null; // JSON string
  session_id: SessionID | null;
  project_name: ProjectName | null;
}

/**
 * Agent event insertion parameters
 */
export interface InsertAgentEventParams {
  timestamp: ISOTimestamp;
  agent: string;
  event_type: AgentEventType;
  file: string | null;
  lines_changed: number | null;
  duration_ms: number | null;
  message: string;
  metadata: Record<string, unknown> | null;
  session_id: SessionID | null;
  project_name: ProjectName | null;
}

/**
 * Agent statistics
 */
export interface AgentStats {
  agent: string;
  event_count: number;
  total_lines: number | null;
  avg_duration: number | null;
  last_seen: ISOTimestamp;
}

/**
 * Agent performance metrics
 */
export interface AgentPerformanceMetrics {
  total_events: number;
  total_lines_changed: number | null;
  avg_lines_per_event: number | null;
  avg_duration_ms: number | null;
  min_duration_ms: number | null;
  max_duration_ms: number | null;
  first_event: ISOTimestamp;
  last_event: ISOTimestamp;
}

// ==================== Metrics Types ====================

/**
 * System metrics record
 */
export interface SystemMetrics {
  id: number;
  timestamp: ISOTimestamp;
  cpu: number;
  mem: number;
  disk: number;
  network_in: number;
  network_out: number;
  active_watchers: number;
  cached_files: number;
  session_id: SessionID | null;
}

/**
 * Process metrics record
 */
export interface ProcessMetrics {
  id: number;
  timestamp: ISOTimestamp;
  agent_name: string;
  cpu_percent: number;
  memory_mb: number;
  files_changed: number;
  session_id: SessionID | null;
}

/**
 * Average system metrics
 */
export interface AverageSystemMetrics {
  avg_cpu: number;
  avg_mem: number;
  avg_disk: number;
  avg_network_in: number;
  avg_network_out: number;
  avg_watchers: number;
  avg_cached_files: number;
  max_cpu: number;
  max_mem: number;
}

/**
 * Peak resource usage
 */
export interface PeakResourceUsage {
  peakCpu: Array<{
    timestamp: ISOTimestamp;
    cpu: number;
    mem: number;
    active_watchers: number;
  }>;
  peakMemory: Array<{
    timestamp: ISOTimestamp;
    cpu: number;
    mem: number;
    cached_files: number;
  }>;
}

/**
 * Metrics statistics
 */
export interface MetricsStats {
  systemMetrics: {
    total_records: number;
    first_record: ISOTimestamp;
    last_record: ISOTimestamp;
  };
  processMetrics: {
    total_records: number;
    unique_agents: number;
    first_record: ISOTimestamp;
    last_record: ISOTimestamp;
  };
}

/**
 * Resource usage trend
 */
export interface ResourceTrend {
  hour: string;
  avg_cpu: number;
  avg_mem: number;
  max_cpu: number;
  max_mem: number;
  sample_count: number;
}

// ==================== File Processing Types ====================

/**
 * File validation result
 */
export interface FileValidationResult {
  valid: boolean;
  size: number;
  stats: any | null; // fs.Stats
  oversized?: boolean;
}

/**
 * Binary file read result
 */
export interface BinaryFileReadResult {
  success: boolean;
  buffer: Buffer | null;
  hash: SHA256Hash | null;
  size: number;
  oversized: boolean;
  error: Error | null;
}

/**
 * Text file read result
 */
export interface TextFileReadResult {
  success: boolean;
  content: string | null;
  hash: SHA256Hash | null;
  size: number;
  oversized: boolean;
  error: Error | null;
}

/**
 * Diff statistics
 */
export interface DiffStats {
  linesAdded: number;
  linesRemoved: number;
}

/**
 * File read error handling result
 */
export interface FileReadErrorResult {
  shouldRetry: boolean;
  shouldConvertToDelete: boolean;
}

// ==================== Error Types ====================

/**
 * Database not found error
 */
export class DatabaseNotFoundError extends Error {
  projectName: string;
  statusCode: number;

  constructor(projectName: string) {
    super(`Database not found for project: ${projectName}`);
    this.name = 'DatabaseNotFoundError';
    this.projectName = projectName;
    this.statusCode = 404;
  }
}

/**
 * Database operation error
 */
export class DatabaseOperationError extends Error {
  operation: string;
  originalError: Error;
  context: Record<string, unknown>;
  statusCode: number;

  constructor(operation: string, originalError: Error, context: Record<string, unknown> = {}) {
    super(`Database ${operation} failed: ${originalError.message}`);
    this.name = 'DatabaseOperationError';
    this.operation = operation;
    this.originalError = originalError;
    this.context = context;
    this.statusCode = 500;
  }
}

// ==================== Repository Options ====================

/**
 * Time range query options
 */
export interface TimeRangeOptions {
  startTime: ISOTimestamp;
  endTime: ISOTimestamp;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Search options
 */
export interface SearchOptions extends PaginationOptions {
  pattern?: string;
  searchTerm?: string;
}

// ==================== Service Types ====================

/**
 * Socket.IO Server instance (simplified type)
 */
export interface SocketIOServer {
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * File processing lock interface
 */
export interface FileProcessingLock {
  acquire(filepath: string): Promise<() => void>;
}

/**
 * Session activity data
 */
export interface SessionActivity {
  change_type: string;
  diff: string | null;
  filepath: string;
  agent: string | null;
  risk_score: number;
}

/**
 * Session tracker interface
 */
export interface SessionTracker {
  recordActivity(projectName: ProjectName, activity: SessionActivity): void;
}

/**
 * Developer database code pattern
 */
export interface DeveloperCodePattern {
  project: string;
  language: string;
  file_type: string;
  edit_type: 'create' | 'modify' | 'delete';
  lines_added: number;
  lines_removed: number;
  timestamp: ISOTimestamp;
}

/**
 * Developer database interface
 */
export interface DeveloperDatabase {
  logCodePattern(pattern: DeveloperCodePattern): void;
}

/**
 * Database instance with all methods
 */
export interface RavenDatabase {
  insertEvent(
    timestamp: ISOTimestamp,
    filepath: string,
    change_type: ChangeType,
    diff: string | null,
    cpu: number,
    mem: number,
    session_id: SessionID,
    file_hash: SHA256Hash | null,
    event_size: number
  ): number;
  clearSyntaxErrors(filepath: string): void;
  clearPatternWarnings(filepath: string): void;
}

/**
 * FileChangeHandler constructor options
 */
export interface FileChangeHandlerOptions {
  projectPaths: Map<ProjectName, string>;
  projectDatabases: Map<ProjectName, RavenDatabase>;
  projectGitMonitors: Map<ProjectName, unknown>;
  projectSnapshotDirs: Map<ProjectName, string>;
  fileCache: Map<string, string>;
  io: SocketIOServer;
  SESSION_ID: SessionID;
  fileProcessingLock: FileProcessingLock;
  developerDB: DeveloperDatabase | null;
  sessionTracker: SessionTracker | null;
  addToFileCache: (filepath: string, content: string) => void;
  emitGitStatusUpdate: (projectName: ProjectName) => void;
}

/**
 * System metrics collection result
 */
export interface SystemMetricsResult {
  cpuPercent: number;
  memPercent: number;
}

/**
 * File watcher service options
 */
export interface FileWatcherServiceOptions {
  io?: SocketIOServer;
  handleFileChange?: (eventType: string, filepath: string) => void | Promise<void>;
  projectPaths?: Map<ProjectName, string>;
  debounceMs?: number;
  skipProjects?: string[];
}

/**
 * File watcher statistics
 */
export interface FileWatcherStats {
  totalEvents: number;
  addEvents: number;
  changeEvents: number;
  unlinkEvents: number;
  activeWatchers: number;
  projects: string[];
}

/**
 * Watcher initialization result
 */
export interface WatcherInitResult {
  success: number;
  failed: number;
  total: number;
}

/**
 * Project manager options
 */
export interface ProjectManagerOptions {
  ravenDir?: string;
  configPath?: string;
  dbDir?: string;
}

/**
 * Discovered project
 */
export interface DiscoveredProject {
  name: string;
  path: string;
  auto_discovered?: boolean;
  is_default?: boolean;
}

/**
 * Project initialization result
 */
export interface ProjectInitResult {
  success: boolean;
  projectName: string;
  database?: string;
  error?: string;
}

/**
 * Project state
 */
export interface ProjectState {
  name: string;
  database: string;
  initialized: boolean;
  startTime: number;
}

/**
 * Project info
 */
export interface ProjectInfo {
  name: string;
  path: string | undefined;
  database: string | undefined;
  state: ProjectState | undefined;
  isActive: boolean;
}

// ==================== Utility Types ====================

/**
 * Ensures a type is not null or undefined
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Makes specific properties required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Makes specific properties optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract the return type of a promise
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

// ==================== Export All ====================

export type { Database, Statement };
