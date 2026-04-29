/**
 * Raven Backend Type Definitions
 *
 * Shared cross-cutting types. Most database/event shapes are defined
 * alongside their consumers; only types used in multiple call sites live here.
 */

/**
 * Project name identifier
 */
export type ProjectName = string;

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
