/**
 * Database Helper Utilities
 * Eliminates duplicated database access patterns across the codebase
 */

import type { ProjectName } from '../types/index.js';
import { DatabaseNotFoundError, DatabaseOperationError } from '../types/index.js';
import { logger } from './logger.js';

// Re-export error classes for backward compatibility
export { DatabaseNotFoundError, DatabaseOperationError };

/**
 * Get a project database by name with error handling
 * @param projectName - Name of the project
 * @param projectDatabases - Map of project databases
 * @param throwOnMissing - Whether to throw error if not found (default: true)
 * @returns Database instance or null if not found and throwOnMissing is false
 * @throws DatabaseNotFoundError - If database not found and throwOnMissing is true
 */
export function getProjectDatabase<T>(
  projectName: ProjectName | null | undefined,
  projectDatabases: Map<ProjectName, T>,
  throwOnMissing: boolean = true
): T | null {
  if (!projectName) {
    logger.error('No project name provided to getProjectDatabase');
    if (throwOnMissing) {
      throw new DatabaseNotFoundError('(no project name)');
    }
    return null;
  }

  const db = projectDatabases.get(projectName);

  if (!db) {
    logger.error(`Database not found for project: ${projectName}`);
    if (throwOnMissing) {
      throw new DatabaseNotFoundError(projectName);
    }
    return null;
  }

  return db;
}

/**
 * Get first available database from the map
 * @param projectDatabases - Map of project databases
 * @param throwOnMissing - Whether to throw error if no databases (default: true)
 * @returns First database instance or null
 * @throws DatabaseNotFoundError - If no databases found and throwOnMissing is true
 */
export function getFirstAvailableDatabase<T>(
  projectDatabases: Map<ProjectName, T>,
  throwOnMissing: boolean = true
): T | null {
  if (!projectDatabases || projectDatabases.size === 0) {
    logger.error('No databases available');
    if (throwOnMissing) {
      throw new DatabaseNotFoundError('(no databases available)');
    }
    return null;
  }

  const db = projectDatabases.values().next().value as T;
  return db;
}

/**
 * Get project database or fall back to first available
 * @param projectName - Name of the project (optional)
 * @param projectDatabases - Map of project databases
 * @param throwOnMissing - Whether to throw error if not found (default: true)
 * @returns Database instance or null
 */
export function getProjectDatabaseOrFirst<T>(
  projectName: ProjectName | null | undefined,
  projectDatabases: Map<ProjectName, T>,
  throwOnMissing: boolean = true
): T | null {
  if (projectName) {
    const db = projectDatabases.get(projectName);
    if (db) return db;
  }

  return getFirstAvailableDatabase(projectDatabases, throwOnMissing);
}

/**
 * Execute a database operation with standardized error handling
 * @param operation - Database operation to execute
 * @param operationName - Name of the operation (for logging)
 * @param context - Additional context for error logging
 * @returns Result of the operation
 * @throws DatabaseOperationError - If operation fails
 */
export async function executeDatabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  context: Record<string, unknown> = {}
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const err = error as Error;
    logger.error(`Database operation failed: ${operationName}`, {
      error: err.message,
      stack: err.stack,
      ...context
    });
    throw new DatabaseOperationError(operationName, err, context);
  }
}

/**
 * Execute a database operation synchronously with standardized error handling
 * @param operation - Database operation to execute
 * @param operationName - Name of the operation (for logging)
 * @param context - Additional context for error logging
 * @returns Result of the operation
 * @throws DatabaseOperationError - If operation fails
 */
export function executeDatabaseOperationSync<T>(
  operation: () => T,
  operationName: string,
  context: Record<string, unknown> = {}
): T {
  try {
    return operation();
  } catch (error) {
    const err = error as Error;
    logger.error(`Database operation failed: ${operationName}`, {
      error: err.message,
      stack: err.stack,
      ...context
    });
    throw new DatabaseOperationError(operationName, err, context);
  }
}

/**
 * Get all project databases as an array
 * @param projectDatabases - Map of project databases
 * @returns Array of {name, db} objects
 */
export function getAllProjectDatabases<T>(
  projectDatabases: Map<ProjectName, T>
): Array<{ name: ProjectName; db: T }> {
  return Array.from(projectDatabases.entries()).map(([name, db]) => ({
    name,
    db
  }));
}

/**
 * Check if a project database exists
 * @param projectName - Name of the project
 * @param projectDatabases - Map of project databases
 * @returns True if database exists
 */
export function projectDatabaseExists<T>(
  projectName: ProjectName,
  projectDatabases: Map<ProjectName, T>
): boolean {
  return projectDatabases.has(projectName);
}

/**
 * Validate project name format
 * @param projectName - Name to validate
 * @returns True if valid
 */
export function isValidProjectName(projectName: unknown): projectName is ProjectName {
  if (!projectName || typeof projectName !== 'string') {
    return false;
  }

  // Must be 1-100 characters, alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]{1,100}$/.test(projectName);
}
