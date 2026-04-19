/**
 * Database Helper Utilities
 * Eliminates duplicated database access patterns across the codebase
 */

import type { ProjectName } from '../types/index.js';
import { DatabaseNotFoundError } from '../types/index.js';
import { logger } from './logger.js';

// Re-export for backward compatibility with consumers importing from this module
export { DatabaseNotFoundError };

/**
 * Get a project database by name with error handling.
 *
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
