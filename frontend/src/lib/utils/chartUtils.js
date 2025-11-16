import { Chart, registerables } from 'chart.js';
import { logger } from '../logger.js';

// Register Chart.js components
Chart.register(...registerables);

/**
 * Extract CSS variable color value
 */
export function getCSSColor(varName) {
  return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

/**
 * Get theme-aware chart colors
 */
export function getChartColors() {
  return {
    primary: getCSSColor('--accent') || '#3b82f6',
    success: getCSSColor('--success') || '#10b981',
    warning: getCSSColor('--warning') || '#f59e0b',
    error: getCSSColor('--error') || '#ef4444',
    text: getCSSColor('--text') || '#e2e8f0',
    textHeading: getCSSColor('--text-heading') || '#f1f5f9',
    muted: getCSSColor('--muted') || '#94a3b8',
    border: getCSSColor('--border') || '#334155',
    surface: getCSSColor('--surface') || '#1e293b',
    bg: getCSSColor('--bg') || '#0f172a'
  };
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

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });

  return observer;
}

/**
 * Common chart configuration defaults
 */
export const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    intersect: false,
    mode: 'index'
  },
  plugins: {
    legend: {
      display: true,
      position: 'top'
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleColor: '#fff',
      bodyColor: '#fff',
      borderColor: '#3b82f6',
      borderWidth: 1
    }
  },
  scales: {
    x: {
      grid: {
        display: true,
        drawBorder: false
      }
    },
    y: {
      beginAtZero: true,
      grid: {
        display: true,
        drawBorder: false
      }
    }
  }
};
