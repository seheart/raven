<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatUnixDateTime } from './timeFormat.js';
  import { projectFilter, availableProjects, matchesFilter } from './projectFilterStore.js';
  import PageInfo from './PageInfo.svelte';
  import { getEmptyStateMessage } from './utils/projectFilter.js';
  import ProjectBadge from './ProjectBadge.svelte';

  const API_BASE = 'http://localhost:3030/api';

  let activeTab = 'rules'; // 'rules', 'events', 'stats'
  let triggers = [];
  let triggeredEvents = [];
  let stats = {
    total_triggers: 0,
    active_triggers: 0,
    trigger_counts: {}
  };
  let loading = true;
  let error = null;
  let successMessage = null;
  let refreshInterval;

  // Filter triggered events based on current project filter
  $: filteredEvents = triggeredEvents.filter(event => {
    // If event has a project field, use it for filtering
    if (event.project) {
      return matchesFilter(event.project, $projectFilter);
    }
    // If no project field, show it in "all" view only
    return $projectFilter === 'all';
  });

  // WebSocket event handlers
  const handleTriggerFired = (event) => {
    // Add new event to the beginning of the list
    triggeredEvents = [event, ...triggeredEvents].slice(0, 100);
  };

  const handleTriggerStats = (newStats) => {
    stats = newStats;
  };

  const handleProjectSwitched = async (data) => {
    console.log('📡 Project switched, reloading triggers data:', data.project);
    await loadAllData();
  };

  onMount(async () => {
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time trigger events
    websocketService.on('trigger-fired', handleTriggerFired);

    // Listen for real-time stats updates
    websocketService.on('trigger-stats', handleTriggerStats);

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Fallback: refresh every 30 seconds (WebSocket should handle real-time)
    refreshInterval = setInterval(loadAllData, 30000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Clean up WebSocket listeners
    websocketService.off('trigger-fired', handleTriggerFired);
    websocketService.off('trigger-stats', handleTriggerStats);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadAllData() {
    loading = true;
    error = null;

    try {
      // Load all trigger data in parallel
      const [triggersRes, eventsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/triggers-config`),
        fetch(`${API_BASE}/triggered-events?limit=100`),
        fetch(`${API_BASE}/trigger-stats`)
      ]);

      triggers = await triggersRes.json();
      triggeredEvents = await eventsRes.json();
      stats = await statsRes.json();
    } catch (e) {
      error = `Failed to load triggers data: ${e}`;
      console.error(error);
    } finally {
      loading = false;
    }
  }

  async function reloadConfig() {
    try {
      const response = await fetch(`${API_BASE}/triggers-reload`, { method: 'POST' });
      const data = await response.json();
      successMessage = data.message;
      setTimeout(() => successMessage = null, 3000);
      await loadAllData();
    } catch (e) {
      error = `Failed to reload config: ${e}`;
      console.error(error);
    }
  }

  async function clearCooldowns() {
    try {
      const response = await fetch(`${API_BASE}/triggers-clear-cooldowns`, { method: 'POST' });
      const data = await response.json();
      successMessage = data.message;
      setTimeout(() => successMessage = null, 3000);
    } catch (e) {
      error = `Failed to clear cooldowns: ${e}`;
      console.error(error);
    }
  }

  function formatTimestamp(timestamp) {
    // timestamp is Unix timestamp in seconds
    return formatUnixDateTime(timestamp);
  }

  function getActionIcon(action) {
    switch(action?.toLowerCase()) {
      case 'notify': return '🔔';
      case 'log': return '📝';
      case 'command': return '⚙️';
      default: return '❓';
    }
  }

  function getConditionsList(trigger) {
    const conditions = [];
    if (trigger.file) conditions.push(`File: ${trigger.file}`);
    if (trigger.agent) conditions.push(`Agent: ${trigger.agent}`);
    if (trigger.event_type) conditions.push(`Type: ${trigger.event_type}`);
    if (trigger.lines_changed) conditions.push(`Lines: ${trigger.lines_changed}`);
    if (trigger.duration_ms) conditions.push(`Duration: ${trigger.duration_ms}ms`);
    if (trigger.cpu_percent) conditions.push(`CPU: ${trigger.cpu_percent}%`);
    if (trigger.memory_percent) conditions.push(`Memory: ${trigger.memory_percent}%`);
    return conditions;
  }
</script>

<div class="triggers-panel">
  <PageInfo
    title="Triggers & Alerts"
    description="Smart monitoring rules that automatically notify you when specific conditions are met. Set up alerts for high CPU usage, frequent file changes, error patterns, and more."
    keyPoints={[
      'Triggers run continuously in the background',
      'Configure custom thresholds for your workflow',
      'Real-time notifications when conditions are met',
      'View trigger history to see what fired and when',
      'Enable/disable triggers individually',
      'Test triggers before activating them'
    ]}
    whenToCheck="Configure triggers when you want automated alerts for specific conditions, or review trigger history to see what has been firing."
    warnings={[
      'Too many trigger fires might need threshold adjustment',
      'No triggers firing could mean conditions aren\'t being met or triggers are misconfigured',
      'Overlapping triggers might cause notification spam'
    ]}
  />

  <div class="header">
    <h2>🎯 Custom Triggers</h2>
    <div class="header-actions">
      <button on:click={reloadConfig} class="btn-action" title="Reload .raven/config.toml">
        🔄 Reload Config
      </button>
      <button on:click={clearCooldowns} class="btn-action" title="Clear all trigger cooldowns">
        ⏰ Clear Cooldowns
      </button>
      <button on:click={loadAllData} class="btn-refresh">
        ↻ Refresh
      </button>
    </div>
  </div>

  {#if successMessage}
    <div class="message success">{successMessage}</div>
  {/if}

  {#if error}
    <div class="message error">{error}</div>
  {/if}

  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'rules'}
      on:click={() => activeTab = 'rules'}
    >
      📋 Trigger Rules ({triggers?.length || 0})
    </button>
    <button
      class="tab"
      class:active={activeTab === 'events'}
      on:click={() => activeTab = 'events'}
    >
      🔔 Triggered Events ({filteredEvents?.length || 0})
    </button>
    <button
      class="tab"
      class:active={activeTab === 'stats'}
      on:click={() => activeTab = 'stats'}
    >
      📊 Statistics
    </button>
  </div>

  <div class="tab-content">
    {#if loading}
      <div class="loading">Loading triggers...</div>
    {:else if activeTab === 'rules'}
      <!-- Trigger Rules Tab -->
      {#if triggers.length === 0}
        <div class="empty">
          <div class="icon">📝</div>
          <h3>No Triggers Configured</h3>
          <p>Create triggers in <code>.raven/config.toml</code> to get started.</p>
          <p class="hint">Example triggers are created automatically when Raven first runs.</p>
        </div>
      {:else}
        <div class="rules-grid">
          {#each triggers || [] as trigger}
            <div class="trigger-card">
              <div class="trigger-header">
                <span class="trigger-name">{trigger.name}</span>
                <span class="trigger-action">
                  {getActionIcon(trigger.action)} {trigger.action}
                </span>
              </div>

              <div class="trigger-details">
                {#if getConditionsList(trigger).length > 0}
                  <div class="conditions">
                    <span class="label">Conditions:</span>
                    <ul>
                      {#each getConditionsList(trigger) || [] as condition}
                        <li>{condition}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}

                {#if trigger.message}
                  <div class="message-preview">
                    <span class="label">Message:</span>
                    <span class="value">{trigger.message}</span>
                  </div>
                {/if}

                {#if trigger.command}
                  <div class="command-preview">
                    <span class="label">Command:</span>
                    <code class="value">{trigger.command}</code>
                  </div>
                {/if}

                <div class="cooldown">
                  <span class="label">Cooldown:</span>
                  <span class="value">
                    {trigger.cooldown_seconds === 0 ? 'None' : `${trigger.cooldown_seconds}s`}
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeTab === 'events'}
      <!-- Triggered Events Tab -->
      {#if filteredEvents.length === 0}
        {@const emptyMsg = getEmptyStateMessage('trigger events', $projectFilter, triggeredEvents.length)}
        <div class="empty">
          <div class="icon">🔕</div>
          <h3>No Triggered Events</h3>
          <p>{emptyMsg.primary}</p>
          <p class="hint">{emptyMsg.hint}</p>
        </div>
      {:else}
        <div class="events-list">
          {#each filteredEvents || [] as event}
            <div class="event-row">
              <span class="event-icon">{getActionIcon(event.action)}</span>
              <div class="event-details">
                <div class="event-header-row">
                  <div class="event-trigger-name">{event.trigger_name}</div>
                  {#if event.project}
                    <ProjectBadge project={event.project} size="small" />
                  {/if}
                </div>
                <div class="event-message">{event.message}</div>
              </div>
              <div class="event-meta">
                <span class="event-action">{event.action}</span>
                <span class="event-time">{formatTimestamp(event.timestamp)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    {:else if activeTab === 'stats'}
      <!-- Statistics Tab -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{stats.total_triggers}</div>
          <div class="stat-label">Total Triggers Fired</div>
        </div>

        <div class="stat-card">
          <div class="stat-value">{stats.active_triggers}</div>
          <div class="stat-label">Active Trigger Rules</div>
        </div>

        {#if Object.keys(stats?.trigger_counts || {}).length > 0}
          <div class="stat-card full-width">
            <h3>Trigger Fire Counts</h3>
            <div class="trigger-counts">
              {#each Object.entries(stats?.trigger_counts || {}).sort((a, b) => b[1] - a[1]) as [name, count]}
                <div class="count-row">
                  <span class="count-name">{name}</span>
                  <span class="count-value">{count}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .triggers-panel {
    padding: 24px;
    width: 100%;
    margin: 0;
    position: relative;
    font-family: var(--mono);
    background: var(--bg);
    color: var(--text);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding: 0 8px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .btn-action,
  .btn-refresh {
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .btn-action:hover,
  .btn-refresh:hover {
    background: var(--surface-2);
    border-color: var(--border);
  }

  .message {
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 10px;
    font-size: 12px;
  }

  .message.success {
    background: color-mix(in srgb, var(--success) 15%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--success) 25%, var(--surface));
    color: var(--success);
  }

  .message.error {
    background: color-mix(in srgb, var(--error) 15%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--error) 25%, var(--surface));
    color: var(--error);
  }

  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
    border-bottom: 2px solid var(--surface-2);
  }

  .tab {
    padding: 12px 20px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .tab:hover {
    color: var(--text);
    background: var(--surface);
  }

  .tab.active {
    color: var(--warning);
    border-bottom-color: var(--warning);
  }

  .tab-content {
    min-height: 400px;
  }

  .loading {
    text-align: center;
    padding: 16px 20px;
    color: var(--muted);
    font-size: 12px;
  }

  .empty {
    text-align: center;
    padding: 16px 20px;
    color: var(--muted);
  }

  .empty .icon {
    font-size: 13px;
    margin-bottom: 10px;
  }

  .empty h3 {
    color: var(--text);
    font-size: 13px;
    margin-bottom: 12px;
  }

  .empty p {
    font-size: 12px;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .empty code {
    background: var(--surface);
    padding: 2px 8px;
    border-radius: 4px;
    color: var(--warning);
    font-family: 'Courier New', monospace;
  }

  .empty .hint {
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
  }

  /* Trigger Rules Tab */
  .rules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 12px;
  }

  .trigger-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s;
  }

  .trigger-card:hover {
    border-color: var(--warning);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--warning) 10%, transparent);
  }

  .trigger-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--surface-2);
  }

  .trigger-name {
    font-weight: 600;
    font-size: 12px;
    color: var(--text);
  }

  .trigger-action {
    background: var(--surface-2);
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    color: var(--warning);
    text-transform: capitalize;
  }

  .trigger-details {
    font-size: 12px;
  }

  .trigger-details .label {
    color: var(--muted);
    font-weight: 500;
    margin-right: 8px;
  }

  .trigger-details .value {
    color: var(--text);
  }

  .conditions {
    margin-bottom: 12px;
  }

  .conditions ul {
    margin: 8px 0 0 0;
    padding-left: 20px;
    list-style: disc;
  }

  .conditions li {
    color: var(--text);
    margin: 4px 0;
    font-size: 13px;
  }

  .message-preview,
  .command-preview,
  .cooldown {
    margin-top: 8px;
  }

  .command-preview code {
    background: var(--bg);
    padding: 4px 8px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: var(--success);
    display: block;
    margin-top: 4px;
    overflow-x: auto;
  }

  /* Triggered Events Tab */
  .events-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .event-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 6px;
    padding: 12px 16px;
    transition: all 0.2s;
  }

  .event-row:hover {
    background: var(--surface-2);
    border-color: var(--surface-2);
  }

  .event-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  .event-details {
    flex: 1;
  }

  .event-header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .event-trigger-name {
    font-weight: 600;
    color: var(--warning);
    font-size: 12px;
  }

  .event-project {
    padding: 2px 8px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    text-transform: lowercase;
    font-family: var(--mono);
  }

  .event-message {
    color: var(--text);
    font-size: 13px;
  }

  .event-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .event-action {
    background: var(--surface-2);
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 11px;
    color: var(--muted);
    text-transform: capitalize;
  }

  .event-time {
    font-size: 12px;
    color: var(--muted);
  }

  /* Statistics Tab */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
  }

  .stat-card.full-width {
    grid-column: 1 / -1;
    text-align: left;
  }

  .stat-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--warning);
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-card h3 {
    color: var(--text);
    font-size: 15px;
    margin-bottom: 10px;
  }

  .trigger-counts {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .count-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: var(--bg);
    border-radius: 6px;
  }

  .count-name {
    color: var(--text);
    font-size: 12px;
    font-weight: 500;
  }

  .count-value {
    background: var(--surface-2);
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 700;
    color: var(--warning);
  }
</style>
