import { logger } from './logger.js';
import { toasts } from './toastStore.js';
import { settings as settingsStore } from './stores/settingsStore.js';
import { notificationHistory } from './stores/notificationHistory.js';

/**
 * @typedef {'info'|'success'|'warning'|'error'|'trigger'|'performance'} NotificationType
 */

/**
 * @typedef {Object} NotificationOptions
 * @property {string} [title='Raven'] - Notification title
 * @property {number} [duration] - Auto-dismiss duration in ms
 * @property {boolean} [browserNotification=false] - Show browser notification
 * @property {boolean} [playSound] - Play notification sound
 * @property {boolean} [critical] - Mark as critical (for warnings)
 * @property {string} [link] - Navigation link when notification is clicked
 * @property {boolean} [saveToHistory=true] - Save notification to history
 */

/**
 * Centralized notification service that respects user preferences
 * Handles: toasts, browser notifications, and sounds
 */
class NotificationService {
  constructor() {
    this.settings = this.loadSettings();
    this.browserPermission = 'default';
    this.requestBrowserPermission();

    // Rate limiting: track recent notifications to avoid duplicates
    this.recentNotifications = new Map(); // key -> timestamp
    this.rateLimitWindow = 5000; // 5 seconds

    // Lazy AudioContext initialization (to avoid autoplay warnings)
    this.audioContext = null;
    this.userHasInteracted = false;

    // Listen for first user interaction to enable audio
    const enableAudio = () => {
      this.userHasInteracted = true;
      // Remove listeners after first interaction
      document.removeEventListener('click', enableAudio);
      document.removeEventListener('keydown', enableAudio);
      document.removeEventListener('touchstart', enableAudio);
    };
    document.addEventListener('click', enableAudio, { once: true });
    document.addEventListener('keydown', enableAudio, { once: true });
    document.addEventListener('touchstart', enableAudio, { once: true });

    // Subscribe to settings changes for real-time updates
    settingsStore.subscribe(newSettings => {
      this.settings = newSettings;
    });
  }

