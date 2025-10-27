<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { websocketService } from './websocket.js';
  import { logger } from './logger.js';

  export let project = 'raven';

  let recommendation = null;
  let dismissed = false;
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
      logger.error('Failed to check break recommendation:', err);
    }
  }

  // WebSocket handler for real-time updates
  const handleFileChanged = () => {
    // Check for break recommendation when user is actively working
    checkBreakRecommendation();
  };

  onMount(async () => {
    await checkBreakRecommendation();

    // Listen for file changes to trigger break checks (event-driven!)
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
  });

  onDestroy(() => {
    websocketService.off('file-changed', handleFileChanged);

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
    role="alert"
    aria-live={recommendation.urgency === 'critical' ? 'assertive' : 'polite'}
  >
    <div class="alert-icon" aria-hidden="true">
      {getUrgencyIcon(recommendation.urgency)}
    </div>

    <div class="alert-content">
      <div class="alert-title" id="break-alert-title">
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

    <button class="dismiss-btn" on:click={handleDismiss} aria-label="Dismiss break alert for 30 minutes">
      ✕
    </button>
  </div>
{/if}

<style>
  .break-alert {
    position: fixed;
    top: var(--space-xl);
    right: var(--space-xl);
    max-width: 450px;
    background: var(--surface);
    border: 3px solid var(--urgency-color);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    display: flex;
    gap: var(--space-lg);
    box-shadow: var(--shadow-lg);
    z-index: 10000;
    animation: celebrate var(--duration-slow) var(--ease-bounce);
  }

  @keyframes celebrate {
    0% {
      transform: translateX(500px) rotate(5deg);
      opacity: 0;
    }
    60% {
      transform: translateX(-10px) rotate(-2deg);
      opacity: 1;
    }
    80% {
      transform: translateX(5px) rotate(1deg);
    }
    100% {
      transform: translateX(0) rotate(0deg);
      opacity: 1;
    }
  }

  .break-alert.critical {
    background: color-mix(in srgb, var(--error) 10%, var(--surface));
    animation: celebrate var(--duration-slow) var(--ease-bounce), pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: var(--shadow-lg);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 12px 40px var(--urgency-color);
      transform: scale(1.02);
    }
  }

  .break-alert.warning {
    background: color-mix(in srgb, var(--warning) 8%, var(--surface));
  }

  .break-alert.info {
    background: color-mix(in srgb, var(--info) 5%, var(--surface));
  }

  .alert-icon {
    font-size: var(--text-3xl);
    flex-shrink: 0;
    line-height: 1;
    animation: iconBounce var(--duration-slower) var(--ease-bounce) 0.2s;
  }

  @keyframes iconBounce {
    0%, 100% {
      transform: scale(1);
    }
    25% {
      transform: scale(1.2) rotate(-10deg);
    }
    50% {
      transform: scale(0.9) rotate(10deg);
    }
    75% {
      transform: scale(1.1) rotate(-5deg);
    }
  }

  .alert-content {
    flex: 1;
    min-width: 0;
  }

  .alert-title {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    font-family: var(--sans);
    color: var(--text);
    margin-bottom: var(--space-sm);
  }

  .alert-message {
    font-size: var(--text-base);
    font-family: var(--sans);
    color: var(--text);
    margin-bottom: var(--space-sm);
    line-height: 1.6;
  }

  .alert-duration {
    font-size: var(--text-sm);
    font-family: var(--sans);
    color: var(--urgency-color);
    font-weight: var(--weight-semibold);
    margin-bottom: var(--space-sm);
  }

  .alert-reasons {
    margin-top: var(--space-md);
    padding: var(--space-md);
    background: var(--bg);
    border-radius: var(--radius);
    font-size: var(--text-xs);
  }

  .reason-item {
    color: var(--muted);
    padding: var(--space-xs) 0;
    line-height: 1.5;
  }

  .dismiss-btn {
    position: absolute;
    top: var(--space-md);
    right: var(--space-md);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--muted);
    font-size: var(--text-lg);
    cursor: pointer;
    border-radius: 50%;
    transition: all var(--duration-fast) var(--ease-out-expo);
  }

  .dismiss-btn:hover {
    background: var(--bg);
    color: var(--text);
    transform: scale(1.1) rotate(90deg);
  }

  .dismiss-btn:active {
    transform: scale(0.9) rotate(90deg);
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
