<script>
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  let timeline = [];
  let currentIndex = 0;
  let isPlaying = false;
  let playSpeed = 1; // 0.5x, 1x, 2x, 4x
  let sessionId = '';
  let stats = null;
  let loading = true;
  let error = null;
  let playInterval = null;

  // Filter options
  let showFileEvents = true;
  let showAgentEvents = true;
  let showMetrics = false;

  // Selected file for detailed view
  let selectedFile = null;
  let fileTimeline = [];

  onMount(async () => {
    await loadSession();
  });

  onDestroy(() => {
    stopPlayback();
  });

  async function loadSession() {
    try {
      loading = true;
      error = null;

      // Get current session ID
      sessionId = await invoke('get_session_id');

      // Get timeline entries
      timeline = await invoke('get_session_timeline', {
        sessionId,
        limit: 500
      });

      // Apply filters
      timeline = applyFilters(timeline);

      // Get timeline stats
      stats = await invoke('get_timeline_stats', { sessionId });

      loading = false;
    } catch (err) {
      error = err.toString();
      loading = false;
      console.error('Error loading session:', err);
    }
  }

  function applyFilters(entries) {
    return entries.filter(entry => {
      if (entry.type === 'FileEvent' && !showFileEvents) return false;
      if (entry.type === 'AgentEvent' && !showAgentEvents) return false;
      if (entry.type === 'MetricsSnapshot' && !showMetrics) return false;
      return true;
    });
  }

  async function toggleFilter(filterName) {
    if (filterName === 'file') showFileEvents = !showFileEvents;
    if (filterName === 'agent') showAgentEvents = !showAgentEvents;
    if (filterName === 'metrics') showMetrics = !showMetrics;

    await loadSession(); // Reload with new filters
  }

  function startPlayback() {
    if (isPlaying) return;

    isPlaying = true;
    const intervalMs = 1000 / playSpeed; // Adjust interval based on speed

    playInterval = setInterval(() => {
      if (currentIndex < timeline.length - 1) {
        currentIndex++;
      } else {
        stopPlayback();
      }
    }, intervalMs);
  }

  function stopPlayback() {
    isPlaying = false;
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }

  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function changeSpeed(newSpeed) {
    const wasPlaying = isPlaying;
    if (wasPlaying) stopPlayback();

    playSpeed = newSpeed;

    if (wasPlaying) startPlayback();
  }

  function jumpToIndex(index) {
    currentIndex = Math.max(0, Math.min(timeline.length - 1, index));
  }

  function stepForward() {
    if (currentIndex < timeline.length - 1) {
      currentIndex++;
    }
  }

  function stepBackward() {
    if (currentIndex > 0) {
      currentIndex--;
    }
  }

  function jumpToStart() {
    currentIndex = 0;
  }

  function jumpToEnd() {
    currentIndex = timeline.length - 1;
  }

  async function selectFile(filepath) {
    try {
      selectedFile = filepath;
      fileTimeline = await invoke('get_file_timeline', { filepath });
    } catch (err) {
      console.error('Error loading file timeline:', err);
    }
  }

  function formatTimestamp(ts) {
    const date = new Date(ts);
    return date.toLocaleTimeString();
  }

  function formatDuration(ms) {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function getEventIcon(entry) {
    if (entry.type === 'FileEvent') {
      if (entry.change_type === 'created') return '➕';
      if (entry.change_type === 'modified') return '✏️';
      if (entry.change_type === 'deleted') return '🗑️';
      return '📄';
    }
    if (entry.type === 'AgentEvent') {
      if (entry.event_type === 'edit') return '✏️';
      if (entry.event_type === 'create') return '➕';
      if (entry.event_type === 'delete') return '🗑️';
      if (entry.event_type === 'execute') return '⚡';
      return '🤖';
    }
    if (entry.type === 'MetricsSnapshot') {
      return '📊';
    }
    return '•';
  }

  $: currentEntry = timeline[currentIndex];
  $: progress = timeline.length > 0 ? (currentIndex / (timeline.length - 1)) * 100 : 0;
</script>

<div class="session-replay">
  <div class="header">
    <h2>🎬 Session Replay</h2>
    {#if stats}
      <div class="stats-summary">
        <span>{stats.total_events} events</span>
        <span>|</span>
        <span>{stats.unique_files_count} files</span>
        <span>|</span>
        <span>{stats.unique_agents_count} agents</span>
      </div>
    {/if}
  </div>

  {#if loading}
    <div class="loading">Loading session timeline...</div>
  {/if}

  {#if error}
    <div class="error">Error: {error}</div>
  {/if}

  {#if !loading && timeline.length > 0}
    <!-- Playback Controls -->
    <div class="controls">
      <button on:click={jumpToStart} class="control-btn" title="Jump to start">
        ⏮️
      </button>
      <button on:click={stepBackward} class="control-btn" title="Step backward">
        ⏪
      </button>
      <button on:click={togglePlayback} class="control-btn play-btn" title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? '⏸️' : '▶️'}
      </button>
      <button on:click={stepForward} class="control-btn" title="Step forward">
        ⏩
      </button>
      <button on:click={jumpToEnd} class="control-btn" title="Jump to end">
        ⏭️
      </button>

      <div class="speed-controls">
        <span>Speed:</span>
        <button on:click={() => changeSpeed(0.5)} class:active={playSpeed === 0.5}>0.5x</button>
        <button on:click={() => changeSpeed(1)} class:active={playSpeed === 1}>1x</button>
        <button on:click={() => changeSpeed(2)} class:active={playSpeed === 2}>2x</button>
        <button on:click={() => changeSpeed(4)} class:active={playSpeed === 4}>4x</button>
      </div>

      <div class="filters">
        <button on:click={() => toggleFilter('file')} class:active={showFileEvents}>
          📄 Files
        </button>
        <button on:click={() => toggleFilter('agent')} class:active={showAgentEvents}>
          🤖 Agents
        </button>
        <button on:click={() => toggleFilter('metrics')} class:active={showMetrics}>
          📊 Metrics
        </button>
      </div>
    </div>

    <!-- Timeline Scrubber -->
    <div class="timeline-scrubber">
      <div class="timeline-track">
        <div class="timeline-progress" style="width: {progress}%"></div>
        <input
          type="range"
          min="0"
          max={timeline.length - 1}
          bind:value={currentIndex}
          class="timeline-slider"
        />
      </div>
      <div class="timeline-labels">
        <span>Event {currentIndex + 1} of {timeline.length}</span>
        {#if currentEntry}
          <span>{formatTimestamp(currentEntry.timestamp)}</span>
        {/if}
      </div>
    </div>

    <!-- Current Event Display -->
    {#if currentEntry}
      <div class="current-event">
        <div class="event-header">
          <span class="event-icon">{getEventIcon(currentEntry)}</span>
          <span class="event-type">{currentEntry.type}</span>
          {#if currentEntry.type === 'FileEvent'}
            <span class="event-detail">{currentEntry.change_type}: {currentEntry.filepath}</span>
          {:else if currentEntry.type === 'AgentEvent'}
            <span class="event-detail">{currentEntry.agent} - {currentEntry.event_type}</span>
            {#if currentEntry.duration_ms}
              <span class="duration">{formatDuration(currentEntry.duration_ms)}</span>
            {/if}
          {/if}
        </div>

        <div class="event-content">
          {#if currentEntry.type === 'FileEvent'}
            <div class="file-event-details">
              <div class="detail-row">
                <span class="label">File:</span>
                <span class="value">
                  <button on:click={() => selectFile(currentEntry.filepath)} class="file-link">
                    {currentEntry.filepath}
                  </button>
                </span>
              </div>
              <div class="detail-row">
                <span class="label">Change:</span>
                <span class="value change-{currentEntry.change_type}">{currentEntry.change_type}</span>
              </div>
              <div class="detail-row">
                <span class="label">CPU:</span>
                <span class="value">{currentEntry.cpu.toFixed(1)}%</span>
              </div>
              <div class="detail-row">
                <span class="label">Memory:</span>
                <span class="value">{currentEntry.mem.toFixed(1)}%</span>
              </div>
              {#if currentEntry.diff}
                <div class="diff-preview">
                  <h4>Diff Preview:</h4>
                  <pre>{currentEntry.diff}</pre>
                </div>
              {/if}
            </div>
          {:else if currentEntry.type === 'AgentEvent'}
            <div class="agent-event-details">
              <div class="detail-row">
                <span class="label">Agent:</span>
                <span class="value agent-badge">{currentEntry.agent}</span>
              </div>
              <div class="detail-row">
                <span class="label">Event:</span>
                <span class="value">{currentEntry.event_type}</span>
              </div>
              {#if currentEntry.file}
                <div class="detail-row">
                  <span class="label">File:</span>
                  <span class="value">{currentEntry.file}</span>
                </div>
              {/if}
              {#if currentEntry.lines_changed}
                <div class="detail-row">
                  <span class="label">Lines Changed:</span>
                  <span class="value">{currentEntry.lines_changed}</span>
                </div>
              {/if}
              <div class="detail-row">
                <span class="label">Message:</span>
                <span class="value message">{currentEntry.message}</span>
              </div>
              {#if currentEntry.system_cpu !== null}
                <div class="detail-row">
                  <span class="label">System CPU:</span>
                  <span class="value">{currentEntry.system_cpu.toFixed(1)}%</span>
                </div>
              {/if}
            </div>
          {:else if currentEntry.type === 'MetricsSnapshot'}
            <div class="metrics-snapshot">
              <div class="detail-row">
                <span class="label">CPU:</span>
                <span class="value">{currentEntry.cpu_percent.toFixed(1)}%</span>
              </div>
              <div class="detail-row">
                <span class="label">Memory:</span>
                <span class="value">{currentEntry.memory_percent.toFixed(1)}%</span>
              </div>
              <div class="detail-row">
                <span class="label">RAM Used:</span>
                <span class="value">{currentEntry.memory_used_mb} MB</span>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- File Timeline (if file selected) -->
    {#if selectedFile && fileTimeline.length > 0}
      <div class="file-timeline-section">
        <h3>📜 History: {selectedFile}</h3>
        <div class="file-timeline">
          {#each fileTimeline as entry, i}
            <div class="file-timeline-item" class:active={entry.id === currentEntry?.id}>
              <span class="timeline-index">{i + 1}</span>
              <span class="timeline-icon">{getEventIcon(entry)}</span>
              <span class="timeline-change">{entry.change_type}</span>
              <span class="timeline-time">{formatTimestamp(entry.timestamp)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  {:else if !loading}
    <div class="empty-state">
      <p>No timeline events available yet.</p>
      <p>Events will appear as you make file changes and agent interactions.</p>
      <button on:click={loadSession} class="refresh-btn">🔄 Refresh</button>
    </div>
  {/if}
</div>

<style>
  .session-replay {
    padding: 20px;
    background: #1a1a1a;
    color: #e0e0e0;
    border-radius: 8px;
    min-height: 500px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #333;
  }

  .header h2 {
    margin: 0;
    font-size: 24px;
    color: #ffa500;
  }

  .stats-summary {
    display: flex;
    gap: 10px;
    font-size: 14px;
    color: #999;
  }

  .controls {
    display: flex;
    gap: 15px;
    align-items: center;
    padding: 15px;
    background: #2a2a2a;
    border-radius: 8px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .control-btn {
    background: #333;
    border: 1px solid #555;
    color: #fff;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
  }

  .control-btn:hover {
    background: #444;
  }

  .play-btn {
    background: #ffa500;
    color: #000;
    font-weight: bold;
  }

  .play-btn:hover {
    background: #ff8c00;
  }

  .speed-controls {
    display: flex;
    gap: 5px;
    align-items: center;
    margin-left: auto;
  }

  .speed-controls span {
    color: #999;
    font-size: 12px;
    margin-right: 5px;
  }

  .speed-controls button {
    background: #333;
    border: 1px solid #555;
    color: #fff;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .speed-controls button.active {
    background: #ffa500;
    color: #000;
    font-weight: bold;
  }

  .filters {
    display: flex;
    gap: 5px;
  }

  .filters button {
    background: #333;
    border: 1px solid #555;
    color: #999;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .filters button.active {
    background: #444;
    color: #ffa500;
    border-color: #ffa500;
  }

  .timeline-scrubber {
    margin-bottom: 20px;
  }

  .timeline-track {
    position: relative;
    height: 40px;
    background: #2a2a2a;
    border-radius: 4px;
    overflow: hidden;
  }

  .timeline-progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, #ffa500, #ff8c00);
    transition: width 0.1s;
    pointer-events: none;
  }

  .timeline-slider {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .timeline-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    font-size: 12px;
    color: #999;
  }

  .current-event {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
  }

  .event-header {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid #333;
  }

  .event-icon {
    font-size: 20px;
  }

  .event-type {
    font-weight: bold;
    color: #ffa500;
  }

  .event-detail {
    color: #ccc;
  }

  .duration {
    margin-left: auto;
    color: #44ff44;
    font-weight: bold;
  }

  .event-content {
    padding: 10px 0;
  }

  .detail-row {
    display: flex;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #333;
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .label {
    min-width: 120px;
    color: #999;
    font-size: 14px;
  }

  .value {
    color: #e0e0e0;
    font-size: 14px;
  }

  .agent-badge {
    background: #ffa500;
    color: #000;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 12px;
  }

  .file-link {
    background: none;
    border: none;
    color: #4a9eff;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }

  .file-link:hover {
    color: #6ab0ff;
  }

  .change-created {
    color: #44ff44;
  }

  .change-modified {
    color: #ffa500;
  }

  .change-deleted {
    color: #ff4444;
  }

  .message {
    font-style: italic;
    color: #ccc;
  }

  .diff-preview {
    margin-top: 15px;
  }

  .diff-preview h4 {
    margin: 0 0 10px 0;
    color: #ffa500;
    font-size: 14px;
  }

  .diff-preview pre {
    background: #1a1a1a;
    padding: 10px;
    border-radius: 4px;
    font-size: 12px;
    overflow-x: auto;
    max-height: 300px;
    color: #ccc;
  }

  .file-timeline-section {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 20px;
    margin-top: 20px;
  }

  .file-timeline-section h3 {
    margin: 0 0 15px 0;
    color: #ffa500;
  }

  .file-timeline {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .file-timeline-item {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px;
    background: #333;
    border-radius: 4px;
    font-size: 14px;
  }

  .file-timeline-item.active {
    background: #444;
    border: 1px solid #ffa500;
  }

  .timeline-index {
    min-width: 30px;
    color: #999;
  }

  .timeline-icon {
    font-size: 16px;
  }

  .timeline-change {
    color: #ccc;
    min-width: 80px;
  }

  .timeline-time {
    margin-left: auto;
    color: #999;
    font-size: 12px;
  }

  .loading, .error, .empty-state {
    text-align: center;
    padding: 40px;
    color: #999;
  }

  .error {
    color: #ff4444;
  }

  .empty-state p {
    margin: 10px 0;
  }

  .refresh-btn {
    margin-top: 15px;
    background: #ffa500;
    color: #000;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  }

  .refresh-btn:hover {
    background: #ff8c00;
  }
</style>
