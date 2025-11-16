<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime, getTimeAgo } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';
  import { activeProject } from './projectStore.js';

  const API_BASE = API_CONFIG.API_BASE;

  let rollbackStats = null;
  let highRiskFiles = [];
  let recentRollbacks = [];
  let loading = true;
  let error = null;
  let lastUpdate = new Date();

  // WebSocket handlers
  const handleHighRiskChange = async event => {
    logger.info('High-risk change detected:', event);
    await loadRiskData();
  };

  const handleFileChanged = async () => {
    await loadRiskData();
  };

  const handleProjectSwitched = async () => {
    await loadRiskData();
  };

  onMount(async () => {
    await loadRiskData();

    websocketService.connect();
    websocketService.on('high-risk-change', handleHighRiskChange);
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    websocketService.off('high-risk-change', handleHighRiskChange);
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadRiskData() {
    try {
      loading = true;
      const project = $activeProject || 'raven';

      const [statsRes, filesRes, rollbacksRes] = await Promise.all([
        fetch(`${API_BASE}/risk/rollback-stats?project=${project}`),
        fetch(`${API_BASE}/risk/high-risk-files?project=${project}&limit=10`),
        fetch(`${API_BASE}/risk/recent-rollbacks?project=${project}&limit=10`)
      ]);

      if (!statsRes.ok || !filesRes.ok || !rollbacksRes.ok) {
        throw new Error('Failed to fetch risk data');
      }

      rollbackStats = await statsRes.json();
      const filesData = await filesRes.json();
      const rollbacksData = await rollbacksRes.json();

      highRiskFiles = filesData.files || [];
      recentRollbacks = rollbacksData.rollbacks || [];

      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load risk data:', error);
      errorMessage = error.message;
    } finally {
      loading = false;
    }
  }

  $: timeSinceUpdate = getTimeAgo(lastUpdate);
  $: totalRollbacks = rollbackStats?.total_rollbacks || 0;
  $: autoRollbacks = rollbackStats?.automatic_rollbacks || 0;
</script>

<div class="risk-correlation-panel">
  <div class="panel-header">
    <div class="header-left">
      <h2>⚠️ Risk Correlation</h2>
      <p class="subtitle">Predictive risk scoring • Rollback tracking • Pattern learning</p>
    </div>
    <div class="header-right">
      <span class="last-update">Updated: {timeSinceUpdate}</span>
      <button class="btn-primary" on:click={loadRiskData}>↻ Refresh</button>
    </div>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state">
      <p>❌ Error: {error}</p>
      <button on:click={loadRiskData}>Retry</button>
    </div>
  {:else}
    <!-- Stats Overview -->
    <div class="stats-row">
      <div class="stat-badge">
        <span class="badge-icon">📊</span>
        <span class="badge-count">{totalRollbacks}</span>
        <span class="badge-label">Total Rollbacks</span>
      </div>
      <div class="stat-badge">
        <span class="badge-icon">🤖</span>
        <span class="badge-count">{autoRollbacks}</span>
        <span class="badge-label">Automatic</span>
      </div>
      <div class="stat-badge">
        <span class="badge-icon">📁</span>
        <span class="badge-count">{rollbackStats?.avg_files_affected || 0}</span>
        <span class="badge-label">Avg Files</span>
      </div>
      <div class="stat-badge">
        <span class="badge-icon">🔥</span>
        <span class="badge-count">{highRiskFiles.length}</span>
        <span class="badge-label">High Risk</span>
      </div>
    </div>

    <!-- High Risk Files -->
    <div class="section">
      <h3>High-Risk Files (Most Rollbacks)</h3>
      {#if highRiskFiles.length === 0}
        <div class="empty-box">
          <p>✅ No high-risk files detected</p>
          <p class="hint">System is learning from rollback patterns</p>
        </div>
      {:else}
        <div class="risk-files-list">
          {#each highRiskFiles as file (file.filepath)}
            <div class="risk-file-card">
              <div class="file-header">
                <span class="file-icon">🔴</span>
                <div class="file-info">
                  <div class="file-path">{file.filepath}</div>
                  <div class="file-meta">
                    Last rollback: {formatDateTime(file.last_rollback)}
                  </div>
                </div>
                <div class="rollback-count">
                  <div class="count-value">{file.rollback_count}</div>
                  <div class="count-label">rollbacks</div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Recent Rollbacks -->
    <div class="section">
      <h3>Recent Rollbacks</h3>
      {#if recentRollbacks.length === 0}
        <div class="empty-box">
          <p>No rollbacks recorded yet</p>
          <p class="hint">The system will learn risk patterns from rollback history</p>
        </div>
      {:else}
        <div class="rollbacks-list">
          {#each recentRollbacks as rollback (rollback.id || rollback.timestamp)}
            <div class="rollback-card">
              <div class="rollback-header">
                <span class="rollback-icon">{rollback.automatic ? '🤖' : '👤'}</span>
                <div class="rollback-info">
                  <div class="rollback-file">{rollback.filepath}</div>
                  <div class="rollback-meta">
                    <time datetime={rollback.timestamp}>{formatDateTime(rollback.timestamp)}</time>
                    <span class="change-type">{rollback.change_type}</span>
                    {#if rollback.agent}
                      <span class="agent">🤖 {rollback.agent}</span>
                    {/if}
                  </div>
                </div>
                <div class="rollback-type">
                  {rollback.rollback_type || 'manual'}
                </div>
              </div>
              {#if rollback.reason}
                <div class="rollback-reason">
                  Reason: {rollback.reason}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- How It Works -->
    <div class="info-box">
      <h4>🧠 How Risk Correlation Works</h4>
      <ul>
        <li><strong>Pattern Learning:</strong> Analyzes last 30 days of rollback history</li>
        <li><strong>File Risk:</strong> Tracks which files fail most often</li>
        <li><strong>Agent Risk:</strong> Identifies which agents have higher failure rates</li>
        <li><strong>Predictive Scoring:</strong> Calculates risk score for every change (0-100)</li>
        <li><strong>Real-time Alerts:</strong> Warns you before high-risk changes are made</li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .risk-correlation-panel {
    padding: var(--space-lg);
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-lg);
  }

  .header-left h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 24px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .header-right {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .last-update {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-primary {
    padding: 8px 16px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    background: var(--accent);
    color: white;
    border: 1px solid var(--accent);
    transition: all 0.2s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .stat-badge {
    padding: var(--space-md);
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .badge-icon {
    font-size: 20px;
  }

  .badge-count {
    font-size: 24px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .badge-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    margin-left: auto;
  }

  .section {
    margin-bottom: var(--space-xl);
  }

  .section h3 {
    margin: 0 0 var(--space-md) 0;
    font-size: 18px;
    color: var(--text);
  }

  .risk-files-list,
  .rollbacks-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .risk-file-card,
  .rollback-card {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid #ef4444;
    border-radius: var(--radius);
    transition: all 0.2s;
  }

  .risk-file-card:hover,
  .rollback-card:hover {
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .file-header,
  .rollback-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .file-icon,
  .rollback-icon {
    font-size: 20px;
  }

  .file-info,
  .rollback-info {
    flex: 1;
  }

  .file-path,
  .rollback-file {
    font-size: 14px;
    font-family: var(--mono);
    color: var(--text);
    font-weight: 600;
    margin-bottom: 4px;
  }

  .file-meta,
  .rollback-meta {
    display: flex;
    gap: var(--space-sm);
    font-size: 12px;
    color: var(--muted);
    flex-wrap: wrap;
  }

  .change-type,
  .agent {
    background: var(--bg);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: var(--mono);
  }

  .rollback-count {
    text-align: center;
    padding: 4px 12px;
    background: var(--bg);
    border-radius: var(--radius);
  }

  .count-value {
    font-size: 20px;
    font-weight: 700;
    font-family: var(--mono);
    color: #ef4444;
  }

  .count-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .rollback-type {
    padding: 4px 12px;
    background: var(--bg);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--mono);
    color: var(--muted);
  }

  .rollback-reason {
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg);
    border-radius: var(--radius);
    font-size: 13px;
    color: var(--text);
  }

  .info-box {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .info-box h4 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 14px;
    color: var(--text);
  }

  .info-box ul {
    margin: 0;
    padding-left: var(--space-lg);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .info-box li {
    margin-bottom: 4px;
  }

  .info-box strong {
    color: var(--text);
  }

  .empty-box {
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .empty-box p {
    margin: var(--space-sm) 0;
    color: var(--text);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }

  .error-state {
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .error-state p {
    margin: 0 0 var(--space-md) 0;
    color: var(--text);
  }

  .error-state button {
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
  }
</style>
