<script>
  import { createPageApi } from '../apiClient.js';
  import { onMount } from 'svelte';
  import { formatTimeOnly, formatDateOnly, formatShortDateTime } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import {
    RefreshButton,
    EmptyState,
    TabButton,
    DataFetchError,
    FreshnessBadge
  } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();

  let data = $state({ entries: [], sessions: [], currentSession: null });
  let loading = $state(true);
  let selectedSession = $state(null);
  let lastUpdated = $state(null);
  let filterType = $state('all'); // 'all' | 'user' | 'assistant' | 'tool' | 'subagent'

  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  const filteredEntries = $derived.by(() => {
    const entries =
      filterType === 'all' ? data.entries : data.entries.filter(e => e.type === filterType);
    return [...entries].reverse();
  });

  const typeCounts = $derived.by(() => {
    const counts = { all: 0, user: 0, assistant: 0, tool: 0, subagent: 0 };
    for (const e of data.entries) {
      counts.all++;
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return counts;
  });

  /** @type {string|null} */
  let loadError = $state(null);

  async function loadData(session = null) {
    try {
      loading = true;
      loadError = null;
      const params = session ? `?session=${session}&limit=500` : '?limit=500';
      const result = await api.get(`/session-activity${params}`);
      // Defensive shape: a malformed 200 ({}, null, or {entries: null}) used
      // to throw on `data.entries.length` and brick the page. Coerce to the
      // expected shape so empty/odd responses render an empty state instead.
      data = {
        entries: Array.isArray(result?.entries) ? result.entries : [],
        sessions: Array.isArray(result?.sessions) ? result.sessions : [],
        currentSession: result?.currentSession ?? null
      };
      selectedSession = data.currentSession;
      lastUpdated = new Date();
    } catch (err) {
      // Was a silent catch — page would just show the loading skeleton
      // forever on a load failure with no signal to the user.
      loadError = err?.message || String(err);
    } finally {
      loading = false;
    }
  }

  function formatDate(ts) {
    if (!ts) return '';
    return formatDateOnly(ts);
  }

  function formatSessionDate(ts) {
    if (!ts) return '';
    return formatShortDateTime(ts);
  }

  function typeColor(type) {
    if (type === 'user') return 'var(--accent)';
    if (type === 'assistant') return 'var(--success)';
    if (type === 'tool') return 'var(--muted)';
    if (type === 'subagent') return 'var(--warning)';
    return 'var(--muted)';
  }

  function typeLabel(type) {
    if (type === 'user') return 'You';
    if (type === 'assistant') return 'Claude';
    if (type === 'tool') return 'Action';
    if (type === 'subagent') return 'Sub-Agent';
    return type;
  }

  // Group entries by date
  function groupByDate(entries) {
    const groups = [];
    let currentDate = '';
    let currentGroup = null;

    for (const entry of entries) {
      const date = formatDate(entry.timestamp);
      if (date !== currentDate) {
        currentDate = date;
        currentGroup = { date, entries: [] };
        groups.push(currentGroup);
      }
      currentGroup.entries.push(entry);
    }

    return groups;
  }

  const groupedEntries = $derived(groupByDate(filteredEntries));

  onMount(() => {
    loadData();
    return () => abortRequests();
  });
</script>

<PageLayout>
  <PageHeader title="Session Activity" description="Conversation timeline between you and Claude">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <FreshnessBadge mode="historical" />
        <span class="text-xs text-muted font-mono">{timeAgo}</span>
        <RefreshButton onClick={() => loadData(selectedSession)} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if loadError}
    <DataFetchError
      endpoint="/api/session-activity"
      message="Couldn't load session activity"
      hint={loadError}
      onRetry={() => loadData(selectedSession)}
    />
  {/if}

  {#if loading && data.entries.length === 0}
    <div class="space-y-3">
      {#each Array(5) as _, i (i)}
        <div class="h-16 bg-surface border border-border rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else if data.entries.length === 0}
    <EmptyState
      icon="💬"
      title="No Activity Yet"
      description="Start a conversation with Claude Code to see activity here."
    />
  {:else}
    <!-- Session Picker + Filters -->
    <div class="flex flex-wrap gap-3 mb-6 items-center">
      <!-- Session selector -->
      {#if data.sessions.length > 1}
        <select
          value={selectedSession}
          onchange={e => loadData(e.target.value)}
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
        >
          {#each data.sessions as session (session.id)}
            <option value={session.id}>
              {formatSessionDate(session.lastModified)} — {session.id.slice(0, 8)}
            </option>
          {/each}
        </select>
      {/if}

      <!-- Type filters -->
      <div class="flex bg-surface border border-border rounded overflow-hidden">
        {#each [['all', 'All'], ['user', 'You'], ['assistant', 'Claude'], ['tool', 'Actions'], ['subagent', 'Agents']] as [value, label] (value)}
          <TabButton active={filterType === value} onClick={() => (filterType = value)}>
            {label}
            <span class="ml-1 opacity-60">{typeCounts[value]}</span>
          </TabButton>
        {/each}
      </div>
    </div>

    <!-- Timeline -->
    <div class="space-y-6 max-h-[500px] overflow-y-auto">
      {#each groupedEntries as group (group.date)}
        <!-- Date header -->
        <div class="flex items-center gap-3">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide">{group.date}</div>
          <div class="flex-1 h-px bg-border"></div>
        </div>

        <div class="space-y-2">
          {#each group.entries as entry, i (entry.timestamp + i)}
            <div class="flex gap-3 group">
              <!-- Time -->
              <div class="text-xs font-mono text-muted w-16 pt-2 flex-shrink-0 text-right">
                {formatTimeOnly(entry.timestamp, true)}
              </div>

              <!-- Type indicator -->
              <div class="flex-shrink-0 pt-1.5">
                <div
                  class="w-2.5 h-2.5 rounded-full"
                  style="background: {typeColor(entry.type)}"
                  title={typeLabel(entry.type)}
                ></div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0 pb-2">
                {#if entry.type === 'user'}
                  <div class="bg-surface border border-border rounded-lg px-4 py-2.5">
                    <div class="text-xs font-semibold text-accent mb-1">You</div>
                    <div class="text-sm text-body whitespace-pre-wrap break-words">
                      {entry.content}
                    </div>
                  </div>
                {:else if entry.type === 'assistant'}
                  <div class="bg-surface border border-border rounded-lg px-4 py-2.5">
                    <div class="text-xs font-semibold text-success mb-1">Claude</div>
                    <div class="text-sm text-body whitespace-pre-wrap break-words">
                      {entry.content}
                    </div>
                  </div>
                {:else if entry.type === 'subagent'}
                  <div class="bg-surface border border-accent/30 rounded-lg px-4 py-2">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-semibold text-warning">Sub-Agent</span>
                      {#if entry.metadata?.subagentType}
                        <span
                          class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-canvas text-muted"
                          >{entry.metadata.subagentType}</span
                        >
                      {/if}
                    </div>
                    <div class="text-sm text-body mt-1">{entry.content}</div>
                  </div>
                {:else if entry.type === 'tool'}
                  <div
                    class="text-xs font-mono text-muted py-1 opacity-70 group-hover:opacity-100 transition-opacity"
                  >
                    {entry.content}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</PageLayout>
