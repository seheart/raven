/**
 * Raven Frontend Configuration
 * Centralized configuration for the Raven frontend application
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.DEV ? '' : 'http://localhost:3030',
  API_BASE: import.meta.env.DEV ? '/api' : 'http://localhost:3030/api',  // Use Vite proxy in dev
  get ENDPOINTS() {
    return {
      // Health & Status
      HEALTH: `${this.BASE_URL}/health`,
      SESSION_ID: `${this.BASE_URL}/api/session-id`,

      // Storage
      STORAGE: `${this.BASE_URL}/api/storage`,
      STORAGE_EXPORT: (dbName) => `${this.BASE_URL}/api/storage/export/${dbName}`,
      STORAGE_VACUUM: (dbName) => `${this.BASE_URL}/api/storage/vacuum/${dbName}`,
      STORAGE_CLEAN: (dbName) => `${this.BASE_URL}/api/storage/clean/${dbName}`,
      STORAGE_RETENTION: `${this.BASE_URL}/api/storage/retention`,

      // Server Sync
      SYNC_CONFIG: `${this.BASE_URL}/api/sync/config`,
      SYNC_TEST: `${this.BASE_URL}/api/sync/test`,
      SYNC_TRIGGER: `${this.BASE_URL}/api/sync/trigger`,
      SYNC_REMOTE_STATS: `${this.BASE_URL}/api/sync/remote-stats`,

      // Notifications
      NOTIFICATIONS: `${this.BASE_URL}/api/notifications`,
      NOTIFICATIONS_STATS: `${this.BASE_URL}/api/notifications/stats`,
      NOTIFICATIONS_READ: (id) => `${this.BASE_URL}/api/notifications/${id}/read`,
      NOTIFICATIONS_MARK_ALL_READ: `${this.BASE_URL}/api/notifications/mark-all-read`,
      NOTIFICATIONS_DELETE: (id) => `${this.BASE_URL}/api/notifications/${id}`,

      // Endpoints
      ENDPOINTS: `${this.BASE_URL}/api/endpoints`,

      // Errors
      ERRORS: `${this.BASE_URL}/api/errors`,

      // Git
      GIT_STATUS: `${this.BASE_URL}/api/git/status`
    };
  }
};

// WebSocket Configuration
export const WEBSOCKET_URL = import.meta.env.DEV ? '' : 'http://localhost:3030';

// UI Configuration
export const UI_CONFIG = {
  DEFAULT_THEME: 'theme--night',
  THEMES: {
    DAY: 'theme--day',
    DUSK: 'theme--dusk',
    NIGHT: 'theme--night'
  },
  REFRESH_INTERVALS: {
    DEFAULT: 30,  // seconds
    MIN: 5,
    MAX: 300
  }
};

// Storage Keys
export const STORAGE_KEYS = {
  SETTINGS: 'raven-settings',
  THEME: 'raven-theme',
  ACTIVE_TAB: 'raven-active-tab',
  WELCOME_SEEN: 'raven-welcome-seen',
  VISITED: 'raven-visited'
};
