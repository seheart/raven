// Time formatting utilities for Raven
// All times displayed in 24-hour format, Chicago timezone (America/Chicago)

const TIMEZONE = 'America/Chicago';

const BASE_OPTIONS = {
  timeZone: TIMEZONE,
  hour12: false
};

/**
 * Format a timestamp as full date and time
 * Example: "10/19/2025, 14:32:15"
 */
export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    ...BASE_OPTIONS,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format a timestamp as time only
 * Example: "14:32:15"
 */
export function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    ...BASE_OPTIONS,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format a timestamp as date only
 * Example: "10/19/2025"
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

/**
 * Format a timestamp as short date and time
 * Example: "10/19 14:32"
 */
export function formatShortDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    ...BASE_OPTIONS,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format a timestamp with full details
 * Example: "Wednesday, October 19, 2025 at 14:32:15"
 */
export function formatLongDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    ...BASE_OPTIONS,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format a Unix timestamp (seconds) to full date and time
 * Example: "10/19/2025, 14:32:15"
 */
export function formatUnixDateTime(unixTimestamp) {
  return formatDateTime(unixTimestamp * 1000);
}

/**
 * Get relative time string
 * Example: "2 hours ago", "just now", "in 5 minutes"
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now();
  const date = new Date(timestamp);
  const diff = now - date.getTime();
  const seconds = Math.floor(Math.abs(diff) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const future = diff < 0;
  const prefix = future ? 'in ' : '';
  const suffix = future ? '' : ' ago';

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${prefix}${seconds}s${suffix}`;
  if (minutes < 60) return `${prefix}${minutes}m${suffix}`;
  if (hours < 24) return `${prefix}${hours}h${suffix}`;
  return `${prefix}${days}d${suffix}`;
}
