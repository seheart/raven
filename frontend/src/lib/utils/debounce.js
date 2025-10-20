/**
 * Debounce utility for Raven
 * Delays function execution until after a specified wait time has passed
 * since the last invocation
 */

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay (default: 300)
 * @param {boolean} immediate - Trigger the function on the leading edge instead of trailing
 * @returns {Function} The debounced function with cancel method
 */
export function debounce(func, wait = 300, immediate = false) {
  let timeout;
  let result;

  const debounced = function(...args) {
    const context = this;
    const later = () => {
      timeout = null;
      if (!immediate) {
        result = func.apply(context, args);
      }
    };

    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) {
      result = func.apply(context, args);
    }

    return result;
  };

  // Allow cancellation of pending executions
  debounced.cancel = () => {
    clearTimeout(timeout);
    timeout = null;
  };

  // Allow immediate execution, bypassing the debounce
  debounced.flush = function(...args) {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    return func.apply(this, args);
  };

  return debounced;
}

/**
 * Creates a debounced store for Svelte reactive values
 * Useful for search inputs and real-time filters
 * @param {any} initialValue - Initial value for the store
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Object} Object with set, update, and subscribe methods
 */
export function createDebouncedStore(initialValue, delay = 300) {
  const { subscribe, set: originalSet, update: originalUpdate } = writable(initialValue);

  const debouncedSet = debounce(originalSet, delay);
  const debouncedUpdate = debounce(originalUpdate, delay);

  return {
    subscribe,
    set: (value) => {
      debouncedSet(value);
    },
    update: (fn) => {
      debouncedUpdate(fn);
    },
    setImmediate: originalSet,
    updateImmediate: originalUpdate,
    cancel: () => {
      debouncedSet.cancel();
      debouncedUpdate.cancel();
    }
  };
}

/**
 * Svelte action for debouncing input events
 * Usage: <input use:debounceInput={{ delay: 500 }} on:debounced={handleSearch} />
 * @param {HTMLElement} node - The input element
 * @param {Object} params - { delay: number, event: string }
 * @returns {Object} Svelte action object with update and destroy methods
 */
export function debounceInput(node, params = {}) {
  const { delay = 300, event = 'input' } = params;

  let debounced = debounce((e) => {
    node.dispatchEvent(new CustomEvent('debounced', {
      detail: e.target.value,
      bubbles: true,
      cancelable: true
    }));
  }, delay);

  const handler = (e) => {
    debounced(e);
  };

  node.addEventListener(event, handler);

  return {
    update(newParams) {
      const newDelay = newParams.delay || 300;
      const newEvent = newParams.event || 'input';

      if (newDelay !== delay || newEvent !== event) {
        node.removeEventListener(event, handler);
        debounced = debounce((e) => {
          node.dispatchEvent(new CustomEvent('debounced', {
            detail: e.target.value,
            bubbles: true,
            cancelable: true
          }));
        }, newDelay);
        node.addEventListener(newEvent, handler);
      }
    },
    destroy() {
      debounced.cancel();
      node.removeEventListener(event, handler);
    }
  };
}

// Add missing import for Svelte stores
import { writable } from 'svelte/store';