import { Chart, registerables } from 'chart.js';
import { logger } from '../logger.js';

// Register Chart.js components
Chart.register(...registerables);

function getCSSColor(varName) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/**
 * Get theme-aware chart colors.
 *
 * `primary` is the canonical brand chart color — Anthropic-inspired warm
 * rust orange (--chart-1). Use it for single-series bar/line charts;
 * pair with chartGradient() for the depth/glow look. Multi-series charts
 * should use the `palette` array, which sequences through the warm
 * Anthropic family (rust → peach → amber → coral → sienna) and only
 * reaches for cooler hues (teal, violet) at positions 5+.
 *
 * `state` colors (success/warning/error) stay distinct so they keep
 * meaning when used as reference lines.
 */
export function getChartColors() {
  return {
    primary: getCSSColor('--chart-1') || '#d97757',
    accent: getCSSColor('--accent') || '#d97757',
    success: getCSSColor('--success') || '#22c55e',
    warning: getCSSColor('--warning') || '#f59e0b',
    error: getCSSColor('--error') || '#ef4444',
    info: getCSSColor('--info') || '#38bdf8',
    text: getCSSColor('--text') || '#e2e8f0',
    textHeading: getCSSColor('--text-heading') || '#f1f5f9',
    muted: getCSSColor('--muted') || '#94a3b8',
    border: getCSSColor('--border') || '#334155',
    surface: getCSSColor('--surface') || '#1e293b',
    bg: getCSSColor('--bg') || '#0f172a',
    /** Multi-series palette. Use `getChartPalette(n)` for typed access. */
    palette: [
      getCSSColor('--chart-1') || '#d97757',
      getCSSColor('--chart-2') || '#e89460',
      getCSSColor('--chart-3') || '#f4a261',
      getCSSColor('--chart-4') || '#e76f51',
      getCSSColor('--chart-5') || '#c95f3e',
      getCSSColor('--chart-6') || '#2a9d8f',
      getCSSColor('--chart-7') || '#8b5cf6',
      getCSSColor('--chart-8') || '#264653'
    ],
    gradTop: getCSSColor('--chart-grad-top') || 'rgba(217, 119, 87, 0.65)',
    gradBottom: getCSSColor('--chart-grad-bottom') || 'rgba(217, 119, 87, 0.04)'
  };
}

/**
 * Return the first `count` colors from the multi-series palette. Wraps
 * around if `count` exceeds the palette length. Use this for donuts /
 * pies / multi-line charts where each series needs a distinct hue.
 */
export function getChartPalette(count = 6) {
  const { palette } = getChartColors();
  if (count <= palette.length) return palette.slice(0, count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(palette[i % palette.length]);
  return out;
}

/**
 * Build a vertical gradient for the canonical brand fill. Uses the
 * theme's chart-grad-top / chart-grad-bottom CSS variables so the
 * gradient flips correctly between light and dark modes.
 *
 * Pass an explicit hex if you want a non-brand series to get the same
 * depth treatment — the function builds a gradient from `hexAA` (top)
 * to `hex0A` (bottom).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ height?: number, color?: string }} [opts]
 * @returns {CanvasGradient | string}
 */
export function chartGradient(ctx, opts = {}) {
  if (!ctx?.createLinearGradient) {
    return getChartColors().primary;
  }
  // Use the canvas's actual height when available so the gradient is
  // sharp on tall charts and not crushed on short ones. Chart.js passes
  // ctx.canvas; bare contexts may not have a height — fall back to 200.
  const height = opts.height ?? ctx.canvas?.height ?? 200;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  if (opts.color) {
    // Custom hex → gradient (alpha at top: ~70%, near-zero at bottom).
    const hex = opts.color.replace('#', '');
    if (hex.length === 6) {
      const top = `#${hex}b3`; // 70% alpha
      const bot = `#${hex}0d`; // 5% alpha
      grad.addColorStop(0, top);
      grad.addColorStop(1, bot);
      return grad;
    }
  }
  const colors = getChartColors();
  grad.addColorStop(0, colors.gradTop);
  grad.addColorStop(1, colors.gradBottom);
  return grad;
}

/**
 * Create a Chart.js instance with theme-aware colors and proper cleanup
 */
export function createChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    logger.warn(`Canvas element #${canvasId} not found`);
    return null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    logger.warn(`Could not get 2D context for #${canvasId}`);
    return null;
  }

  // Destroy any existing chart on this canvas
  const existingChart = Chart.getChart(canvas);
  if (existingChart) {
    existingChart.destroy();
  }

  // Get theme colors
  const colors = getChartColors();

  // Apply theme colors to config if not explicitly set
  if (config.options) {
    config.options.color = config.options.color || colors.text;

    if (config.options.scales) {
      // Apply colors to axes
      Object.values(config.options.scales).forEach(scale => {
        if (scale.ticks) {
          scale.ticks.color = scale.ticks.color || colors.muted;
        }
        if (scale.grid) {
          scale.grid.color = scale.grid.color || colors.border;
        }
      });
    }

    if (config.options.plugins?.legend?.labels) {
      config.options.plugins.legend.labels.color =
        config.options.plugins.legend.labels.color || colors.text;
    }
  }

  return new Chart(ctx, config);
}

/**
 * Destroy a chart instance safely
 */
export function destroyChart(chart) {
  if (chart && typeof chart.destroy === 'function') {
    chart.destroy();
  }
}

/**
 * Create a theme observer that recreates charts on theme change
 * Returns the observer instance for cleanup
 */
export function createThemeObserver(onThemeChange) {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === 'class') {
        onThemeChange();
      }
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });

  return observer;
}
