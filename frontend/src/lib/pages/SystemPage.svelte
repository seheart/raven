<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * System Overview Page
   * Backend status, infrastructure, and health monitoring
   */

  import { onMount } from 'svelte';
  import { navigate } from '../utils/router.svelte.js';

  // State
  let backendHealth = $state({
    status: 'unknown',
    version: '0.0.0',
    uptime: 0,
    session_id: '',
    active_agents: 0
  });

  let projectHealth = $state([]);
  let databaseStats = $state({ size: 0, events: 0 });
  let errorCount = $state(0);
  let notifications = $state(0);
  let apiHealth = $state(null);

  let loading = $state(true);
  let error = $state(null);
  let lastUpdated = $state(null);

  // Derived
  const healthyProjects = $derived(
    projectHealth.filter(
      p =>
        p.status === 'active' ||
        p.status === 'recent' ||
        p.status === 'idle' ||
        (p.health_score && p.health_score >= 60)
    ).length
  );

  const totalProjects = $derived(projectHealth.length);

  const systemStatus = $derived(
    (backendHealth.status === 'healthy' || backendHealth.status === 'warning') &&
      projectHealth.length > 0 &&
      healthyProjects >= totalProjects * 0.5
      ? 'healthy'
      : 'degraded'
  );

  const statusColor = $derived(systemStatus === 'healthy' ? 'var(--success)' : 'var(--warning)');

  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  async function loadSystemData() {
    try {
      loading = true;
      error = null;

      const [healthData, projectsData, errorsData, notifData, apiHealthData, dashboardData] =
        await Promise.all([
          api
            .get('/health')

            .catch(() => ({})),
          api
            .get('/health/projects')

            .catch(() => ({ projects: [] })),
          api
            .get('/errors/stats')

            .catch(() => ({ total: 0 })),
          api
            .get('/notifications/stats')

            .catch(() => ({ unread: 0 })),
          api
            .get('/health-checks')

            .catch(() => null),
          api
            .get('/dashboard-stats')

            .catch(() => ({ total_events: 0 }))
        ]);

      backendHealth = {
        status: healthData.status || 'unknown',
        version: healthData.version || '0.0.0',
        uptime: healthData.uptime || 0,
        session_id: healthData.session_id || 'unknown',
        active_agents: healthData.active_agents || 0
      };

      projectHealth = projectsData.projects || [];
      databaseStats = {
        size: healthData.storage?.ravenSize || 0,
        events: dashboardData.total_events || 0
      };

      errorCount = errorsData.total || 0;
      notifications = notifData.unread || 0;
      apiHealth = apiHealthData;

      lastUpdated = new Date();
      loading = false;
    } catch (err) {
      logger.error('Failed to load system data:', err);
      error = err.message;
      loading = false;
    }
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  onMount(() => {
    loadSystemData();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">⚙️ System Overview</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Backend status, infrastructure, and monitoring
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-[var(--muted)] font-mono">Updated: {timeAgo}</span>
        <button
          onclick={() => loadSystemData()}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳' : '↻'} Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 flex justify-between items-center mb-6"
      >
        <span class="text-sm text-[var(--error)] font-sans"
          >⚠️ Failed to load system data: {error}</span
        >
        <button
          onclick={() => loadSystemData()}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {#each Array(4) as _, i (i)}
          <div
            class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <!-- System Status Card -->
      <div
        class="bg-[var(--surface)] border-2 rounded-lg p-5 mb-6 flex gap-5 items-start"
        style="border-color: {statusColor}"
      >
        <div class="text-5xl">{systemStatus === 'healthy' ? '✅' : '⚠️'}</div>
        <div class="flex-1">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] font-sans mb-1">
            System Status: <span style="color: {statusColor}">{systemStatus.toUpperCase()}</span>
          </h2>
          <p class="text-sm text-[var(--muted)] font-sans mb-3">
            Raven v{backendHealth.version} · Uptime: {formatUptime(backendHealth.uptime)}
          </p>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="flex items-center gap-2 text-sm">
              <span class="text-lg">{backendHealth.status === 'healthy' ? '🟢' : '🔴'}</span>
              <span class="text-[var(--text)] font-sans">Backend: {backendHealth.status}</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <span class="text-lg">📁</span>
              <span class="text-[var(--text)] font-sans"
                >Projects: {healthyProjects}/{totalProjects} healthy</span
              >
            </div>
            <div class="flex items-center gap-2 text-sm">
              <span class="text-lg">🤖</span>
              <span class="text-[var(--text)] font-sans"
                >Active Agents: {backendHealth.active_agents}</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <button
          onclick={() => navigate('/system/projects')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex gap-4 items-center hover:border-[var(--accent)] transition-all hover:-translate-y-1"
        >
          <div class="text-3xl">📂</div>
          <div class="flex-1 text-left">
            <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
              {totalProjects}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">Projects Monitored</div>
            <div
              class="text-xs mt-1"
              class:text-[var(--success)]={healthyProjects === totalProjects}
              class:text-[var(--warning)]={healthyProjects < totalProjects}
            >
              {healthyProjects} healthy
            </div>
          </div>
        </button>

        <button
          onclick={() => navigate('/system/storage')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex gap-4 items-center hover:border-[var(--accent)] transition-all hover:-translate-y-1"
        >
          <div class="text-3xl">💾</div>
          <div class="flex-1 text-left">
            <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
              {formatBytes(databaseStats.size)}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">Database Size</div>
            <div class="text-xs text-[var(--muted)] mt-1">
              {databaseStats.events.toLocaleString()} events
            </div>
          </div>
        </button>

        <button
          onclick={() => navigate('/system/errors')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex gap-4 items-center hover:border-[var(--accent)] transition-all hover:-translate-y-1"
          class:border-[var(--error)]={errorCount > 0}
        >
          <div class="text-3xl">🚨</div>
          <div class="flex-1 text-left">
            <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">{errorCount}</div>
            <div class="text-sm text-[var(--muted)] font-sans">System Errors</div>
            <div
              class="text-xs mt-1"
              class:text-[var(--success)]={errorCount === 0}
              class:text-[var(--error)]={errorCount > 0}
            >
              {errorCount === 0 ? 'All clear' : 'Needs attention'}
            </div>
          </div>
        </button>

        <button
          onclick={() => navigate('/system/notifications')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex gap-4 items-center hover:border-[var(--accent)] transition-all hover:-translate-y-1"
          class:border-[var(--warning)]={notifications > 0}
        >
          <div class="text-3xl">🔔</div>
          <div class="flex-1 text-left">
            <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
              {notifications}
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">Notifications</div>
            <div class="text-xs text-[var(--muted)] mt-1">Unread messages</div>
          </div>
        </button>
      </div>

      <!-- Project Health -->
      {#if projectHealth.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] font-sans mb-4">
            📊 Project Health Status
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {#each projectHealth.slice(0, 6) as project (project.name)}
              <div
                class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3"
                class:border-l-4={project.status === 'active' ||
                  project.status === 'recent' ||
                  project.status === 'idle'}
                class:border-l-[var(--success)]={project.status === 'active' ||
                  project.status === 'recent' ||
                  project.status === 'idle'}
              >
                <div class="text-xl">
                  {#if project.status === 'active' || project.status === 'recent'}
                    ✅
                  {:else if project.status === 'idle'}
                    🟢
                  {:else}
                    ⚠️
                  {/if}
                </div>
                <div class="flex-1">
                  <div class="font-semibold text-[var(--text)] font-mono text-sm">
                    {project.name}
                  </div>
                  <div class="text-xs text-[var(--muted)] font-sans mt-1">
                    {project.recent_events || 0} events · Health: {project.health_score || 0}%
                  </div>
                </div>
              </div>
            {/each}
          </div>
          {#if projectHealth.length > 6}
            <button
              onclick={() => navigate('/system/projects')}
              class="text-sm text-[var(--accent)] font-sans hover:underline"
            >
              View all {projectHealth.length} projects →
            </button>
          {/if}
        </div>
      {/if}

      <!-- API Health Checks -->
      {#if apiHealth && apiHealth.summary}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 mb-6">
          <h2 class="text-xl font-semibold text-[var(--text-heading)] font-sans mb-4">
            🏥 API Health Checks
          </h2>
          <div class="flex gap-6 mb-4">
            <div class="text-center">
              <div class="text-3xl font-bold text-[var(--text)] font-mono">
                {apiHealth.summary.total}
              </div>
              <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mt-1">
                Total Checks
              </div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-bold text-[var(--success)] font-mono">
                {apiHealth.summary.passed}
              </div>
              <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mt-1">
                Passed
              </div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-bold text-[var(--error)] font-mono">
                {apiHealth.summary.failed}
              </div>
              <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mt-1">
                Failed
              </div>
            </div>
          </div>
          <button
            onclick={() => navigate('/system/api')}
            class="text-sm text-[var(--accent)] font-sans hover:underline"
          >
            View detailed health checks →
          </button>
        </div>
      {/if}

      <!-- Quick Actions -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h2 class="text-xl font-semibold text-[var(--text-heading)] font-sans mb-4">
          🚀 Quick Actions
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onclick={() => navigate('/system/status')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3 items-center hover:border-[var(--accent)] transition-colors"
          >
            <div class="text-2xl">📊</div>
            <div class="text-left">
              <div class="font-semibold text-sm text-[var(--text)] font-sans">System Status</div>
              <div class="text-xs text-[var(--muted)] font-sans">Backend connectivity</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/system/anomalies')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3 items-center hover:border-[var(--accent)] transition-colors"
          >
            <div class="text-2xl">🚨</div>
            <div class="text-left">
              <div class="font-semibold text-sm text-[var(--text)] font-sans">Anomaly Alerts</div>
              <div class="text-xs text-[var(--muted)] font-sans">Unusual patterns</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/system/storage')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3 items-center hover:border-[var(--accent)] transition-colors"
          >
            <div class="text-2xl">💾</div>
            <div class="text-left">
              <div class="font-semibold text-sm text-[var(--text)] font-sans">
                Storage Management
              </div>
              <div class="text-xs text-[var(--muted)] font-sans">Database & retention</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/system/sync')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3 items-center hover:border-[var(--accent)] transition-colors"
          >
            <div class="text-2xl">🔄</div>
            <div class="text-left">
              <div class="font-semibold text-sm text-[var(--text)] font-sans">Server Sync</div>
              <div class="text-xs text-[var(--muted)] font-sans">Remote sync</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/system/projects')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3 items-center hover:border-[var(--accent)] transition-colors"
          >
            <div class="text-2xl">📂</div>
            <div class="text-left">
              <div class="font-semibold text-sm text-[var(--text)] font-sans">Projects Config</div>
              <div class="text-xs text-[var(--muted)] font-sans">Manage projects</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/system/notifications')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3 items-center hover:border-[var(--accent)] transition-colors"
          >
            <div class="text-2xl">🔔</div>
            <div class="text-left">
              <div class="font-semibold text-sm text-[var(--text)] font-sans">Notifications</div>
              <div class="text-xs text-[var(--muted)] font-sans">Alerts history</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/system/errors')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3 items-center hover:border-[var(--accent)] transition-colors"
          >
            <div class="text-2xl">🐛</div>
            <div class="text-left">
              <div class="font-semibold text-sm text-[var(--text)] font-sans">Error Log</div>
              <div class="text-xs text-[var(--muted)] font-sans">Error tracking</div>
            </div>
          </button>

          <button
            onclick={() => navigate('/system/api')}
            class="bg-[var(--bg)] border border-[var(--border)] rounded p-3 flex gap-3 items-center hover:border-[var(--accent)] transition-colors"
          >
            <div class="text-2xl">🏥</div>
            <div class="text-left">
              <div class="font-semibold text-sm text-[var(--text)] font-sans">API Health</div>
              <div class="text-xs text-[var(--muted)] font-sans">Endpoint monitoring</div>
            </div>
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
