# Chart.js Integration Guide

## Quick Start

Use the chart helpers to ensure charts render consistently across all components.

```javascript
import { onMount, onDestroy } from 'svelte';
import { Chart, registerables } from 'chart.js';
import { initializeCharts, setupChartThemeObserver, getChartThemeColors } from './utils/chartHelpers.js';

Chart.register(...registerables);

let myData = [];
let showCharts = true;
let charts = {};
let themeObserver;

function createCharts() {
  // Destroy existing charts
  Object.values(charts).forEach(chart => chart?.destroy());
  charts = {};

  if (!showCharts || myData.length === 0) return;

  const colors = getChartThemeColors();

  // Create your charts...
  const canvas = document.getElementById('my-chart');
  if (canvas) {
    charts.myChart = new Chart(canvas, {
      type: 'bar',
      data: { /* ... */ },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: colors.text,
              font: { size: 11, family: 'var(--mono)' }
            }
          }
        }
      }
    });
  }
}

onMount(async () => {
  // 1. Load your data first
  await loadMyData();

  // 2. Initialize charts after data loads (automatic timing!)
  initializeCharts(createCharts, {
    data: myData,
    enabled: showCharts
  });

  // 3. Setup theme change observer
  themeObserver = setupChartThemeObserver(createCharts, {
    enabled: showCharts
  });
});

onDestroy(() => {
  Object.values(charts).forEach(chart => chart?.destroy());
  themeObserver?.disconnect();
});

// Reactive: recreate when data changes
$: if (showCharts && myData.length > 0) {
  setTimeout(createCharts, 100);
}
```

## HTML Requirements

Canvas elements need explicit `width` and `height` attributes:

```html
<div class="chart-container">
  <canvas id="my-chart" width="400" height="250"></canvas>
</div>
```

## Helper Functions

### `initializeCharts(createChartsFunc, options)`

Initializes charts after data loads and DOM is ready.

**Parameters:**
- `createChartsFunc` - Your `createCharts()` function
- `options.data` - Data to check (must have `.length > 0` or be truthy)
- `options.enabled` - Whether charts are enabled (default: `true`)
- `options.delay` - Delay in ms (default: `200`)

### `setupChartThemeObserver(createChartsFunc, options)`

Sets up automatic chart recreation on theme changes.

**Parameters:**
- `createChartsFunc` - Your `createCharts()` function
- `options.enabled` - Whether observer is enabled (default: `true`)
- `options.delay` - Delay after theme change (default: `100`)

**Returns:** `MutationObserver` instance

### `getChartThemeColors()`

Gets theme-aware colors from CSS variables.

**Returns:**
```javascript
{
  text: '#...',
  muted: '#...',
  success: '#...',
  error: '#...',
  warning: '#...',
  info: '#...',
  accent: '#...',
  grid: 'rgba(128, 128, 128, 0.15)'
}
```

### `getChartDefaultOptions(customOptions)`

Returns standard Chart.js options with theme-aware styling.

**Example:**
```javascript
const options = getChartDefaultOptions({
  plugins: {
    title: {
      display: true,
      text: 'My Chart'
    }
  }
});
```

## Common Patterns

### Multiple Charts

```javascript
function createCharts() {
  const colors = getChartThemeColors();

  // Chart 1
  const canvas1 = document.getElementById('chart-1');
  if (canvas1) {
    charts.chart1 = new Chart(canvas1, { /* ... */ });
  }

  // Chart 2
  const canvas2 = document.getElementById('chart-2');
  if (canvas2) {
    charts.chart2 = new Chart(canvas2, { /* ... */ });
  }
}
```

### Conditional Charts

```javascript
onMount(async () => {
  await loadData();

  // Only initialize if on specific tab
  if (activeTab === 'analytics') {
    initializeCharts(createCharts, { data: myData });
  }
});
```

### Chart with No Data Check

```javascript
function createCharts() {
  if (!showCharts || filteredData.length === 0) {
    console.warn('Skipping charts: no data or charts disabled');
    return;
  }

  // Create charts...
}
```

## Troubleshooting

### Charts Not Rendering

1. **Check canvas has dimensions:**
   ```html
   <canvas id="my-chart" width="400" height="250"></canvas>
   ```

2. **Verify data is loaded:**
   ```javascript
   console.log('Data length:', myData.length);
   ```

3. **Check createCharts is called:**
   ```javascript
   function createCharts() {
     console.log('createCharts called', { showCharts, dataLength: myData.length });
     // ...
   }
   ```

4. **Ensure Chart.js is registered:**
   ```javascript
   Chart.register(...registerables);
   ```

### Charts Not Updating on Theme Change

Make sure theme observer is set up:

```javascript
onMount(async () => {
  await loadData();
  initializeCharts(createCharts, { data: myData });

  // Don't forget this!
  themeObserver = setupChartThemeObserver(createCharts);
});

onDestroy(() => {
  themeObserver?.disconnect(); // Clean up!
});
```

## Best Practices

1. ✅ **Always use helpers** - Don't manually implement timing logic
2. ✅ **Clean up in onDestroy** - Prevent memory leaks
3. ✅ **Use theme colors** - Ensure charts match app theme
4. ✅ **Check data availability** - Don't create empty charts
5. ✅ **Add canvas dimensions** - Required for Chart.js
6. ✅ **Destroy before recreating** - Prevent duplicate charts

## Examples

See existing implementations:
- `src/lib/LiveCodeFeed.svelte` - Multiple charts, filtering
- `src/lib/EventFeed.svelte` - 4 charts, theme adaptation
- `src/lib/AgentsPanel.svelte` - Conditional chart creation
- `src/lib/ConversationsPanel.svelte` - Simple chart setup
