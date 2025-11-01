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
        class="preset-btn"
        class:active={value.preset === preset && !showCustom}
        on:click={() => selectPreset(preset)}
        aria-pressed={value.preset === preset && !showCustom}
        aria-label="Select {presetLabels[preset] || preset}"
      >
        {presetLabels[preset] || preset}
      </button>
    {/each}
    <button
      class="preset-btn custom-btn"
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
        <button class="btn-apply" on:click={applyCustomRange} aria-label="Apply custom time range">Apply</button>
        <button class="btn-reset" on:click={resetToDefault} aria-label="Reset to default time range">Reset</button>
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
    padding: 16px;
    margin-bottom: 6px;
  }

  .preset-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .preset-btn {
    padding: 8px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .preset-btn:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .preset-btn:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .preset-btn.active {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .custom-btn {
    margin-left: auto;
  }

  .custom-range {
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    margin-bottom: 12px;
  }

  .custom-inputs {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .input-group label {
    font-size: 13px;
    color: var(--muted);
    font-weight: 500;
  }

  input[type="datetime-local"] {
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
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
    gap: 8px;
  }

  .btn-apply, .btn-reset {
    padding: 8px 16px;
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-apply {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .btn-apply:hover {
    opacity: 0.9;
  }

  .btn-apply:focus,
  .btn-reset:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .btn-reset {
    background: var(--surface);
    color: var(--text);
  }

  .btn-reset:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .current-range {
    display: flex;
    align-items: center;
    gap: 8px;
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
