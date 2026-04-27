/**
 * Chart.js initialization helpers for Raven
 *
 * Ensures consistent chart rendering across all components by:
 * - Waiting for DOM to be ready
 * - Checking data availability
 * - Handling theme changes
 */

/**
 * Initialize charts after data loads and DOM is ready
 *
 * Usage in onMount:
 * ```js
 * onMount(async () => {
 *   await loadData();
 *   initializeCharts(createCharts, { data: myData, enabled: showCharts });
 * });
 * ```
 *
 * @param {Function} createChartsFunc - Your createCharts() function
 * @param {Object} options - Configuration options
 * @param {Array|Object} options.data - Data to check (must have length > 0 or be truthy)
 * @param {boolean} options.enabled - Whether charts are enabled (e.g., showCharts)
 * @param {number} options.delay - Delay in ms before creating charts (default: 200)
 */
export function initializeCharts(createChartsFunc, { data, enabled = true, delay = 200 } = {}) {
  if (!enabled) return;

  const hasData = Array.isArray(data) ? data.length > 0 : !!data;
  if (!hasData) return;

  setTimeout(createChartsFunc, delay);
}

/**
 * Setup theme change observer for charts
 *
 * Usage in onMount:
 * ```js
 * const themeObserver = setupChartThemeObserver(createCharts, { enabled: showCharts });
 *
 * // In onDestroy:
 * themeObserver?.disconnect();
 * ```
 *
 * @param {Function} createChartsFunc - Your createCharts() function
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether charts are enabled
 * @param {number} options.delay - Delay after theme change (default: 100)
 * @returns {MutationObserver} The observer instance
 */
export function setupChartThemeObserver(createChartsFunc, { enabled = true, delay = 100 } = {}) {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === 'class' && enabled) {
        setTimeout(createChartsFunc, delay);
      }
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });

  return observer;
}

/**
 * Get theme-aware colors from CSS variables
 *
 * @returns {Object} Color values for charts
 */
export function getChartThemeColors() {
  const rootStyles = getComputedStyle(document.documentElement);

  return {
    text: rootStyles.getPropertyValue('--text').trim(),
    muted: rootStyles.getPropertyValue('--muted').trim(),
    success: rootStyles.getPropertyValue('--success').trim(),
    error: rootStyles.getPropertyValue('--error').trim(),
    warning: rootStyles.getPropertyValue('--warning').trim(),
    info: rootStyles.getPropertyValue('--info').trim(),
    accent: rootStyles.getPropertyValue('--accent').trim(),
    grid: 'rgba(128, 128, 128, 0.15)'
  };
}
