import { websocketService } from './websocket.js';
import { notifications } from './notificationService.js';

/**
 * Central listener for backend WebSocket events that trigger notifications
 * Call setupNotificationListeners() once during app initialization
 */
export function setupNotificationListeners() {
  // Error logged events
  websocketService.on('error-logged', (error) => {
    const severity = error.severity || 'error';
    const message = `${error.component || 'System'}: ${error.message}`;

    if (severity === 'error' || severity === 'critical') {
      notifications.error(message, {
        title: 'Error Logged',
        browserNotification: severity === 'critical'
      });
    } else if (severity === 'warning') {
      notifications.warning(message, {
        title: 'Warning'
      });
    }
  });

  // Notification events from backend
  websocketService.on('notification', (notification) => {
    const { type, title, message, severity } = notification;

    if (severity === 'critical' || severity === 'error') {
      notifications.error(message, {
        title: title || 'Error',
        browserNotification: true
      });
    } else if (severity === 'warning') {
      notifications.warning(message, {
        title: title || 'Warning'
      });
    } else if (type === 'trigger') {
      notifications.trigger(message, {
        title: title || 'Trigger Alert'
      });
    } else {
      notifications.info(message, {
        title: title || 'Notification'
      });
    }
  });

  // Agent status changes
  websocketService.on('agent-event', (event) => {
    if (event.event_type === 'status_change') {
      const agentName = event.agent_name || 'Unknown Agent';
      const newStatus = event.metadata?.status || event.status;

      if (newStatus) {
        notifications.agentStatusChange(agentName, newStatus);
      }
    }

    // Agent errors
    if (event.event_type === 'error') {
      notifications.error(`Agent ${event.agent_name}: ${event.metadata?.error || 'Unknown error'}`, {
        title: 'Agent Error',
        browserNotification: true
      });
    }
  });

  // Sync completion
  websocketService.on('sync-complete', (data) => {
    if (data.success) {
      notifications.syncComplete();
    } else {
      notifications.syncFailed(data.error || 'Unknown error');
    }
  });

  // File change errors (file watcher issues)
  websocketService.on('file-watcher-error', (error) => {
    notifications.fileWatcherError(error.message || 'File watcher error');
  });

  // Performance alerts
  websocketService.on('performance-alert', (alert) => {
    notifications.performance(alert.message, {
      title: alert.title || 'Performance Alert'
    });
  });

  // Storage warnings (we'll add backend emission for this)
  websocketService.on('storage-warning', (data) => {
    if (data.critical) {
      notifications.storageCritical(data.percentage);
    } else {
      notifications.storageWarning(data.percentage);
    }
  });

  // Trigger events
  websocketService.on('trigger-fired', (trigger) => {
    notifications.trigger(`Trigger "${trigger.name}": ${trigger.message}`, {
      title: 'Trigger Fired'
    });
  });

  console.log('📢 Notification listeners initialized');
}

/**
 * Remove all notification listeners (cleanup)
 */
export function teardownNotificationListeners() {
  const events = [
    'error-logged',
    'notification',
    'agent-event',
    'sync-complete',
    'file-watcher-error',
    'performance-alert',
    'storage-warning',
    'trigger-fired'
  ];

  events.forEach(event => {
    // Note: We'd need to store callbacks to properly remove them
    // For now, disconnect will handle cleanup
  });
}
