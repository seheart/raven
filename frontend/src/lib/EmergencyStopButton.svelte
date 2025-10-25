<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { notifications } from './notificationService.js';

  let paused = false;
  let pauseReason = '';
  let pauseTime = null;
  let pauseDuration = 0;
  let pulsing = false;
  let ws = null;
  let durationInterval = null;

  // Fetch pause status
  async function fetchStatus() {
    try {
      const response = await fetch('/api/pause/status');
      if (!response.ok) throw new Error('Failed to fetch pause status');

      const data = await response.json();
      paused = data.paused;
      pauseReason = data.reason;
      pauseTime = data.pauseTime;
      pauseDuration = data.duration;
    } catch (error) {
      console.error('Failed to fetch pause status:', error);
    }
  }

  // Pause monitoring
  async function pause() {
    if (paused) return;

    if (!confirm('⚠️ PAUSE MONITORING?\n\nThis will stop processing file changes until you resume.\n\nUse this if the AI is making unwanted changes.')) {
      return;
    }

    try {
      const response = await fetch('/api/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User emergency stop' })
      });

      if (!response.ok) throw new Error('Failed to pause monitoring');

      notifications.warning('Monitoring PAUSED - File changes will be ignored', {
        title: 'Monitoring Paused',
        duration: 10000
      });

      await fetchStatus();
    } catch (error) {
      console.error('Failed to pause monitoring:', error);
      notifications.error('Failed to pause monitoring');
    }
  }

  // Resume monitoring
  async function resume() {
    if (!paused) return;

    if (!confirm('▶️ RESUME MONITORING?\n\nFile changes will be processed again.')) {
      return;
    }

    try {
      const response = await fetch('/api/resume', {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to resume monitoring');

      notifications.success('Monitoring RESUMED - File changes are being tracked', {
        title: 'Monitoring Resumed'
      });

      await fetchStatus();
    } catch (error) {
      console.error('Failed to resume monitoring:', error);
      notifications.error('Failed to resume monitoring');
    }
  }

  // Format duration
  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Setup WebSocket for real-time updates
  function setupWebSocket() {
    ws = websocketService.subscribe('monitoring-paused', (data) => {
      console.log('Monitoring paused:', data);
      fetchStatus();
      pulsing = true;
      setTimeout(() => pulsing = false, 1000);
    });

    websocketService.subscribe('monitoring-resumed', (data) => {
      console.log('Monitoring resumed:', data);
      fetchStatus();
    });
  }

  onMount(() => {
    fetchStatus();
    setupWebSocket();

    // Update duration every second when paused
    durationInterval = setInterval(() => {
      if (paused && pauseTime) {
        pauseDuration = Date.now() - new Date(pauseTime).getTime();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (ws) ws();
    if (durationInterval) clearInterval(durationInterval);
  });
</script>

{#if paused}
  <!-- Paused State: Resume Button -->
  <div class="emergency-stop paused" class:pulsing>
    <button class="resume-btn" on:click={resume} title="Resume monitoring">
      <span class="icon">▶️</span>
      <div class="button-content">
        <span class="button-label">MONITORING PAUSED</span>
        <span class="button-sublabel">Click to Resume</span>
      </div>
    </button>
    <div class="pause-info">
      <div class="pause-duration">{formatDuration(pauseDuration)}</div>
      <div class="pause-reason">{pauseReason}</div>
    </div>
  </div>
{:else}
  <!-- Active State: Emergency Stop Button -->
  <button class="emergency-stop active" on:click={pause} title="Emergency stop - Pause file monitoring">
    <span class="icon">🛑</span>
    <div class="button-content">
      <span class="button-label">EMERGENCY STOP</span>
      <span class="button-sublabel">Pause Monitoring</span>
    </div>
  </button>
{/if}

<style>
  .emergency-stop {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .emergency-stop.active {
    padding: 16px 24px;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    border: 2px solid #b91c1c;
    border-radius: 12px;
    color: white;
    font-family: var(--mono);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }

  .emergency-stop.active:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  }

  .emergency-stop.active:active {
    transform: translateY(0);
  }

  .emergency-stop.paused {
    padding: 16px 24px;
    background: var(--surface-2);
    border: 2px solid #f59e0b;
    border-radius: 12px;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .emergency-stop.paused.pulsing {
    animation: pulse 0.5s ease-in-out;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }

  .resume-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: 2px solid #047857;
    border-radius: 8px;
    color: white;
    font-family: var(--mono);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
  }

  .resume-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
  }

  .icon {
    font-size: 24px;
    line-height: 1;
  }

  .button-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex: 1;
  }

  .button-label {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .button-sublabel {
    font-size: 11px;
    opacity: 0.9;
    font-weight: 500;
  }

  .pause-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--surface);
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .pause-duration {
    font-family: var(--mono);
    font-size: 16px;
    font-weight: 700;
    color: #f59e0b;
  }

  .pause-reason {
    font-size: 11px;
    color: var(--muted);
    font-style: italic;
  }

  @media (max-width: 768px) {
    .emergency-stop.active,
    .emergency-stop.paused {
      padding: 12px 16px;
    }

    .icon {
      font-size: 20px;
    }

    .button-label {
      font-size: 12px;
    }

    .button-sublabel {
      font-size: 10px;
    }
  }
</style>
