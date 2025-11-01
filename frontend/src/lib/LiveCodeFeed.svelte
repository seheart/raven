<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatTime as formatTimeString } from './timeFormat.js';
  import ProjectBadge from './ProjectBadge.svelte';
  import { api } from './apiClient.js';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';

  const API_BASE = API_CONFIG.API_BASE;

  let codeChanges = [];
  let recentActivity = [];
  let loading = true;

  // Live session stats
  let sessionStats = {
    duration: 0,
    files_touched: 0,
    active_agents: 0,
    session_id: '',
    total_events: 0
  };
  let isPaused = false;

  // Metrics history for sparklines (last 20 data points)
  let metricsHistory = {
    cpu: [],
    memory: []
  };


  // Filter out build artifacts - only show real source code changes
  function isSourceCodeFile(filepath) {
    if (!filepath) return false;

    // Exclude build/dist directories
    if (filepath.match(/\/(dist|build|\.vite|\.next|\.nuxt|out|public\/build)\//)) return false;

    // Exclude build artifacts
    if (filepath.match(/\.(map|min\.js|min\.css|chunk\.js)$/)) return false;

    // Exclude dependencies
    if (filepath.match(/\/(node_modules|\.git|\.svelte-kit)\//)) return false;

    // Include everything else (source code)
    return true;
  }

  // Debounce utility function (moved outside reactive scope)
  let debouncedTimeoutId;
  const debounce = (fn, delay) => {
    return function (...args) {
      clearTimeout(debouncedTimeoutId);
      debouncedTimeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  // Debounced reload functions
  const debouncedLoadChanges = debounce(async () => {
    await loadCodeChanges();
    await loadRecentActivity();
  }, 300);

  // WebSocket event handlers
  const handleFileChanged = (data) => {
    logger.info('File change detected:', data);
    debouncedLoadChanges();
  };

  const handleAgentEvent = () => {
    debouncedLoadChanges();
  };

  const handleProjectSwitched = (data) => {
    logger.info('📡 Project switched, reloading data:', data.project);
    loadAllData();
  };

  onMount(async () => {
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for file change events (debounced)
    websocketService.on('file-changed', handleFileChanged);

    // Listen for agent events (debounced)
    websocketService.on('agent-event', handleAgentEvent);

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Event-driven updates via WebSocket (no polling!)
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('agent-event', handleAgentEvent);
    websocketService.off('project-switched', handleProjectSwitched);

    // Clean up pending debounced timeout
    if (debouncedTimeoutId) {
      clearTimeout(debouncedTimeoutId);
    }
  });

  async function loadAllData() {
    await Promise.all([
      loadCodeChanges(),
      loadRecentActivity(),
      loadSessionStats()
    ]);
    loading = false;
  }

  async function loadSessionStats() {
    try {
      const data = await api.get('/dashboard-stats');

      sessionStats = {
        duration: data.session_duration_seconds || 0,
        files_touched: data.unique_files_modified || 0,
        active_agents: data.total_agents || 0,
        session_id: data.session_id || 'unknown',
        total_events: data.total_events || 0
      };

      // Update metrics history for sparklines
      await loadMetrics();
    } catch (error) {
      logger.error('Failed to load session stats:', error);
    }
  }

  async function loadMetrics() {
    try {
      const data = await api.get('/process-metrics?limit=1');

      if (data && data.length > 0) {
        const latest = data[0];

        // Map database column names to display names
        // process_metrics table has: cpu_usage, memory_mb
        const cpu = latest.cpu_usage || latest.cpu || 0;
        const mem = latest.memory_mb || latest.mem || 0;

        // Add to history (keep last 20 points)
        metricsHistory.cpu = [...metricsHistory.cpu, cpu].slice(-20);
        metricsHistory.memory = [...metricsHistory.memory, mem].slice(-20);
      }
    } catch (error) {
      logger.error('Failed to load metrics:', error);
    }
  }

  function generateSparkline(data, width = 60, height = 24) {
    if (data.length < 2) return '';

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    return `M ${points.split(' ').join(' L ')}`;
  }

  function togglePause() {
    isPaused = !isPaused;
    // Pause just stops WebSocket handlers from updating UI
    // Event-driven updates will resume when unpause
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  async function loadCodeChanges() {
    try {
      // Use all-file-events to get events from ALL projects
      const data = await api.get('/all-file-events?limit=50&diff=true');
      // all-file-events returns an array directly with project tags
      const allChanges = Array.isArray(data) ? data : [];

      // Filter to only show real source code (exclude build artifacts)
      codeChanges = allChanges.filter(change => isSourceCodeFile(change.filepath));
    } catch (error) {
      logger.error('Failed to load code changes:', error);
    }
  }

  async function loadRecentActivity() {
    try {
      // Get both file events and agent events from ALL projects
      const [fileEvents, agentEvents] = await Promise.all([
        api.get('/all-file-events?limit=20'),
        api.get('/all-agent-events?limit=20')
      ]);

      // all-file-events and all-agent-events return arrays directly with project tags
      const fileEventsArray = Array.isArray(fileEvents) ? fileEvents : [];
      const agentEventsArray = Array.isArray(agentEvents) ? agentEvents : [];

      // Combine and sort by timestamp
      const combined = [
        ...fileEventsArray.map(e => ({ ...e, type: 'file' })),
        ...agentEventsArray.map(e => ({ ...e, type: 'agent' }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      recentActivity = combined.slice(0, 30);
    } catch (error) {
      logger.error('Failed to load recent activity:', error);
    }
  }

  function parseDiffLines(diff) {
    if (!diff) return [];

    const lines = diff.split('\n');
    let currentLineNum = 0;

    return lines.map((line, index) => {
      let type = 'context';
      let displayNum = '';

      // Check if it's a header line (@@)
      if (line.startsWith('@@')) {
        type = 'header';
        // Extract starting line number from @@ -x,y +a,b @@
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentLineNum = parseInt(match[1], 10) - 1;
        }
        displayNum = '•';
      }
      // Addition line
      else if (line.startsWith('+') && !line.startsWith('+++')) {
        type = 'add';
        currentLineNum++;
        displayNum = currentLineNum.toString();
      }
      // Deletion line
      else if (line.startsWith('-') && !line.startsWith('---')) {
        type = 'remove';
        displayNum = '-';
      }
      // File header lines
      else if (line.startsWith('+++') || line.startsWith('---')) {
        type = 'header';
        displayNum = '•';
      }
      // Context line
      else if (line.trim() !== '') {
        type = 'context';
        currentLineNum++;
        displayNum = currentLineNum.toString();
      }

      return {
        text: line,
        type,
        lineNum: displayNum,
        index
      };
    }).filter(line => line.text.trim() !== '' || line.type !== 'context');
  }

  function getChangeTypeIcon(changeType) {
    if (changeType === 'add' || changeType === 'create') return '➕';
    if (changeType === 'change' || changeType === 'modify') return '✏️';
    if (changeType === 'unlink' || changeType === 'delete') return '🗑️';
    return '📝';
  }

  function getChangeTypeColor(changeType) {
    if (changeType === 'add' || changeType === 'create') return 'var(--success)';
    if (changeType === 'change' || changeType === 'modify') return 'var(--info)';
    if (changeType === 'unlink' || changeType === 'delete') return 'var(--error)';
    return 'var(--muted)';
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  function formatTime(timestamp) {
    return formatTimeString(timestamp);
  }

  function truncatePath(path, maxLength = 40) {
    if (!path || path.length <= maxLength) return path;
    const parts = path.split('/');
    if (parts.length <= 2) return path;
    return '.../' + parts.slice(-2).join('/');
  }
</script>

<div class="live-code-feed" role="region" aria-label="Live code feed">
  <!-- Live Session Stats Widget -->
  <div class="stats-widget" role="region" aria-label="Live session statistics">
    <div class="stats-header">
      <div class="stats-title">
        <h2>💻 Code Changes</h2>
        <p class="stats-subtitle">Source code only • Excludes build artifacts and dependencies</p>
      </div>
    </div>
    <div class="stats-bar" role="list" aria-label="Session metrics">
      <div class="stat-item">
        <span class="stat-icon">⏱️</span>
        <div class="stat-content">
          <span class="stat-label">Duration</span>
          <span class="stat-value">{formatDuration(sessionStats.duration)}</span>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">📁</span>
        <div class="stat-content">
          <span class="stat-label">Files Touched</span>
          <span class="stat-value">{sessionStats.files_touched}</span>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">🤖</span>
        <div class="stat-content">
          <span class="stat-label">Active Agents</span>
          <span class="stat-value">{sessionStats.active_agents}</span>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">📊</span>
        <div class="stat-content">
          <span class="stat-label">Total Events</span>
          <span class="stat-value">{sessionStats.total_events}</span>
        </div>
      </div>

      <!-- Sparklines for CPU and Memory -->
      {#if metricsHistory.cpu.length > 1}
        <div class="sparkline-item">
          <div class="sparkline-header">
            <span class="sparkline-label">CPU</span>
            <span class="sparkline-current">{metricsHistory.cpu[metricsHistory.cpu.length - 1]?.toFixed(1)}%</span>
          </div>
          <svg class="sparkline" width="60" height="24" viewBox="0 0 60 24">
            <path
              d={generateSparkline(metricsHistory.cpu, 60, 24)}
              fill="none"
              stroke="var(--info)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>
      {/if}

      {#if metricsHistory.memory.length > 1}
        <div class="sparkline-item">
          <div class="sparkline-header">
            <span class="sparkline-label">MEM</span>
            <span class="sparkline-current">{metricsHistory.memory[metricsHistory.memory.length - 1]?.toFixed(1)}%</span>
          </div>
          <svg class="sparkline" width="60" height="24" viewBox="0 0 60 24">
            <path
              d={generateSparkline(metricsHistory.memory, 60, 24)}
              fill="none"
              stroke="var(--success)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>
      {/if}

      <div class="stat-controls">
        <button class="btn-pause" on:click={togglePause} aria-label={isPaused ? 'Resume live feed updates' : 'Pause live feed updates'} aria-pressed={isPaused}>
          <span aria-hidden="true">{isPaused ? '▶️' : '⏸️'}</span>
          <span class="pause-text">{isPaused ? 'Resume' : 'Pause'}</span>
        </button>
      </div>
    </div>

    {#if isPaused}
      <div class="paused-banner" role="status" aria-live="polite">
        <span aria-hidden="true">⏸️</span> Feed paused - Click Resume to continue live updates
      </div>
    {/if}
  </div>

  <div class="feed-layout">
    <!-- Code Changes List -->
    <section class="code-changes-content" aria-labelledby="code-changes-heading">
        {#if loading}
          <div class="loading" role="status" aria-live="polite">Loading changes...</div>
        {:else if codeChanges.length === 0}
          <div class="empty-state" role="status">
            <p>No recent code changes</p>
            <p class="empty-hint">Waiting for file modifications to be detected</p>
          </div>
        {:else}
          <div class="changes-list" role="feed" aria-label="Code changes feed" aria-busy={loading}>
            {#each codeChanges || [] as change, index (`${change.id || change.filepath}-${index}`)}
              <div class="change-item">
                <div class="change-header">
                  <div class="change-meta">
                    <span class="change-icon" style="color: {getChangeTypeColor(change.change_type)}">
                      {getChangeTypeIcon(change.change_type)}
                    </span>
                    <span class="change-type" style="color: {getChangeTypeColor(change.change_type)}">
                      {change.change_type.toUpperCase()}
                    </span>
                    {#if change.project}
                      <ProjectBadge project={change.project} size="small" />
                    {/if}
                    <span class="change-time">{formatTime(change.timestamp)}</span>
                  </div>
                  <button class="btn-copy" title="Copy">📋</button>
                </div>

                <div class="change-file">
                  <code>{change.filepath || 'Unknown file'}</code>
                </div>

                {#if change.diff}
                  <div class="change-diff">
                    {#each parseDiffLines(change.diff) as line (line.index)}
                      <div class="diff-line {line.type}">
                        <span class="line-number">{line.lineNum}</span>
                        <code class="line-content">{line.text}</code>
                      </div>
                    {/each}
                  </div>
                {/if}

                <div class="change-footer">
                  <span class="change-size">{change.event_size || 0} bytes</span>
                  {#if change.file_hash}
                    <span class="change-hash">{change.file_hash.substring(0, 8)}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
    </section>
  </div>
</div>

<style>
  .live-code-feed {
    width: 100%;
    height: calc(100vh - 180px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    position: relative;
    color: var(--text);
    font-family: var(--mono);
  }

  /* Stats Widget */
  .stats-widget {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0;
    flex-shrink: 0;
  }

  .stats-header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }

  .stats-title h2 {
    margin: 0 0 4px 0;
    font-size: 12px;
    color: var(--text);
    font-weight: 600;
  }

  .stats-subtitle {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }

  .stats-bar {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
  }

  .stat-item {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 3px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    transition: all 0.15s ease;
  }

  .stat-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .stat-icon {
    font-size: 12px;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .stat-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
  }

  .stat-value {
    font-size: 11px;
    color: var(--text);
    font-weight: 700;
    font-family: var(--mono);
  }

  .stat-controls {
    margin-left: auto;
  }

  .btn-pause {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 3px;
    color: white;
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-pause:hover {
    background: var(--accent-2, var(--accent));
    border-color: var(--accent-2, var(--accent));
  }

  .btn-pause:focus {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .pause-text {
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .paused-banner {
    margin-top: 12px;
    padding: 6px 10px;
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    border: 1px solid var(--warning);
    border-radius: 3px;
    color: var(--warning);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Sparklines */
  .sparkline-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 3px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    transition: all 0.15s ease;
  }

  .sparkline-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .sparkline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4px;
  }

  .sparkline-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
  }

  .sparkline-current {
    font-size: 11px;
    color: var(--text);
    font-weight: 700;
    font-family: var(--mono);
  }

  .sparkline {
    display: block;
    border-radius: 2px;
  }

  .sparkline path {
    transition: stroke 0.3s ease;
  }

  .feed-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .code-changes-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px;
  }

  /* Code Changes Styles */
  .changes-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 20px;
  }

  .change-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 8px;
    transition: all 0.15s;
  }

  .change-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .change-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .change-meta {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .change-icon {
    font-size: 11px;
  }

  .change-type {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  .project-badge {
    padding: 2px 6px;
    background: var(--accent);
    color: white;
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .change-time {
    font-size: 11px;
    color: var(--muted);
  }

  .btn-copy {
    padding: 2px 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
  }

  .btn-copy:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-copy:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .change-file {
    margin-bottom: 4px;
  }

  .change-file code {
    font-size: 11px;
    color: var(--accent);
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 3px;
    display: inline-block;
  }

  .change-diff {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    margin-bottom: 4px;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
    font-family: 'Courier New', 'Consolas', monospace;
  }

  .diff-line {
    display: flex;
    align-items: stretch;
    font-size: 11px;
    line-height: 1.5;
    min-height: 18px;
    transition: background 0.1s ease;
  }

  .diff-line:hover {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .diff-line.add {
    background: color-mix(in srgb, #22c55e 15%, transparent);
    border-left: 3px solid #22c55e;
  }

  .diff-line.remove {
    background: color-mix(in srgb, #ef4444 15%, transparent);
    border-left: 3px solid #ef4444;
  }

  .diff-line.context {
    background: transparent;
    border-left: 3px solid transparent;
  }

  .diff-line.header {
    background: color-mix(in srgb, var(--info) 10%, transparent);
    border-left: 3px solid var(--info);
    color: var(--info);
    font-weight: 600;
  }

  .line-number {
    display: inline-block;
    width: 32px;
    padding: 1px 6px;
    color: var(--muted);
    text-align: right;
    user-select: none;
    font-size: 11px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--bg) 50%, var(--surface));
  }

  .diff-line.add .line-number {
    color: #22c55e;
  }

  .diff-line.remove .line-number {
    color: #ef4444;
  }

  .line-content {
    flex: 1;
    padding: 1px 8px;
    white-space: pre;
    overflow-x: auto;
    color: var(--text);
    font-family: inherit;
  }

  .diff-line.add .line-content {
    color: #22c55e;
  }

  .diff-line.remove .line-content {
    color: #ef4444;
  }

  .change-diff::-webkit-scrollbar {
    height: 6px;
    width: 6px;
  }

  .change-diff::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  .change-footer {
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }

  .change-size,
  .change-hash {
    padding: 2px 4px;
    background: var(--bg);
    border-radius: 3px;
  }

  /* Activity Styles */
  .activity-list {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .activity-item {
    display: flex;
    gap: 6px;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    transition: all 0.15s;
    cursor: pointer;
  }

  .activity-item:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .activity-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .activity-details {
    flex: 1;
    overflow: hidden;
  }

  .activity-file {
    font-size: 11px;
    color: var(--text);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 2px;
  }

  .activity-meta {
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }

  .activity-type {
    text-transform: uppercase;
    font-weight: 600;
  }

  .loading {
    text-align: center;
    padding: 8px;
    color: var(--muted);
    font-size: 11px;
  }

  .empty-state {
    text-align: center;
    padding: 12px 8px;
    color: var(--muted);
  }

  .empty-state p {
    margin: 0 0 8px 0;
    font-size: 12px;
  }

  .empty-hint {
    font-size: 11px;
  }

  /* Scrollbar */
  .code-changes-content::-webkit-scrollbar,
  .activity-content::-webkit-scrollbar {
    width: 6px;
  }

  .code-changes-content::-webkit-scrollbar-thumb,
  .activity-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .code-changes-content {
      padding: 8px;
    }
  }
</style>
