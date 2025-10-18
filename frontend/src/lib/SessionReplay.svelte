<script>
  import { onMount } from 'svelte';

  const API_BASE = 'http://localhost:3030/api';
  let events = [];
  let loading = true;

  onMount(async () => {
    await loadEvents();
  });

  async function loadEvents() {
    try {
      const response = await fetch(`${API_BASE}/agent-events?limit=50`);
      events = await response.json();
      loading = false;
    } catch (e) {
      console.error('Failed to load events:', e);
      loading = false;
    }
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
  }
</script>

<div class="session-replay">
  <div class="header">
    <h2>🎬 Session Replay</h2>
    <button on:click={loadEvents} class="btn-refresh">
      ↻ Refresh
    </button>
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
    padding: 0;
    background: #0f0f0f;
    min-height: 80vh;
    color: #e5e5e5;
    font-family: 'Inter', sans-serif;
    width: 100%;
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding: 20px;
    padding-bottom: 20px;
    border-bottom: 2px solid #1f1f1f;
  }

  h2 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(135deg, #FF6B35 0%, #F7931A 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .btn-refresh {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    transition: all 0.2s;
  }

  .btn-refresh:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .loading, .empty-state {
    text-align: center;
    padding: 60px;
    color: #6b7280;
    font-size: 16px;
  }

  .timeline {
    margin-top: 20px;
    padding: 0 20px;
  }

  h3 {
    font-size: 20px;
    margin-bottom: 20px;
    color: #e5e5e5;
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
    padding-bottom: 20px;
  }

  .event-item {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-left: 4px solid #FF6B35;
    border-radius: 8px;
    padding: 20px;
    transition: all 0.2s;
  }

  .event-item:hover {
    background: #1f1f1f;
    border-left-color: #F7931A;
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
    color: #4ECDC4;
    font-size: 13px;
    font-family: 'Courier New', monospace;
  }

  .agent {
    padding: 4px 12px;
    background: rgba(255, 107, 53, 0.2);
    color: #FF6B35;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .event-type {
    padding: 4px 12px;
    background: rgba(78, 205, 196, 0.2);
    color: #4ECDC4;
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
    color: #e5e5e5;
    font-size: 14px;
    margin: 0;
  }

  .file, .lines, .duration {
    color: #9ca3af;
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
