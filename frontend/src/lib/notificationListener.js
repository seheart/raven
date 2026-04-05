import { logger } from './logger.js';
import { websocketService } from './services/websocket.js';
import { notifications } from './notificationService.js';

// Store callbacks so we can remove them on teardown
const listeners = new Map();

/**
 * Central listener for backend WebSocket events that trigger notifications
 * Call setupNotificationListeners() once during app initialization
 */
export function setupNotificationListeners() {
  const handlers = {
    'error-logged': error => {
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
    },

    notification: notification => {
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
    },

    'agent-event': agentEvent => {
      if (agentEvent.event_type === 'status_change') {
        const agentName = agentEvent.agent_name || 'Unknown Agent';
        const newStatus = agentEvent.metadata?.status || agentEvent.status;

        if (newStatus) {
          notifications.agentStatusChange(agentName, newStatus);
        }
      }

      if (agentEvent.event_type === 'error') {
        notifications.error(
          `Agent ${agentEvent.agent_name}: ${agentEvent.metadata?.error || 'Unknown error'}`,
          {
            title: 'Agent Error',
            browserNotification: true
          }
        );
      }
    },

    'sync-complete': data => {
      if (data.success) {
        notifications.syncComplete();
      } else {
        notifications.syncFailed(data.error || 'Unknown error');
      }
    },

    'file-watcher-error': error => {
      notifications.fileWatcherError(error.message || 'File watcher error');
    },

    'performance-alert': alert => {
      notifications.performance(alert.message, {
        title: alert.title || 'Performance Alert'
      });
    },

    'storage-warning': data => {
      if (data.critical) {
        notifications.storageCritical(data.percentage);
      } else {
        notifications.storageWarning(data.percentage);
      }
    },

    'trigger-fired': trigger => {
      notifications.trigger(`Trigger "${trigger.name}": ${trigger.message}`, {
        title: 'Trigger Fired'
      });
    },

    'model-status-changed': data => {
      const modelInfo = data.models?.length > 0 ? ` (${data.models.join(', ')})` : '';
      if (data.status === 'running') {
        notifications.info(`${data.name}${modelInfo} is now running`, {
          title: 'Model Started'
        });
      } else {
        notifications.warning(`${data.name} has stopped`, {
          title: 'Model Stopped'
        });
      }
    }
  };

  for (const [eventName, handler] of Object.entries(handlers)) {
    listeners.set(eventName, handler);
    websocketService.on(eventName, handler);
  }

  logger.info(' Notification listeners initialized');
}

/**
 * Remove all notification listeners (cleanup)
 */
export function teardownNotificationListeners() {
  for (const [eventName, handler] of listeners) {
    websocketService.off(eventName, handler);
  }
  listeners.clear();
}
