import { getSetting } from './settingsStore.js';

/**
 * Format a timestamp according to user's time format preference
 * @param {string|Date} timestamp - The timestamp to format
 * @param {object} options - Formatting options
 * @param {boolean} options.includeDate - Include date in output (default: true)
 * @param {boolean} options.includeTime - Include time in output (default: true)
 * @param {boolean} options.includeSeconds - Include seconds (default: false)
 * @param {string} options.separator - Date/time separator (default: ', ')
 * @returns {string} Formatted time string
 */
export function formatTime(timestamp, options = {}) {
  const {
    includeDate = true,
    includeTime = true,
    includeSeconds = false,
    separator = ', '
  } = options;

  if (!timestamp) return '';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid date';

  const timeFormat = getSetting('ui.timeFormat') || '24h';
  const parts = [];

  // Date part
  if (includeDate) {
    // Format: MM/DD/YY
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2); // Get last 2 digits
    parts.push(`${month}/${day}/${year}`);
  }

  // Time part
  if (includeTime) {
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    if (timeFormat === '12h') {
      // 12-hour format with AM/PM
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12; // Convert 0 to 12
      let timeStr = `${hours}:${minutes}`;
      if (includeSeconds) {
        timeStr += `:${seconds}`;
      }
      timeStr += ` ${ampm}`;
      parts.push(timeStr);
    } else {
      // 24-hour format
      const hoursStr = String(hours).padStart(2, '0');
      let timeStr = `${hoursStr}:${minutes}`;
      if (includeSeconds) {
        timeStr += `:${seconds}`;
      }
      parts.push(timeStr);
    }
  }

  return parts.join(separator);
}

/**
 * Format a timestamp for display in UI
 * Convenience wrapper for formatTime with common defaults
 */
export function formatDateTime(timestamp) {
  return formatTime(timestamp, {
    includeDate: true,
    includeTime: true,
    includeSeconds: false
  });
}

/**
 * Format just the time portion
 */
export function formatTimeOnly(timestamp, includeSeconds = false) {
  return formatTime(timestamp, {
    includeDate: false,
    includeTime: true,
    includeSeconds
  });
}

/**
 * Format just the date portion
 */
export function formatDateOnly(timestamp) {
  return formatTime(timestamp, {
    includeDate: true,
    includeTime: false
  });
}

/**
 * Get the current time format setting
 */
export function getTimeFormat() {
  return getSetting('ui.timeFormat') || '24h';
}

/**
 * Format timestamp in a shorter format (e.g., "Jan 29, 2:30 PM")
 * @param {string|Date} timestamp - The timestamp to format
 * @returns {string} Short formatted time string
 */
export function formatShortDateTime(timestamp) {
  if (!timestamp) return '';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid date';

  const timeFormat = getSetting('ui.timeFormat') || '24h';
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');

  let timeStr;
  if (timeFormat === '12h') {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    timeStr = `${hours}:${minutes} ${ampm}`;
  } else {
    const hoursStr = String(hours).padStart(2, '0');
    timeStr = `${hoursStr}:${minutes}`;
  }

  return `${month} ${day}, ${timeStr}`;
}

/**
 * Format timestamp to relative time (e.g., "5m ago", "2h ago")
 * @param {string|Date} timestamp - The timestamp to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid date';

  const now = Date.now();
  const then = date.getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 5) return `${seconds}s ago`;
  return 'just now';
}
