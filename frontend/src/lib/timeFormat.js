import { getSetting } from './stores/settingsStore.js';

/**
 * Get a Date's components in the user's configured timezone.
 * Uses Intl.DateTimeFormat to project into the target zone.
 */
function getPartsInZone(date) {
  const tz = getSetting('ui.timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    parts[type] = value;
  }
  return parts; // { year, month, day, hour, minute, second }
}

/**
 * Format a timestamp according to user's time format and timezone preferences
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
  const p = getPartsInZone(date);
  const result = [];

  if (includeDate) {
    result.push(`${p.month}/${p.day}/${p.year.slice(-2)}`);
  }

  if (includeTime) {
    let hours = parseInt(p.hour, 10);
    if (timeFormat === '12h') {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      let timeStr = `${hours}:${p.minute}`;
      if (includeSeconds) timeStr += `:${p.second}`;
      timeStr += ` ${ampm}`;
      result.push(timeStr);
    } else {
      let timeStr = `${String(hours).padStart(2, '0')}:${p.minute}`;
      if (includeSeconds) timeStr += `:${p.second}`;
      result.push(timeStr);
    }
  }

  return result.join(separator);
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
 * Format timestamp in a shorter format (e.g., "Jan 29, 2:30 PM")
 * @param {string|Date} timestamp - The timestamp to format
 * @returns {string} Short formatted time string
 */
export function formatShortDateTime(timestamp) {
  if (!timestamp) return '';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid date';

  const timeFormat = getSetting('ui.timeFormat') || '24h';
  const tz = getSetting('ui.timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: tz });
  const p = getPartsInZone(date);

  let hours = parseInt(p.hour, 10);
  let timeStr;
  if (timeFormat === '12h') {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    timeStr = `${hours}:${p.minute} ${ampm}`;
  } else {
    timeStr = `${String(hours).padStart(2, '0')}:${p.minute}`;
  }

  return `${month} ${parseInt(p.day, 10)}, ${timeStr}`;
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

/**
 * Get time ago string for "Updated: Xs ago" displays
 * Used for real-time "last updated" timestamps in UI
 * @param {Date|null} date - The date to calculate from
 * @returns {string} Time ago string
 */
export function getTimeAgo(date) {
  if (!date) return 'Just now';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
