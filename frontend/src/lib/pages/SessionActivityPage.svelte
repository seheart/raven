<script>
  import { createPageApi } from '../apiClient.js';
  import { onMount } from 'svelte';
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
    const entries = filterType === 'all' ? data.entries : data.entries.filter(e => e.type === filterType);
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

  async function loadData(session = null) {
    try {
      loading = true;
      const params = session ? `?session=${session}&limit=500` : '?limit=500';
      const result = await api.get(`/session-activity${params}`);
      data = result;
      selectedSession = result.currentSession;
      lastUpdated = new Date();
    } catch (_err) {
      // Silent
    } finally {
      loading = false;
    }
  }

  function formatTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  function formatSessionDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function typeIcon(type) {
    if (type === 'user') return '\u{1F464}';
    if (type === 'assistant') return '\u{1F916}';
    if (type === 'tool') return '\u{1F527}';
    if (type === 'subagent') return '\u{1F4E6}';
    return '\u2022';
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

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Session Activity</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Conversation timeline between you and Claude
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-[var(--muted)] font-mono">{timeAgo}</span>
        <button
          onclick={() => loadData(selectedSession)}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '\u21BB'} Refresh
        </button>
      </div>
    </div>

    {#if loading && data.entries.length === 0}
      <div class="space-y-3">
        {#each Array(5) as _, i (i)}
          <div class="h-16 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if data.entries.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-4xl mb-4 opacity-30">💬</div>
        <h2 class="text-lg font-bold text-[var(--text-heading)] mb-2">No Activity Yet</h2>
        <p class="text-sm text-[var(--muted)] font-sans">
          Start a conversation with Claude Code to see activity here.
        </p>
      </div>
    {:else}
      <!-- Session Picker + Filters -->
      <div class="flex flex-wrap gap-3 mb-6 items-center">
        <!-- Session selector -->
        {#if data.sessions.length > 1}
          <select
            value={selectedSession}
            onchange={(e) => loadData(e.target.value)}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          >
            {#each data.sessions as session (session.id)}
              <option value={session.id}>
                {formatSessionDate(session.lastModified)} — {session.id.slice(0, 8)}
              </option>
            {/each}
          </select>
        {/if}

        <!-- Type filters -->
        <div class="flex bg-[var(--surface)] border border-[var(--border)] rounded overflow-hidden">
          {#each [['all', 'All'], ['user', 'You'], ['assistant', 'Claude'], ['tool', 'Actions'], ['subagent', 'Agents']] as [value, label] (value)}
            <button
              onclick={() => filterType = value}
              class="px-3 py-1.5 text-xs font-sans transition-colors border-0 cursor-pointer {filterType === value ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}"
            >
              {label}
              <span class="ml-1 opacity-60">{typeCounts[value]}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Timeline -->
      <div class="space-y-6">
        {#each groupedEntries as group (group.date)}
          <!-- Date header -->
          <div class="flex items-center gap-3">
            <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{group.date}</div>
            <div class="flex-1 h-px bg-[var(--border)]"></div>
          </div>

          <div class="space-y-2">
            {#each group.entries as entry, i (entry.timestamp + i)}
              <div class="flex gap-3 group">
                <!-- Time -->
                <div class="text-xs font-mono text-[var(--muted)] w-16 pt-2 flex-shrink-0 text-right">
                  {formatTime(entry.timestamp)}
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
                    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5">
                      <div class="text-xs font-semibold text-[var(--accent)] mb-1">You</div>
                      <div class="text-sm text-[var(--text)] whitespace-pre-wrap break-words">{entry.content}</div>
                    </div>
                  {:else if entry.type === 'assistant'}
                    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5">
                      <div class="text-xs font-semibold text-[var(--success)] mb-1">Claude</div>
                      <div class="text-sm text-[var(--text)] whitespace-pre-wrap break-words">{entry.content}</div>
                    </div>
                  {:else if entry.type === 'subagent'}
                    <div class="bg-[var(--surface)] border border-[var(--accent)]/30 rounded-lg px-4 py-2">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold text-[var(--warning)]">Sub-Agent</span>
                        {#if entry.metadata?.subagentType}
                          <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--muted)]">{entry.metadata.subagentType}</span>
                        {/if}
                      </div>
                      <div class="text-sm text-[var(--text)] mt-1">{entry.content}</div>
                    </div>
                  {:else if entry.type === 'tool'}
                    <div class="text-xs font-mono text-[var(--muted)] py-1 opacity-70 group-hover:opacity-100 transition-opacity">
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
  </div>
</div>
