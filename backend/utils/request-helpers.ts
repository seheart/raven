/**
 * Request Helper Utilities
 * Common request parsing and validation functions to reduce code duplication
 */

import type { Request } from 'express';

/**
 * Parse any value into an int with fallback. Used for query params.
 */
export function safeInt(value: unknown, defaultValue: number): number {
  const parsed = parseInt(value as string, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse pagination limit from query parameters
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
 */
export function parseDateRange(req: Request): { startTime?: string; endTime?: string } {
  return {
    startTime: req.query.start_time as string | undefined,
    endTime: req.query.end_time as string | undefined
  };
}

/**
 * Parse boolean query parameter
 */
export function parseBoolean(req: Request, paramName: string, defaultValue = false): boolean {
  const value = req.query[paramName];

  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === '1';
}

/**
 * Build SQL query with optional time filtering.
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

  if (options.additionalWhere) {
    whereConditions.push(options.additionalWhere);
  }

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

  if (whereConditions.length > 0) {
    if (query.toLowerCase().includes('where')) {
      query += ' AND ' + whereConditions.join(' AND ');
    } else {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }
  }

  if (options.orderBy) {
    query += ` ORDER BY ${options.orderBy}`;
  }

  if (options.limit !== undefined) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  return { query, params };
}
