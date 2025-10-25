<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';

  export let project = 'raven';
  export let checkInterval = 5 * 60 * 1000; // Check every 5 minutes

  let recommendation = null;
  let dismissed = false;
  let pollIntervalId = null;
  let dismissTimeout = null;

  async function checkBreakRecommendation() {
    try {
      const data = await api.get(`/sessions/break-recommendation?project=${project}`);

      if (data.recommendation && data.recommendation.shouldTakeBreak) {
        // Only show if not dismissed, or if it's a new critical alert
        if (!dismissed || data.recommendation.urgency === 'critical') {
          recommendation = data.recommendation;
          dismissed = false; // Reset dismiss for critical alerts
        }
      } else {
        recommendation = null;
        dismissed = false;
      }
    } catch (err) {
      console.error('Failed to check break recommendation:', err);
    }
  }

  onMount(async () => {
    await checkBreakRecommendation();

    // Poll for updates
    pollIntervalId = setInterval(checkBreakRecommendation, checkInterval);
  });

  onDestroy(() => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
    }
  });

  function handleDismiss() {
    dismissed = true;

    // Auto-clear dismiss after 30 minutes so alert can reappear
    if (dismissTimeout) {
      clearTimeout(dismissTimeout);
    }
    dismissTimeout = setTimeout(() => {
      dismissed = false;
    }, 30 * 60 * 1000);
  }

  function getUrgencyIcon(urgency) {
    if (urgency === 'critical') return '🚨';
    if (urgency === 'warning') return '⚠️';
    if (urgency === 'info') return 'ℹ️';
    return '✅';
  }

  function getUrgencyColor(urgency) {
    if (urgency === 'critical') return '#f7768e';
    if (urgency === 'warning') return '#e0af68';
    if (urgency === 'info') return '#7aa2f7';
    return '#9ece6a';
  }

  $: showAlert = recommendation && !dismissed;
</script>

{#if showAlert}
  <div
    class="break-alert"
    class:critical={recommendation.urgency === 'critical'}
    class:warning={recommendation.urgency === 'warning'}
    class:info={recommendation.urgency === 'info'}
    style="--urgency-color: {getUrgencyColor(recommendation.urgency)}"
  >
    <div class="alert-icon">
      {getUrgencyIcon(recommendation.urgency)}
    </div>

    <div class="alert-content">
      <div class="alert-title">
        {#if recommendation.urgency === 'critical'}
          Time to Take a Break!
        {:else if recommendation.urgency === 'warning'}
          Consider Taking a Break
        {:else}
          Break Suggestion
        {/if}
      </div>

      <div class="alert-message">
        {recommendation.message}
      </div>

      {#if recommendation.breakDuration}
        <div class="alert-duration">
          Recommended break: {recommendation.breakDuration} minutes
        </div>
      {/if}

      {#if recommendation.reasons && recommendation.reasons.length > 0}
        <div class="alert-reasons">
          {#each recommendation.reasons as reason}
            <div class="reason-item">• {reason}</div>
          {/each}
        </div>
      {/if}
    </div>

    <button class="dismiss-btn" on:click={handleDismiss} title="Dismiss for 30 minutes">
      ✕
    </button>
  </div>
{/if}

<style>
  .break-alert {
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 450px;
    background: var(--surface);
    border: 3px solid var(--urgency-color);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    gap: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(500px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .break-alert.critical {
    background: color-mix(in srgb, var(--error) 10%, var(--surface));
    animation: slideIn 0.3s ease-out, pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    50% {
      box-shadow: 0 8px 32px var(--urgency-color);
    }
  }

  .break-alert.warning {
    background: color-mix(in srgb, var(--warning) 8%, var(--surface));
  }

  .break-alert.info {
    background: color-mix(in srgb, var(--info) 5%, var(--surface));
  }

  .alert-icon {
    font-size: 32px;
    flex-shrink: 0;
    line-height: 1;
  }

  .alert-content {
    flex: 1;
    min-width: 0;
  }

  .alert-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
  }

  .alert-message {
    font-size: 14px;
    color: var(--text);
    margin-bottom: 8px;
    line-height: 1.5;
  }

  .alert-duration {
    font-size: 13px;
    color: var(--urgency-color);
    font-weight: 600;
    margin-bottom: 8px;
  }

  .alert-reasons {
    margin-top: 12px;
    padding: 12px;
    background: var(--bg);
    border-radius: 6px;
    font-size: 12px;
  }

  .reason-item {
    color: var(--muted);
    padding: 4px 0;
    line-height: 1.4;
  }

  .dismiss-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: 18px;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .dismiss-btn:hover {
    background: var(--bg);
    color: var(--text);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .break-alert {
      top: 10px;
      right: 10px;
      left: 10px;
      max-width: none;
      padding: 16px;
    }

    .alert-icon {
      font-size: 24px;
    }

    .alert-title {
      font-size: 14px;
    }

    .alert-message {
      font-size: 13px;
    }
  }
</style>
