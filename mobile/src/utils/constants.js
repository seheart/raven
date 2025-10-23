// App configuration constants
export const APP_CONFIG = {
  APP_NAME: 'Raven Mobile',
  VERSION: '1.0.0',
  DEFAULT_PORT: '3030',
  WEBSOCKET_RECONNECT_DELAY: 3000,
  MAX_EVENTS_DISPLAY: 100,
};

// Event types from backend
export const EVENT_TYPES = {
  FILE_CREATED: 'file_created',
  FILE_MODIFIED: 'file_modified',
  FILE_DELETED: 'file_deleted',
  DIRECTORY_CREATED: 'directory_created',
  DIRECTORY_DELETED: 'directory_deleted',
  SYSTEM_METRIC: 'system_metric',
  TRIGGER_FIRED: 'trigger_fired',
};

// Storage keys for AsyncStorage
export const STORAGE_KEYS = {
  BACKEND_URL: '@raven_backend_url',
  SELECTED_PROJECT: '@raven_selected_project',
  RECENT_PROJECTS: '@raven_recent_projects',
};
