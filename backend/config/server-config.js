/**
 * Server Configuration
 * Centralized configuration eliminating hardcoded values
 */

/**
 * @typedef {Object} ServerConfig
 * @property {number} port - Server port
 * @property {string} host - Server host
 * @property {Object} cors - CORS configuration
 * @property {Object} rateLimit - Rate limiting configuration
 * @property {Object} websocket - WebSocket configuration
 * @property {Object} database - Database configuration
 * @property {Object} monitoring - Monitoring configuration
 * @property {Object} security - Security configuration
 */

const isDevelopment = process.env.NODE_ENV !== 'production';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Server configuration object
 * @type {ServerConfig}
 */
export const serverConfig = {
  // Server settings
  port: parseInt(process.env.PORT || '3030', 10),
  host: process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',

  // CORS settings
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },

  // Rate limiting
  rateLimit: {
    general: {
      windowMs: isProduction ? 15 * 60 * 1000 : 60 * 1000,
      max: isProduction ? 100 : 1000,
      message: 'Too many requests from this IP, please try again later'
    },
    auth: {
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many login attempts, please try again later'
    },
    telemetry: {
      windowMs: 60 * 1000,
      max: 1000,
      message: 'Telemetry rate limit exceeded'
    },
    write: {
      windowMs: 15 * 60 * 1000,
      max: 50,
      message: 'Too many write operations, please try again later'
    }
  },

  // WebSocket configuration
  websocket: {
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '60000', 10),
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10),
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true
    },
    transports: ['websocket', 'polling']
  },

  // Database configuration
  database: {
    path: process.env.DB_PATH || '.raven/raven.db',
    developerDbPath: process.env.DEVELOPER_DB_PATH || '.raven/db/developer.db',
    authDbPath: process.env.AUTH_DB_PATH || '.raven/db/auth.db',
    snapshotsDir: process.env.SNAPSHOTS_DIR || '.raven/snapshots',
    options: {
      verbose: isDevelopment ? console.log : null,
      timeout: 5000
    }
  },

  // Monitoring configuration
  monitoring: {
    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '5000', 10),
    logWatcherPollInterval: parseInt(process.env.LOG_WATCHER_POLL_INTERVAL || '100', 10),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    snapshotRetentionDays: parseInt(process.env.SNAPSHOT_RETENTION_DAYS || '30', 10)
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    sessionSecret: process.env.SESSION_SECRET,
    disableAuth: process.env.DISABLE_AUTH === 'true',
    enableTracing: process.env.ENABLE_TRACING === 'true',
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    format: process.env.LOG_FORMAT || 'json',
    directory: process.env.LOG_DIR || 'logs',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '30', 10),
    maxSize: process.env.LOG_MAX_SIZE || '20m'
  },

  // File watching configuration
  fileWatching: {
    debounceMs: parseInt(process.env.FILE_WATCH_DEBOUNCE || '100', 10),
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.raven/**'
    ],
    maxFiles: parseInt(process.env.MAX_WATCHED_FILES || '10000', 10)
  },

  // Performance thresholds
  performance: {
    slowRequestMs: parseInt(process.env.SLOW_REQUEST_MS || '1000', 10),
    maxResponseTimeMs: parseInt(process.env.MAX_RESPONSE_TIME_MS || '5000', 10),
    memoryWarningMb: parseInt(process.env.MEMORY_WARNING_MB || '500', 10),
    cpuWarningPercent: parseInt(process.env.CPU_WARNING_PERCENT || '80', 10)
  },

  // Plugin system
  plugins: {
    enabled: process.env.ENABLE_PLUGINS !== 'false',
    directory: process.env.PLUGINS_DIR || '.raven/plugins',
    autoLoad: process.env.AUTO_LOAD_PLUGINS !== 'false'
  }
};

/**
 * Validate configuration
 * @throws {Error} If configuration is invalid
 */
export function validateConfig() {
  const errors = [];

  if (!serverConfig.port || serverConfig.port < 1 || serverConfig.port > 65535) {
    errors.push('Invalid port number');
  }

  if (isProduction && !serverConfig.security.jwtSecret) {
    errors.push('JWT_SECRET required in production');
  }

  if (isProduction && !serverConfig.security.sessionSecret) {
    errors.push('SESSION_SECRET required in production');
  }

  if (errors.length > 0) {
    const errorList = errors.join('\n- ');
    throw new Error('Configuration errors:\n- ' + errorList);
  }
}

/**
 * Get configuration value by dot notation path
 * @param {string} path - Dot notation path (e.g., 'database.path')
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Configuration value
 */
export function getConfig(path, defaultValue = undefined) {
  const keys = path.split('.');
  let value = serverConfig;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }

  return value;
}

export default serverConfig;
