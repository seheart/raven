<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { formatDateTime as formatTimestamp } from './timeFormat.js';

  const dispatch = createEventDispatcher();

  export let value = { start: null, end: null, preset: '24h' };
  export let presets = ['1h', '6h', '24h', '7d', '30d'];

  let showCustom = false;
  let customStart = '';
  let customEnd = '';
  let initialized = false;

  const presetLabels = {
    '1h': 'Last Hour',
    '6h': 'Last 6 Hours',
    '24h': 'Last 24 Hours',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
    'today': 'Today',
    'yesterday': 'Yesterday',
    'thisWeek': 'This Week',
    'thisMonth': 'This Month'
  };

  function selectPreset(preset) {
    showCustom = false;

    const now = new Date();
    let start;

    switch (preset) {
    case '1h':
      start = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '6h':
      start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      break;
    case '24h':
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'today':
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      // Create new object to avoid mutation
      value = {
        preset,
        start: start.toISOString(),
        end: end.toISOString()
      };
      dispatch('change', value);
      return;
    case 'thisWeek':
      start = new Date(now);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      break;
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Create new object to avoid mutation and trigger reactivity
    value = {
      preset,
      start: start.toISOString(),
      end: now.toISOString()
    };

    dispatch('change', value);
  }

  function applyCustomRange() {
    if (!customStart || !customEnd) {
      // Don't use alert - just return silently or show in UI
      return;
    }

    const startDate = new Date(customStart);
    const endDate = new Date(customEnd);
    const now = new Date();

    // Validate: end must be after start
    if (endDate <= startDate) {
      // Could add error state to show in UI instead of alert
      return;
    }

    // Validate: end cannot be in the future
    if (endDate > now) {
      return;
    }

    // Create new object to avoid mutation
    value = {
      preset: 'custom',
      start: startDate.toISOString(),
      end: endDate.toISOString()
    };

    dispatch('change', value);
  }

  function resetToDefault() {
    selectPreset('24h');
  }

  function formatDateTime(isoString) {
    if (!isoString) return 'Not set';
    // Use the user's preferred time format from settings
    return formatTimestamp(isoString);
  }

  // Initialize with default preset only once
  onMount(() => {
    if (!value.start || !value.end) {
      selectPreset(value.preset || '24h');
    }
    initialized = true;
  });
</script>

<div class="time-range-filter" role="region" aria-label="Time range filter">
  <div class="preset-buttons" role="group" aria-label="Time range presets">
    {#each presets as preset (preset)}
      <button
        class="btn btn-ghost btn-sm"
        class:active={value.preset === preset && !showCustom}
        on:click={() => selectPreset(preset)}
        aria-pressed={value.preset === preset && !showCustom}
        aria-label="Select {presetLabels[preset] || preset}"
      >
        {presetLabels[preset] || preset}
      </button>
    {/each}
    <button
      class="btn btn-ghost btn-sm custom-btn"
      class:active={showCustom}
      on:click={() => showCustom = !showCustom}
      aria-pressed={showCustom}
      aria-label="Toggle custom time range"
      aria-expanded={showCustom}
    >
      <span aria-hidden="true">{showCustom ? '✕' : '⚙'}</span> Custom
    </button>
  </div>

  {#if showCustom}
    <div class="custom-range" role="group" aria-label="Custom time range inputs">
      <div class="custom-inputs">
        <div class="input-group">
          <label for="start-time">From:</label>
          <input
            id="start-time"
            type="datetime-local"
            bind:value={customStart}
          />
        </div>
        <span class="arrow">→</span>
        <div class="input-group">
          <label for="end-time">To:</label>
          <input
            id="end-time"
            type="datetime-local"
            bind:value={customEnd}
          />
        </div>
      </div>
      <div class="custom-actions" role="group" aria-label="Custom range actions">
        <button class="btn btn-primary btn-sm" on:click={applyCustomRange} aria-label="Apply custom time range">Apply</button>
        <button class="btn btn-secondary btn-sm" on:click={resetToDefault} aria-label="Reset to default time range">Reset</button>
      </div>
    </div>
  {/if}

  <div class="current-range" role="status" aria-live="polite">
    <span class="range-label">Showing:</span>
    <span class="range-value">{formatDateTime(value.start)} → {formatDateTime(value.end)}</span>
  </div>
</div>

<style>
  .time-range-filter {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    margin-bottom: var(--space-md);
  }

  .preset-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-lg);
    margin-bottom: var(--space-xl);
  }

  .btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .custom-btn {
    margin-left: auto;
  }

  .custom-range {
    padding: var(--space-2xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-xl);
  }

  .custom-inputs {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    margin-bottom: var(--space-xl);
    flex-wrap: wrap;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .input-group label {
    font-size: 13px;
    color: var(--muted);
    font-weight: 500;
  }

  input[type="datetime-local"] {
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 13px;
    font-family: var(--mono);
  }

  input[type="datetime-local"]:focus {
    outline: none;
    border-color: var(--accent);
  }

  .arrow {
    color: var(--muted);
    font-size: 11px;
  }

  .custom-actions {
    display: flex;
    gap: var(--space-lg);
  }

  .current-range {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 13px;
  }

  .range-label {
    color: var(--muted);
    font-weight: 500;
  }

  .range-value {
    color: var(--text);
    font-family: var(--mono);
    font-weight: 600;
  }
</style>
