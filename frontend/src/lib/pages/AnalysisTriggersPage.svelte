<script>
  import { logger } from '../logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import ProjectBadge from '../ProjectBadge.svelte';

  /**
   * Triggers Configuration Page
   * Automated monitoring rules, events, and statistics
   */

  // State
  let activeTab = $state('rules'); // 'rules', 'events', 'stats'
  let triggers = $state([]);
  let triggeredEvents = $state([]);
  let stats = $state({
    total_triggers: 0,
    active_triggers: 0,
    trigger_counts: {}
  });
  let loading = $state(true);
  let error = $state(null);
  let successMessage = $state(null);
  let lastUpdated = $state(null);
  let isManualRefresh = $state(false);

  // Filters
  let searchQuery = $state('');
  let debouncedSearchQuery = $state('');
  let selectedActionFilter = $state('all'); // 'all', 'notify', 'log', 'command'
  let selectedProjectFilter = $state('all');
  let enabledTriggers = $state(new Set());

  // Debounce timeout
  let searchDebounceTimeout;

  // Event ID counter for unique keys
  let eventIdCounter = 0;

  // Success message timeouts
  let successMessageTimeouts = [];

  // Debounce search query
  $effect(() => {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
      debouncedSearchQuery = searchQuery;
    }, 300);
  });

  // Filter triggers based on search and action type
  const filteredTriggers = $derived.by(() => {
    return triggers.filter(trigger => {
      // Search filter (debounced)
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase();
        const matchesName = trigger.name?.toLowerCase().includes(query);
        const matchesMessage = trigger.message?.toLowerCase().includes(query);
        const matchesFile = trigger.file?.toLowerCase().includes(query);
        if (!matchesName && !matchesMessage && !matchesFile) {
          return false;
        }
      }

      // Action type filter
      if (selectedActionFilter !== 'all' && trigger.action !== selectedActionFilter) {
        return false;
      }

      return true;
    });
  });

  // Filter events by project
  const filteredEvents = $derived.by(() => {
    return triggeredEvents.filter(event => {
      if (selectedProjectFilter === 'all') return true;
      return event.project === selectedProjectFilter;
    });
  });

  // Get unique projects from events
  const availableProjects = $derived.by(() => {
    const projects = new Set();
    triggeredEvents.forEach(event => {
      if (event.project) {
        projects.add(event.project);
      }
    });
    return Array.from(projects).sort();
  });

  // Time ago calculation
  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  // WebSocket event handlers
  const handleTriggerFired = event => {
    // Add unique ID to prevent duplicate key errors
    event.id = `event-${eventIdCounter++}`;
    // Add new event to the beginning of the list
    triggeredEvents = [event, ...triggeredEvents].slice(0, 100);
  };

  const handleTriggerStats = newStats => {
    stats = newStats;
  };

  async function loadAllData(manual = false) {
    loading = true;
    isManualRefresh = manual;
    error = null;

    try {
      // CRITICAL: api.get() returns parsed JSON directly (NO .json() call)
      const [triggersData, events, statsData] = await Promise.all([
        api.get('/triggers-config'),
        api.get('/triggered-events?limit=100'),
        api.get('/trigger-stats')
      ]);

      triggers = triggersData.rules || triggersData || [];

      // Initialize all triggers as enabled by default
      const newEnabledSet = new Set();
      triggers.forEach(trigger => newEnabledSet.add(trigger.name));
      enabledTriggers = newEnabledSet;

      // Load events and add unique IDs to prevent duplicate key errors
      triggeredEvents = events.map(event => ({
        ...event,
        id: `event-${eventIdCounter++}`
      }));

      stats = statsData;

      lastUpdated = new Date();
    } catch (e) {
      error = `Failed to load triggers data: ${e.message}`;
      logger.error(error);
    } finally {
      loading = false;
      isManualRefresh = false;
    }
  }

  async function reloadConfig() {
    try {
      const data = await api.post('/triggers-reload', {});
      successMessage = data.message;
      const timeout = setTimeout(() => (successMessage = null), 3000);
      successMessageTimeouts.push(timeout);
      await loadAllData();
    } catch (e) {
      error = `Failed to reload config: ${e.message}`;
      logger.error(error);
    }
  }

  async function clearCooldowns() {
    try {
      const data = await api.post('/triggers-clear-cooldowns', {});
      successMessage = data.message;
      const timeout = setTimeout(() => (successMessage = null), 3000);
      successMessageTimeouts.push(timeout);
    } catch (e) {
      error = `Failed to clear cooldowns: ${e.message}`;
      logger.error(error);
    }
  }

  function toggleTrigger(triggerName) {
    const newSet = new Set(enabledTriggers);
    if (newSet.has(triggerName)) {
      newSet.delete(triggerName);
      successMessage = `Disabled trigger: ${triggerName}`;
    } else {
      newSet.add(triggerName);
      successMessage = `Enabled trigger: ${triggerName}`;
    }
    enabledTriggers = newSet;
    const timeout = setTimeout(() => (successMessage = null), 2000);
    successMessageTimeouts.push(timeout);
  }

  function testTrigger(trigger) {
    successMessage = `Test fired: ${trigger.name}`;
    const testEvent = {
      id: `event-${eventIdCounter++}`,
      trigger_name: trigger.name,
      action: trigger.action,
      message: `[TEST] ${trigger.message}`,
      timestamp: Math.floor(Date.now() / 1000),
      project: null
    };
    triggeredEvents = [testEvent, ...triggeredEvents].slice(0, 100);
    const timeout = setTimeout(() => (successMessage = null), 3000);
    successMessageTimeouts.push(timeout);
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getActionIcon(action) {
    switch (action?.toLowerCase()) {
      case 'notify':
        return '🔔';
      case 'log':
        return '📝';
      case 'command':
        return '⚙️';
      default:
        return '❓';
    }
  }

  function getConditionsList(trigger) {
    const conditions = [];
    if (trigger.file) conditions.push(`File: ${trigger.file}`);
    if (trigger.agent) conditions.push(`Agent: ${trigger.agent}`);
    if (trigger.event_type) conditions.push(`Type: ${trigger.event_type}`);
    if (trigger.lines_changed) conditions.push(`Lines: ${trigger.lines_changed}`);
    if (trigger.duration_ms) conditions.push(`Duration: ${trigger.duration_ms}ms`);
    if (trigger.cpu_percent) conditions.push(`CPU: ${trigger.cpu_percent}%`);
    if (trigger.memory_percent) conditions.push(`Memory: ${trigger.memory_percent}%`);
    return conditions;
  }

  onMount(async () => {
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time trigger events
    websocketService.on('trigger-fired', handleTriggerFired);

    // Listen for real-time stats updates
    websocketService.on('trigger-stats', handleTriggerStats);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('trigger-fired', handleTriggerFired);
    websocketService.off('trigger-stats', handleTriggerStats);

    // Clean up timeouts
    successMessageTimeouts.forEach(timeout => clearTimeout(timeout));
    clearTimeout(searchDebounceTimeout);
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Trigger Configuration</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Automated monitoring rules and real-time alerts
        </p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-sm text-[var(--muted)] font-mono">Updated {timeAgo}</span>
        <button
          onclick={reloadConfig}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] hover:border-[var(--accent)] transition-colors"
        >
          🔄 Reload Config
        </button>
        <button
          onclick={clearCooldowns}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] hover:border-[var(--accent)] transition-colors"
        >
          ⏰ Clear Cooldowns
        </button>
        <button
          onclick={() => loadAllData(true)}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans text-[var(--text)] hover:border-[var(--accent)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isManualRefresh}
            <span class="inline-block animate-spin">↻</span>
          {:else}
            ↻
          {/if}
          Refresh
        </button>
      </div>
    </div>

    <!-- Success/Error Messages -->
    {#if successMessage}
      <div
        class="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-sm text-green-400 font-sans"
      >
        {successMessage}
      </div>
    {/if}

    {#if error}
      <div
        class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-400 font-sans"
      >
        {error}
      </div>
    {/if}

    <!-- Tabs -->
    <div class="flex gap-2 mb-6 border-b-2 border-[var(--surface)]">
      <button
        onclick={() => (activeTab = 'rules')}
        class="px-4 py-2 text-sm font-sans transition-all border-b-2 {activeTab === 'rules'
          ? 'text-[var(--warning)] border-[var(--warning)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)] hover:bg-[var(--surface)]'}"
      >
        📋 Rules ({triggers.length})
      </button>
      <button
        onclick={() => (activeTab = 'events')}
        class="px-4 py-2 text-sm font-sans transition-all border-b-2 {activeTab === 'events'
          ? 'text-[var(--warning)] border-[var(--warning)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)] hover:bg-[var(--surface)]'}"
      >
        🔔 Events ({filteredEvents.length})
      </button>
      <button
        onclick={() => (activeTab = 'stats')}
        class="px-4 py-2 text-sm font-sans transition-all border-b-2 {activeTab === 'stats'
          ? 'text-[var(--warning)] border-[var(--warning)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)] hover:bg-[var(--surface)]'}"
      >
        📊 Stats
      </button>
    </div>

    <!-- Tab Content -->
    <div>
      {#if loading}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each Array(6) as _, i (i)}
            <div
              class="h-48 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
            ></div>
          {/each}
        </div>
      {:else if activeTab === 'rules'}
        <!-- RULES TAB -->

        <!-- Filters -->
        {#if triggers.length > 0}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6 flex gap-4 flex-wrap items-center"
          >
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search triggers by name, message, or file..."
              class="flex-1 min-w-[200px] px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--warning)]"
            />
            <select
              bind:value={selectedActionFilter}
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--warning)] cursor-pointer"
            >
              <option value="all">All Actions</option>
              <option value="notify">🔔 Notify</option>
              <option value="log">📝 Log</option>
              <option value="command">⚙️ Command</option>
            </select>
            <div
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--muted)] font-semibold"
            >
              {filteredTriggers.length} / {triggers.length} triggers
            </div>
          </div>
        {/if}

        <!-- Trigger Rules Grid -->
        {#if filteredTriggers.length === 0 && triggers.length > 0}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
            <div class="text-4xl mb-3">🔍</div>
            <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2 font-sans">
              No Matching Triggers
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              Try adjusting your search or filters.
            </p>
          </div>
        {:else if triggers.length === 0}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
            <div class="text-4xl mb-3">📝</div>
            <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2 font-sans">
              No Triggers Configured
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans mb-2">
              Create triggers in <code
                class="bg-[var(--bg)] px-2 py-1 rounded text-[var(--warning)] font-mono"
                >.raven/config.toml</code
              > to get started.
            </p>
            <p class="text-xs text-[var(--muted)] font-sans italic">
              Example triggers are created automatically when Raven first runs.
            </p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each filteredTriggers as trigger (trigger.name)}
              <div
                class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 transition-all {enabledTriggers.has(
                  trigger.name
                )
                  ? 'hover:border-[var(--warning)] hover:shadow-lg'
                  : 'opacity-50 grayscale'}"
              >
                <!-- Header -->
                <div
                  class="flex justify-between items-start mb-3 pb-3 border-b border-[var(--border)]"
                >
                  <div class="flex-1">
                    <div class="font-semibold text-sm text-[var(--text-heading)] font-mono mb-2">
                      {trigger.name}
                    </div>
                    <span
                      class="inline-block bg-[var(--bg)] px-2 py-1 rounded text-xs text-[var(--warning)] font-sans capitalize"
                    >
                      {getActionIcon(trigger.action)}
                      {trigger.action}
                    </span>
                  </div>
                  <!-- Toggle Switch -->
                  <label class="relative inline-block w-11 h-6 cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={enabledTriggers.has(trigger.name)}
                      onchange={() => toggleTrigger(trigger.name)}
                      class="opacity-0 w-0 h-0 peer"
                    />
                    <span
                      class="absolute inset-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-full transition-all peer-checked:bg-[var(--warning)] peer-checked:border-[var(--warning)]"
                    ></span>
                    <span
                      class="absolute left-1 top-1 w-4 h-4 bg-[var(--muted)] rounded-full transition-all peer-checked:translate-x-5 peer-checked:bg-white"
                    ></span>
                  </label>
                </div>

                <!-- Details -->
                <div class="text-xs space-y-2 mb-3">
                  {#if getConditionsList(trigger).length > 0}
                    <div>
                      <span class="text-[var(--muted)] font-sans font-medium">Conditions:</span>
                      <ul class="mt-1 ml-4 list-disc space-y-0.5">
                        {#each getConditionsList(trigger) as condition (condition)}
                          <li class="text-[var(--text)] font-mono">{condition}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}

                  {#if trigger.message}
                    <div>
                      <span class="text-[var(--muted)] font-sans font-medium">Message:</span>
                      <div class="text-[var(--text)] font-mono mt-1">{trigger.message}</div>
                    </div>
                  {/if}

                  {#if trigger.command}
                    <div>
                      <span class="text-[var(--muted)] font-sans font-medium">Command:</span>
                      <code
                        class="block bg-[var(--bg)] px-2 py-1 rounded text-[var(--success)] font-mono mt-1 overflow-x-auto"
                        >{trigger.command}</code
                      >
                    </div>
                  {/if}

                  <div>
                    <span class="text-[var(--muted)] font-sans font-medium">Cooldown:</span>
                    <span class="text-[var(--text)] font-mono ml-2">
                      {trigger.cooldown_seconds === 0 ? 'None' : `${trigger.cooldown_seconds}s`}
                    </span>
                  </div>
                </div>

                <!-- Footer -->
                <div class="flex justify-between items-center pt-3 border-t border-[var(--border)]">
                  <button
                    onclick={() => testTrigger(trigger)}
                    disabled={!enabledTriggers.has(trigger.name)}
                    class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-xs font-sans text-[var(--text)] hover:bg-[var(--warning)] hover:text-white hover:border-[var(--warning)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🧪 Test Fire
                  </button>
                  <span class="text-xs font-semibold font-sans px-2 py-1 bg-[var(--bg)] rounded">
                    {enabledTriggers.has(trigger.name) ? '🟢 Enabled' : '⚫ Disabled'}
                  </span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {:else if activeTab === 'events'}
        <!-- EVENTS TAB -->

        <!-- Project Filter -->
        {#if availableProjects.length > 0}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6 flex gap-4 items-center"
          >
            <span class="text-sm text-[var(--muted)] font-sans font-medium">Filter by project:</span
            >
            <select
              bind:value={selectedProjectFilter}
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--warning)] cursor-pointer"
            >
              <option value="all">All Projects</option>
              {#each availableProjects as project (project)}
                <option value={project}>{project}</option>
              {/each}
            </select>
            <div
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--muted)] font-semibold"
            >
              {filteredEvents.length} / {triggeredEvents.length} events
            </div>
          </div>
        {/if}

        <!-- Triggered Events -->
        {#if filteredEvents.length === 0 && triggeredEvents.length > 0}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
            <div class="text-4xl mb-3">🔍</div>
            <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2 font-sans">
              No Events for Selected Project
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">Try selecting a different project.</p>
          </div>
        {:else if triggeredEvents.length === 0}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
            <div class="text-4xl mb-3">🔕</div>
            <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2 font-sans">
              No Triggered Events
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              No triggers have fired yet. Events will appear here when conditions are met.
            </p>
            <p class="text-xs text-[var(--muted)] font-sans italic mt-2">
              Real-time updates via WebSocket
            </p>
          </div>
        {:else}
          <div class="space-y-2">
            {#each filteredEvents as event (event.id)}
              <div
                class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex items-center gap-3 hover:bg-[var(--bg)] transition-colors"
              >
                <span class="text-xl flex-shrink-0">{getActionIcon(event.action)}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <span class="font-semibold text-sm text-[var(--warning)] font-mono"
                      >{event.trigger_name}</span
                    >
                    {#if event.project}
                      <ProjectBadge project={event.project} size="small" />
                    {/if}
                  </div>
                  <div class="text-sm text-[var(--text)] font-mono">{event.message}</div>
                  {#if event.file}
                    <div class="text-xs text-[var(--muted)] font-mono mt-1">File: {event.file}</div>
                  {/if}
                </div>
                <div class="text-right flex-shrink-0">
                  <div
                    class="text-xs text-[var(--muted)] font-sans capitalize bg-[var(--bg)] px-2 py-1 rounded mb-1"
                  >
                    {event.action}
                  </div>
                  <div class="text-xs text-[var(--muted)] font-mono">
                    {formatTimestamp(event.timestamp)}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {:else if activeTab === 'stats'}
        <!-- STATS TAB -->
        <div class="space-y-6">
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
            >
              <div class="text-4xl font-bold text-[var(--warning)] font-mono mb-2">
                {stats.total_triggers}
              </div>
              <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide">
                Total Triggers Fired
              </div>
            </div>
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
            >
              <div class="text-4xl font-bold text-[var(--warning)] font-mono mb-2">
                {stats.active_triggers}
              </div>
              <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide">
                Active Trigger Rules
              </div>
            </div>
          </div>

          <!-- Trigger Fire Counts -->
          {#if Object.keys(stats?.trigger_counts || {}).length > 0}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
              <h3 class="text-lg font-semibold text-[var(--text-heading)] font-sans mb-4">
                Trigger Fire Counts
              </h3>
              <div class="space-y-2">
                {#each Object.entries(stats.trigger_counts).sort((a, b) => b[1] - a[1]) as [name, count] (name)}
                  <div
                    class="flex justify-between items-center bg-[var(--bg)] border border-[var(--border)] rounded p-3 hover:border-[var(--warning)] transition-colors"
                  >
                    <span class="text-sm text-[var(--text)] font-mono font-medium">{name}</span>
                    <span
                      class="text-sm font-bold text-[var(--warning)] bg-[var(--surface)] px-3 py-1 rounded font-mono"
                      >{count}</span
                    >
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center"
            >
              <div class="text-4xl mb-3">📊</div>
              <h3 class="text-lg font-semibold text-[var(--text-heading)] mb-2 font-sans">
                No Statistics Available
              </h3>
              <p class="text-sm text-[var(--muted)] font-sans">
                Statistics will appear here once triggers start firing.
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
