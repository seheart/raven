<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Agents Overview Page
   * Modern dashboard showing agent activity, stats, and insights
   */

  import { navigate } from '../utils/router.svelte.js';
  import AgentsNav from '../components/layout/AgentsNav.svelte';

  // State
  let stats = $state({
    total_agents: 0,
    active_agents: 0,
    total_events: 0,
    total_conversations: 0
  });
  let topAgents = $state([]);
  let recentActivity = $state([]);
  let agentInsights = $state({
    most_active_today: null,
    avg_events_per_agent: 0,
    total_duration_hours: 0
  });
  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(new Date());

  // Derived
  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  // Format functions
  function formatNumber(num) {
    return num?.toLocaleString() || '0';
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  function formatDuration(seconds) {
    if (!seconds) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Load all data
  async function loadAllData(manual = false) {
    try {
      if (manual || loading) {
        loading = true;
      }
      error = null;

      // Fetch all data in parallel
      const [agentStatusData, agentStatsData, conversationStatsData, agentEventsData] = await Promise.all([
        api.get('/agents-status').catch(() => ({ agents: [] })),
        api.get('/agent-stats').catch(() => ({ stats: [] })),
        api.get('/conversations/stats').catch(() => ({ total: 0 })),
        api.get('/agent-events?limit=100').catch(() => ({ events: [] }))
      ]);

      // Process agent status
      const agents = Array.isArray(agentStatusData) ? agentStatusData : (agentStatusData.agents || []);
      stats.total_agents = agents.length;
      stats.active_agents = agents.filter(a => a.is_running || a.confidence > 0.7).length;

      // Process agent stats
      const agentStats = Array.isArray(agentStatsData) ? agentStatsData : (agentStatsData.stats || []);
      const sortedByEvents = [...agentStats].sort((a, b) => (b.total_events || 0) - (a.total_events || 0));
      topAgents = sortedByEvents.slice(0, 5);

      // Calculate total events
      stats.total_events = agentStats.reduce((sum, agent) => sum + (agent.total_events || 0), 0);

      // Process conversations
      stats.total_conversations = conversationStatsData.total || 0;

      // Process recent activity (last 10 events)
      const events = Array.isArray(agentEventsData) ? agentEventsData : (agentEventsData.events || []);
      recentActivity = events.slice(0, 10);

      // Calculate insights
      if (agentStats.length > 0) {
        agentInsights.avg_events_per_agent = Math.round(stats.total_events / agentStats.length);
        agentInsights.total_duration_hours = agentStats.reduce((sum, agent) =>
          sum + (agent.total_duration_seconds || 0), 0) / 3600;

        // Find most active today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEvents = events.filter(e => new Date(e.timestamp) >= today);
        const agentEventCounts = {};
        todayEvents.forEach(e => {
          const agent = e.agent_name || 'Unknown';
          agentEventCounts[agent] = (agentEventCounts[agent] || 0) + 1;
        });
        const mostActive = Object.entries(agentEventCounts).sort((a, b) => b[1] - a[1])[0];
        agentInsights.most_active_today = mostActive ? mostActive[0] : null;
      }

      loading = false;
      lastUpdated = new Date();
    } catch (err) {
      logger.error('Failed to load agents data:', err);
      error = err.message;
      loading = false;
    }
  }

  // Load on mount
  $effect(() => {
    loadAllData();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] pb-20">
  <AgentsNav />
  <div class="max-w-7xl mx-auto space-y-6 px-6">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">AI Agents Overview</h1>
        <p class="text-base text-[var(--muted)] font-sans">Monitor agent activity, conversations, and insights</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-sans">Updated {timeAgo}</span>
        <button
          onclick={() => loadAllData(true)}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 flex justify-between items-center">
        <span class="text-base text-[var(--error)] font-sans">⚠️ Failed to load agents data: {error}</span>
        <button onclick={() => loadAllData(true)} class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans">
          Retry
        </button>
      </div>
    {/if}

    <!-- Stats Grid -->
    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _, i (i)}
          <div class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4">
          <div class="text-3xl flex-shrink-0">🤖</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {formatNumber(stats.total_agents)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">Total Agents</div>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4">
          <div class="text-3xl flex-shrink-0">✅</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--success)] leading-none mb-1">
              {formatNumber(stats.active_agents)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">Active Agents</div>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4">
          <div class="text-3xl flex-shrink-0">📊</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {formatNumber(stats.total_events)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">Total Events</div>
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4">
          <div class="text-3xl flex-shrink-0">💬</div>
          <div class="flex-1">
            <div class="text-2xl font-bold text-[var(--text-heading)] leading-none mb-1">
              {formatNumber(stats.total_conversations)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">Conversations</div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Top 5 Most Active Agents -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
      <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">Top 5 Most Active Agents</h2>
      {#if loading}
        <div class="text-center py-8 text-base text-[var(--muted)]">Loading agents...</div>
      {:else if topAgents.length === 0}
        <div class="text-center py-8">
          <span class="text-2xl block mb-2">🤖</span>
          <p class="text-base text-[var(--muted)] font-sans">No agent activity detected</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {#each topAgents as agent, i (i)}
            {@const avgDurationMs = agent.total_events > 0
              ? (agent.total_duration_seconds * 1000) / agent.total_events
              : 0}
            {@const isSlow = avgDurationMs > 5000}
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition-all relative">
              {#if isSlow}
                <span
                  class="absolute top-2 right-2 text-base animate-pulse"
                  title="Slow response time detected (avg > 5s)"
                  style="animation: pulse 2s ease-in-out infinite;"
                >
                  ⚠️
                </span>
              {/if}
              <div class="flex items-center gap-2 mb-3">
                <span class="text-xl">🤖</span>
                <span class="text-sm font-semibold text-[var(--text)] font-mono truncate flex-1">
                  {agent.agent_name || 'Unknown'}
                </span>
              </div>
              <div class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-[var(--muted)]">Events:</span>
                  <span class="text-[var(--accent)] font-semibold font-mono">
                    {formatNumber(agent.total_events)}
                  </span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-[var(--muted)]">Duration:</span>
                  <span class="text-[var(--text)] font-semibold font-mono">
                    {formatDuration(agent.total_duration_seconds)}
                  </span>
                </div>
                {#if isSlow}
                  <div class="mt-2 px-2 py-1 bg-[var(--warning-subtle)] border border-[var(--warning)] rounded text-xs text-[var(--warning)] font-sans">
                    Slow: {(avgDurationMs / 1000).toFixed(1)}s avg
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Recent Activity Stream -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold text-[var(--text-heading)] font-sans">Recent Activity</h2>
        <span class="flex items-center gap-2 text-sm text-[var(--success)] font-mono">
          <span class="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse"></span>
          Live
        </span>
      </div>

      {#if loading}
        <div class="text-center py-8 text-base text-[var(--muted)]">Loading activity...</div>
      {:else if recentActivity.length === 0}
        <div class="text-center py-8">
          <span class="text-2xl block mb-2">💤</span>
          <p class="text-base text-[var(--muted)] font-sans">No recent activity</p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each recentActivity as event (event.id || event.timestamp)}
            <div class="flex items-start gap-3 p-3 bg-[var(--bg)] rounded hover:bg-[var(--surface-2)] transition-all">
              <span class="text-base flex-shrink-0 mt-1">
                {#if event.event_type === 'file_change'}
                  📝
                {:else if event.event_type === 'command'}
                  ⚡
                {:else if event.event_type === 'conversation'}
                  💬
                {:else}
                  🔔
                {/if}
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-base text-[var(--text)] font-mono mb-1">
                  {#if event.agent_name}
                    <span class="inline-block px-2 py-0.5 mr-2 bg-[var(--accent)] text-white rounded text-sm font-semibold uppercase tracking-wide">
                      {event.agent_name}
                    </span>
                  {/if}
                  <span>{event.description || event.event_type || 'Activity'}</span>
                </div>
                <div class="text-sm text-[var(--muted)] font-mono">
                  {event.event_type} • {formatDateTime(event.timestamp)}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Agent Insights -->
    <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
      <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">Agent Insights</h2>
      {#if loading}
        <div class="text-center py-8 text-base text-[var(--muted)]">Loading insights...</div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-[var(--bg)] rounded-lg p-4">
            <div class="text-sm text-[var(--muted)] mb-2 font-sans">Most Active Today</div>
            <div class="text-xl font-bold text-[var(--accent)] font-mono">
              {agentInsights.most_active_today || 'N/A'}
            </div>
          </div>
          <div class="bg-[var(--bg)] rounded-lg p-4">
            <div class="text-sm text-[var(--muted)] mb-2 font-sans">Avg Events per Agent</div>
            <div class="text-xl font-bold text-[var(--accent)] font-mono">
              {formatNumber(agentInsights.avg_events_per_agent)}
            </div>
          </div>
          <div class="bg-[var(--bg)] rounded-lg p-4">
            <div class="text-sm text-[var(--muted)] mb-2 font-sans">Total Duration</div>
            <div class="text-xl font-bold text-[var(--accent)] font-mono">
              {agentInsights.total_duration_hours.toFixed(1)}h
            </div>
          </div>
        </div>
      {/if}
    </section>

    <!-- Quick Actions -->
    <section>
      <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">Quick Actions</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          onclick={() => navigate('/agents/stats')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
        >
          <div class="text-2xl flex-shrink-0">📊</div>
          <div>
            <div class="text-base font-semibold text-[var(--text-heading)] font-sans">Agent Stats</div>
            <div class="text-sm text-[var(--muted)] font-sans">Detailed statistics</div>
          </div>
        </button>

        <button
          onclick={() => navigate('/agents/monitoring')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
        >
          <div class="text-2xl flex-shrink-0">📡</div>
          <div>
            <div class="text-base font-semibold text-[var(--text-heading)] font-sans">Live Monitoring</div>
            <div class="text-sm text-[var(--muted)] font-sans">Real-time tracking</div>
          </div>
        </button>

        <button
          onclick={() => navigate('/agents/conversations')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
        >
          <div class="text-2xl flex-shrink-0">💬</div>
          <div>
            <div class="text-base font-semibold text-[var(--text-heading)] font-sans">Conversations</div>
            <div class="text-sm text-[var(--muted)] font-sans">View interactions</div>
          </div>
        </button>

        <button
          onclick={() => navigate('/agents/setup')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3 hover:border-[var(--accent)] transition-all hover:-translate-y-0.5 text-left"
        >
          <div class="text-2xl flex-shrink-0">⚙️</div>
          <div>
            <div class="text-base font-semibold text-[var(--text-heading)] font-sans">Setup Guide</div>
            <div class="text-sm text-[var(--muted)] font-sans">Integration help</div>
          </div>
        </button>

        <button
          onclick={loadAllData}
          class="bg-[var(--accent)] border border-[var(--accent)] rounded-lg p-4 flex items-center gap-3 hover:opacity-90 transition-all hover:-translate-y-0.5 text-left text-white"
        >
          <div class="text-2xl flex-shrink-0">🔄</div>
          <div>
            <div class="text-base font-semibold font-sans">Refresh Data</div>
            <div class="text-sm opacity-90 font-sans">Update all stats</div>
          </div>
        </button>
      </div>
    </section>
  </div>
</div>
