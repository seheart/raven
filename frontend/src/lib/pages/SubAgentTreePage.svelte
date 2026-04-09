<script>
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();
  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';

  // State
  let sessions = $state([]);
  let stats = $state({ total: 0, by_type: [], by_model: [] });
  let selectedSession = $state(null);
  let treeData = $state([]);
  let loading = $state(true);
  let treeLoading = $state(false);
  let lastUpdated = $state(null);

  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  });

  // Build tree from flat list
  const tree = $derived.by(() => {
    if (treeData.length === 0) return [];

    // Group by parent
    const byParent = new Map();
    const roots = [];

    for (const node of treeData) {
      if (!node.parent_agent_id) {
        roots.push(node);
      } else {
        if (!byParent.has(node.parent_agent_id)) {
          byParent.set(node.parent_agent_id, []);
        }
        byParent.get(node.parent_agent_id).push(node);
      }
    }

    function buildTree(node, depth = 0) {
      const children = byParent.get(node.agent_id) || [];
      return {
        ...node,
        depth,
        children: children.map(c => buildTree(c, depth + 1))
      };
    }

    // If no clear roots, treat all as roots
    if (roots.length === 0) return treeData.map(n => ({ ...n, depth: 0, children: [] }));
    return roots.map(r => buildTree(r));
  });

  async function loadData() {
    try {
      loading = true;
      const [sessionsData, statsData] = await Promise.all([
        api.get('/subagents/sessions').catch(() => []),
        api.get('/subagents/stats').catch(() => ({ total: 0, by_type: [], by_model: [] }))
      ]);
      sessions = Array.isArray(sessionsData) ? sessionsData : [];
      stats = statsData;
      lastUpdated = new Date();

      // Auto-select first session
      if (sessions.length > 0 && !selectedSession) {
        await selectSession(sessions[0].session_id);
      }
    } catch (err) {
      logger.error('Failed to load subagent data:', err);
    } finally {
      loading = false;
    }
  }

  async function selectSession(sessionId) {
    try {
      treeLoading = true;
      selectedSession = sessionId;
      const data = await api.get(`/subagents/tree/${sessionId}`).catch(() => []);
      treeData = Array.isArray(data) ? data : [];
    } catch (err) {
      logger.error('Failed to load agent tree:', err);
    } finally {
      treeLoading = false;
    }
  }

  function formatCost(usd) {
    if (!usd || usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(3)}`;
  }

  function formatTokens(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  function getTypeColor(type) {
    const colors = {
      'general-purpose': '#FF6B35',
      'Explore': '#10A37F',
      'Plan': '#4285F4',
      'code-reviewer': '#F39C12',
    };
    return colors[type] || '#6b7280';
  }

  function formatTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  onMount(() => {
    websocketService.connect();
    loadData();

    const onSpawn = () => loadData();
    websocketService.on('subagent-spawn', onSpawn);

    return () => {
      abortRequests();
      websocketService.off('subagent-spawn', onSpawn);
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Sub-Agent Tree</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Visualize parent-child agent relationships and resource usage
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-[var(--muted)] font-mono">{timeAgo}</span>
        <button
          onclick={loadData}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    {#if loading && sessions.length === 0}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {#each Array(3) as _, i (i)}
          <div class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else}
      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Total Sub-Agents</div>
          <div class="text-2xl font-bold text-[var(--accent)] font-mono">{stats.total}</div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Sessions</div>
          <div class="text-2xl font-bold text-[var(--text)] font-mono">{sessions.length}</div>
        </div>
        {#each stats.by_type?.slice(0, 2) || [] as typeInfo (typeInfo.agent_type)}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
            <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">{typeInfo.agent_type}</div>
            <div class="text-2xl font-bold text-[var(--text)] font-mono">{typeInfo.count}</div>
          </div>
        {/each}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <!-- Session List -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-3">Sessions</h3>
          <div class="space-y-1 max-h-96 overflow-y-auto">
            {#each sessions as session (session.session_id)}
              <button
                onclick={() => selectSession(session.session_id)}
                class="w-full text-left px-3 py-2 rounded text-sm transition-colors border-0 cursor-pointer {selectedSession === session.session_id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--border)]'}"
              >
                <div class="font-medium truncate">{session.project_name || session.session_id?.slice(0, 12)}</div>
                <div class="text-xs {selectedSession === session.session_id ? 'text-white/70' : 'text-[var(--muted)]'}">{session.agent_count} agents · {formatTime(session.last_spawn)}</div>
              </button>
            {/each}
            {#if sessions.length === 0}
              <p class="text-xs text-[var(--muted)] text-center py-4">No sessions with sub-agents</p>
            {/if}
          </div>
        </div>

        <!-- Agent Tree -->
        <div class="md:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-3">Agent Tree</h3>

          {#if treeLoading}
            <div class="py-8 text-center text-sm text-[var(--muted)]">Loading tree...</div>
          {:else if treeData.length === 0}
            <div class="py-8 text-center text-sm text-[var(--muted)]">
              {selectedSession ? 'No sub-agents in this session' : 'Select a session to view the agent tree'}
            </div>
          {:else}
            <div class="space-y-1">
              {#each tree as node (node.agent_id)}
                {@render treeNode(node)}
              {/each}
            </div>
          {/if}
        </div>
      </div>

      {#if stats.total === 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-12 text-center mt-6">
          <div class="text-4xl mb-4">🌳</div>
          <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2">No sub-agent activity recorded</h3>
          <p class="text-sm text-[var(--muted)]">
            Sub-agent trees will appear here when Claude Code spawns agents via the Agent tool.
          </p>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#snippet treeNode(node)}
  <div style="margin-left: {node.depth * 24}px">
    <div class="flex items-center gap-3 py-2 px-3 rounded bg-[var(--bg)] hover:bg-[var(--border)] transition-colors">
      <!-- Connector line -->
      {#if node.depth > 0}
        <span class="text-[var(--muted)] text-xs">└─</span>
      {/if}

      <!-- Type badge -->
      <span
        class="px-2 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap"
        style="background-color: {getTypeColor(node.agent_type)}"
      >
        {node.agent_type || 'agent'}
      </span>

      <!-- Description -->
      <span class="text-sm text-[var(--text)] flex-1 truncate" title={node.description}>
        {node.description || node.agent_id?.slice(0, 12) || 'Unknown agent'}
      </span>

      <!-- Model -->
      {#if node.model}
        <span class="text-xs text-[var(--muted)] hidden md:inline">{node.model}</span>
      {/if}

      <!-- Tokens / Cost -->
      {#if (node.tokens?.cost_usd ?? 0) > 0}
        <span class="text-xs text-[var(--muted)]">{formatTokens((node.tokens?.input_tokens ?? 0) + (node.tokens?.output_tokens ?? 0))} tok</span>
        <span class="text-xs font-mono text-[var(--accent)] font-semibold">{formatCost(node.tokens?.cost_usd ?? 0)}</span>
      {/if}

      <!-- Timestamp -->
      <span class="text-xs text-[var(--muted)] hidden lg:inline">{formatTime(node.started_at)}</span>
    </div>

    {#if node.children?.length > 0}
      {#each node.children as child (child.agent_id)}
        {@render treeNode(child)}
      {/each}
    {/if}
  </div>
{/snippet}
