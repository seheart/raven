/**
 * Simple client-side router for Svelte 5
 * Manages URL-based navigation with History API
 */

class Router {
  path = $state(window.location.pathname);
  #onPopState;

  constructor() {
    // Listen for browser back/forward navigation
    this.#onPopState = () => {
      this.path = window.location.pathname;
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', this.#onPopState);
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

  destroy() {
    window.removeEventListener('popstate', this.#onPopState);
  }
}

// Create singleton instance
const router = new Router();

// Export convenience functions that use the singleton
export function navigate(path) {
  router.navigate(path);
}

/** @public */
export function getPath() {
  return router.path;
}
