// Runtime configuration
// Environment variables from Vite (import.meta.env) or fallback to defaults

export const config = {
  // API Base URL - configurable via VITE_API_BASE_URL environment variable
  API_BASE: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3030/api',

  // WebSocket URL - configurable via VITE_WS_URL environment variable
  WS_URL: import.meta.env.VITE_WS_URL || 'http://localhost:3030',

  // Refresh intervals (milliseconds)
  DASHBOARD_REFRESH_INTERVAL: parseInt(import.meta.env.VITE_DASHBOARD_REFRESH_MS) || 30000,
  STORAGE_REFRESH_INTERVAL: parseInt(import.meta.env.VITE_STORAGE_REFRESH_MS) || 30000,

  // Pagination
  DEFAULT_PAGE_SIZE: parseInt(import.meta.env.VITE_DEFAULT_PAGE_SIZE) || 50,

  // Feature flags
  ENABLE_DEBUG_MODE: import.meta.env.VITE_ENABLE_DEBUG === 'true',
};

// Log configuration on startup (only in development)
if (import.meta.env.DEV) {
  console.log('🔧 Raven Frontend Configuration:', config);
}
