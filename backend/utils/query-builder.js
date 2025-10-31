/**
 * SQL Query Builder Utility
 * Provides reusable patterns for building SQL queries safely
 */

/**
 * Adds timestamp filtering to a query
 * @param {string} query - Base SQL query
 * @param {any[]} params - Query parameters array
 * @param {string} [startTime] - Start timestamp
 * @param {string} [endTime] - End timestamp
 * @param {string} [fieldName='timestamp'] - Timestamp field name
 * @returns {{query: string, params: any[]}} Updated query and params
 */
export function addTimestampFilter(query, params, startTime, endTime, fieldName = 'timestamp') {
  const hasWhere = query.toLowerCase().includes('where');
  const conjunction = hasWhere ? 'AND' : 'WHERE';

  if (startTime && endTime) {
    query += ` ${conjunction} ${fieldName} BETWEEN ? AND ?`;
    params.push(startTime, endTime);
  } else if (startTime) {
    query += ` ${conjunction} ${fieldName} >= ?`;
    params.push(startTime);
  } else if (endTime) {
    query += ` ${conjunction} ${fieldName} <= ?`;
    params.push(endTime);
  }

  return { query, params };
}

/**
 * Adds ORDER BY clause to a query
 * @param {string} query - Base SQL query
 * @param {string} field - Field to order by
 * @param {'ASC'|'DESC'} [direction='DESC'] - Sort direction
 * @returns {string} Updated query
 */
export function addOrderBy(query, field, direction = 'DESC') {
  return `${query} ORDER BY ${field} ${direction}`;
}

/**
 * Adds LIMIT clause to a query
 * @param {string} query - Base SQL query
 * @param {any[]} params - Query parameters array
 * @param {number} limit - Maximum number of results
 * @returns {{query: string, params: any[]}} Updated query and params
 */
export function addLimit(query, params, limit) {
  query += ' LIMIT ?';
  params.push(limit);
  return { query, params };
}

/**
 * Adds pagination (LIMIT and OFFSET) to a query
 * @param {string} query - Base SQL query
 * @param {any[]} params - Query parameters array
 * @param {number} limit - Maximum number of results
 * @param {number} offset - Number of results to skip
 * @returns {{query: string, params: any[]}} Updated query and params
 */
export function addPagination(query, params, limit, offset) {
  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return { query, params };
}

/**
 * Simple query builder class for fluent API
 */
export class QueryBuilder {
  constructor(baseQuery) {
    this.query = baseQuery;
    this.params = [];
  }

  /**
   * Add WHERE condition
   * @param {string} field - Field name
   * @param {string} operator - SQL operator (=, >, <, LIKE, etc.)
   * @param {any} value - Value to compare
   * @returns {QueryBuilder} This instance for chaining
   */
  where(field, operator, value) {
    if (value !== null && value !== undefined) {
      const conjunction = this.query.toLowerCase().includes('where') ? 'AND' : 'WHERE';
      this.query += ` ${conjunction} ${field} ${operator} ?`;
      this.params.push(value);
    }
    return this;
  }

  /**
   * Add BETWEEN condition
   * @param {string} field - Field name
   * @param {any} start - Start value
   * @param {any} end - End value
   * @returns {QueryBuilder} This instance for chaining
   */
  between(field, start, end) {
    if (start && end) {
      const conjunction = this.query.toLowerCase().includes('where') ? 'AND' : 'WHERE';
      this.query += ` ${conjunction} ${field} BETWEEN ? AND ?`;
      this.params.push(start, end);
    }
    return this;
  }

  /**
   * Add ORDER BY clause
   * @param {string} field - Field to order by
   * @param {'ASC'|'DESC'} [direction='DESC'] - Sort direction
   * @returns {QueryBuilder} This instance for chaining
   */
  orderBy(field, direction = 'DESC') {
    this.query += ` ORDER BY ${field} ${direction}`;
    return this;
  }

  /**
   * Add LIMIT clause
   * @param {number} count - Maximum number of results
   * @returns {QueryBuilder} This instance for chaining
   */
  limit(count) {
    this.query += ` LIMIT ?`;
    this.params.push(count);
    return this;
  }

  /**
   * Add OFFSET clause
   * @param {number} count - Number of results to skip
   * @returns {QueryBuilder} This instance for chaining
   */
  offset(count) {
    this.query += ` OFFSET ?`;
    this.params.push(count);
    return this;
  }

  /**
   * Build and return the final query and parameters
   * @returns {{query: string, params: any[]}} Final query and parameters
   */
  build() {
    return { query: this.query, params: this.params };
  }
}

/**
 * Helper function to build a paginated query with timestamp filtering
 * Common pattern used across multiple endpoints
 * @param {object} options - Query options
 * @param {string} options.baseQuery - Base SELECT query
 * @param {string} [options.startTime] - Start timestamp
 * @param {string} [options.endTime] - End timestamp
 * @param {string} [options.orderByField='timestamp'] - Field to order by
 * @param {'ASC'|'DESC'} [options.orderByDirection='DESC'] - Sort direction
 * @param {number} [options.limit=100] - Maximum results
 * @param {number} [options.offset=0] - Results to skip
 * @returns {{query: string, params: any[]}} Built query and parameters
 */
export function buildPaginatedTimeQuery(options) {
  const {
    baseQuery,
    startTime,
    endTime,
    orderByField = 'timestamp',
    orderByDirection = 'DESC',
    limit = 100,
    offset = 0
  } = options;

  const builder = new QueryBuilder(baseQuery);

  if (startTime && endTime) {
    builder.between('timestamp', startTime, endTime);
  } else if (startTime) {
    builder.where('timestamp', '>=', startTime);
  } else if (endTime) {
    builder.where('timestamp', '<=', endTime);
  }

  builder
    .orderBy(orderByField, orderByDirection)
    .limit(limit)
    .offset(offset);

  return builder.build();
}