  // Load settings from localStorage
  loadSettings() {
    const saved = localStorage.getItem('raven-settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        logger.error('Failed to parse notification settings:', e);
      }
    }
    return {
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
      }
    };
  }

  // Refresh settings (call this when settings change)
  refreshSettings() {
    this.settings = this.loadSettings();
  }

  // Check if notification should be rate-limited
  isRateLimited(key) {
    const now = Date.now();
    const lastShown = this.recentNotifications.get(key);

    if (lastShown && now - lastShown < this.rateLimitWindow) {
      return true; // Too soon, rate limit
    }

    // Update timestamp and clean old entries
    this.recentNotifications.set(key, now);

    // Clean up old entries (older than rate limit window)
    for (const [k, timestamp] of this.recentNotifications.entries()) {
      if (now - timestamp > this.rateLimitWindow) {
        this.recentNotifications.delete(k);
      }
    }

    return false;
  }

  // Request browser notification permission
  async requestBrowserPermission() {
    if ('Notification' in window) {
      this.browserPermission = Notification.permission;
      if (this.browserPermission === 'default') {
        this.browserPermission = await Notification.requestPermission();
      }
    }
  }

  // Check if notification type should be shown based on user preferences
  shouldShow(type) {
    if (!this.settings.notifications.enabled) return false;

    const typeMap = {
      error: 'errors',
      warning: 'warnings',
      trigger: 'triggers',
      performance: 'performance',
      info: 'info',
      success: 'info' // Map success to info
    };

    const settingKey = typeMap[type] || 'info';
    return this.settings.notifications.types[settingKey] !== false;
  }

  // Play notification sound with different tones for different types
  playSound(type = 'info') {
    if (!this.settings.notifications.soundEnabled) return;

    // Don't create AudioContext until user has interacted with the page
    if (!this.userHasInteracted) return;

    try {
      // Lazy initialization of AudioContext (avoids autoplay warnings)
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Resume context if suspended (happens after creation before user interaction)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const now = this.audioContext.currentTime;

      // Different sound patterns for different notification types
      const soundPatterns = {
        error: [
          { freq: 400, duration: 0.1, delay: 0 },
          { freq: 300, duration: 0.1, delay: 0.12 },
          { freq: 200, duration: 0.2, delay: 0.24 }
        ],
        warning: [
          { freq: 600, duration: 0.08, delay: 0 },
          { freq: 500, duration: 0.08, delay: 0.1 }
        ],
        success: [
          { freq: 523, duration: 0.06, delay: 0 }, // C5
          { freq: 659, duration: 0.06, delay: 0.08 }, // E5
          { freq: 784, duration: 0.12, delay: 0.16 } // G5
        ],
        trigger: [
          { freq: 800, duration: 0.05, delay: 0 },
          { freq: 1000, duration: 0.05, delay: 0.06 },
          { freq: 800, duration: 0.05, delay: 0.12 }
        ],
        info: [{ freq: 800, duration: 0.1, delay: 0 }]
      };

      const pattern = soundPatterns[type] || soundPatterns.info;

      pattern.forEach(note => {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = note.freq;
        oscillator.type = 'sine';

        const startTime = now + note.delay;
        const endTime = startTime + note.duration;

        gainNode.gain.setValueAtTime(0.15, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);

        oscillator.start(startTime);
        oscillator.stop(endTime);
      });
    } catch (e) {
      // Handle AudioContext errors (e.g., before user interaction)
      const isAutoplayError =
        e.message.includes('user gesture') ||
        e.message.includes('play()') ||
        e.message.includes('interact with the document');

      if (isAutoplayError) {
        // Expected autoplay restriction - debug level only
        logger.debug('Audio autoplay blocked (expected):', e.message);
      } else {
        // Unexpected audio error - log as warning with full context for debugging
        logger.warn('Unexpected audio error:', {
          message: e.message,
          name: e.name,
          stack: e.stack,
          audioContext: this.audioContext?.state,
          userInteracted: this.userHasInteracted
        });
      }
    }
  }

  // Show browser notification
  showBrowserNotification(title, message, type = 'info') {
    if (!this.settings.notifications.desktopNotifications) return;
    if (!('Notification' in window)) return;
    if (this.browserPermission !== 'granted') return;

    try {
      const icon = type === 'error' ? '' : type === 'warning' ? '' : type === 'success' ? '' : '';

      new Notification(`${icon} ${title}`, {
        body: message,
        icon: '/raven-icon.svg',
        badge: '/raven-icon.svg',
        tag: `raven-${type}`,
        requireInteraction: type === 'error'
      });
    } catch (e) {
      logger.warn('Failed to show browser notification:', e);
    }
  }

  /**
   * Main notification method
   * @param {string} message - Notification message
   * @param {NotificationType} [type='info'] - Notification type
   * @param {NotificationOptions} [options={}] - Notification options
   */
  notify(message, type = 'info', options = {}) {
    // Check if this notification type should be shown
    if (!this.shouldShow(type)) return;

    const {
      title = 'Raven',
      duration,
      browserNotification = false,
      playSound = type === 'error' || type === 'warning',
      link = null,
      saveToHistory = true
    } = options;

    // Determine navigation link based on type (if not provided)
    let finalLink = link;
    if (!finalLink) {
      if (type === 'error') {
        finalLink = '/system';
      } else if (type === 'warning') {
        finalLink = '/safety';
      } else if (type === 'trigger') {
        finalLink = '/activity';
      } else if (type === 'performance') {
        finalLink = '/analysis';
      }
    }

    // Add to notification history (unless explicitly disabled)
    if (saveToHistory) {
      notificationHistory.add({
        message,
        type,
        title,
        link: finalLink
      });
    }

    // Show toast notification
    if (this.settings.notifications.showToasts) {
      if (type === 'error') {
        toasts.error(message, duration);
      } else if (type === 'warning') {
        toasts.warning(message, duration);
      } else if (type === 'success') {
        toasts.success(message, duration);
      } else {
        toasts.info(message, duration);
      }
    }

    // Show browser notification if requested
    if (browserNotification) {
      this.showBrowserNotification(title, message, type);
    }

    // Play sound if requested
    if (playSound) {
      this.playSound(type);
    }
  }

  /**
   * Show error notification
   * @param {string} message - Error message
   * @param {NotificationOptions} [options={}] - Notification options
   */
  error(message, options = {}) {
    this.notify(message, 'error', {
      ...options,
      browserNotification: true,
      playSound: true
    });
  }

  /**
   * Show warning notification
   * @param {string} message - Warning message
   * @param {NotificationOptions} [options={}] - Notification options
   */
  warning(message, options = {}) {
    this.notify(message, 'warning', {
      ...options,
      browserNotification: options.critical || false
    });
  }

  /**
   * Show success notification
   * @param {string} message - Success message
   * @param {NotificationOptions} [options={}] - Notification options
   */
  success(message, options = {}) {
    this.notify(message, 'success', options);
  }

  /**
   * Show info notification
   * @param {string} message - Info message
   * @param {NotificationOptions} [options={}] - Notification options
   */
  info(message, options = {}) {
    this.notify(message, 'info', options);
  }

  trigger(message, options = {}) {
    this.notify(message, 'trigger', {
      ...options,
      title: 'Trigger Alert'
    });
  }

  performance(message, options = {}) {
    this.notify(message, 'performance', {
      ...options,
      title: 'Performance Alert'
    });
  }

  // System-level notifications
  websocketConnected() {
    this.success('WebSocket connected', { title: 'Connection Established', saveToHistory: false });
  }

  websocketDisconnected() {
    this.error('WebSocket disconnected - Real-time updates paused', {
      title: 'Connection Lost',
      duration: 0 // Don't auto-dismiss
    });
  }

  websocketReconnecting(attempt) {
    this.warning(`Reconnecting to server... (Attempt ${attempt})`, {
      title: 'Reconnecting',
      duration: 3000
    });
  }

  serverHealthy() {
    this.success('Server health check passed', { title: 'Server Healthy' });
  }

  serverUnhealthy(reason) {
    this.error(`Server health check failed: ${reason}`, {
      title: 'Server Unhealthy',
      duration: 0
    });
  }

  apiError(endpoint, error) {
    // Rate limit API errors to avoid spam (same endpoint + error)
    const rateLimitKey = `api-error:${endpoint}:${error.substring(0, 50)}`;
    if (this.isRateLimited(rateLimitKey)) {
      logger.warn(`Rate limited API error: ${endpoint}`);
      return;
    }

    this.error(`API error on ${endpoint}: ${error}`, {
      title: 'API Error',
      browserNotification: true
    });
  }

  storageWarning(percentage) {
    this.warning(`Storage at ${percentage}% capacity`, {
      title: 'Storage Warning',
      critical: percentage >= 90
    });
  }

  storageCritical(percentage) {
    this.error(`Storage critically full: ${percentage}%`, {
      title: 'Storage Critical',
      duration: 0
    });
  }

  syncComplete() {
    this.success('Server sync completed successfully', { title: 'Sync Complete' });
  }

  syncFailed(error) {
    this.error(`Server sync failed: ${error}`, { title: 'Sync Failed' });
  }

  fileWatcherError(error) {
    this.error(`File watcher error: ${error}`, {
      title: 'File Watcher Error',
      browserNotification: true
    });
  }

  agentStatusChange(agentName, status) {
    const message = `Agent "${agentName}" is now ${status}`;
    if (status === 'running') {
      this.info(message, { title: 'Agent Started' });
    } else if (status === 'stopped' || status === 'failed') {
      this.warning(message, { title: 'Agent Stopped' });
    }
  }

  /**
   * Cleanup method to properly dispose of resources
   * Call this when the service is no longer needed
   */
  destroy() {
    // Close AudioContext if it exists
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clear recent notifications map
    this.recentNotifications.clear();

    logger.debug('NotificationService destroyed');
  }
}

// Export singleton instance
export const notifications = new NotificationService();

// Allow external refresh of settings
window.addEventListener('storage', () => {
  notifications.refreshSettings();
});
