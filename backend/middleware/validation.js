/**
 * Input Validation Middleware for Raven
 * Uses Joi for comprehensive schema validation
 */

import Joi from 'joi';
import path from 'path';

/**
 * Sanitize file path to prevent directory traversal
 */
export function sanitizeFilePath(filepath) {
  if (!filepath) return null;

  // Normalize path (resolve .. and .)
  const normalized = path.normalize(filepath);

  // Reject absolute paths outside the project
  if (path.isAbsolute(normalized)) {
    // Allow absolute paths but prevent traversal
    return normalized;
  }

  // Reject paths that try to go up directories
  if (normalized.includes('..')) {
    throw new Error('Path traversal detected');
  }

  return normalized;
}

/**
 * Common validation schemas
 */
export const schemas = {
  // Authentication
  login: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).max(100).required()
  }),

  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).max(100).required(),
    role: Joi.string().valid('admin', 'user', 'viewer').default('user')
  }),

  changePassword: Joi.object({
    oldPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).max(100).required()
  }),

  // File operations
  filePath: Joi.object({
    filepath: Joi.string()
      .pattern(/^[a-zA-Z0-9/_.\-]+$/)
      .required()
      .custom((value) => sanitizeFilePath(value))
  }),

  fileContent: Joi.object({
    filepath: Joi.string()
      .pattern(/^[a-zA-Z0-9/_.\-]+$/)
      .required()
      .custom((value) => sanitizeFilePath(value)),
    content: Joi.string().max(10485760).required() // Max 10MB
  }),

  // Events
  eventQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(100),
    offset: Joi.number().integer().min(0).default(0),
    search: Joi.string().max(100).allow('').default(''),
    eventType: Joi.string().valid('all', 'file', 'agent', 'system').default('all'),
    startDate: Joi.string().isoDate().optional(),
    endDate: Joi.string().isoDate().optional()
  }),

  // Errors
  errorLog: Joi.object({
    error_type: Joi.string().max(100).required(),
    message: Joi.string().max(1000).required(),
    stack: Joi.string().max(10000).optional(),
    component: Joi.string().max(100).optional(),
    user_agent: Joi.string().max(500).optional(),
    url: Joi.string().uri().max(500).optional(),
    metadata: Joi.object().optional(),
    severity: Joi.string().valid('error', 'warning', 'info').default('error')
  }),

  errorQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(100),
    offset: Joi.number().integer().min(0).default(0),
    search: Joi.string().max(100).allow('').default(''),
    severity: Joi.string().valid('all', 'error', 'warning', 'info').default('all'),
    startDate: Joi.string().isoDate().optional(),
    endDate: Joi.string().isoDate().optional()
  }),

  // Notifications
  notificationQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(50),
    offset: Joi.number().integer().min(0).default(0),
    type: Joi.string().max(50).default('all'),
    severity: Joi.string().valid('all', 'info', 'warning', 'error', 'success').default('all'),
    unread_only: Joi.boolean().default(false)
  }),

  createNotification: Joi.object({
    type: Joi.string().max(50).required(),
    severity: Joi.string().valid('info', 'warning', 'error', 'success').required(),
    title: Joi.string().max(200).required(),
    message: Joi.string().max(1000).required(),
    metadata: Joi.object().optional()
  }),

  // Storage
  storageCleanup: Joi.object({
    olderThanDays: Joi.number().integer().min(1).max(365).optional()
  }),

  // Sync config
  syncConfig: Joi.object({
    enabled: Joi.boolean().required(),
    host: Joi.string().hostname().max(255).optional(),
    port: Joi.number().integer().min(1).max(65535).optional(),
    username: Joi.string().max(100).optional(),
    remotePath: Joi.string().max(500).optional(),
    schedule: Joi.string().max(100).optional()
  }),

  // Telemetry
  telemetry: Joi.object({
    agent: Joi.string().max(100).required(),
    event_type: Joi.string().max(50).required(),
    file: Joi.string().max(500).optional(),
    lines_changed: Joi.number().integer().min(0).optional(),
    duration_ms: Joi.number().integer().min(0).optional(),
    message: Joi.string().max(1000).required(),
    metadata: Joi.object().optional()
  }),

  // Pagination
  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(100),
    offset: Joi.number().integer().min(0).default(0)
  }),

  // ID parameter
  id: Joi.object({
    id: Joi.number().integer().positive().required()
  })
};

/**
 * Create validation middleware for a schema
 */
export function validate(schemaName, source = 'body') {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      return res.status(500).json({ error: 'Invalid validation schema' });
    }

    const data = source === 'body' ? req.body :
                 source === 'query' ? req.query :
                 source === 'params' ? req.params :
                 req.body;

    const { error, value } = schema.validate(data, {
      abortEarly: false, // Return all errors
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace request data with validated and sanitized data
    if (source === 'body') req.body = value;
    else if (source === 'query') req.query = value;
    else if (source === 'params') req.params = value;

    next();
  };
}

/**
 * Validate and sanitize file path parameter
 */
export function validateFilePath(req, res, next) {
  try {
    if (req.body.filepath) {
      req.body.filepath = sanitizeFilePath(req.body.filepath);
    }
    if (req.query.filepath) {
      req.query.filepath = sanitizeFilePath(req.query.filepath);
    }
    if (req.params.filepath) {
      req.params.filepath = sanitizeFilePath(req.params.filepath);
    }
    next();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
