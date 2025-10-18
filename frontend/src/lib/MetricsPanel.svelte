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
        cpu = latest.cpu_percent;
        memory = latest.memory_percent;
        memoryUsed = latest.memory_used_mb;
        memoryTotal = latest.memory_total_mb;
      }
    } catch (error) {
      console.error('Failed to get metrics:', error);
    }
  }

  onMount(() => {
    // Initial fetch
    updateMetrics();

    // Connect to WebSocket for real-time system metrics
    websocketService.connect();

    // Listen for real-time system metrics
    websocketService.on('system-metrics', (metrics) => {
      cpu = metrics.cpu_percent;
      memory = metrics.memory_percent;
      memoryUsed = metrics.memory_used_mb;
      memoryTotal = metrics.memory_total_mb;
    });

    // Fallback: refresh every 30 seconds (WebSocket should handle real-time)
    intervalId = setInterval(updateMetrics, 30000);
  });

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }

    // Clean up WebSocket listeners
    websocketService.off('system-metrics');
  });
</script>

<div class="metrics">
  <div class="metric">
    <div class="label">CPU Usage</div>
    <div class="value">{cpu.toFixed(1)}%</div>
    <div class="bar">
      <div class="fill" style="width: {cpu}%"></div>
    </div>
  </div>

  <div class="metric">
    <div class="label">Memory Usage</div>
    <div class="value">{memory.toFixed(1)}%</div>
    <div class="bar">
      <div class="fill memory" style="width: {memory}%"></div>
    </div>
    <div class="detail">{memoryUsed} MB / {memoryTotal} MB</div>
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
    gap: 1.5rem;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .label {
    color: #888;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .value {
    font-size: 1.8rem;
    font-weight: bold;
    color: #4ade80;
  }

  .bar {
    height: 8px;
    background: #2a2a2a;
    border-radius: 4px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: #646cff;
    transition: width 0.3s ease;
  }

  .fill.memory {
    background: #f59e0b;
  }

  .detail {
    font-size: 0.8rem;
    color: #666;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #333;
  }

  .status-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #4ade80;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status span {
    color: #888;
    font-size: 0.9rem;
  }
</style>
