import { writable } from 'svelte/store';

const DEFAULT_DURATION = 3000;

function createToastStore() {
  const { subscribe, update } = writable([]);
  let nextId = 0;

  return {
    subscribe,

    show(message, type = 'info', duration = DEFAULT_DURATION) {
      const id = nextId++;
      const toast = {
        id,
        message,
        type, // 'success', 'error', 'warning', 'info'
        duration,
        timestamp: Date.now()
      };

      update(toasts => [...toasts, toast]);

      if (duration > 0) {
        setTimeout(() => {
          this.dismiss(id);
        }, duration);
      }

      return id;
    },

    success(message, duration) {
      return this.show(message, 'success', duration);
    },

    error(message, duration = 5000) {
      return this.show(message, 'error', duration);
    },

    warning(message, duration) {
      return this.show(message, 'warning', duration);
    },

    info(message, duration) {
      return this.show(message, 'info', duration);
    },

    dismiss(id) {
      update(toasts => toasts.filter(t => t.id !== id));
    },

    clear() {
      update(() => []);
    }
  };
}

export const toasts = createToastStore();