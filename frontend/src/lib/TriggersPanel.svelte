<script>
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  let triggers = [];
  let triggeredEvents = [];
  let stats = {
    total_triggers: 0,
    active_triggers: 0,
    trigger_counts: {}
  };
  let loading = true;
  let error = null;

  // Selected tab
  let selectedTab = 'rules'; // 'rules' | 'events' | 'stats'

  // Reload message
  let reloadMessage = '';

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    error = null;

    try {
      triggers = await invoke('get_triggers_config');
      triggeredEvents = await invoke('get_triggered_events', { limit: 100 });
      stats = await invoke('get_trigger_stats');
    } catch (e) {
      error = `Failed to load triggers: ${e}`;
      console.error(error);
    } finally {
      loading = false;
    }
  }

  async function reloadConfig() {
    try {
      const message = await invoke('reload_triggers_config');
      reloadMessage = message;
      setTimeout(() => reloadMessage = '', 3000);
      await loadData();
    } catch (e) {
      error = `Failed to reload config: ${e}`;
    }
  }

  async function clearCooldowns() {
    try {
      const message = await invoke('clear_trigger_cooldowns');
      reloadMessage = message;
      setTimeout(() => reloadMessage = '', 3000);
    } catch (e) {
      error = `Failed to clear cooldowns: ${e}`;
    }
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
  }

  function getActionIcon(action) {
    switch (action) {
      case 'notify': return '🔔';
      case 'log': return '📝';
      case 'command': return '⚙️';
      default: return '❓';
    }
  }

  function getActionColor(action) {
    switch (action) {
      case 'notify': return '#3b82f6'; // blue
      case 'log': return '#10b981'; // green
      case 'command': return '#f59e0b'; // amber
      default: return '#6b7280'; // gray
    }
  }
</script>

