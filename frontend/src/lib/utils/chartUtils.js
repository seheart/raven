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
    gradBottom: getCSSColor('--chart-grad-bottom') || 'rgba(217, 119, 87, 0.04)',
    /** Flat translucent bar/area fill — uniform alpha, no vertical fade. */
    fill: getCSSColor('--chart-fill') || 'rgba(217, 119, 87, 0.5)'
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
 * The canonical brand bar/area fill: a FLAT translucent color (theme-aware via
 * the --chart-fill CSS variable), faded but clearly visible at every height.
 *
 * Was a vertical gradient (chart-grad-top → chart-grad-bottom) that faded to
 * near-transparent at the baseline, which made tall bars almost disappear.
 * Now uniform. The `ctx`/`y0`/`y1` params are ignored (kept for back-compat
 * with the old scriptable-callback call sites); pass `{color: '#hex'}` for a
 * non-brand series and it returns that hue at the same alpha.
 *
 * @param {CanvasRenderingContext2D} [_ctx] - unused; kept for signature compat
 * @param {{ y0?: number, y1?: number, color?: string }} [opts]
 * @returns {string}
 */
function chartGradient(_ctx, opts = {}) {
  // Returns a FLAT translucent fill, not a vertical gradient. The old version
  // faded from ~0.65 alpha at the top to ~0.04 at the bottom, so tall bars
  // (and area fills) washed out to near-invisible toward their baseline. We
  // keep the function name + signature for back-compat — every caller still
  // gets a single theme-aware fill color that's faded but clearly visible.
  try {
    if (opts.color) {
      const hex = opts.color.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.5)`;
      }
      return opts.color;
    }
    return getChartColors().fill || 'rgba(217, 119, 87, 0.5)';
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[chartGradient] fallback to solid:', err);
    }
    return opts.color || '#d97757';
  }
}

/**
 * Chart.js scriptable-callback wrapper. Drop this in directly as
 *
 *   backgroundColor: chartFill,
 *
 * and it'll do the right thing — read chartArea from the Chart.js
 * context and build a gradient anchored to the visible plot region. On
 * the first paint (before chartArea is laid out) it returns the solid
 * primary color so the chart doesn't flicker.
 *
 * Arity is fixed at 1 on purpose: Chart.js invokes scriptables as
 * `fn(context, optionsProxy)`, and that options proxy resolves every
 * scriptable property on access — iterating it (e.g. `...opts`) would
 * re-enter `backgroundColor` and trip Chart.js's recursion guard.
 */
export function chartFill(scriptCtx) {
  return _resolveFill(scriptCtx, undefined);
}

function _resolveFill(scriptCtx, color) {
  try {
    const ctx = scriptCtx?.chart?.ctx;
    const area = scriptCtx?.chart?.chartArea;
    if (!ctx) return color || getChartColors().primary || '#d97757';
    return chartGradient(ctx, { y0: area?.top, y1: area?.bottom, color });
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[chartFill] fallback to solid:', err);
    }
    return color || '#d97757';
  }
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
