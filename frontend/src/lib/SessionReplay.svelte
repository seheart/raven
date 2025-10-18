<script>
  import { onMount } from 'svelte';

  const API_BASE = 'http://localhost:3030/api';
  let events = [];
  let allSessions = [];
  let selectedSession = 'all'; // 'all' or a specific session ID
  let loading = true;

  onMount(async () => {
    await loadSessions();
    await loadEvents();
  });

  async function loadSessions() {
    try {
      const response = await fetch(`${API_BASE}/session-id`);
      const data = await response.json();
      const currentSessionId = data.session_id;

      // For now, just show current session (could be expanded to show multiple sessions)
      allSessions = [
        { id: 'all', label: 'All Sessions' },
        { id: currentSessionId, label: `Current Session (${currentSessionId.slice(0, 8)}...)` }
      ];
    } catch (e) {
      console.error('Failed to load sessions:', e);
      allSessions = [{ id: 'all', label: 'All Sessions' }];
    }
  }

  async function loadEvents() {
    try {
      loading = true;
      let url = `${API_BASE}/agent-events?limit=50`;

      // If a specific session is selected, use the session filter endpoint
      if (selectedSession !== 'all') {
        url = `${API_BASE}/events-by-session/${selectedSession}`;
      }

      const response = await fetch(url);
      events = await response.json();
      loading = false;
    } catch (e) {
      console.error('Failed to load events:', e);
      loading = false;
    }
  }

  async function onSessionChange() {
    await loadEvents();
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
  }
</script>

<div class="session-replay">
  <div class="header">
    <h2>🎬 Session Replay</h2>
    <div class="header-controls">
      <div class="filter-group">
        <label for="session-filter">Session:</label>
        <select
          id="session-filter"
          bind:value={selectedSession}
          on:change={onSessionChange}
          class="session-select"
        >
          {#each allSessions as session}
            <option value={session.id}>{session.label}</option>
          {/each}
        </select>
      </div>
      <button on:click={loadEvents} class="btn-refresh">
        ↻ Refresh
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading events...</div>
  {:else if events.length === 0}
    <div class="empty-state">
      <p>No events recorded yet.</p>
      <p>Events will appear here as AI agents make changes.</p>
    </div>
  {:else}
    <div class="timeline">
      <h3>Recent Activity ({events.length} events)</h3>
      <div class="events-list">
        {#each events as event}
          <div class="event-item">
            <div class="event-header">
              <span class="timestamp">{formatTimestamp(event.timestamp)}</span>
              <span class="agent">{event.agent}</span>
              <span class="event-type">{event.event_type}</span>
            </div>
            <div class="event-body">
              <p class="message">{event.message}</p>
              {#if event.file}
                <p class="file">📄 {event.file}</p>
              {/if}
              {#if event.lines_changed}
                <p class="lines">Lines changed: {event.lines_changed}</p>
              {/if}
              {#if event.duration_ms}
                <p class="duration">Duration: {event.duration_ms}ms</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .session-replay {
    padding: 12px;
    background: var(--bg);
    min-height: 80vh;
    color: var(--text);
    font-family: var(--mono);
    width: 100%;
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

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

  .btn-refresh:hover {
    background: var(--surface-2);
    border-color: var(--border);
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .filter-group label {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
  }

  .session-select {
    padding: 8px 16px;
    border: 1px solid var(--surface-2);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .session-select:hover {
    border-color: var(--surface-2);
    background: var(--surface-2);
  }

  .session-select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .loading, .empty-state {
    text-align: center;
    padding: 16px;
    color: var(--muted);
    font-size: 12px;
  }

  .timeline {
    margin-top: 20px;
    padding: 0 20px;
  }

  h3 {
    font-size: 12px;
    margin-bottom: 10px;
    color: var(--text);
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
    padding-bottom: 10px;
  }

  .event-item {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-left: 4px solid var(--accent);
    border-radius: 8px;
    padding: 12px;
    transition: all 0.2s;
  }

  .event-item:hover {
    background: var(--border);
    border-left-color: var(--accent-2);
    transform: translateX(4px);
  }

  .event-header {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .timestamp {
    color: var(--accent-2);
    font-size: 13px;
    font-family: 'Courier New', monospace;
  }

  .agent {
    padding: 4px 12px;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .event-type {
    padding: 4px 12px;
    background: color-mix(in srgb, var(--accent-2) 20%, transparent);
    color: var(--accent-2);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .event-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .message {
    color: var(--text);
    font-size: 12px;
    margin: 0;
  }

  .file, .lines, .duration {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }

  .file {
    font-family: 'Courier New', monospace;
  }

  @media (max-width: 768px) {
    .event-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
