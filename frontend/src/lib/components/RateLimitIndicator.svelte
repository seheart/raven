<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../apiClient.js';

  let rateLimitStatus = null;
  let error = null;
  let interval = null;
  let showDetails = false;

  async function fetchRateLimitStatus() {
    try {
      const response = await api.get('/rate-limit-status');
      rateLimitStatus = response;
      error = null;
    } catch (err) {
      error = err.message;
    }
  }

  onMount(() => {
    // Stagger initial load by 600ms to reduce simultaneous API calls
    const initialDelay = setTimeout(fetchRateLimitStatus, 600);

    // Poll every 10 seconds
    interval = setInterval(fetchRateLimitStatus, 10000);

    return () => {
      clearTimeout(initialDelay);
    };
  });

  onDestroy(() => {
    if (interval) {
      clearInterval(interval);
    }
  });

  function getStatusIcon(status) {
    if (!status) return '—';
    switch (status.status) {
    case 'ok':
      return '●';
    case 'warning':
      return '●';
    case 'critical':
      return '●';
    default:
      return '○';
    }
  }

  function getStatusClass(status) {
    if (!status) return '';
    switch (status.status) {
    case 'ok':
      return 'status-ok';
    case 'warning':
      return 'status-warning';
    case 'critical':
      return 'status-critical';
    default:
      return '';
    }
  }

  function toggleDetails() {
    showDetails = !showDetails;
  }

  $: primaryStatus = rateLimitStatus?.api;
  $: hasWarning = rateLimitStatus && Object.values(rateLimitStatus).some(s => s.status !== 'ok');
</script>

<div class="rate-limit-indicator" class:has-warning={hasWarning}>
  {#if error}
    <button class="indicator-button" on:click={toggleDetails} title="Rate limit error">
      Rate Limit Error
    </button>
  {:else if primaryStatus}
    <button
      class="indicator-button {getStatusClass(primaryStatus)}"
      on:click={toggleDetails}
      title="Click for details"
    >
      {getStatusIcon(primaryStatus)} API: {primaryStatus.current}/{primaryStatus.max} ({primaryStatus.percentUsed}%)
    </button>
  {:else}
    <button class="indicator-button" on:click={toggleDetails}> Loading... </button>
  {/if}

  {#if showDetails && rateLimitStatus}
    <div class="details-panel">
      <div class="details-header">
        <h3>Rate Limit Status</h3>
        <button class="close-btn" on:click={toggleDetails} aria-label="Close rate limit details"></button>
      </div>
      <div class="details-content">
        {#each Object.entries(rateLimitStatus) as [name, status] (name)}
          {#if status.max > 0}
            <div class="limit-item {getStatusClass(status)}">
              <div class="limit-header">
                <span class="limit-icon">{getStatusIcon(status)}</span>
                <span class="limit-name">{name.toUpperCase()}</span>
                <span class="limit-percent">{status.percentUsed}%</span>
              </div>
              <div class="limit-bar">
                <div class="limit-fill" style="width: {status.percentUsed}%"></div>
              </div>
              <div class="limit-details">
                <span>{status.current} / {status.max} requests</span>
                <span>Resets in {status.secondsUntilReset}s</span>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .rate-limit-indicator {
    position: relative;
    display: inline-block;
  }

  .indicator-button {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: var(--mono);
  }

  .indicator-button:hover {
    background: var(--surface-2);
    border-color: var(--muted);
  }

  .indicator-button.status-warning {
    border-color: var(--warning);
    background: var(--warning-subtle);
  }

  .indicator-button.status-critical {
    border-color: var(--error);
    background: var(--error-subtle);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  .details-panel {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 1rem;
    min-width: 350px;
    max-width: 400px;
    box-shadow: var(--shadow-lg);
    z-index: 1000;
  }

  .details-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  .details-header h3 {
    margin: 0;
    font-size: var(--text-2xl);
    color: var(--text-heading);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--muted);
    font-size: var(--text-3xl);
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius);
  }

  .close-btn:hover {
    background: var(--surface-2);
    color: var(--text-heading);
  }

  .details-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .limit-item {
    padding: 0.75rem;
    border-radius: var(--radius-lg);
    background: var(--bg);
  }

  .limit-item.status-warning {
    background: var(--warning-subtle);
    border: 1px solid var(--warning);
  }

  .limit-item.status-critical {
    background: var(--error-subtle);
    border: 1px solid var(--error);
  }

  .limit-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .limit-name {
    flex: 1;
    font-weight: 600;
    font-size: var(--text-base);
    color: var(--text-heading);
  }

  .limit-percent {
    font-weight: 700;
    font-size: var(--text-lg);
    color: var(--text-heading);
  }

  .limit-bar {
    height: 8px;
    background: var(--surface-2);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .limit-fill {
    height: 100%;
    background: var(--success);
    transition:
      width 0.3s ease,
      background 0.3s ease;
  }

  .status-warning .limit-fill {
    background: var(--warning);
  }

  .status-critical .limit-fill {
    background: var(--error);
  }

  .limit-details {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm);
    color: var(--muted);
  }
</style>
