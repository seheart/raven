/**
 * Custom Error Types for Raven Backend
 * Provides type-safe error handling with error codes
 */

export enum ErrorCode {
  // Authentication Errors (1xxx)
  AUTH_INVALID_CREDENTIALS = 'ERR_AUTH_1001',
  AUTH_TOKEN_EXPIRED = 'ERR_AUTH_1002',
  AUTH_TOKEN_INVALID = 'ERR_AUTH_1003',
  AUTH_UNAUTHORIZED = 'ERR_AUTH_1004',
  AUTH_FORBIDDEN = 'ERR_AUTH_1005',

  // Database Errors (2xxx)
  DB_CONNECTION_FAILED = 'ERR_DB_2001',
  DB_QUERY_FAILED = 'ERR_DB_2002',
  DB_NOT_FOUND = 'ERR_DB_2003',
  DB_CONSTRAINT_VIOLATION = 'ERR_DB_2004',

  // Validation Errors (3xxx)
  VALIDATION_MISSING_FIELD = 'ERR_VAL_3001',
  VALIDATION_INVALID_FORMAT = 'ERR_VAL_3002',
  VALIDATION_OUT_OF_RANGE = 'ERR_VAL_3003',

  // File System Errors (4xxx)
  FS_FILE_NOT_FOUND = 'ERR_FS_4001',
  FS_PERMISSION_DENIED = 'ERR_FS_4002',
  FS_READ_FAILED = 'ERR_FS_4003',
  FS_WRITE_FAILED = 'ERR_FS_4004',

  // API Errors (5xxx)
  API_RATE_LIMIT_EXCEEDED = 'ERR_API_5001',
  API_INVALID_REQUEST = 'ERR_API_5002',
  API_SERVICE_UNAVAILABLE = 'ERR_API_5003',

  // Internal Errors (9xxx)
  INTERNAL_SERVER_ERROR = 'ERR_INT_9001',
  INTERNAL_UNKNOWN_ERROR = 'ERR_INT_9999'
}

/**
 * Base Raven Error Class
 */
export class RavenError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
      }
    };
  }
}

/**
 * Authentication Error
 */
export class AuthError extends RavenError {
  constructor(code: ErrorCode, message: string) {
    super(code, message, 401);
  }
}

/**
 * Authorization Error (Forbidden)
 */
export class ForbiddenError extends RavenError {
  constructor(message: string = 'Access forbidden') {
    super(ErrorCode.AUTH_FORBIDDEN, message, 403);
  }
}

/**
 * Database Error
 */
export class DatabaseError extends RavenError {
  constructor(code: ErrorCode, message: string, originalError?: Error) {
    super(code, message, 500);
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * Validation Error
 */
export class ValidationError extends RavenError {
  public readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(ErrorCode.VALIDATION_INVALID_FORMAT, message, 400);
    this.fields = fields;
  }

  override toJSON(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        fields: this.fields,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends RavenError {
  constructor(resource: string) {
    super(ErrorCode.DB_NOT_FOUND, `${resource} not found`, 404);
  }
}

/**
 * File System Error
 */
export class FileSystemError extends RavenError {
  constructor(code: ErrorCode, message: string) {
    super(code, message, 500);
  }
}

/**
 * Rate Limit Error
 */
export class RateLimitError extends RavenError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super(ErrorCode.API_RATE_LIMIT_EXCEEDED, 'Too many requests, please try again later', 429);
    this.retryAfter = retryAfter;
  }

  override toJSON(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryAfter: this.retryAfter,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Type guard to check if error is operational
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof RavenError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Helper to create standardized error response
 */
export function formatErrorResponse(error: Error) {
  if (error instanceof RavenError) {
    return error.toJSON();
  }

  // Unknown errors
  return {
    error: {
      code: ErrorCode.INTERNAL_UNKNOWN_ERROR,
      message:
        process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Type for unknown caught errors
 * Use this instead of 'any' in catch blocks
 */
export type UnknownError = unknown;

/**
 * Type guard to check if caught error is an Error instance
 */
export function isError(error: UnknownError): error is Error {
  return error instanceof Error;
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: UnknownError): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}
