<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Custom Metrics Dashboard Page
   * User-defined KPIs and metrics at a glance
   */

  import { onMount } from 'svelte';

  // State
  let metrics = $state({});
  let loading = $state(true);
  let error = $state(null);
  let lastUpdate = $state(new Date());

  const timeSinceUpdate = $derived.by(() => {
    const seconds = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  });

  async function loadMetrics() {
    try {
      loading = true;
      const data = await api.get('/metrics/dashboard');
      metrics = data.metrics || {};
      lastUpdate = new Date();
      error = null;
    } catch {
      logger.error('Failed to load metrics:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function formatHour(hour) {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
  }

  onMount(() => {
    loadMetrics();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">
          📊 Custom Metrics Dashboard
        </h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Key performance indicators at a glance
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-mono">Updated: {timeSinceUpdate}</span>
        <button
          onclick={() => loadMetrics()}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳' : '↻'} Refresh
        </button>
      </div>
    </div>

    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(8) as _, i (i)}
          <div
            class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans">⚠️ Error loading metrics: {error}</span>
        <button
          onclick={() => loadMetrics()}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Try Again
        </button>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Total Events -->
        <div class="bg-[var(--surface)] border-2 border-[var(--accent)] rounded-lg p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-2xl">📈</span>
            <span class="text-sm text-[var(--muted)] font-sans">Total Events</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-1">
            {(metrics.total_events || 0).toLocaleString()}
          </div>
          <div class="text-xs text-[var(--muted)] font-sans">All-time</div>
        </div>

        <!-- Events 24h -->
        <div class="bg-[var(--surface)] border-2 border-[var(--success)] rounded-lg p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-2xl">⚡</span>
            <span class="text-sm text-[var(--muted)] font-sans">Events (24h)</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-1">
            {(metrics.events_24h || 0).toLocaleString()}
          </div>
          <div class="text-xs text-[var(--muted)] font-sans">Recent activity</div>
        </div>

        <!-- Active Projects -->
        <div class="bg-[var(--surface)] border-2 border-[var(--warning)] rounded-lg p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-2xl">📁</span>
            <span class="text-sm text-[var(--muted)] font-sans">Active Projects</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-1">
            {metrics.active_projects || 0}
          </div>
          <div class="text-xs text-[var(--muted)] font-sans">Last 7 days</div>
        </div>

        <!-- Total Files -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-2xl">📄</span>
            <span class="text-sm text-[var(--muted)] font-sans">Files Tracked</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-1">
            {(metrics.total_files || 0).toLocaleString()}
          </div>
          <div class="text-xs text-[var(--muted)] font-sans">Unique files</div>
        </div>

        <!-- Error Count -->
        <div class="bg-[var(--surface)] border-2 border-[var(--error)] rounded-lg p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-2xl">❌</span>
            <span class="text-sm text-[var(--muted)] font-sans">Total Errors</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-1">
            {metrics.error_count || 0}
          </div>
          <div class="text-xs text-[var(--muted)] font-sans">All-time</div>
        </div>

        <!-- Conversations -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-2xl">💬</span>
            <span class="text-sm text-[var(--muted)] font-sans">Conversations</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-1">
            {(metrics.conversation_count || 0).toLocaleString()}
          </div>
          <div class="text-xs text-[var(--muted)] font-sans">Total logged</div>
        </div>

        <!-- Avg Events Per Day -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-2xl">📊</span>
            <span class="text-sm text-[var(--muted)] font-sans">Avg Events/Day</span>
          </div>
          <div class="text-4xl font-bold text-[var(--text-heading)] mb-1">
            {metrics.avg_events_per_day || 0}
          </div>
          <div class="text-xs text-[var(--muted)] font-sans">Last 7 days</div>
        </div>

        <!-- Busiest Hour -->
        {#if metrics.busiest_hour}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-2xl">🕒</span>
              <span class="text-sm text-[var(--muted)] font-sans">Busiest Hour</span>
            </div>
            <div class="text-4xl font-bold text-[var(--text-heading)] mb-1">
              {formatHour(metrics.busiest_hour.hour)}
            </div>
            <div class="text-xs text-[var(--muted)] font-sans">
              {metrics.busiest_hour.count} events
            </div>
          </div>
        {/if}
      </div>

      <!-- Events by Type Breakdown -->
      {#if metrics.events_by_type}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <div class="flex items-center gap-2 mb-4">
            <span class="text-2xl">📋</span>
            <h2 class="text-xl font-semibold text-[var(--text-heading)] font-sans">
              Events by Type
            </h2>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {#each Object.entries(metrics.events_by_type) as [type, count] (type)}
              <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-3">
                <div class="text-sm text-[var(--muted)] font-sans mb-1">{type}</div>
                <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
                  {count.toLocaleString()}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Most Active File -->
      {#if metrics.most_active_file}
        <div
          class="bg-gradient-to-br from-[var(--surface)] to-[var(--bg)] border-2 border-[var(--accent)] rounded-lg p-5"
        >
          <div class="flex items-center gap-2 mb-3">
            <span class="text-2xl">🔥</span>
            <h2 class="text-xl font-semibold text-[var(--text-heading)] font-sans">
              Most Active File (7d)
            </h2>
          </div>
          <div class="font-mono text-lg text-[var(--text-heading)] mb-2">
            {metrics.most_active_file.file}
          </div>
          <div class="text-sm text-[var(--muted)] font-sans">
            <span class="text-2xl font-bold text-[var(--accent)]"
              >{metrics.most_active_file.changes}</span
            > changes
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
