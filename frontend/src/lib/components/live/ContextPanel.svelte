<script>
  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';

  let { currentFile = null } = $props();

  let sessionTask = $state(null);
  let alerts = $state([]);
  let context = $state({});
  let recentActivity = $state([]);
  let loading = $state(true);

  // Fetch context data
  async function fetchContextData() {
    try {
      const [taskResponse, alertsResponse, activityResponse] = await Promise.all([
        api.get('/session/current-task').catch(() => ({ task: null })),
        api.get('/session/alerts').catch(() => ({ alerts: [] })),
        api.get('/session/recent-activity').catch(() => ({ activity: [] }))
      ]);

      sessionTask = taskResponse.task;
      alerts = alertsResponse.alerts || [];
      recentActivity = activityResponse.activity || [];

      loading = false;
    } catch (err) {
      console.error('Failed to fetch context data:', err);
      loading = false;
    }
  }

  // Fetch file-specific context when file changes
  async function fetchFileContext(filePath) {
    if (!filePath) return;

    try {
      const response = await api.get(`/session/file-context/${encodeURIComponent(filePath)}`);
      context = response || {};
    } catch (err) {
      console.error('Failed to fetch file context:', err);
      context = {};
    }
  }

  $effect(() => {
    if (currentFile) {
      fetchFileContext(currentFile);
    }
  });

  onMount(() => {
    // Stagger initial load by 400ms to reduce simultaneous API calls
    const initialDelay = setTimeout(fetchContextData, 400);
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchContextData, 10000);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  });

  function getAlertIcon(type) {
    const icons = {
      error: '🔴',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅'
    };
    return icons[type] || 'ℹ️';
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }
</script>

<div class="context-panel">
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
    </div>
  {:else}
    <!-- Current Task Card -->
    {#if sessionTask}
      <div class="task-progress-card">
        <div class="task-name">🎯 {sessionTask.name || 'Current Task'}</div>
        {#if sessionTask.step}
          <div class="task-step">{sessionTask.step}</div>
        {/if}
        {#if sessionTask.progress !== undefined}
          <div class="progress-track">
            <div class="progress-bar-fill" style="width: {sessionTask.progress}%"></div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Smart Alerts -->
    {#if alerts.length > 0}
      <div class="panel-section">
        <div class="section-header">
          <span>🚨 Alerts</span>
          <span class="count-badge">{alerts.length}</span>
        </div>

        {#each alerts as alert (alert.id || alert.message)}
          <div class="alert-card {alert.type}">
            <div class="alert-title">
              <span>{getAlertIcon(alert.type)}</span>
              <span>{alert.title || 'Alert'}</span>
            </div>
            <div class="alert-body">{alert.message}</div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- File Context (when file is selected) -->
    {#if currentFile && Object.keys(context).length > 0}
      <div class="panel-section">
        <div class="section-header">
          <span>🎯 Context</span>
        </div>

        {#if context.impact}
          <div class="context-card">
            <div class="context-title">Impact Analysis</div>
            <div class="context-body">{context.impact}</div>
          </div>
        {/if}

        {#if context.relatedFiles && context.relatedFiles.length > 0}
          <div class="context-card">
            <div class="context-title">Related Files</div>
            <div class="context-body">
              {context.relatedFiles.join(', ')}
            </div>
          </div>
        {/if}

        {#if context.risks && context.risks.length > 0}
          <div class="context-card">
            <div class="context-title">Potential Risks</div>
            <div class="context-body">
              <ul>
                {#each context.risks as risk, i (i)}
                  <li>{risk}</li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Recent Activity -->
    {#if recentActivity.length > 0}
      <div class="panel-section">
        <div class="section-header">
          <span>📊 Recent Changes</span>
        </div>

        {#each recentActivity.slice(0, 5) as activity (activity.id || activity.timestamp)}
          <div class="activity-item">
            <div class="activity-header">
              <div class="activity-title">{activity.title || 'Change'}</div>
              <div class="activity-time">{formatTimeAgo(activity.timestamp)}</div>
            </div>
            {#if activity.description}
              <div class="activity-desc">{activity.description}</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="panel-section">
      <div class="section-header">
        <span>⚡ Quick Actions</span>
      </div>

      <button class="quick-action-btn" onclick={() => console.log('View session diff')}>
        📋 View Full Session Diff
      </button>
      <button class="quick-action-btn" onclick={() => console.log('Rollback')}>
        🔙 Rollback Last Change
      </button>
      <button class="quick-action-btn" onclick={() => console.log('Run tests')}>
        🧪 Run Tests
      </button>
      <button class="quick-action-btn" onclick={() => console.log('Create snapshot')}>
        💾 Create Snapshot
      </button>
      <button class="quick-action-btn" onclick={() => console.log('Open in editor')}>
        📝 Open in Editor
      </button>
    </div>
  {/if}
</div>

<style>
  .context-panel {
    height: 100%;
    background: var(--bg);
    border-left: 1px solid var(--border);
    overflow-y: auto;
    padding: 1rem;
  }

  .loading-state {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .task-progress-card {
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    color: white;
  }

  .task-name {
    font-weight: 600;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  .task-step {
    font-size: 0.75rem;
    opacity: 0.9;
    margin-bottom: 0.75rem;
  }

  .progress-track {
    height: 6px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: white;
    border-radius: 3px;
    transition: width 0.3s;
  }

  .panel-section {
    margin-bottom: 1.5rem;
  }

  .section-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
    font-weight: 600;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .count-badge {
    background: rgba(88, 166, 255, 0.2);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-size: 0.7rem;
  }

  .alert-card {
    background: var(--surface);
    border-left: 3px solid;
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
  }

  .alert-card.warning {
    border-left-color: var(--warning);
    background: var(--warning-subtle);
  }

  .alert-card.error {
    border-left-color: var(--error);
    background: var(--error-subtle);
  }

  .alert-card.info {
    border-left-color: var(--accent);
    background: var(--accent-subtle);
  }

  .alert-card.success {
    border-left-color: var(--success);
    background: var(--success-subtle);
  }

  .alert-title {
    font-weight: 600;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .alert-body {
    color: var(--muted);
    line-height: 1.4;
    font-size: 0.75rem;
  }

  .context-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
  }

  .context-title {
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }

  .context-body {
    color: var(--muted);
    line-height: 1.5;
  }

  .context-body ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .context-body li {
    margin-bottom: 0.25rem;
  }

  .activity-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
  }

  .activity-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }

  .activity-title {
    color: var(--text);
    font-weight: 600;
    font-size: 0.8rem;
  }

  .activity-time {
    color: var(--muted);
    font-size: 0.7rem;
  }

  .activity-desc {
    color: var(--muted);
    line-height: 1.4;
  }

  .quick-action-btn {
    display: block;
    width: 100%;
    padding: 0.6rem;
    margin-bottom: 0.5rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    font-family: inherit;
  }

  .quick-action-btn:hover {
    background: var(--surface-3);
    border-color: var(--accent);
    color: var(--accent);
  }

  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--muted);
  }
</style>
