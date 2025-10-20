<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';

  const API_BASE = 'http://localhost:3030/api';

  let cpu = 0;
  let memory = 0;
  let memoryUsed = 0;
  let memoryTotal = 0;
  let intervalId = null;

  async function updateMetrics() {
    try {
      const response = await fetch(`${API_BASE}/system-metrics?limit=1`);
      const metrics = await response.json();

      if (metrics && metrics.length > 0) {
        const latest = metrics[0];
        cpu = latest?.cpu_percent || 0;
        memory = latest?.memory_percent || 0;
        memoryUsed = latest?.memory_used_mb || 0;
        memoryTotal = latest?.memory_total_mb || 0;
      }
    } catch (error) {
      console.error('Failed to get metrics:', error);
    }
  }

  // WebSocket event handler
  const handleSystemMetrics = (metrics) => {
    cpu = metrics?.cpu_percent || 0;
    memory = metrics?.memory_percent || 0;
    memoryUsed = metrics?.memory_used_mb || 0;
    memoryTotal = metrics?.memory_total_mb || 0;
  };

  onMount(() => {
    // Initial fetch
    updateMetrics();

    // Connect to WebSocket for real-time system metrics
    websocketService.connect();

    // Listen for real-time system metrics
    websocketService.on('system-metrics', handleSystemMetrics);

    // Fallback: refresh every 30 seconds (WebSocket should handle real-time)
    intervalId = setInterval(updateMetrics, 30000);
  });

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }

    // Clean up WebSocket listeners
    websocketService.off('system-metrics', handleSystemMetrics);
  });
</script>

<div class="metrics">
  <div class="metric">
    <div class="label">CPU Usage</div>
    <div class="value">{(cpu || 0).toFixed(1)}%</div>
    <div class="bar">
      <div class="fill" style="width: {cpu || 0}%"></div>
    </div>
  </div>

  <div class="metric">
    <div class="label">Memory Usage</div>
    <div class="value">{(memory || 0).toFixed(1)}%</div>
    <div class="bar">
      <div class="fill memory" style="width: {memory || 0}%"></div>
    </div>
    <div class="detail">{memoryUsed || 0} MB / {memoryTotal || 0} MB</div>
  </div>

  <div class="status">
    <div class="status-indicator"></div>
    <span>Monitoring Active</span>
  </div>
</div>

<style>
  .metrics {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .label {
    color: var(--muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .value {
    font-size: 13px;
    font-weight: bold;
    color: var(--success);
  }

  .bar {
    height: 8px;
    background: var(--surface-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--info);
    transition: width 0.3s ease;
  }

  .fill.memory {
    background: var(--warning);
  }

  .detail {
    font-size: 11px;
    color: var(--muted);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .status-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--success);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status span {
    color: var(--muted);
    font-size: 12px;
  }
</style>
