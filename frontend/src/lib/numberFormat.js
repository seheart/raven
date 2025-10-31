/**
 * Format numbers for display in the UI
 * Adds thousand separators for readability
 * Example: 1234567 -> "1,234,567"
 * Used throughout Raven for consistent number formatting in all panels
 *
 * @param {number} num - The number to format
 * @returns {string} Formatted number with commas
 */
export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  return num.toLocaleString('en-US');
}

/**
 * Format bytes for human-readable display
 * Example: 1048576 -> "1.00 MB"
 * Supports up to petabytes (PB)
 *
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places (default 2)
 * @returns {string} Formatted string like "1.5 MB"
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return '0 Bytes';
  if (bytes < 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)).toLocaleString('en-US') + ' ' + sizes[i];
}
