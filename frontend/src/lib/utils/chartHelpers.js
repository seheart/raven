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

  observer.observe(document.body, {
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
  const bodyStyles = getComputedStyle(document.body);

  return {
    text: bodyStyles.getPropertyValue('--text').trim(),
    muted: bodyStyles.getPropertyValue('--muted').trim(),
    success: bodyStyles.getPropertyValue('--success').trim(),
    error: bodyStyles.getPropertyValue('--error').trim(),
    warning: bodyStyles.getPropertyValue('--warning').trim(),
    info: bodyStyles.getPropertyValue('--info').trim(),
    accent: bodyStyles.getPropertyValue('--accent').trim(),
    grid: 'rgba(128, 128, 128, 0.15)'
  };
}

/**
 * Standard Chart.js options for consistent styling
 *
 * @param {Object} customOptions - Custom options to merge
 * @returns {Object} Chart.js options object
 */
export function getChartDefaultOptions(customOptions = {}) {
  const colors = getChartThemeColors();

  const defaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: colors.text,
          font: { size: 11, family: 'var(--mono)' },
          padding: 8
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: colors.muted,
          font: { size: 10, family: 'var(--mono)' }
        },
        grid: {
          color: colors.grid
        }
      },
      x: {
        ticks: {
          color: colors.muted,
          font: { size: 10, family: 'var(--mono)' }
        },
        grid: {
          color: colors.grid
        }
      }
    }
  };

  // Deep merge custom options
  return mergeDeep(defaults, customOptions);
}

/**
 * Deep merge utility
 */
function mergeDeep(target, source) {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) Object.assign(output, { [key]: source[key] });
        else output[key] = mergeDeep(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}
