import { writable, derived } from 'svelte/store';

/**
 * Notification History Store
 * Saves all notifications for the session with timestamps
 */

function createNotificationHistory() {
  const { subscribe, update } = writable([]);

  return {
    subscribe,

    /**
     * Add a notification to history
     * @param {Object} notification
     */
    add: notification => {
      update(notifications => {
        const newNotification = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          read: false,
          ...notification
        };

        // Add to beginning (most recent first)
        // Keep max 100 notifications
        return [newNotification, ...notifications].slice(0, 100);
      });
    },

    /**
     * Mark notification as read
     * @param {number} id - Notification ID
     */
    markRead: id => {
      update(notifications => notifications.map(n => (n.id === id ? { ...n, read: true } : n)));
    },

    /**
     * Mark all notifications as read
     */
    markAllRead: () => {
      update(notifications => notifications.map(n => ({ ...n, read: true })));
    },

    /**
     * Clear a specific notification
     * @param {number} id - Notification ID
     */
    clear: id => {
      update(notifications => notifications.filter(n => n.id !== id));
    },

    /**
     * Clear all notifications
     */
    clearAll: () => {
      update(() => []);
    },

    /**
     * Clear all read notifications
     */
    clearRead: () => {
      update(notifications => notifications.filter(n => !n.read));
    }
  };
}

export const notificationHistory = createNotificationHistory();

// Derived store for unread count
export const unreadCount = derived(
  notificationHistory,
  $notifications => $notifications.filter(n => !n.read).length
);
