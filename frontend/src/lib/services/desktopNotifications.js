import { logger } from '../logger.js';
/**
 * Desktop Notifications Service
 *
 * Handles browser desktop notifications for Raven alerts.
 * Empowers users by keeping them informed even when not looking at the dashboard.
 */

class DesktopNotificationService {
  constructor() {
    this.permission = 'default';
    this.enabled = false;
    this.soundEnabled = true;

    // Check if notifications are supported
    this.supported = 'Notification' in window;

    if (this.supported) {
      this.permission = Notification.permission;
      this.enabled = this.permission === 'granted';
    }

    // Load user preferences
    this.loadPreferences();
  }

  /**
   * Request permission from user to show desktop notifications
   */
  async requestPermission() {
    if (!this.supported) {
      logger.warn('Desktop notifications not supported in this browser');
      return false;
    }

    if (this.permission === 'granted') {
      this.enabled = true;
      return true;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      this.enabled = permission === 'granted';

      if (this.enabled) {
        // Show welcome notification
        this.show({
          title: ' Raven Alerts Enabled',
          body: "You'll now get desktop notifications when AI makes important changes",
          icon: '/raven-icon.png',
          tag: 'welcome'
        });

        this.savePreferences();
      }

      return this.enabled;
    } catch (error) {
      logger.error('Failed to request notification permission:', error);
      return false;
    }
  }

  /**
   * Show a desktop notification
   *
   * @param {Object} options - Notification options
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification body text
   * @param {string} [options.icon] - Icon URL
   * @param {string} [options.tag] - Tag to group notifications
   * @param {boolean} [options.requireInteraction] - Keep notification visible until user dismisses
   * @param {boolean} [options.silent] - Don't play sound
   * @param {string} [options.severity] - Severity level (critical, warning, info)
   */
  show(options) {
    if (!this.enabled) {
      logger.info('Desktop notifications disabled, falling back to in-app notification');
      return null;
    }

    const {
      title,
      body,
      icon = '/raven-icon.png',
      tag,
      requireInteraction = false,
      silent = !this.soundEnabled,
      severity = 'info'
    } = options;

    try {
      // Add severity emoji to title
      const severityEmoji = {
        critical: '',
        warning: '',
        info: 'ℹ'
      };

      const enhancedTitle = `${severityEmoji[severity] || ''} ${title}`;

      const notification = new Notification(enhancedTitle, {
        body,
        icon,
        tag,
        requireInteraction,
        silent,
        badge: '/raven-badge.png',
        timestamp: Date.now()
      });

      // Auto-close after 10 seconds unless requireInteraction is true
      if (!requireInteraction) {
        setTimeout(() => notification.close(), 10000);
      }

      // Handle click - focus window and close notification
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return notification;
    } catch (error) {
      logger.error('Failed to show desktop notification:', error);
      return null;
    }
  }

  /**
   * Show alert for large deletion
   */
  alertLargeDeletion(file, lines) {
    return this.show({
      title: 'Large Code Deletion',
      body: `AI deleted ${lines} lines in ${file}`,
      severity: 'warning',
      requireInteraction: false,
      tag: 'large-deletion'
    });
  }

  /**
   * Show alert for security file change
   */
  alertSecurityFile(file) {
    return this.show({
      title: 'Security File Changed',
      body: `Sensitive file modified: ${file}`,
      severity: 'critical',
      requireInteraction: true,
      tag: 'security-file'
    });
  }

  /**
   * Show alert for dependency change
   */
  alertDependencyChange(file) {
    return this.show({
      title: 'Dependencies Updated',
      body: `Package file modified: ${file}`,
      severity: 'info',
      requireInteraction: false,
      tag: 'dependency-change'
    });
  }

  /**
   * Show alert for massive change
   */
  alertMassiveChange(file, lines) {
    return this.show({
      title: 'Massive File Change',
      body: `Huge change detected: ${lines} lines in ${file}`,
      severity: 'warning',
      requireInteraction: false,
      tag: 'massive-change'
    });
  }

  /**
   * Show alert for rapid changes
   */
  alertRapidChanges(file, count) {
    return this.show({
      title: 'Rapid Changes Detected',
      body: `${file} modified ${count} times in 60 seconds - possible issue?`,
      severity: 'info',
      requireInteraction: false,
      tag: 'rapid-changes'
    });
  }

  /**
   * Show alert for syntax error
   */
  alertSyntaxError(file, error) {
    return this.show({
      title: 'Syntax Error Detected',
      body: `${file}: ${error}`,
      severity: 'critical',
      requireInteraction: true,
      tag: 'syntax-error'
    });
  }

  /**
   * Show alert for test failure
   */
  alertTestFailure(file, test) {
    return this.show({
      title: 'Test Failure',
      body: `Test failed in ${file}: ${test}`,
      severity: 'warning',
      requireInteraction: true,
      tag: 'test-failure'
    });
  }

  /**
   * Enable/disable desktop notifications
   */
  setEnabled(enabled) {
    this.enabled = enabled && this.permission === 'granted';
    this.savePreferences();
  }

  /**
   * Enable/disable notification sounds
   */
  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
    this.savePreferences();
  }

  /**
   * Save preferences to localStorage
   */
  savePreferences() {
    localStorage.setItem(
      'raven-desktop-notifications',
      JSON.stringify({
        enabled: this.enabled,
        soundEnabled: this.soundEnabled
      })
    );
  }

  /**
   * Load preferences from localStorage
   */
  loadPreferences() {
    try {
      const saved = localStorage.getItem('raven-desktop-notifications');
      if (saved) {
        const prefs = JSON.parse(saved);
        this.soundEnabled = prefs.soundEnabled !== false; // Default true
        // Don't override enabled if permission was revoked
        if (this.permission === 'granted') {
          this.enabled = prefs.enabled !== false;
        }
      }
    } catch (error) {
      logger.error('Failed to load notification preferences:', error);
    }
  }

  /**
   * Check if notifications are currently enabled
   */
  isEnabled() {
    return this.enabled && this.permission === 'granted';
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      supported: this.supported,
      permission: this.permission,
      enabled: this.enabled,
      soundEnabled: this.soundEnabled
    };
  }
}

// Create singleton instance
export const desktopNotifications = new DesktopNotificationService();

// Export for easy importing
export default desktopNotifications;
