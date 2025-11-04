<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { logger } from './logger.js';

  let totalAgents = 0;
  let activeAgents = 0;
  let totalEvents = 0;
  let totalConversations = 0;
  let topAgents = [];
  let recentActivity = [];
  let agentStats = null;

  let loading = true;
  let error = null;
  let lastUpdated = new Date();

  async function loadAgentsData() {
    try {
      loading = true;
      error = null;

      const [agentsStatus, agentStatsData, conversationsData, eventsData] = await Promise.all([
        fetch('/api/agents-status').then(r => r.json()).catch(() => []),
        fetch('/api/agent-stats').then(r => r.json()).catch(() => ({})),
        fetch('/api/conversations/stats').then(r => r.json()).catch(() => ({ total: 0 })),
        fetch('/api/agent-events?limit=100').then(r => r.json()).catch(() => ({ events: [] }))
      ]);

      const agents = Array.isArray(agentsStatus) ? agentsStatus : [];
      totalAgents = agents.length;
      activeAgents = agents.filter(a => a.is_running).length;

      totalConversations = conversationsData.total || 0;
      agentStats = agentStatsData;

      const events = eventsData.events || [];
      totalEvents = events.length;
      recentActivity = events.slice(0, 5);

      // Get top 5 most active agents
      const agentEventCounts = {};
      events.forEach(e => {
        if (e.agent) {
          agentEventCounts[e.agent] = (agentEventCounts[e.agent] || 0) + 1;
        }
      });

      topAgents = Object.entries(agentEventCounts)
        .map(([name, count]) => ({ name, events: count }))
        .sort((a, b) => b.events - a.events)
        .slice(0, 5);

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load agents data:', err);
      error = err.message;
      loading = false;
    }
  }

  let unsubscribers = [];

  onMount(() => {
    loadAgentsData();
    unsubscribers.push(
      websocketService.subscribe('agent-event', loadAgentsData),
      websocketService.subscribe('file-changed', loadAgentsData)
    );
  });

  onDestroy(() => {
    unsubscribers.forEach(unsub => unsub());
  });
</script>

