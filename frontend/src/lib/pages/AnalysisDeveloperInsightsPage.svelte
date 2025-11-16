<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Developer Insights Page
   * Productivity analytics and coding patterns
   */

  import { onMount } from 'svelte';
  import SimilarChangesPanel from '../SimilarChangesPanel.svelte';

  // State
  let stats = $state({
    counts: {
      agent_interactions: 0,
      code_patterns: 0,
      workflow_events: 0,
      error_recovery: 0,
      context_switches: 0,
      preferences: 0
    },
    languages: [],
    projects: [],
    hourly_activity: []
  });
  let interactions = $state([]);
  let patterns = $state([]);
  let loading = $state(true);
  let lastUpdate = $state(null);
  let autoRefresh = $state(false);

  // Similar changes state
  let selectedEventId = $state(null);
  let selectedInteraction = $state(null);

  // Derived
  const totalDataPoints = $derived(
    stats.counts.agent_interactions + stats.counts.code_patterns + stats.counts.workflow_events
  );

  const timeAgo = $derived.by(() => {
    if (!lastUpdate) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  const maxHourlyActivity = $derived(
    stats.hourly_activity.length > 0 ? Math.max(...stats.hourly_activity.map(h => h.count)) : 1
  );

  async function loadAllData() {
    try {
      loading = true;
      const [statsData, interactionsData, patternsData] = await Promise.all([
        api
          .get('/developer/stats')
          .catch(() => ({ counts: {}, languages: [], projects: [], hourly_activity: [] })),
        api.get('/developer/interactions?limit=20').catch(() => ({ interactions: [] })),
        api.get('/developer/patterns?limit=20').catch(() => ({ patterns: [] }))
      ]);

      stats = statsData;
      interactions = interactionsData.interactions || [];
      patterns = patternsData.patterns || [];
      lastUpdate = new Date();
    } catch (error) {
      logger.error('Failed to load developer insights:', error);
    } finally {
      loading = false;
    }
  }

  function exportData() {
    const exportData = {
      exported_at: new Date().toISOString(),
      stats,
      interactions,
      patterns
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-developer-insights-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function selectInteraction(interaction) {
    selectedEventId = interaction.id;
    selectedInteraction = interaction;
  }

  function clearSelection() {
    selectedEventId = null;
    selectedInteraction = null;
  }

  onMount(() => {
    loadAllData();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">👨‍💻 Developer Insights</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Productivity analytics and coding patterns
        </p>
      </div>
    </div>

    <!-- Controls -->
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6 flex gap-4 items-center flex-wrap"
    >
      <label
        class="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded cursor-pointer hover:border-[var(--accent)] transition-colors"
      >
        <input type="checkbox" bind:checked={autoRefresh} class="w-4 h-4" />
        <span class="text-sm font-sans">Auto-refresh</span>
      </label>

      <button
        onclick={() => loadAllData()}
        disabled={loading}
        class="px-3 py-1.5 bg-[var(--accent)] text-white border border-[var(--accent)] rounded text-sm font-sans hover:brightness-110 transition-all disabled:opacity-50"
      >
        {loading ? '⏳' : '🔄'} Refresh
      </button>

      <button
        onclick={exportData}
        class="px-3 py-1.5 bg-[var(--accent)] text-white border border-[var(--accent)] rounded text-sm font-sans hover:brightness-110 transition-all"
      >
        📤 Export
      </button>

      <div class="ml-auto text-sm text-[var(--muted)] font-mono">
        Updated: {timeAgo}
      </div>
    </div>

    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each Array(6) as _, i (i)}
          <div
            class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if totalDataPoints === 0}
      <!-- Empty State -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8">
        <div class="text-center mb-6">
          <div class="text-5xl mb-3">🌱</div>
          <h2 class="text-2xl font-bold text-[var(--accent)] mb-2 font-sans">
            Your Developer Persona is Growing
          </h2>
          <p class="text-[var(--muted)] font-sans mb-6">
            Raven is learning about your development patterns, but needs data to provide insights.
          </p>
        </div>

        <div
          class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-6 text-left max-w-3xl mx-auto space-y-6"
        >
          <div>
            <h3 class="text-lg font-semibold text-[var(--accent)] mb-3 font-sans">
              What Gets Tracked:
            </h3>
            <ul class="space-y-2 text-sm text-[var(--text)] font-sans ml-6 list-disc">
              <li>
                <strong>Agent Interactions:</strong> Your prompts to AI, responses received, code changes
                accepted/rejected
              </li>
              <li>
                <strong>Code Patterns:</strong> Languages used, indentation style, naming conventions,
                comment density
              </li>
              <li>
                <strong>Workflow Events:</strong> When you code (hour/day), focus duration, interruptions,
                productivity score
              </li>
              <li>
                <strong>Error Recovery:</strong> How you debug, time to fix, approaches used, repeated
                patterns
              </li>
              <li>
                <strong>Context Switches:</strong> How often you switch projects, what triggers switches,
                completion rates
              </li>
            </ul>
          </div>

          <div>
            <h3 class="text-lg font-semibold text-[var(--accent)] mb-3 font-sans">
              Privacy First:
            </h3>
            <p class="text-sm text-[var(--text)] font-sans mb-2">
              All data stays <strong>100% local</strong> on your machine. Nothing is sent to external
              servers.
            </p>
            <p class="text-sm text-[var(--text)] font-sans">
              This database is at: <code class="bg-[var(--surface)] px-2 py-1 rounded font-mono"
                >~/.raven/db/developer.db</code
              >
            </p>
          </div>

          <div>
            <h3 class="text-lg font-semibold text-[var(--accent)] mb-3 font-sans">
              To Start Collecting Data:
            </h3>
            <p class="text-sm text-[var(--text)] font-sans">
              Data collection hooks are not yet active. When implemented, Raven will automatically
              track your development activity in real-time.
            </p>
          </div>
        </div>
      </div>
    {:else}
      <!-- Stats Overview -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        >
          <div class="text-3xl">🤖</div>
          <div class="flex-1">
            <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
              Agent Interactions
            </div>
            <div class="text-2xl font-bold text-[var(--accent)] font-mono mb-0.5">
              {stats.counts.agent_interactions.toLocaleString()}
            </div>
            <div class="text-xs text-[var(--muted)] font-sans">Prompts & responses tracked</div>
          </div>
        </div>

        <div
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        >
          <div class="text-3xl">💻</div>
          <div class="flex-1">
            <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
              Code Patterns
            </div>
            <div class="text-2xl font-bold text-[var(--accent)] font-mono mb-0.5">
              {stats.counts.code_patterns.toLocaleString()}
            </div>
            <div class="text-xs text-[var(--muted)] font-sans">Coding style observations</div>
          </div>
        </div>

        <div
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        >
          <div class="text-3xl">⚡</div>
          <div class="flex-1">
            <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
              Workflow Events
            </div>
            <div class="text-2xl font-bold text-[var(--accent)] font-mono mb-0.5">
              {stats.counts.workflow_events.toLocaleString()}
            </div>
            <div class="text-xs text-[var(--muted)] font-sans">Work pattern data points</div>
          </div>
        </div>

        <div
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        >
          <div class="text-3xl">🔧</div>
          <div class="flex-1">
            <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
              Error Recoveries
            </div>
            <div class="text-2xl font-bold text-[var(--accent)] font-mono mb-0.5">
              {stats.counts.error_recovery.toLocaleString()}
            </div>
            <div class="text-xs text-[var(--muted)] font-sans">Debugging patterns learned</div>
          </div>
        </div>

        <div
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        >
          <div class="text-3xl">🔄</div>
          <div class="flex-1">
            <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
              Context Switches
            </div>
            <div class="text-2xl font-bold text-[var(--accent)] font-mono mb-0.5">
              {stats.counts.context_switches.toLocaleString()}
            </div>
            <div class="text-xs text-[var(--muted)] font-sans">Project switches tracked</div>
          </div>
        </div>

        <div
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        >
          <div class="text-3xl">⚙️</div>
          <div class="flex-1">
            <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
              Preferences
            </div>
            <div class="text-2xl font-bold text-[var(--accent)] font-mono mb-0.5">
              {stats.counts.preferences.toLocaleString()}
            </div>
            <div class="text-xs text-[var(--muted)] font-sans">Learned preferences</div>
          </div>
        </div>
      </div>

      <!-- Language Breakdown -->
      {#if stats.languages.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-lg font-semibold text-[var(--accent)] font-sans mb-4">
            🔤 Language Breakdown
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {#each stats.languages as lang (lang.language)}
              <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                <div class="font-semibold text-[var(--text)] font-mono mb-1">{lang.language}</div>
                <div class="text-sm text-[var(--muted)] font-sans mb-2">
                  {lang.count.toLocaleString()} patterns
                </div>
                <div class="h-1 bg-[var(--border)] rounded overflow-hidden">
                  <div
                    class="h-full bg-[var(--accent)] transition-all duration-500"
                    style="width: {(lang.count / stats.languages[0].count) * 100}%"
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Project Activity -->
      {#if stats.projects.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-lg font-semibold text-[var(--accent)] font-sans mb-4">
            📊 Project Activity
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {#each stats.projects as proj (proj.project)}
              <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                <div class="font-semibold text-[var(--text)] font-mono mb-1">{proj.project}</div>
                <div class="text-sm text-[var(--muted)] font-sans mb-2">
                  {proj.count.toLocaleString()} interactions
                </div>
                <div class="h-1 bg-[var(--border)] rounded overflow-hidden">
                  <div
                    class="h-full bg-[var(--accent)] transition-all duration-500"
                    style="width: {(proj.count / stats.projects[0].count) * 100}%"
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Activity by Hour -->
      {#if stats.hourly_activity.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-lg font-semibold text-[var(--accent)] font-sans mb-4">
            📊 Activity by Hour of Day
          </h2>
          <div class="flex items-end gap-1 h-48">
            {#each Array(24)
              .fill(0)
              .map((_, i) => i) as hour (hour)}
              {@const activity = stats.hourly_activity.find(h => h.hour_of_day === hour)}
              {@const count = activity?.count || 0}
              <div class="flex-1 flex flex-col items-center gap-1">
                <div class="flex-1 flex items-end w-full">
                  <div
                    class="w-full bg-[var(--accent)] rounded-t transition-all hover:opacity-80"
                    style="height: {(count / maxHourlyActivity) * 100}%"
                    title="{hour}:00 - {count} events"
                  ></div>
                </div>
                <span class="text-xs text-[var(--muted)] font-mono"
                  >{hour % 6 === 0 ? `${hour}:00` : ''}</span
                >
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Recent Interactions -->
      {#if interactions.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-lg font-semibold text-[var(--accent)] font-sans mb-4">
            🤖 Recent Agent Interactions
          </h2>
          <p class="text-sm text-[var(--muted)] font-sans mb-4">
            Click on an interaction to see similar changes analysis
          </p>
          <div class="space-y-3">
            {#each interactions as interaction (interaction.id)}
              <div
                class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 cursor-pointer hover:border-[var(--accent)] transition-colors"
                class:border-accent={selectedEventId === interaction.id}
                onclick={() => selectInteraction(interaction)}
                onkeydown={e =>
                  (e.key === 'Enter' || e.key === ' ') && selectInteraction(interaction)}
                role="button"
                tabindex="0"
              >
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-[var(--accent)] font-mono"
                      >{interaction.project || 'Unknown'}</span
                    >
                    <span
                      class="text-sm px-2 py-0.5 bg-[var(--surface)] rounded text-[var(--muted)] font-sans"
                      >{interaction.agent_name}</span
                    >
                  </div>
                  <span class="text-sm text-[var(--muted)] font-mono"
                    >{formatTimestamp(interaction.timestamp)}</span
                  >
                </div>
                {#if interaction.prompt}
                  <p class="text-sm text-[var(--text)] font-mono mb-2">
                    {interaction.prompt.substring(0, 150)}...
                  </p>
                {/if}
                <div class="flex flex-wrap gap-2 text-xs">
                  {#if interaction.file_path}
                    <span
                      class="px-2 py-0.5 bg-[var(--surface)] rounded text-[var(--muted)] font-mono"
                      >📄 {interaction.file_path}</span
                    >
                  {/if}
                  {#if interaction.language}
                    <span
                      class="px-2 py-0.5 bg-[var(--surface)] rounded text-[var(--muted)] font-mono"
                      >🔤 {interaction.language}</span
                    >
                  {/if}
                  {#if interaction.lines_changed}
                    <span
                      class="px-2 py-0.5 bg-[var(--surface)] rounded text-[var(--muted)] font-mono"
                      >±{interaction.lines_changed} lines</span
                    >
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Recent Code Patterns -->
      {#if patterns.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-lg font-semibold text-[var(--accent)] font-sans mb-4">
            💻 Recent Code Patterns
          </h2>
          <div class="space-y-3">
            {#each patterns as pattern (pattern.id)}
              <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-[var(--accent)] font-mono"
                      >{pattern.language || 'Unknown'}</span
                    >
                    <span
                      class="text-sm px-2 py-0.5 bg-[var(--surface)] rounded text-[var(--muted)] font-sans"
                      >{pattern.edit_type || 'Edit'}</span
                    >
                  </div>
                  <span class="text-sm text-[var(--muted)] font-mono"
                    >{formatTimestamp(pattern.timestamp)}</span
                  >
                </div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <span
                    class="px-2 py-0.5 bg-[var(--surface)] rounded text-[var(--muted)] font-mono"
                    >+{pattern.lines_added || 0} / -{pattern.lines_removed || 0}</span
                  >
                  {#if pattern.indent_style}
                    <span
                      class="px-2 py-0.5 bg-[var(--surface)] rounded text-[var(--muted)] font-mono"
                      >Indent: {pattern.indent_style} ({pattern.indent_size || 2})</span
                    >
                  {/if}
                  {#if pattern.uses_types}
                    <span
                      class="px-2 py-0.5 bg-[var(--accent)] text-white rounded font-mono font-semibold"
                      >TypeScript</span
                    >
                  {/if}
                  {#if pattern.uses_tests}
                    <span
                      class="px-2 py-0.5 bg-[var(--accent)] text-white rounded font-mono font-semibold"
                      >Tests</span
                    >
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Similar Changes Analysis -->
      {#if selectedEventId}
        <div class="bg-[var(--surface)] border-2 border-[var(--accent)] rounded-lg p-5">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h2 class="text-lg font-semibold text-[var(--accent)] font-sans mb-1">
                🔍 Similar Changes Analysis
              </h2>
              {#if selectedInteraction}
                <p class="text-sm text-[var(--muted)] font-sans">
                  Analyzing patterns for: <span class="font-mono text-[var(--text)]"
                    >{selectedInteraction.file_path || 'interaction'}</span
                  >
                </p>
              {/if}
            </div>
            <button
              onclick={clearSelection}
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
            >
              ✕ Close
            </button>
          </div>
          <SimilarChangesPanel
            eventId={selectedEventId}
            project={selectedInteraction?.project || 'raven'}
            limit={5}
          />
        </div>
      {/if}
    {/if}
  </div>
</div>
