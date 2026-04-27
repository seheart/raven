/**
 * Raven Backend Type Definitions
 * Comprehensive type safety for the entire application
 */

import type { Database, Statement } from 'better-sqlite3';

// ==================== Core Types ====================

/**
 * ISO 8601 timestamp string
 */
type ISOTimestamp = string;

/**
 * SHA256 hash string
 */
type SHA256Hash = string;

/**
 * Project name identifier
 */
export type ProjectName = string;

/**
 * Session identifier (UUID)
 */
type SessionID = string;

// ==================== Database Types ====================

// ==================== Event Types ====================

/**
 * File change event types
 */
type ChangeType = 'create' | 'edit' | 'delete';

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

// ==================== Agent Types ====================

/**
 * Agent event types
 */
type AgentEventType = string;

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
 * Agent statistics
 */
export interface AgentStats {
  agent: string;
  event_count: number;
  total_lines: number | null;
  avg_duration: number | null;
  last_seen: ISOTimestamp;
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

// ==================== File Processing Types ====================

/**
 * Diff statistics
 */
export interface DiffStats {
  linesAdded: number;
  linesRemoved: number;
}

// ==================== Error Types ====================

// ==================== Repository Options ====================

// ==================== Service Types ====================

/**
 * Socket.IO Server instance (simplified type)
 */
export interface SocketIOServer {
  emit(event: string, ...args: unknown[]): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Session activity data
 */
interface SessionActivity {
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

// ==================== Export All ====================

export type { Database, Statement };
