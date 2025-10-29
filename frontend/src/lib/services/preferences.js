/**
 * User Preferences Service
 * Manages user settings stored in localStorage
 */

const STORAGE_KEY = 'raven_preferences';

const DEFAULT_PREFERENCES = {
  editor: 'auto',
  theme: 'system',
  notifications: {
    desktop: true,
    sound: false
  }
};

class PreferencesService {
  constructor() {
    this.preferences = this.load();
  }

  /**
   * Load preferences from localStorage
   */
  load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
    return { ...DEFAULT_PREFERENCES };
  }

  /**
   * Save preferences to localStorage
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  /**
   * Get a preference value
   */
  get(key) {
    const keys = key.split('.');
    let value = this.preferences;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  }

  /**
   * Set a preference value
   */
  set(key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    let obj = this.preferences;

    for (const k of keys) {
      if (!obj[k]) obj[k] = {};
      obj = obj[k];
    }

    obj[lastKey] = value;
    this.save();
  }

  /**
   * Get editor preference
   */
  getEditor() {
    return this.get('editor') || 'auto';
  }

  /**
   * Set editor preference
   */
  setEditor(editor) {
    this.set('editor', editor);
  }

  /**
   * Reset to defaults
   */
  reset() {
    this.preferences = { ...DEFAULT_PREFERENCES };
    this.save();
  }
}

export const preferences = new PreferencesService();
