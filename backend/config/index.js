/**
 * Application configuration
 * Centralized configuration module - USE THIS instead of process.env
 *
 * IMPORTANT: Always import config values from this module, not process.env directly
 */

import { join } from 'path';

/**
 * Get integer from environment variable
 */
function getInt(name, defaultValue) {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get boolean from environment variable
 */
function getBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

export const config = {
  // Server
  PORT: getInt('PORT', 9100),
  HOST: process.env.HOST || '0.0.0.0',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:9000',
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Paths
  RAVEN_DIR: process.env.RAVEN_DIR || join(process.cwd(), '..', '.raven'),
  WATCH_PATH: process.env.WATCH_PATH || join(process.cwd(), '..', '..'),

  // Payload limits
  JSON_LIMIT: process.env.JSON_PAYLOAD_LIMIT || '10mb',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Cache
  MAX_CACHE_SIZE: getInt('MAX_CACHE_SIZE', 1000),
  HEALTH_CACHE_TTL: getInt('HEALTH_CACHE_TTL', 5000),

  // Compression
  COMPRESSION_THRESHOLD: 1024, // Only compress responses > 1KB
  COMPRESSION_LEVEL: 6, // 0-9, 6 is balanced

  // Snapshots
  SNAPSHOT_TTL_DAYS: getInt('SNAPSHOT_TTL_DAYS', 30),

  // File watching
  DEBOUNCE_MS: getInt('FILE_WATCH_DEBOUNCE', 100),

  // Security
  DISABLE_AUTH: getBool('DISABLE_AUTH', false),

  // Rate Limiting
  API_RATE_LIMIT_WINDOW_MS: getInt('API_RATE_LIMIT_WINDOW_MS', 60000),
  API_RATE_LIMIT_MAX: getInt('API_RATE_LIMIT_MAX', 500),
  TELEMETRY_RATE_LIMIT_WINDOW_MS: getInt('TELEMETRY_RATE_LIMIT_WINDOW_MS', 60000),
  TELEMETRY_RATE_LIMIT_MAX: getInt('TELEMETRY_RATE_LIMIT_MAX', 5000)
};