<div class="agents-overview">
  <div class="header">
    <div class="header-content">
      <h1>🤖 Agents Overview</h1>
      <p class="subtitle">AI agent activity, conversations, and insights</p>
    </div>
    <div class="header-actions">
      <span class="last-updated">Updated {Math.floor((new Date() - lastUpdated) / 1000)}s ago</span>
      <button class="refresh-btn" on:click={loadAgentsData} disabled={loading}>
        {loading ? '⏳' : '🔄'} Refresh
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-banner">
      <span>⚠️ Failed to load agents data: {error}</span>
      <button on:click={loadAgentsData}>Retry</button>
    </div>
  {:else if loading}
    <div class="loading-skeleton">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  {:else}
    <!-- Quick Stats -->
    <div class="stats-grid">
      <a href="#agents-stats" class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-content">
          <div class="stat-value">{totalAgents}</div>
          <div class="stat-label">Total Agents</div>
          <div class="stat-detail">{activeAgents} currently active</div>
        </div>
      </a>

      <a href="#agents-events" class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-content">
          <div class="stat-value">{totalEvents}</div>
          <div class="stat-label">Recent Events</div>
          <div class="stat-detail">Agent activity log</div>
        </div>
      </a>

      <a href="#agents-conversations" class="stat-card">
        <div class="stat-icon">💬</div>
        <div class="stat-content">
          <div class="stat-value">{totalConversations}</div>
          <div class="stat-label">Conversations</div>
          <div class="stat-detail">Total interactions</div>
        </div>
      </a>

      <div class="stat-card featured">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-value">{topAgents.length > 0 ? topAgents[0]?.name || 'N/A' : 'N/A'}</div>
          <div class="stat-label">Most Active Agent</div>
          <div class="stat-detail">{topAgents.length > 0 ? `${topAgents[0]?.events} events` : ''}</div>
        </div>
      </div>
    </div>

    <!-- Top Agents -->
    {#if topAgents.length > 0}
      <div class="section-card">
        <h2>🏆 Top Active Agents</h2>
        <div class="agents-list">
          {#each topAgents as agent, index}
            <div class="agent-item">
              <span class="agent-rank">#{index + 1}</span>
              <div class="agent-info">
                <div class="agent-name">{agent.name}</div>
                <div class="agent-meta">{agent.events} events</div>
              </div>
              <div class="agent-badge">
                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐'}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Recent Activity -->
    {#if recentActivity.length > 0}
      <div class="section-card">
        <h2>🔄 Recent Activity</h2>
        <div class="activity-list">
          {#each recentActivity as event}
            <div class="activity-item">
              <span class="activity-icon">
                {event.action === 'edit' ? '✏️' : event.action === 'create' ? '➕' : '🗑️'}
              </span>
              <div class="activity-content">
                <div class="activity-title">{event.agent || 'Unknown'}</div>
                <div class="activity-meta">{event.message || event.filepath}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Agent Insights -->
    {#if agentStats}
      <div class="section-card">
        <h2>💡 Agent Insights</h2>
        <div class="insights-grid">
          <div class="insight-item">
            <div class="insight-icon">📈</div>
            <div>
              <div class="insight-value">{agentStats.total_edits || 0}</div>
              <div class="insight-label">Total Edits</div>
            </div>
          </div>
          <div class="insight-item">
            <div class="insight-icon">📝</div>
            <div>
              <div class="insight-value">{agentStats.total_files || 0}</div>
              <div class="insight-label">Files Touched</div>
            </div>
          </div>
          <div class="insight-item">
            <div class="insight-icon">⏱️</div>
            <div>
              <div class="insight-value">{agentStats.avg_session_duration ? Math.round(agentStats.avg_session_duration / 60) + 'm' : 'N/A'}</div>
              <div class="insight-label">Avg Session</div>
            </div>
          </div>
          <div class="insight-item">
            <div class="insight-icon">🎯</div>
            <div>
              <div class="insight-value">{totalEvents > 0 && totalAgents > 0 ? Math.round(totalEvents / totalAgents) : 0}</div>
              <div class="insight-label">Events per Agent</div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>🚀 Quick Actions</h2>
      <div class="actions-grid">
        <a href="#agents-stats" class="action-card">
          <div class="action-icon">📊</div>
          <div class="action-title">Agent Stats</div>
          <div class="action-description">View detailed metrics</div>
        </a>

        <a href="#agents-conversations" class="action-card">
          <div class="action-icon">💬</div>
          <div class="action-title">Conversations</div>
          <div class="action-description">Browse all interactions</div>
        </a>

        <a href="#agents-events" class="action-card">
          <div class="action-icon">⚡</div>
          <div class="action-title">Event Log</div>
          <div class="action-description">Agent activity timeline</div>
        </a>

        <a href="#agents-insights" class="action-card">
          <div class="action-icon">🔍</div>
          <div class="action-title">Insights</div>
          <div class="action-description">Performance analytics</div>
        </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .agents-overview {
    padding: 1rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: var(--space-lg);
  }

  .header-content h1 {
    margin: 0;
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.25rem 0 0 0;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  .last-updated {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .refresh-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    cursor: pointer;
    font-size: 0.9rem;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--primary);
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin-bottom: 1rem;
  }

  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 0.65rem 0.85rem;
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    text-decoration: none;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .stat-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .stat-card.featured {
    border-color: var(--primary);
    background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(99, 102, 241, 0.05) 100%);
  }

  .stat-icon {
    font-size: 1.65rem;
    flex-shrink: 0;
    line-height: 1;
  }

  .stat-content {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .stat-value {
    font-size: 1.65rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stat-label {
    color: var(--text-secondary);
    font-size: 0.82rem;
    margin: 0;
    line-height: 1.1;
    font-weight: 500;
  }

  .stat-detail {
    font-size: 0.72rem;
    color: var(--text-tertiary);
    line-height: 1.2;
    margin: 0;
    flex-basis: 100%;
  }

  /* Section Card */
  .section-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .section-card h2 {
    margin: 0 0 0.75rem 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
  }

  /* Agents List */
  .agents-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .agent-item {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: 0.65rem 0.85rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
  }

  .agent-rank {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-tertiary);
    min-width: 30px;
    text-align: center;
    line-height: 1;
  }

  .agent-info {
    flex: 1;
    min-width: 0;
  }

  .agent-name {
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.15rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .agent-meta {
    font-size: 0.72rem;
    color: var(--text-secondary);
    line-height: 1.2;
    margin: 0;
  }

  .agent-badge {
    font-size: 1.35rem;
    flex-shrink: 0;
    line-height: 1;
  }

  /* Activity List */
  .activity-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .activity-item {
    display: flex;
    gap: var(--space-lg);
    padding: 0.65rem 0.85rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
  }

  .activity-icon {
    font-size: 1.35rem;
    flex-shrink: 0;
    line-height: 1;
  }

  .activity-content {
    flex: 1;
    min-width: 0;
  }

  .activity-title {
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.15rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .activity-meta {
    font-size: 0.72rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
    margin: 0;
  }

  /* Agent Insights */
  .insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-lg);
  }

  .insight-item {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: 0.65rem 0.85rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
  }

  .insight-icon {
    font-size: 1.65rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .insight-value {
    font-size: var(--icon-md);
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin: 0 0 0.15rem 0;
  }

  .insight-label {
    font-size: 0.72rem;
    color: var(--text-secondary);
    line-height: 1.2;
    margin: 0;
  }

  /* Quick Actions */
  .quick-actions h2 {
    margin: 0 0 0.75rem 0;
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-lg);
  }

  .action-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 0.65rem 0.85rem;
    text-decoration: none;
    transition: all var(--duration-base) var(--ease-smooth);
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .action-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }

  .action-icon {
    font-size: 1.65rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .action-title {
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.15rem 0;
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .action-description {
    font-size: 0.72rem;
    color: var(--text-secondary);
    line-height: 1.2;
    margin: 0;
  }

  /* Loading & Error States */
  .loading-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--space-2xl);
  }

  .skeleton-card {
    height: 150px;
    background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
    border-radius: var(--radius-xl);
  }

  @keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--error);
    border-radius: var(--radius-xl);
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .error-banner button {
    padding: 0.5rem 1rem;
    background: var(--error);
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .agents-overview {
      padding: 1rem;
    }

    .header {
      flex-direction: column;
    }

    .stats-grid,
    .actions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
