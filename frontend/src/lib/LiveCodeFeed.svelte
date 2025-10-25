<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatTime as formatTimeString } from './timeFormat.js';
  import ProjectBadge from './ProjectBadge.svelte';
  import PageInfo from './PageInfo.svelte';
  import { api } from './apiClient.js';

  const API_BASE = 'http://localhost:3030/api';

  let codeChanges = [];
  let recentActivity = [];
  let loading = true;
  let refreshInterval;
  let statsRefreshInterval;

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


  // Debounce utility function (moved outside reactive scope)
  const debounce = (fn, delay) => {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  // Debounced reload functions
  const debouncedLoadChanges = debounce(async () => {
    await loadCodeChanges();
    await loadRecentActivity();
  }, 300);

  // WebSocket event handlers
  const handleFileChanged = (data) => {
    console.log('File change detected:', data);
    debouncedLoadChanges();
  };

  const handleAgentEvent = () => {
    debouncedLoadChanges();
  };

  const handleProjectSwitched = (data) => {
    console.log('📡 Project switched, reloading data:', data.project);
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

    // Refresh every 30 seconds (reduced frequency)
    refreshInterval = setInterval(loadAllData, 30000);

    // Refresh stats more frequently (every 5 seconds)
    statsRefreshInterval = setInterval(loadSessionStats, 5000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    if (statsRefreshInterval) {
      clearInterval(statsRefreshInterval);
    }
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('agent-event', handleAgentEvent);
    websocketService.off('project-switched', handleProjectSwitched);
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
      const data = await api.get("/dashboard-stats");

      sessionStats = {
        duration: data.session_duration_seconds || 0,
        files_touched: data.unique_files_modified || 0,
        active_agents: data.active_agents || 0,
        session_id: data.session_id || 'unknown',
        total_events: data.total_events || 0
      };

      // Update metrics history for sparklines
      await loadMetrics();
    } catch (error) {
      console.error('Failed to load session stats:', error);
    }
  }

  async function loadMetrics() {
    try {
      const data = await api.get("/process-metrics?limit=1");

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
      console.error('Failed to load metrics:', error);
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

    if (isPaused) {
      // Stop auto-refresh when paused
      if (refreshInterval) clearInterval(refreshInterval);
      if (statsRefreshInterval) clearInterval(statsRefreshInterval);
    } else {
      // Resume auto-refresh
      refreshInterval = setInterval(loadAllData, 30000);
      statsRefreshInterval = setInterval(loadSessionStats, 5000); // Stats update every 5s
    }
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
      const data = await api.get("/file-events?limit=50&diff=true");
      codeChanges = data;
    } catch (error) {
      console.error('Failed to load code changes:', error);
    }
  }

  async function loadRecentActivity() {
    try {
      // Get both file events and agent events
      const [fileEvents, agentEvents] = await Promise.all([
        api.get("/file-events?limit=20"),
        api.get("/agent-events?limit=20")
      ]);

      // Combine and sort by timestamp
      const combined = [
        ...(fileEvents || []).map(e => ({ ...e, type: 'file', project: e.project || null })),
        ...(agentEvents || []).map(e => ({ ...e, type: 'agent', project: e.project || null }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      recentActivity = combined.slice(0, 30);
    } catch (error) {
      console.error('Failed to load recent activity:', error);
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

<div class="live-code-feed">
  <PageInfo
    title="Live Code Feed"
    description="This is your **real-time code monitoring dashboard** - imagine watching security camera footage of your codebase as it changes, but instead of video, you see actual code diffs scrolling by. The Live Code Feed is a 2-column view showing code changes and activity stream, all updating in real-time as you (or AI agents) edit files. Perfect for watching AI coding sessions or reviewing what changed during intense development."
    keyPoints={[
      '**Left Column: Code Changes** - The main event! Shows actual code diffs for recent file modifications. Each change block shows: Change type (➕ ADD / ✏️ CHANGE / 🗑️ DELETE) in colored text, Project badge like `[RAVEN]` identifying which project, Timestamp when it happened, The diff with line numbers and syntax highlighting (green = added lines, red = deleted lines, gray = context).',
      '**Right Column: Activity Stream** - Condensed timeline of ALL recent activity (both file changes and agent actions). Shows icons for change type, file path (truncated to last 2 parts if long), time ago ("5m ago", "2h ago"). Updates live without refresh.',
      '**Change Type Icons & Colors** - ➕ green = file added/created, ✏️ blue = file modified/edited, 🗑️ red = file deleted/unlinked. These icons appear everywhere to help you quickly identify what happened.',
      '**Diff Format** - Uses standard unified diff format: Lines starting with `+` are additions (green), Lines starting with `-` are deletions (red), Lines with no prefix are context (gray), `@@ -1,5 +1,7 @@` headers show line numbers (means "showing lines 1-7 in the new version").',
      '**Project Badges** - Small colored pills like `[wrap]`, `[recall]`, `[raven]` appear on each change to show which project the file belongs to. Helps when monitoring multiple projects simultaneously.',
      '**WebSocket Live Updates** - This page uses WebSocket connections for INSTANT updates. When a file changes, you see it within 100ms. No polling, no delays. The feed scrolls as new changes arrive.'
    ]}
    whenToCheck="Keep this open **during AI coding sessions** to watch the AI work in real-time, **while debugging** to see which files are being touched, or **after a session** to review the complete timeline of what changed and in what order."
    warnings={[
      '**No code changes showing** - Raven is not watching directories, or no changes have been detected yet. Check Status page to verify file watchers are active. Try editing a file in a monitored project.',
      '**Empty diffs (file shown but no code changes)** - Happens when: File was moved/renamed (change detected but content identical), File permissions changed, File timestamp updated but content same. This is normal for renames.',
      '**Very rapid updates/scrolling** - Could indicate: AI agent in a tight loop editing the same file repeatedly, Build system auto-generating files on every save (like webpack hot-reload), File watcher detecting its own writes (watch loop). If sustained, investigate the looping process.',
      '**Diff shows binary file or "No diff available"** - File is binary (image, PDF, compiled code) so Raven cannot show text diff. Or file was deleted so there\'s no new content. This is expected for non-text files.',
      '**Activity stream showing duplicates** - WebSocket might have reconnected and re-sent recent events. Refresh the page if this persists. Usually resolves itself within 30 seconds.'
    ]}
  />

  <!-- Live Session Stats Widget -->
  <div class="stats-widget">
    <div class="stats-bar">
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
        <button class="btn-pause" on:click={togglePause} title={isPaused ? 'Resume feed' : 'Pause feed'}>
          {isPaused ? '▶️' : '⏸️'}
          <span class="pause-text">{isPaused ? 'Resume' : 'Pause'}</span>
        </button>
      </div>
    </div>

    {#if isPaused}
      <div class="paused-banner">
        ⏸️ Feed paused - Click Resume to continue live updates
      </div>
    {/if}
  </div>

  <div class="feed-layout">
    <!-- Code Changes Column -->
    <div class="code-changes-column">
      <div class="column-header">
        <h3>📊 Code Changes</h3>
        <span class="change-count">{codeChanges.length} events</span>
      </div>
      <div class="code-changes-content">
        {#if loading}
          <div class="loading">Loading changes...</div>
        {:else if codeChanges.length === 0}
          <div class="empty-state">
            <p>No recent code changes</p>
            <p class="empty-hint">Waiting for file modifications to be detected</p>
          </div>
        {:else}
          <div class="changes-list">
            {#each codeChanges || [] as change}
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
                    {#each parseDiffLines(change.diff) as line}
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
      </div>
    </div>

    <!-- Right Column: Recent Activity -->
    <div class="activity-column">
      <div class="column-header">
        <h3>⚡️ Recent Activity</h3>
      </div>
      <div class="activity-content">
        {#if loading}
          <div class="loading">Loading activity...</div>
        {:else if recentActivity.length === 0}
          <div class="empty-state">
            <p>No recent activity</p>
            <p class="empty-hint">File and agent activity will appear here</p>
          </div>
        {:else}
          <div class="activity-list">
            {#each recentActivity || [] as activity}
              <div class="activity-item" class:file={activity.type === 'file'} class:agent={activity.type === 'agent'}>
                <div class="activity-icon">
                  {#if activity.type === 'file'}
                    <span style="color: {getChangeTypeColor(activity.change_type)}">
                      {getChangeTypeIcon(activity.change_type)}
                    </span>
                  {:else}
                    <span>🤖</span>
                  {/if}
                </div>

                <div class="activity-details">
                  {#if activity.type === 'file'}
                    <div class="activity-file">{truncatePath(activity.filepath)}</div>
                    <div class="activity-meta">
                      <span class="activity-type">{activity.change_type}</span>
                      <span class="activity-time">{formatTimestamp(activity.timestamp)}</span>
                    </div>
                  {:else}
                    <div class="activity-file">{activity.agent || 'Agent'}</div>
                    <div class="activity-meta">
                      <span class="activity-type">{activity.event_type}</span>
                      <span class="activity-time">{formatTimestamp(activity.timestamp)}</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
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
    padding: 12px 24px;
    flex-shrink: 0;
  }

  .stats-bar {
    display: flex;
    gap: 24px;
    align-items: center;
    justify-content: space-between;
  }

  .stat-item {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .stat-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .stat-icon {
    font-size: 20px;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: 9px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .stat-value {
    font-size: 14px;
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
    gap: 8px;
    padding: 8px 16px;
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: white;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-pause:hover {
    background: var(--accent-2, var(--accent));
    transform: scale(1.05);
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 50%, transparent);
  }

  .pause-text {
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .paused-banner {
    margin-top: 12px;
    padding: 10px 16px;
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    border: 1px solid var(--warning);
    border-radius: 6px;
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
    gap: 4px;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .sparkline-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .sparkline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .sparkline-label {
    font-size: 9px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
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
    display: grid;
    grid-template-columns: 1fr 440px;
    gap: 0;
    height: 100%;
    overflow: hidden;
  }

  .code-changes-column,
  .activity-column {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  .activity-column {
    border-right: none;
  }

  .column-header {
    padding: 10px 12px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .column-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .change-count {
    font-size: 10px;
    color: var(--muted);
    padding: 2px 8px;
    background: var(--surface);
    border-radius: 4px;
  }

  .code-changes-content,
  .activity-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Code Changes Styles */
  .changes-list {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .change-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    transition: all 0.2s;
  }

  .change-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .change-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .change-meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .change-icon {
    font-size: 14px;
  }

  .change-type {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .project-badge {
    padding: 2px 6px;
    background: var(--accent);
    color: white;
    font-size: 9px;
    font-weight: 600;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .change-time {
    font-size: 10px;
    color: var(--muted);
  }

  .btn-copy {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
  }

  .btn-copy:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .change-file {
    margin-bottom: 8px;
  }

  .change-file code {
    font-size: 11px;
    color: var(--accent);
    background: var(--bg);
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
  }

  .change-diff {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 8px;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
    font-family: 'Courier New', 'Consolas', monospace;
  }

  .diff-line {
    display: flex;
    align-items: stretch;
    font-size: 11px;
    line-height: 1.6;
    min-height: 20px;
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
    width: 40px;
    padding: 2px 8px;
    color: var(--muted);
    text-align: right;
    user-select: none;
    font-size: 10px;
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
    padding: 2px 12px;
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
    gap: 12px;
    font-size: 10px;
    color: var(--muted);
  }

  .change-size,
  .change-hash {
    padding: 2px 6px;
    background: var(--bg);
    border-radius: 4px;
  }

  /* Activity Styles */
  .activity-list {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .activity-item {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    transition: all 0.2s;
    cursor: pointer;
  }

  .activity-item:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .activity-icon {
    font-size: 14px;
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
    gap: 8px;
    font-size: 10px;
    color: var(--muted);
  }

  .activity-type {
    text-transform: uppercase;
    font-weight: 600;
  }

  .loading {
    text-align: center;
    padding: 24px;
    color: var(--muted);
    font-size: 11px;
  }

  .empty-state {
    text-align: center;
    padding: 32px 16px;
    color: var(--muted);
  }

  .empty-state p {
    margin: 0 0 8px 0;
    font-size: 12px;
  }

  .empty-hint {
    font-size: 10px;
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
  @media (max-width: 1200px) {
    .feed-layout {
      grid-template-columns: 1fr 380px;
    }
  }

  @media (max-width: 768px) {
    .feed-layout {
      grid-template-columns: 1fr;
    }

    .activity-column {
      display: none;
    }
  }
</style>
