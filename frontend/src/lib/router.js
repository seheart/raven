import { writable, derived } from 'svelte/store';

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
    const hash = window.location.hash.slice(1); // Remove #
    if (!hash || hash === '/') {
      return { tab: 'overview', subTab: '' };
    }

    const parts = hash.split('/').filter(Boolean);
    return {
      tab: parts[0] || 'overview',
      subTab: parts[1] || ''
    };
  }

  // Create the store
  const { subscribe, set, update } = writable(parseHash());

  // Listen to hash changes
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      set(parseHash());
    });
  }

  return {
    subscribe,

    // Navigate to a route
    navigate: (tab, subTab = '') => {
      const hash = subTab ? `#/${tab}/${subTab}` : `#/${tab}`;
      window.location.hash = hash;
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