<div class="triggers-panel">
  <div class="header">
    <h2>🎯 Custom Triggers</h2>
    <div class="actions">
      <button on:click={reloadConfig} class="btn-reload">
        🔄 Reload Config
      </button>
      <button on:click={clearCooldowns} class="btn-clear">
        ⏰ Clear Cooldowns
      </button>
      <button on:click={loadData} class="btn-refresh">
        ↻ Refresh
      </button>
    </div>
  </div>

  {#if reloadMessage}
    <div class="message success">{reloadMessage}</div>
  {/if}

  {#if error}
    <div class="message error">{error}</div>
  {/if}

  <div class="tabs">
    <button
      class:active={selectedTab === 'rules'}
      on:click={() => selectedTab = 'rules'}
    >
      📋 Trigger Rules ({triggers.length})
    </button>
    <button
      class:active={selectedTab === 'events'}
      on:click={() => selectedTab = 'events'}
    >
      🔔 Triggered Events ({triggeredEvents.length})
    </button>
    <button
      class:active={selectedTab === 'stats'}
      on:click={() => selectedTab = 'stats'}
    >
      📊 Statistics
    </button>
  </div>

  {#if loading}
    <div class="loading">Loading triggers...</div>
  {:else}
    <div class="content">
      {#if selectedTab === 'rules'}
        <div class="rules-list">
          {#if triggers.length === 0}
            <div class="empty">
              <p>No triggers configured.</p>
              <p class="hint">Edit <code>.raven/config.toml</code> to add trigger rules.</p>
            </div>
          {:else}
            {#each triggers as trigger}
              <div class="trigger-rule">
                <div class="rule-header">
                  <span class="action-icon" style="color: {getActionColor(trigger.action)}">
                    {getActionIcon(trigger.action)}
                  </span>
                  <h3>{trigger.name}</h3>
                  <span class="action-badge" style="background-color: {getActionColor(trigger.action)}">
                    {trigger.action}
                  </span>
                </div>

                <div class="rule-conditions">
                  {#if trigger.file}
                    <div class="condition">
                      <span class="label">File:</span>
                      <code>{trigger.file}</code>
                    </div>
                  {/if}
                  {#if trigger.agent}
                    <div class="condition">
                      <span class="label">Agent:</span>
                      <code>{trigger.agent}</code>
                    </div>
                  {/if}
                  {#if trigger.event_type}
                    <div class="condition">
                      <span class="label">Event:</span>
                      <code>{trigger.event_type}</code>
                    </div>
                  {/if}
                  {#if trigger.lines_changed}
                    <div class="condition">
                      <span class="label">Lines:</span>
                      <code>{trigger.lines_changed}</code>
                    </div>
                  {/if}
                  {#if trigger.duration_ms}
                    <div class="condition">
                      <span class="label">Duration:</span>
                      <code>{trigger.duration_ms}ms</code>
                    </div>
                  {/if}
                  {#if trigger.cpu_percent}
                    <div class="condition">
                      <span class="label">CPU:</span>
                      <code>{trigger.cpu_percent}%</code>
                    </div>
                  {/if}
                  {#if trigger.memory_percent}
                    <div class="condition">
                      <span class="label">Memory:</span>
                      <code>{trigger.memory_percent}%</code>
                    </div>
                  {/if}
                </div>

                {#if trigger.message}
                  <div class="rule-message">
                    <span class="label">Message:</span>
                    <span class="message-text">{trigger.message}</span>
                  </div>
                {/if}

                {#if trigger.command}
                  <div class="rule-command">
                    <span class="label">Command:</span>
                    <code>{trigger.command}</code>
                  </div>
                {/if}

                <div class="rule-footer">
                  <span class="cooldown">
                    ⏱️ Cooldown: {trigger.cooldown_seconds}s
                  </span>
                  {#if stats.trigger_counts[trigger.name]}
                    <span class="trigger-count">
                      Triggered: {stats.trigger_counts[trigger.name]} times
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}

      {#if selectedTab === 'events'}
        <div class="events-list">
          {#if triggeredEvents.length === 0}
            <div class="empty">
              <p>No triggers have fired yet.</p>
              <p class="hint">Triggers will appear here when conditions are met.</p>
            </div>
          {:else}
            {#each triggeredEvents as event}
              <div class="triggered-event">
                <div class="event-header">
                  <span class="action-icon" style="color: {getActionColor(event.action)}">
                    {getActionIcon(event.action)}
                  </span>
                  <h4>{event.trigger_name}</h4>
                  <span class="timestamp">{formatTimestamp(event.timestamp)}</span>
                </div>
                <div class="event-message">{event.message}</div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}

      {#if selectedTab === 'stats'}
        <div class="stats-panel">
          <div class="stat-card">
            <div class="stat-value">{stats.active_triggers}</div>
            <div class="stat-label">Active Triggers</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">{stats.total_triggers}</div>
            <div class="stat-label">Total Fired</div>
          </div>

          <div class="stat-card">
            <div class="stat-value">
              {Object.keys(stats.trigger_counts).length}
            </div>
            <div class="stat-label">Unique Triggers</div>
          </div>

          {#if Object.keys(stats.trigger_counts).length > 0}
            <div class="trigger-counts">
              <h3>Trigger Counts</h3>
              <table>
                <thead>
                  <tr>
                    <th>Trigger Name</th>
                    <th>Times Fired</th>
                  </tr>
                </thead>
                <tbody>
                  {#each Object.entries(stats.trigger_counts).sort((a, b) => b[1] - a[1]) as [name, count]}
                    <tr>
                      <td>{name}</td>
                      <td class="count-cell">{count}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .triggers-panel {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
    font-family: 'Inter', sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 10px;
  }

  button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .btn-reload {
    background-color: #3b82f6;
    color: white;
  }

  .btn-reload:hover {
    background-color: #2563eb;
  }

  .btn-clear {
    background-color: #f59e0b;
    color: white;
  }

  .btn-clear:hover {
    background-color: #d97706;
  }

  .btn-refresh {
    background-color: #10b981;
    color: white;
  }

  .btn-refresh:hover {
    background-color: #059669;
  }

  .message {
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 20px;
    font-size: 14px;
  }

  .message.success {
    background-color: #d1fae5;
    color: #065f46;
    border: 1px solid #6ee7b7;
  }

  .message.error {
    background-color: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }

  .tabs {
    display: flex;
    gap: 5px;
    margin-bottom: 20px;
    border-bottom: 2px solid #e5e7eb;
  }

  .tabs button {
    padding: 10px 20px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    color: #6b7280;
    font-weight: 500;
  }

  .tabs button.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }

  .tabs button:hover {
    background-color: #f3f4f6;
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: #6b7280;
  }

  .empty {
    text-align: center;
    padding: 40px;
    color: #6b7280;
  }

  .empty .hint {
    font-size: 14px;
    margin-top: 10px;
  }

  .empty code {
    background-color: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Fira Code', monospace;
  }

  /* Trigger Rules */
  .rules-list {
    display: grid;
    gap: 15px;
  }

  .trigger-rule {
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
  }

  .rule-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .action-icon {
    font-size: 20px;
  }

  .rule-header h3 {
    margin: 0;
    font-size: 18px;
    flex: 1;
  }

  .action-badge {
    padding: 4px 12px;
    border-radius: 12px;
    color: white;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .rule-conditions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
  }

  .condition {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .label {
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
  }

  code {
    background-color: #e5e7eb;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: 'Fira Code', monospace;
    font-size: 13px;
  }

  .rule-message {
    padding: 8px 12px;
    background-color: #eff6ff;
    border-left: 3px solid #3b82f6;
    border-radius: 4px;
    margin-bottom: 12px;
    display: flex;
    gap: 8px;
  }

  .message-text {
    flex: 1;
    font-size: 14px;
  }

  .rule-command {
    padding: 8px 12px;
    background-color: #fef3c7;
    border-left: 3px solid #f59e0b;
    border-radius: 4px;
    margin-bottom: 12px;
    display: flex;
    gap: 8px;
  }

  .rule-footer {
    display: flex;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
    color: #6b7280;
  }

  .cooldown {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .trigger-count {
    font-weight: 500;
    color: #3b82f6;
  }

  /* Triggered Events */
  .events-list {
    display: grid;
    gap: 12px;
  }

  .triggered-event {
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 16px;
  }

  .event-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .event-header h4 {
    margin: 0;
    font-size: 16px;
    flex: 1;
  }

  .timestamp {
    font-size: 13px;
    color: #6b7280;
  }

  .event-message {
    font-size: 14px;
    color: #374151;
    padding-left: 30px;
  }

  /* Statistics */
  .stats-panel {
    display: grid;
    gap: 20px;
  }

  .stat-card {
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
  }

  .stat-value {
    font-size: 36px;
    font-weight: 700;
    color: #3b82f6;
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 14px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .trigger-counts {
    grid-column: 1 / -1;
  }

  .trigger-counts h3 {
    margin-bottom: 15px;
    font-size: 18px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background-color: white;
    border-radius: 8px;
    overflow: hidden;
  }

  thead {
    background-color: #f3f4f6;
  }

  th {
    padding: 12px;
    text-align: left;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  td {
    padding: 12px;
    border-top: 1px solid #e5e7eb;
    font-size: 14px;
  }

  .count-cell {
    text-align: center;
    font-weight: 600;
    color: #3b82f6;
  }

  @media (min-width: 768px) {
    .stats-panel {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>
