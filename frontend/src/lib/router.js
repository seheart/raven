import { writable, derived } from 'svelte/store';
import { logger } from './logger.js';

/**
 * Simple hash-based router for Raven
 *
 * Routes format: #/tab/subtab
 * Examples:
 *   #/overview
 *   #/activity/live-feed
 *   #/activity/event-log
 *   #/agents
 */

function createRouter() {
  // Parse hash into route parts
  function parseHash() {
    try {
      const hash = window.location.hash.slice(1); // Remove #
      console.log('[Router] Parsing hash:', hash);

      if (!hash || hash === '/') {
        console.log('[Router] No hash, defaulting to overview');
        return { tab: 'overview', subTab: '' };
      }

      const parts = hash.split('/').filter(Boolean);
      const route = {
        tab: parts[0] || 'overview',
        subTab: parts[1] || ''
      };
      logger.debug('[Router] Parsed route:', route);
      return route;
    } catch (error) {
      logger.error('[Router] Error parsing hash:', error);
      return { tab: 'overview', subTab: '' };
    }
  }

  // Create the store with initial hash - this runs immediately when module loads
  const initialRoute = parseHash();
  console.log('[Router] Initial route:', initialRoute);
  const { subscribe, set, update } = writable(initialRoute);

  // Listen to hash changes
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      set(parseHash());
      // Scroll to top on navigation
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.scrollTop = 0;
      }
      // Also scroll window to top (for mobile/overflow scenarios)
      window.scrollTo(0, 0);
    });

    // Force re-parse on DOMContentLoaded in case hash changed during parsing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        const currentRoute = parseHash();
        // Only update if route actually changed
        if (JSON.stringify(currentRoute) !== JSON.stringify(initialRoute)) {
          set(currentRoute);
        }
      });
    }
  }

  return {
    subscribe,

    // Navigate to a route
    navigate: (tab, subTab = '') => {
      const hash = subTab ? `#/${tab}/${subTab}` : `#/${tab}`;
      window.location.hash = hash;
      // Scroll to top immediately on navigation
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.scrollTop = 0;
      }
      window.scrollTo(0, 0);
    },

    // Go back (if possible)
    back: () => {
      window.history.back();
    }
  };
}

export const router = createRouter();

// Derived stores for convenience
export const currentTab = derived(router, $router => $router.tab);
export const currentSubTab = derived(router, $router => $router.subTab);
