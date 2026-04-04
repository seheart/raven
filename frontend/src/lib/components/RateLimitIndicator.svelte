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
        <button class="close-btn" on:click={toggleDetails}></button>
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
    background: var(--bg-secondary, #2a2a2a);
    border: 1px solid var(--border-color, #3a3a3a);
    color: var(--text-primary, #e0e0e0);
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
  }

  .indicator-button:hover {
    background: var(--bg-tertiary, #353535);
    border-color: var(--border-hover, #4a4a4a);
  }

  .indicator-button.status-warning {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  .indicator-button.status-critical {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
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
    background: var(--bg-secondary, #2a2a2a);
    border: 1px solid var(--border-color, #3a3a3a);
    border-radius: 8px;
    padding: 1rem;
    min-width: 350px;
    max-width: 400px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    z-index: 1000;
  }

  .details-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-color, #3a3a3a);
  }

  .details-header h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--text-primary, #e0e0e0);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #a0a0a0);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: var(--bg-tertiary, #353535);
    color: var(--text-primary, #e0e0e0);
  }

  .details-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .limit-item {
    padding: 0.75rem;
    border-radius: 6px;
    background: var(--bg-primary, #1e1e1e);
  }

  .limit-item.status-warning {
    background: rgba(245, 158, 11, 0.05);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .limit-item.status-critical {
    background: rgba(239, 68, 68, 0.05);
    border: 1px solid rgba(239, 68, 68, 0.3);
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
    font-size: 0.85rem;
    color: var(--text-primary, #e0e0e0);
  }

  .limit-percent {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--text-primary, #e0e0e0);
  }

  .limit-bar {
    height: 8px;
    background: var(--bg-tertiary, #353535);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .limit-fill {
    height: 100%;
    background: #22c55e;
    transition:
      width 0.3s ease,
      background 0.3s ease;
  }

  .status-warning .limit-fill {
    background: #f59e0b;
  }

  .status-critical .limit-fill {
    background: #ef4444;
  }

  .limit-details {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--text-secondary, #a0a0a0);
  }
</style>
