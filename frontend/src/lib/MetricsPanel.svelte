<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

  let cpu = 0;
  let memory = 0;
  let memoryUsed = 0;
  let memoryTotal = 0;

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
      logger.error('Failed to get metrics:', error);
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

    // Listen for real-time system metrics (event-driven, no polling!)
    websocketService.on('system-metrics', handleSystemMetrics);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('system-metrics', handleSystemMetrics);
  });
</script>

<div class="metrics" role="region" aria-label="System metrics">
  <div class="metric" role="status" aria-live="polite">
    <div class="label" id="cpu-label">CPU Usage</div>
    <div class="value" aria-labelledby="cpu-label" aria-label="CPU usage {(cpu || 0).toFixed(1)} percent">{(cpu || 0).toFixed(1)}%</div>
    <div class="bar" role="progressbar" aria-valuenow={cpu || 0} aria-valuemin="0" aria-valuemax="100" aria-label="CPU usage progress bar">
      <div class="fill" style="width: {cpu || 0}%"></div>
    </div>
  </div>

  <div class="metric" role="status" aria-live="polite">
    <div class="label" id="memory-label">Memory Usage</div>
    <div class="value" aria-labelledby="memory-label" aria-label="Memory usage {(memory || 0).toFixed(1)} percent">{(memory || 0).toFixed(1)}%</div>
    <div class="bar" role="progressbar" aria-valuenow={memory || 0} aria-valuemin="0" aria-valuemax="100" aria-label="Memory usage progress bar">
      <div class="fill memory" style="width: {memory || 0}%"></div>
    </div>
    <div class="detail" aria-label="{memoryUsed || 0} megabytes used of {memoryTotal || 0} megabytes total">{memoryUsed || 0} MB / {memoryTotal || 0} MB</div>
  </div>

  <div class="status" role="status" aria-live="polite">
    <div class="status-indicator" aria-hidden="true"></div>
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
