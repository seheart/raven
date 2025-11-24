/**
 * Request Helper Utilities
 * Common request parsing and validation functions to reduce code duplication
 */

import type { Request } from 'express';

/**
 * Parse pagination limit from query parameters
 * @param req - Express request object
 * @param defaultLimit - Default limit value (default: 100)
 * @param maxLimit - Maximum allowed limit (default: 1000)
 * @returns Parsed limit value
 */
export function parseLimit(req: Request, defaultLimit = 100, maxLimit = 1000): number {
  const limit = parseInt(req.query.limit as string);

  if (isNaN(limit) || limit <= 0) {
    return defaultLimit;
  }

  return Math.min(limit, maxLimit);
}

/**
 * Parse date range from query parameters
 * @param req - Express request object
 * @returns Object with startTime and endTime
 */
export function parseDateRange(req: Request): { startTime?: string; endTime?: string } {
  return {
    startTime: req.query.start_time as string | undefined,
    endTime: req.query.end_time as string | undefined
  };
}

/**
 * Parse time window from query parameters (in seconds)
 * @param req - Express request object
 * @param defaultSeconds - Default window in seconds (default: 5)
 * @returns Time window in seconds
 */
export function parseTimeWindow(req: Request, defaultSeconds = 5): number {
  const windowSeconds = parseInt(req.query.time_window_seconds as string);

  if (isNaN(windowSeconds) || windowSeconds <= 0) {
    return defaultSeconds;
  }

  return Math.min(windowSeconds, 3600); // Max 1 hour
}

/**
 * Parse boolean query parameter
 * @param req - Express request object
 * @param paramName - Parameter name
 * @param defaultValue - Default value if parameter is missing
 * @returns Boolean value
 */
export function parseBoolean(req: Request, paramName: string, defaultValue = false): boolean {
  const value = req.query[paramName];

  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === '1';
}

/**
 * Parse agent name from URL parameters or query
 * @param req - Express request object
 * @returns Agent name or undefined
 */
export function parseAgent(req: Request): string | undefined {
  return (req.params.agent || req.query.agent) as string | undefined;
}

/**
 * Parse session ID from URL parameters
 * @param req - Express request object
 * @returns Session ID or undefined
 */
export function parseSessionId(req: Request): string | undefined {
  return req.params.sessionId as string | undefined;
}

/**
 * Build SQL query with optional time filtering
 * @param baseQuery - Base SQL query
 * @param options - Query options
 * @returns Object with query string and parameters array
 */
export function buildTimeFilterQuery(
  baseQuery: string,
  options: {
    startTime?: string;
    endTime?: string;
    orderBy?: string;
    limit?: number;
    additionalWhere?: string;
  }
): { query: string; params: any[] } {
  let query = baseQuery;
  const params: any[] = [];

  const whereConditions: string[] = [];

  // Add additional where conditions
  if (options.additionalWhere) {
    whereConditions.push(options.additionalWhere);
  }

  // Add time filtering
  if (options.startTime && options.endTime) {
    whereConditions.push('timestamp BETWEEN ? AND ?');
    params.push(options.startTime, options.endTime);
  } else if (options.startTime) {
    whereConditions.push('timestamp >= ?');
    params.push(options.startTime);
  } else if (options.endTime) {
    whereConditions.push('timestamp <= ?');
    params.push(options.endTime);
  }

  // Add WHERE clause if conditions exist
  if (whereConditions.length > 0) {
    if (query.toLowerCase().includes('where')) {
      query += ' AND ' + whereConditions.join(' AND ');
    } else {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }
  }

  // Add ORDER BY
  if (options.orderBy) {
    query += ` ORDER BY ${options.orderBy}`;
  }

  // Add LIMIT
  if (options.limit !== undefined) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  return { query, params };
}

/**
 * Validate table name to prevent SQL injection
 * Only allows alphanumeric characters and underscores
 * @param tableName - Table name to validate
 * @returns True if valid, false otherwise
 */
export function isValidTableName(tableName: string): boolean {
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  return validPattern.test(tableName) && tableName.length <= 64;
}

/**
 * Parse offset for pagination
 * @param req - Express request object
 * @param defaultOffset - Default offset value (default: 0)
 * @returns Parsed offset value
 */
export function parseOffset(req: Request, defaultOffset = 0): number {
  const offset = parseInt(req.query.offset as string);

  if (isNaN(offset) || offset < 0) {
    return defaultOffset;
  }

  return offset;
}

/**
 * Calculate pagination metadata
 * @param total - Total number of items
 * @param limit - Items per page
 * @param offset - Current offset
 * @returns Pagination metadata
 */
export function getPaginationMetadata(total: number, limit: number, offset: number) {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
    currentPage: Math.floor(offset / limit) + 1,
    totalPages: Math.ceil(total / limit)
  };
}
