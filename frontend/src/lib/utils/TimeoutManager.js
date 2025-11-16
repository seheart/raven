import { logger } from '../logger.js';

/**
 * TimeoutManager - Utility class for managing multiple timeouts
 * Simplifies cleanup of timeouts in Svelte components
 *
 * Usage:
 *   const timeouts = new TimeoutManager();
 *   timeouts.add(() => logger.debug('Hello'), 1000);
 *   onDestroy(() => timeouts.cleanup());
 */
export class TimeoutManager {
  constructor() {
    this.timeouts = [];
  }

  /**
   * Add a new timeout
   * @param {Function} callback - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timeout ID
   */
  add(callback, delay) {
    const id = setTimeout(callback, delay);
    this.timeouts.push(id);
    return id;
  }

  /**
   * Clear a specific timeout
   * @param {number} id - Timeout ID to clear
   */
  clear(id) {
    clearTimeout(id);
    this.timeouts = this.timeouts.filter(tid => tid !== id);
  }

  /**
   * Clear all tracked timeouts
   */
  cleanup() {
    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts = [];
  }

  /**
   * Get count of active timeouts
   * @returns {number} Number of active timeouts
   */
  get count() {
    return this.timeouts.length;
  }
}
