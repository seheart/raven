import { writable } from 'svelte/store';

// Notification store
function createNotificationStore() {
  const { subscribe, update } = writable([]);

  let id = 0;

  return {
    subscribe,
    add: notification => {
      const newNotification = {
        id: id++,
        type: notification.type || 'info', // 'success', 'error', 'warning', 'info'
        message: notification.message,
        timeout: notification.timeout || 5000
      };

      update(notifications => [...notifications, newNotification]);

      // Auto-remove after timeout
      if (newNotification.timeout > 0) {
        setTimeout(() => {
          update(notifications => notifications.filter(n => n.id !== newNotification.id));
        }, newNotification.timeout);
      }

      return newNotification.id;
    },
    remove: id => {
      update(notifications => notifications.filter(n => n.id !== id));
    },
    clear: () => {
      update(() => []);
    }
  };
}

export const notifications = createNotificationStore();

// Helper functions
export function showSuccess(message, timeout = 3000) {
  notifications.add({ type: 'success', message, timeout });
}

export function showError(message, timeout = 5000) {
  notifications.add({ type: 'error', message, timeout });
}

export function showWarning(message, timeout = 4000) {
  notifications.add({ type: 'warning', message, timeout });
}

export function showInfo(message, timeout = 3000) {
  notifications.add({ type: 'info', message, timeout });
}
