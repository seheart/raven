<script>
  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';

  let sessionStats = $state({
    currentFile: null,
    filesModified: 0,
    linesAdded: 0,
    linesRemoved: 0,
    lastChange: null,
    sessionHealth: 'healthy',
    sessionActive: true
  });

  let sessionDuration = $state(0);
  let lastChangeSeconds = $state(0);

  async function fetchSessionStats() {
    try {
      const response = await api.get('/session/stats');
      sessionStats = {
        ...sessionStats,
        ...response
      };
    } catch (err) {
      console.error('Failed to fetch session stats:', err);
    }
  }

  // Update timers every second
  function updateTimers() {
    sessionDuration++;

    if (sessionStats.lastChange) {
      const secondsAgo = Math.floor(
        (Date.now() - new Date(sessionStats.lastChange).getTime()) / 1000
      );
      lastChangeSeconds = secondsAgo;
    }
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  function formatLastChange(seconds) {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  function getHealthIcon(health) {
    const icons = {
      healthy: '✓',
      warning: '⚠️',
      error: '✗'
    };
    return icons[health] || '✓';
  }

  function getHealthColor(health) {
    const colors = {
      healthy: 'var(--success)',
      warning: 'var(--warning)',
      error: 'var(--error)'
    };
    return colors[health] || 'var(--success)';
  }

  onMount(() => {
    fetchSessionStats();

    // Poll for stats every 5 seconds
    const statsInterval = setInterval(fetchSessionStats, 5000);

    // Update timers every second
    const timerInterval = setInterval(updateTimers, 1000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(timerInterval);
    };
  });
</script>

<div class="live-status-bar">
  <div class="status-item">
    <span class="status-icon">📄</span>
    <div class="status-content">
      <div class="status-label">Current File</div>
      <div class="status-value">{sessionStats.currentFile || 'None'}</div>
    </div>
  </div>

  <div class="status-divider"></div>

  <div class="status-item">
    <span class="status-icon">📊</span>
    <div class="status-content">
      <div class="status-label">Files Modified</div>
      <div class="status-value">{sessionStats.filesModified}</div>
    </div>
  </div>

  <div class="status-divider"></div>

  <div class="status-item">
    <span class="status-icon">📈</span>
    <div class="status-content">
      <div class="status-label">Lines Changed</div>
      <div class="status-value">
        <span class="stat-add">+{sessionStats.linesAdded}</span>
        <span class="stat-remove">-{sessionStats.linesRemoved}</span>
      </div>
    </div>
  </div>

  <div class="status-divider"></div>

  <div class="status-item">
    <span class="status-icon">⏱️</span>
    <div class="status-content">
      <div class="status-label">Last Change</div>
      <div class="status-value">
        {lastChangeSeconds > 0 ? formatLastChange(lastChangeSeconds) : 'Just now'}
      </div>
    </div>
  </div>

  <div class="status-divider"></div>

  <div class="status-item">
    <span class="status-icon">{getHealthIcon(sessionStats.sessionHealth)}</span>
    <div class="status-content">
      <div class="status-label">Session Health</div>
      <div class="status-value" style="color: {getHealthColor(sessionStats.sessionHealth)}">
        {sessionStats.sessionHealth.charAt(0).toUpperCase() + sessionStats.sessionHealth.slice(1)}
      </div>
    </div>
  </div>

  {#if sessionStats.sessionActive}
    <div class="status-divider"></div>

    <div class="status-item">
      <span class="status-icon">🟢</span>
      <div class="status-content">
        <div class="status-label">Session Time</div>
        <div class="status-value">{formatDuration(sessionDuration)}</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .live-status-bar {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.6rem 1.5rem;
    background: linear-gradient(135deg, rgba(88, 166, 255, 0.1), rgba(139, 92, 246, 0.1));
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 0.8rem;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-icon {
    font-size: 1rem;
  }

  .status-content {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .status-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--accent);
    font-weight: 600;
  }

  .status-value {
    font-size: 0.85rem;
    color: var(--text);
    font-weight: 600;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .stat-add {
    color: var(--success);
  }

  .stat-remove {
    color: var(--error);
  }

  .status-divider {
    width: 1px;
    height: 32px;
    background: var(--border);
  }
</style>
