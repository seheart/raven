/**
 * Environment Configuration Module
 * Centralized environment variable management with validation
 */

/**
 * Get required environment variable (throws if missing)
 * @param {string} name - Environment variable name
 * @returns {string} Value
 */
function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || '';
}

/**
 * Get optional environment variable with default
 * @param {string} name - Environment variable name
 * @param {string} defaultValue - Default value
 * @returns {string} Value
 */
function getEnv(name, defaultValue) {
  return process.env[name] || defaultValue;
}

/**
 * Get boolean environment variable
 * @param {string} name - Environment variable name
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Value
 */
function getBoolEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

/**
 * Get integer environment variable
 * @param {string} name - Environment variable name
 * @param {number} defaultValue - Default value
 * @returns {number} Value
 */
function getIntEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Application environment configuration
 */
export const env = {
  // Environment
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV !== 'production',
  IS_TEST: process.env.NODE_ENV === 'test',

  // Server
  PORT: getIntEnv('PORT', 3030),
  HOST: getEnv('HOST', '0.0.0.0'),
  CORS_ORIGIN: getEnv('CORS_ORIGIN', 'http://localhost:5173'),

  // Authentication
  DISABLE_AUTH: getBoolEnv('DISABLE_AUTH', false),
  JWT_SECRET: process.env.NODE_ENV === 'production'
    ? getRequiredEnv('JWT_SECRET')
    : getEnv('JWT_SECRET', 'dev-secret-key'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '24h'),

  // Logging
  LOG_LEVEL: getEnv('LOG_LEVEL', 'info'),
  STRUCTURED_LOGGING: getBoolEnv('STRUCTURED_LOGGING', false),
  SHOW_ERROR_DETAILS: getBoolEnv('SHOW_ERROR_DETAILS', process.env.NODE_ENV !== 'production'),

  // Database
  DB_DIR: getEnv('DB_DIR', './.raven/databases'),
  SNAPSHOT_TTL_DAYS: getIntEnv('SNAPSHOT_TTL_DAYS', 30),

  // Performance
  JSON_PAYLOAD_LIMIT: getEnv('JSON_PAYLOAD_LIMIT', '10mb'),
  MAX_CACHE_SIZE: getIntEnv('MAX_CACHE_SIZE', 1000),
  HEALTH_CACHE_TTL: getIntEnv('HEALTH_CACHE_TTL', 5000),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: getIntEnv('RATE_LIMIT_WINDOW_MS', 60000),
  RATE_LIMIT_MAX_REQUESTS: getIntEnv('RATE_LIMIT_MAX_REQUESTS', 100),
  TELEMETRY_RATE_LIMIT: getIntEnv('TELEMETRY_RATE_LIMIT', 1000),

  // Features
  ENABLE_METRICS: getBoolEnv('ENABLE_METRICS', true),
  ENABLE_TRIGGERS: getBoolEnv('ENABLE_TRIGGERS', true),
  ENABLE_GIT_MONITOR: getBoolEnv('ENABLE_GIT_MONITOR', true),
  ENABLE_DEBUG_ROUTES: getBoolEnv('ENABLE_DEBUG_ROUTES', false),

  // Observability
  ENABLE_TRACING: getBoolEnv('ENABLE_TRACING', false),
  METRICS_PORT: getIntEnv('METRICS_PORT', 9090),

  // Projects
  ACTIVE_PROJECT: getEnv('ACTIVE_PROJECT', 'raven')
};

/**
 * Validate required configuration
 * Throws error if configuration is invalid
 */
export function validateConfig() {
  const errors = [];

  // Production checks
  if (env.IS_PRODUCTION) {
    if (!env.JWT_SECRET || env.JWT_SECRET === 'dev-secret-key') {
      errors.push('JWT_SECRET must be set in production');
    }
    if (env.DISABLE_AUTH) {
      errors.push('DISABLE_AUTH should not be enabled in production');
    }
    if (env.SHOW_ERROR_DETAILS) {
      errors.push('SHOW_ERROR_DETAILS should be false in production');
    }
  }

  // Port validation
  if (env.PORT < 1 || env.PORT > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Log level validation
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(env.LOG_LEVEL)) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Print configuration (safe - no secrets)
 */
export function printConfig() {
  console.log('\n📋 Raven Configuration:');
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Port: ${env.PORT}`);
  console.log(`   CORS Origin: ${env.CORS_ORIGIN}`);
  console.log(`   Auth: ${env.DISABLE_AUTH ? 'Disabled' : 'Enabled'}`);
  console.log(`   Log Level: ${env.LOG_LEVEL}`);
  console.log(`   Structured Logging: ${env.STRUCTURED_LOGGING}`);
  console.log(`   Tracing: ${env.ENABLE_TRACING}`);
  console.log(`   Cache Size: ${env.MAX_CACHE_SIZE}`);
  console.log(`   DB Directory: ${env.DB_DIR}`);
  console.log('');
}

/**
 * Initialize and validate configuration
 * Call this explicitly in server.js startup
 */
export function initConfig() {
  try {
    validateConfig();
    if (env.IS_DEVELOPMENT) {
      printConfig();
    }
  } catch (error) {
    if (env.NODE_ENV !== 'test') {
      console.error('❌ Configuration Error:', error.message);
      process.exit(1);
    } else {
      throw error;
    }
  }
}
