/**
 * Filter out build artifacts - only show real source code changes
 */
export function isSourceCodeFile(filepath) {
  if (!filepath) return false;

  // Exclude build/dist directories
  if (filepath.match(/\/(dist|build|\.vite|\.next|\.nuxt|out|public\/build)\//)) return false;

  // Exclude build artifacts
  if (filepath.match(/\.(map|min\.js|min\.css|chunk\.js)$/)) return false;

  // Exclude dependencies
  if (filepath.match(/\/(node_modules|\.git|\.svelte-kit)\//)) return false;

  // Include everything else (source code)
  return true;
}

/**
 * Debounce utility function
 */
export function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Get file extension from path
 */
export function getFileExtension(filepath) {
  if (!filepath) return '';
  const match = filepath.match(/\.([^.]+)$/);
  return match ? match[1] : '';
}

/**
 * Group array items by a key function
 */
export function groupBy(array, keyFn) {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

/**
 * Calculate percentage safely
 */
export function percentage(value, total, decimals = 1) {
  if (total === 0) return 0;
  return parseFloat(((value / total) * 100).toFixed(decimals));
}
