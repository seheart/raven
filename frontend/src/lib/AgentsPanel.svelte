<script>
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';

  let agents = [];
  let loading = true;
  let error = null;
  let refreshInterval;

  onMount(async () => {
    await loadAgents();
    // Auto-refresh every 5 seconds
    refreshInterval = setInterval(loadAgents, 5000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });

  async function loadAgents() {
    try {
      agents = await invoke('get_agents_status');
      error = null;
    } catch (e) {
      error = `Failed to load agents: ${e}`;
      console.error(error);
    } finally {
      loading = false;
    }
  }

  function getStatusIcon(isRunning) {
    return isRunning ? '🟢' : '🔴';
  }

  function getStatusText(isRunning) {
    return isRunning ? 'Running' : 'Offline';
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  }
</script>

<div class="agents-panel">
  <div class="header">
    <h2>🤖 AI Agents</h2>
    <button on:click={loadAgents} class="btn-refresh">
      ↻ Refresh
    </button>
  </div>

  {#if error}
    <div class="message error">{error}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading agents...</div>
  {:else if agents.length === 0}
    <div class="empty">
      <p>No agents detected.</p>
      <p class="hint">Agents will appear here when Raven detects them running (Ollama, LM Studio, etc.)</p>
    </div>
  {:else}
    <div class="agents-grid">
      {#each agents as agent}
        <div class="agent-card" style="border-left-color: {agent.color}">
          <div class="agent-header">
            <div class="agent-icon" style="background-color: {agent.color}">
              {agent.agent_name.charAt(0).toUpperCase()}
            </div>
            <div class="agent-info">
              <h3>{agent.agent_name}</h3>
              <span class="agent-type">{agent.agent_type}</span>
            </div>
            <div class="agent-status" class:running={agent.is_running}>
              <span class="status-icon">{getStatusIcon(agent.is_running)}</span>
              <span class="status-text">{getStatusText(agent.is_running)}</span>
            </div>
          </div>

          <div class="agent-details">
            <div class="detail-row">
              <span class="label">Last Seen:</span>
              <span class="value">{formatTimestamp(agent.last_seen)}</span>
            </div>

            <div class="detail-row">
              <span class="label">Models Available:</span>
              <span class="value">{agent.models_available.length}</span>
            </div>

            {#if agent.models_available.length > 0}
              <div class="models-list">
                <span class="label">Models:</span>
                <div class="models">
                  {#each agent.models_available as model}
                    <span class="model-tag" style="border-color: {agent.color}; color: {agent.color}">
                      {model}
                    </span>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="detail-row">
              <span class="label">Requests Handled:</span>
              <span class="value">{agent.requests_handled}</span>
            </div>

            {#if agent.errors > 0}
              <div class="detail-row">
                <span class="label">Errors:</span>
                <span class="value error-count">{agent.errors}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="footer">
    <p class="hint">
      Raven automatically discovers and monitors AI agents running on your system.
      Supported: Ollama (localhost:11434), LM Studio (localhost:1234)
    </p>
  </div>
</div>

<style>
  .agents-panel {
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

  .btn-refresh {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    background-color: #10b981;
    color: white;
    transition: all 0.2s;
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

  .message.error {
    background-color: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
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
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }

  .agents-grid {
    display: grid;
    gap: 20px;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  }

  .agent-card {
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    border-left-width: 4px;
    border-radius: 8px;
    padding: 20px;
    transition: all 0.2s;
  }

  .agent-card:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  .agent-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .agent-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 24px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .agent-info {
    flex: 1;
  }

  .agent-info h3 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
    text-transform: capitalize;
  }

  .agent-type {
    font-size: 12px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .agent-status {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .status-icon {
    font-size: 16px;
  }

  .status-text {
    font-size: 12px;
    font-weight: 500;
    color: #ef4444;
  }

  .agent-status.running .status-text {
    color: #10b981;
  }

  .agent-details {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
  }

  .label {
    color: #6b7280;
    font-weight: 500;
  }

  .value {
    color: #111827;
    font-weight: 500;
  }

  .error-count {
    color: #ef4444;
    font-weight: 600;
  }

  .models-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .models {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .model-tag {
    padding: 4px 12px;
    border-radius: 12px;
    border: 1px solid;
    font-size: 12px;
    font-weight: 500;
    background-color: white;
  }

  .footer {
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  }

  .footer .hint {
    font-size: 13px;
    color: #6b7280;
    text-align: center;
    line-height: 1.6;
  }

  @media (max-width: 768px) {
    .agents-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
