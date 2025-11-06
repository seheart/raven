/**
 * Database Helper Utilities
 * Eliminates duplicated database access patterns across the codebase
 */

import { logger } from './logger.js';

/**
 * Custom error for database not found scenarios
 */
export class DatabaseNotFoundError extends Error {
  constructor(projectName) {
    super(`Database not found for project: ${projectName}`);
    this.name = 'DatabaseNotFoundError';
    this.projectName = projectName;
    this.statusCode = 404;
  }
}

/**
 * Custom error for database operation failures
 */
export class DatabaseOperationError extends Error {
  constructor(operation, originalError, context = {}) {
    super(`Database ${operation} failed: ${originalError.message}`);
    this.name = 'DatabaseOperationError';
    this.operation = operation;
    this.originalError = originalError;
    this.context = context;
    this.statusCode = 500;
  }
}

/**
 * Get a project database by name with error handling
 * @param {string} projectName - Name of the project
 * @param {Map<string, object>} projectDatabases - Map of project databases
 * @param {boolean} throwOnMissing - Whether to throw error if not found (default: true)
 * @returns {object|null} - Database instance or null if not found and throwOnMissing is false
 * @throws {DatabaseNotFoundError} - If database not found and throwOnMissing is true
 */
export function getProjectDatabase(projectName, projectDatabases, throwOnMissing = true) {
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
 * @param {Map<string, object>} projectDatabases - Map of project databases
 * @param {boolean} throwOnMissing - Whether to throw error if no databases (default: true)
 * @returns {object|null} - First database instance or null
 * @throws {DatabaseNotFoundError} - If no databases found and throwOnMissing is true
 */
export function getFirstAvailableDatabase(projectDatabases, throwOnMissing = true) {
  if (!projectDatabases || projectDatabases.size === 0) {
    logger.error('No databases available');
    if (throwOnMissing) {
      throw new DatabaseNotFoundError('(no databases available)');
    }
    return null;
  }

  const db = projectDatabases.values().next().value;
  return db;
}

/**
 * Get project database or fall back to first available
 * @param {string|null} projectName - Name of the project (optional)
 * @param {Map<string, object>} projectDatabases - Map of project databases
 * @param {boolean} throwOnMissing - Whether to throw error if not found (default: true)
 * @returns {object|null} - Database instance or null
 */
export function getProjectDatabaseOrFirst(projectName, projectDatabases, throwOnMissing = true) {
  if (projectName) {
    const db = projectDatabases.get(projectName);
    if (db) return db;
  }

  return getFirstAvailableDatabase(projectDatabases, throwOnMissing);
}

/**
 * Execute a database operation with standardized error handling
 * @param {Function} operation - Database operation to execute
 * @param {string} operationName - Name of the operation (for logging)
 * @param {object} context - Additional context for error logging
 * @returns {Promise<any>} - Result of the operation
 * @throws {DatabaseOperationError} - If operation fails
 */
export async function executeDatabaseOperation(operation, operationName, context = {}) {
  try {
    return await operation();
  } catch (error) {
    logger.error(`Database operation failed: ${operationName}`, {
      error: error.message,
      stack: error.stack,
      ...context
    });
    throw new DatabaseOperationError(operationName, error, context);
  }
}

/**
 * Execute a database operation synchronously with standardized error handling
 * @param {Function} operation - Database operation to execute
 * @param {string} operationName - Name of the operation (for logging)
 * @param {object} context - Additional context for error logging
 * @returns {any} - Result of the operation
 * @throws {DatabaseOperationError} - If operation fails
 */
export function executeDatabaseOperationSync(operation, operationName, context = {}) {
  try {
    return operation();
  } catch (error) {
    logger.error(`Database operation failed: ${operationName}`, {
      error: error.message,
      stack: error.stack,
      ...context
    });
    throw new DatabaseOperationError(operationName, error, context);
  }
}

/**
 * Get all project databases as an array
 * @param {Map<string, object>} projectDatabases - Map of project databases
 * @returns {Array<{name: string, db: object}>} - Array of {name, db} objects
 */
export function getAllProjectDatabases(projectDatabases) {
  return Array.from(projectDatabases.entries()).map(([name, db]) => ({
    name,
    db
  }));
}

/**
 * Check if a project database exists
 * @param {string} projectName - Name of the project
 * @param {Map<string, object>} projectDatabases - Map of project databases
 * @returns {boolean} - True if database exists
 */
export function projectDatabaseExists(projectName, projectDatabases) {
  return projectDatabases.has(projectName);
}

/**
 * Validate project name format
 * @param {string} projectName - Name to validate
 * @returns {boolean} - True if valid
 */
export function isValidProjectName(projectName) {
  if (!projectName || typeof projectName !== 'string') {
    return false;
  }

  // Must be 1-100 characters, alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]{1,100}$/.test(projectName);
}
