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
 * Calculate flow state based on activity level
 */
export function calculateFlowState(totalChanges, timeWindowMinutes = 60) {
  if (!totalChanges) return { level: 'low', color: 'var(--muted)', label: 'Low Flow' };

  const changesPerMinute = totalChanges / timeWindowMinutes;

  if (changesPerMinute > 5) {
    return { level: 'high', color: 'var(--success)', label: 'High Flow' };
  } else if (changesPerMinute > 2) {
    return { level: 'medium', color: 'var(--warning)', label: 'Medium Flow' };
  } else {
    return { level: 'low', color: 'var(--muted)', label: 'Low Flow' };
  }
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
 * Format time difference in human-readable format
 */
export function formatTimeDiff(timestamp) {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
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
