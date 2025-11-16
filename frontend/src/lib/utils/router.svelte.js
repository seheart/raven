/**
 * Simple client-side router for Svelte 5
 * Manages URL-based navigation with History API
 */

let currentPath = $state(window.location.pathname);

// Listen for browser back/forward navigation
window.addEventListener('popstate', () => {
  currentPath = window.location.pathname;
  // Scroll to top on back/forward navigation
  window.scrollTo(0, 0);
});

/**
 * Navigate to a new path
 * @param {string} path - The path to navigate to
 */
export function navigate(path) {
  if (path !== currentPath) {
    window.history.pushState({}, '', path);
    currentPath = path;
    // Scroll to top when navigating to a new page
    window.scrollTo(0, 0);
  }
}

/**
 * Get the current path
 * @returns {string} Current path
 */
export function getPath() {
  return currentPath;
}

/**
 * Create a derived value that returns true if the current path matches
 * @param {string} path - Path to match
 * @returns {boolean} Whether the path matches
 */
export function isActive(path) {
  return currentPath === path;
}
