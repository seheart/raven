<script>
  import { logger } from '../logger.js';
  import { createPageApi } from '../apiClient.js';
  import { formatShortDateTime as formatTime } from '../timeFormat.js';
  import { formatUsd } from '../utils/formatUsd.js';
  import { getSubagentTypeColor } from '../utils/agentBrand.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import {
    RefreshButton,
    EmptyState,
    DataFetchError,
    FreshnessBadge
  } from '../components/ui/index.js';
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
  let error = $state(null);

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

    // `visited` guards against cyclic parent data (a node that is its own
    // ancestor) which would otherwise recurse until the stack overflows.
    function buildTree(node, depth = 0, visited = new Set()) {
      if (visited.has(node.agent_id)) {
        return { ...node, depth, children: [] };
      }
      const nextVisited = new Set(visited);
      nextVisited.add(node.agent_id);
      const children = byParent.get(node.agent_id) || [];
      return {
        ...node,
        depth,
        children: children.map(c => buildTree(c, depth + 1, nextVisited))
      };
    }

    // If no clear roots, treat all as roots
    if (roots.length === 0) return treeData.map(n => ({ ...n, depth: 0, children: [] }));
    return roots.map(r => buildTree(r));
  });

  async function loadData() {
    try {
      loading = true;
      error = null;
      // Previously each fetch had `.catch(() => default)`, which silently
      // turned a backend outage into an empty tree / zeroed stats with no
      // signal to the user. Let failures propagate to the DataFetchError UI.
      const [sessionsData, statsData] = await Promise.all([
        api.get('/subagents/sessions'),
        api.get('/subagents/stats')
      ]);
      sessions = Array.isArray(sessionsData) ? sessionsData : [];
      stats = statsData || { total: 0, by_type: [], by_model: [] };
      lastUpdated = new Date();

      // Auto-select first session
      if (sessions.length > 0 && !selectedSession) {
        await selectSession(sessions[0].session_id);
      }
    } catch (err) {
      logger.error('Failed to load subagent data:', err);
      error = err?.message || 'Failed to load sub-agent data';
    } finally {
      loading = false;
    }
  }

  async function selectSession(sessionId) {
    try {
      treeLoading = true;
      error = null;
      selectedSession = sessionId;
      const data = await api.get(`/subagents/tree/${sessionId}`);
      treeData = Array.isArray(data) ? data : [];
    } catch (err) {
      logger.error('Failed to load agent tree:', err);
      error = err?.message || 'Failed to load agent tree';
    } finally {
      treeLoading = false;
    }
  }

  function formatCost(usd) {
    if (!usd || usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    if (usd < 1) return `$${usd.toFixed(3)}`;
    return formatUsd(usd);
  }

  function formatTokens(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  const getTypeColor = getSubagentTypeColor;

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

<PageLayout>
  <PageHeader
    title="Sub-Agent Tree"
    description="When Claude Code hands work off to a helper agent, you can see who spawned whom here — the parent, its children, and what each one cost you in tokens and time."
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <FreshnessBadge mode="polled" since={lastUpdated} />
        <RefreshButton onClick={loadData} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if error}
    <DataFetchError
      endpoint="/api/subagents"
      message="Couldn't load sub-agent data"
      hint={error}
      onRetry={loadData}
    />
  {/if}

  {#if loading && sessions.length === 0}
    <div class="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
      {#each Array(3) as _, i (i)}
        <div class="h-24 bg-surface border border-border rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else}
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Total Sub-Agents
        </div>
        <div class="text-sm font-mono text-body">{stats.total}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Sessions</div>
        <div class="text-sm font-mono text-body">{sessions.length}</div>
      </div>
      {#each stats.by_type?.slice(0, 2) || [] as typeInfo (typeInfo.agent_type)}
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            {typeInfo.agent_type}
          </div>
          <div class="text-sm font-mono text-body">{typeInfo.count}</div>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-4 gap-4">
      <!-- Session List -->
      <div class="bg-surface border border-border rounded p-4">
        <h3 class="text-sm font-semibold text-heading mb-3">Sessions</h3>
        <div class="space-y-1 max-h-[400px] overflow-y-auto">
          {#each sessions as session (session.session_id)}
            <button
              onclick={() => selectSession(session.session_id)}
              class="w-full text-left px-3 py-2 rounded text-sm transition-colors border-0 cursor-pointer {selectedSession ===
              session.session_id
                ? 'bg-accent text-canvas'
                : 'bg-canvas text-body hover:bg-border'}"
            >
              <div class="font-medium truncate">
                {session.project_name || session.session_id?.slice(0, 12)}
              </div>
              <div
                class="text-xs {selectedSession === session.session_id
                  ? 'text-canvas/70'
                  : 'text-muted'}"
              >
                {session.agent_count} agents · {formatTime(session.last_spawn)}
              </div>
            </button>
          {/each}
          {#if sessions.length === 0}
            <p class="text-xs text-muted text-center py-4">No sessions with sub-agents</p>
          {/if}
        </div>
      </div>

      <!-- Agent Tree -->
      <div class="xl:col-span-3 bg-surface border border-border rounded p-4">
        <h3 class="text-sm font-semibold text-heading mb-3">Agent Tree</h3>

        {#if treeLoading}
          <div class="py-8 text-center text-sm text-muted">Loading tree...</div>
        {:else if treeData.length === 0}
          <div class="py-8 text-center text-sm text-muted">
            {selectedSession
              ? 'No sub-agents in this session'
              : 'Select a session to view the agent tree'}
          </div>
        {:else}
          <div class="space-y-1 max-h-[500px] overflow-y-auto">
            {#each tree as node (node.agent_id)}
              {@render treeNode(node)}
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if stats.total === 0}
      <div class="mt-6">
        <EmptyState
          title="No sub-agent activity yet"
          description="When Claude Code delegates work via its Task tool (Explore, general-purpose sub-agents, etc.) the parent/child tree appears here with each sub-agent's duration, model, and tool calls. Sub-agents only spawn when a Claude session asks for one — they aren't always used."
        />
      </div>
    {/if}
  {/if}
</PageLayout>

{#snippet treeNode(node)}
  <div style="margin-left: {node.depth * 24}px">
    <div
      class="flex items-center gap-3 py-2 px-3 rounded bg-canvas hover:bg-border transition-colors"
    >
      <!-- Connector line -->
      {#if node.depth > 0}
        <span class="text-muted text-xs">└─</span>
      {/if}

      <!-- Type badge -->
      <span
        class="px-2 py-0.5 rounded text-[10px] font-semibold text-canvas whitespace-nowrap"
        style="background-color: {getTypeColor(node.agent_type)}"
      >
        {node.agent_type || 'agent'}
      </span>

      <!-- Description -->
      <span class="text-sm text-body flex-1 truncate" title={node.description}>
        {node.description || node.agent_id?.slice(0, 12) || 'Unknown agent'}
      </span>

      <!-- Model -->
      {#if node.model}
        <span class="text-xs text-muted hidden md:inline">{node.model}</span>
      {/if}

      <!-- Tokens / Cost -->
      {#if (node.tokens?.cost_usd ?? 0) > 0}
        <span class="text-xs text-muted"
          >{formatTokens((node.tokens?.input_tokens ?? 0) + (node.tokens?.output_tokens ?? 0))} tok</span
        >
        <span class="text-xs font-mono text-accent font-semibold"
          >{formatCost(node.tokens?.cost_usd ?? 0)}</span
        >
      {/if}

      <!-- Timestamp -->
      <span class="text-xs text-muted hidden lg:inline">{formatTime(node.started_at)}</span>
    </div>

    {#if node.children?.length > 0}
      {#each node.children as child (child.agent_id)}
        {@render treeNode(child)}
      {/each}
    {/if}
  </div>
{/snippet}
