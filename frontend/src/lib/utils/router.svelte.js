/**
 * Simple client-side router for Svelte 5
 * Manages URL-based navigation with History API
 */

class Router {
  path = $state(window.location.pathname);

  constructor() {
    // Listen for browser back/forward navigation
    window.addEventListener('popstate', () => {
      this.path = window.location.pathname;
      // Scroll to top on back/forward navigation
      window.scrollTo(0, 0);
    });
  }

  /**
   * Navigate to a new path
   * @param {string} path - The path to navigate to
   */
  navigate(path) {
    if (path !== this.path) {
      window.history.pushState({}, '', path);
      this.path = path;
      // Scroll to top when navigating to a new page
      window.scrollTo(0, 0);
    }
  }

  /**
   * Check if a path is active
   * @param {string} path - Path to check
   * @returns {boolean} Whether the path is active
   */
  isActive(path) {
    return this.path === path;
  }
}

// Create singleton instance
const router = new Router();

// Export convenience functions that use the singleton
export function navigate(path) {
  router.navigate(path);
}

export function getPath() {
  return router.path;
}

export function isActive(path) {
  return router.isActive(path);
}
