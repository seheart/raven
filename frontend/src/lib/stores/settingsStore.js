import { writable, derived, get } from 'svelte/store';
import { logger } from '../logger.js';

// Default settings structure
const DEFAULT_SETTINGS = {
  notifications: {
    enabled: true,
    showToasts: true,
    soundEnabled: false,
    desktopNotifications: false,
    types: {
      errors: true,
      warnings: true,
      triggers: true,
      performance: false,
      info: true
    }
  },
  ui: {
    theme: 'dark',
    compactMode: false,
    animationsEnabled: true,
    autoRefresh: true,
    refreshInterval: 10,
    timeFormat: '24h', // '12h' or '24h'
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone // auto-detect
  },
  editor: {
    defaultEditor: 'auto'
  },
  performance: {
    enableMetrics: true,
    metricsInterval: 10,
    enableFileWatcher: true,
    maxEventsDisplay: 100
  }
};

// Load settings from localStorage
function loadSettings() {
  try {
    // In test/SSR environments, localStorage may be unavailable
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return { ...DEFAULT_SETTINGS };
    }
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }

  const saved = localStorage.getItem('raven-settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all keys exist
      return {
        notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
        ui: { ...DEFAULT_SETTINGS.ui, ...parsed.ui },
        editor: { ...DEFAULT_SETTINGS.editor, ...parsed.editor },
        performance: { ...DEFAULT_SETTINGS.performance, ...parsed.performance }
      };
    } catch (e) {
      logger.error('Failed to parse saved settings:', e);
      return { ...DEFAULT_SETTINGS };
    }
  }
  return { ...DEFAULT_SETTINGS };
}

// Create the main settings store
const settingsStore = writable(loadSettings());

// Auto-save to localStorage whenever settings change
settingsStore.subscribe(value => {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem('raven-settings', JSON.stringify(value));
    }
  } catch (error) {
    // localStorage may be unavailable in private browsing mode or due to quota
    logger.debug('[Settings] localStorage unavailable:', error.message);
  }
});

// Derived stores for specific setting sections
export const notificationSettings = derived(settingsStore, $settings => $settings.notifications);

export const uiSettings = derived(settingsStore, $settings => $settings.ui);

export const performanceSettings = derived(settingsStore, $settings => $settings.performance);

// Settings actions
export const settings = {
  subscribe: settingsStore.subscribe,

  // Update entire settings object
  set: newSettings => {
    settingsStore.set(newSettings);
  },

  // Update a specific setting path
  update: (path, value) => {
    settingsStore.update(current => {
      const updated = { ...current };
      const keys = path.split('.');

      // Safety check: ensure keys array is not empty
      if (keys.length === 0) {
        logger.warn('Settings update called with empty path');
        return updated;
      }

      let obj = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;

      return updated;
    });
  },

  // Update notification settings
  updateNotifications: updates => {
    settingsStore.update(current => ({
      ...current,
      notifications: { ...current.notifications, ...updates }
    }));
  },

  // Update UI settings
  updateUI: updates => {
    settingsStore.update(current => ({
      ...current,
      ui: { ...current.ui, ...updates }
    }));

    // Apply theme change immediately if theme was updated
    if (updates.theme) {
      try {
        if (typeof document !== 'undefined') {
          if (updates.theme === 'dark') {
            document.body.classList.add('dark');
          } else {
            document.body.classList.remove('dark');
          }
        }
        if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
          localStorage.setItem('raven-theme', updates.theme);
        }
      } catch (error) {
        logger.debug('[Settings] Failed to save theme:', error.message);
      }
    }
  },

  // Update performance settings
  updatePerformance: updates => {
    settingsStore.update(current => ({
      ...current,
      performance: { ...current.performance, ...updates }
    }));
  },

  // Reset to defaults
  reset: () => {
    settingsStore.set({ ...DEFAULT_SETTINGS });
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem('raven-settings');
      }
    } catch (error) {
      // localStorage may be unavailable in private browsing mode
      logger.debug('[Settings] Failed to clear localStorage:', error.message);
    }
  },

  // Get current settings value (non-reactive)
  getValue: () => {
    return get(settingsStore);
  },

  // Export settings as JSON
  export: () => {
    return JSON.stringify(get(settingsStore), null, 2);
  },

  // Import settings from JSON
  import: jsonString => {
    try {
      const imported = JSON.parse(jsonString);
      // Merge with defaults to ensure all keys exist
      const merged = {
        notifications: { ...DEFAULT_SETTINGS.notifications, ...imported.notifications },
        ui: { ...DEFAULT_SETTINGS.ui, ...imported.ui },
        editor: { ...DEFAULT_SETTINGS.editor, ...imported.editor },
        performance: { ...DEFAULT_SETTINGS.performance, ...imported.performance }
      };
      settingsStore.set(merged);
      return true;
    } catch (e) {
      logger.error('Failed to import settings:', e);
      return false;
    }
  }
};

// Convenience getters for commonly used settings
export const getSetting = path => {
  const current = get(settingsStore);
  const keys = path.split('.');
  let value = current;

  for (const key of keys) {
    value = value[key];
    if (value === undefined) break;
  }

  return value;
};

// Check if a notification type is enabled
export const isNotificationTypeEnabled = type => {
  const current = get(settingsStore);
  return current.notifications.enabled && current.notifications.types[type];
};

// Get theme
export const getTheme = () => {
  const current = get(settingsStore);
  return current.ui.theme;
};

// Get refresh interval
export const getRefreshInterval = () => {
  const current = get(settingsStore);
  return current.ui.autoRefresh ? current.ui.refreshInterval * 1000 : null;
};

export default settings;
