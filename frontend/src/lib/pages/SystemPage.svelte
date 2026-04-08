<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  import { onMount } from 'svelte';
  import { navigate } from '../utils/router.svelte.js';
  import { websocketService } from '../services/websocket.js';

  let backendHealth = $state({
    connected: false,
    status: 'unknown',
    version: '0.0.0',
    uptime: 0,
    session_id: '',
    active_agents: 0,
    database: '',
    database_health: { status: 'unknown', accessible: false }
  });

  let websocketStatus = $state({ connected: false });
  let gitStatus = $state({
    available: false,
    branch: 'unknown',
    modified: [],
    created: [],
    deleted: [],
    commits: []
  });

  let healthChecks = $state({
    status: 'pending',
    summary: { total: 0, passed: 0, failed: 0, byCategory: {} },
    checks: []
  });

  let projectHealth = $state([]);
  let errorCount = $state(0);
  let loading = $state(true);
  let lastUpdated = $state(null);
  let _healthExpanded = $state(false);

  const timeAgo = $derived.by(() => {
    if (!lastUpdated) return 'Just now';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  });

  async function loadAll() {
    try {
      loading = true;

      const [health, projects, errors, git, checks, gitHistory] = await Promise.all([
        api.get('/health').catch(() => ({})),
        api.get('/health/projects').catch(() => ({ projects: [] })),
        api.get('/errors/stats').catch(() => ({ total: 0 })),
        api.get('/git/status').catch(() => null),
        api.get('/health-checks').catch(() => ({
          status: 'healthy',
          checks: [],
          summary: { total: 0, passed: 0, failed: 0 }
        })),
        api.get('/git/history?limit=5').catch(() => null)
      ]);

      backendHealth = {
        connected: !!health.status,
        status: health.status || 'unknown',
        version: health.version || '0.0.0',
        uptime: health.uptime || 0,
        session_id: health.session_id || '',
        active_agents: health.active_agents || 0,
        database: health.database || '',
        database_health: health.database_health || { status: 'unknown', accessible: false }
      };

      projectHealth = projects.projects || [];
      errorCount = errors.total || 0;
      healthChecks = {
        status: checks.status || 'pending',
        summary: checks.summary || { total: 0, passed: 0, failed: 0, byCategory: {} },
        checks: checks.checks || []
      };

      if (git) {
        gitStatus = {
          available: true,
          branch: git.branch || 'unknown',
          modified: git.modified || [],
          created: git.created || [],
          deleted: git.deleted || [],
          commits: gitHistory?.commits || []
        };
      }

      websocketStatus.connected = websocketService.isConnected();

      lastUpdated = new Date();
    } catch (err) {
      logger.error('Failed to load system data:', err);
    } finally {
      loading = false;
    }
  }

  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function formatCommitDate(date) {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onMount(() => {
    // Ensure WebSocket is connected
    websocketService.connect();
    loadAll();

    // Listen for connection state changes
    const onConnect = () => {
      websocketStatus.connected = true;
    };
    const onDisconnect = () => {
      websocketStatus.connected = false;
    };
    websocketService.on('connect', onConnect);
    websocketService.on('disconnect', onDisconnect);

    // Re-check after socket has time to connect
    const checkTimer = setTimeout(() => {
      websocketStatus.connected = websocketService.isConnected();
    }, 2000);

    return () => {
      websocketService.off('connect', onConnect);
      websocketService.off('disconnect', onDisconnect);
      clearTimeout(checkTimer);
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">System</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Raven v{backendHealth.version} · Uptime: {formatUptime(backendHealth.uptime)}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-[var(--muted)] font-mono">{timeAgo}</span>
        <button
          onclick={loadAll}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {#each Array(3) as _, i (i)}
          <div
            class="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <!-- Status Indicators -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Backend
          </div>
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full {backendHealth.connected
                ? 'bg-[var(--success)]'
                : 'bg-[var(--error)]'}"
            ></span>
            <span class="text-sm font-mono text-[var(--text)]"
              >{backendHealth.connected ? 'Online' : 'Offline'}</span
            >
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            WebSocket
          </div>
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full {websocketStatus.connected
                ? 'bg-[var(--success)]'
                : 'bg-[var(--error)]'}"
            ></span>
            <span class="text-sm font-mono text-[var(--text)]"
              >{websocketStatus.connected ? 'Connected' : 'Disconnected'}</span
            >
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded p-4">
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Database
          </div>
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full {backendHealth.database_health.status === 'healthy'
                ? 'bg-[var(--success)]'
                : 'bg-[var(--error)]'}"
            ></span>
            <span class="text-sm font-mono text-[var(--text)]"
              >{backendHealth.database_health.status === 'healthy' ? 'Healthy' : 'Error'}</span
            >
          </div>
        </div>

        <button
          onclick={() => navigate('/system/errors')}
          class="bg-[var(--surface)] border border-[var(--border)] rounded p-4 text-left hover:border-[var(--accent)] transition-colors"
          class:border-[var(--error)]={errorCount > 0}
        >
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            Errors
          </div>
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full {errorCount === 0
                ? 'bg-[var(--success)]'
                : 'bg-[var(--error)]'}"
            ></span>
            <span class="text-sm font-mono text-[var(--text)]"
              >{errorCount === 0 ? 'All clear' : `${errorCount} errors`}</span
            >
          </div>
        </button>
      </div>

      <!-- Backend Details -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            Server Details
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between border-b border-[var(--border)] pb-2">
              <span class="text-[var(--muted)]">Session</span>
              <span class="font-mono text-[var(--text)] text-xs"
                >{backendHealth.session_id
                  ? backendHealth.session_id.slice(0, 12) + '...'
                  : 'N/A'}</span
              >
            </div>
            <div class="flex justify-between border-b border-[var(--border)] pb-2">
              <span class="text-[var(--muted)]">Active Agents</span>
              <span class="font-mono text-[var(--text)]">{backendHealth.active_agents}</span>
            </div>
            <div class="flex justify-between border-b border-[var(--border)] pb-2">
              <span class="text-[var(--muted)]">Database</span>
              <span class="font-mono text-[var(--text)] text-xs"
                >{backendHealth.database
                  ? backendHealth.database.split('/').slice(-2).join('/')
                  : 'N/A'}</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-[var(--muted)]">Projects</span>
              <span class="font-mono text-[var(--text)]">{projectHealth.length} monitored</span>
            </div>
          </div>
        </div>

        <!-- Health Checks -->
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            Health Checks
          </h3>
          <div
            class="px-3 py-2 rounded text-sm font-mono text-center mb-3"
            style="background: {healthChecks.status === 'healthy'
              ? 'var(--success-subtle)'
              : 'var(--error-subtle)'}; color: {healthChecks.status === 'healthy'
                ? 'var(--success)'
                : 'var(--error)'}"
          >
            {healthChecks.status === 'healthy'
              ? 'All Systems Operational'
              : healthChecks.status === 'issues_found'
                ? `${healthChecks.summary.failed} Issues Found`
                : 'Checking...'}
          </div>
          {#if healthChecks.checks.length > 0}
            <div class="space-y-2 mt-3 max-h-60 overflow-y-auto">
              {#each healthChecks.checks as check (check.id || check.name)}
                <div
                  class="flex items-center gap-2 text-xs px-2 py-1.5 bg-[var(--bg)] rounded border border-[var(--border)]"
                >
                  <span
                    class="w-1.5 h-1.5 rounded-full flex-shrink-0 {check.passed
                      ? 'bg-[var(--success)]'
                      : 'bg-[var(--error)]'}"
                  ></span>
                  <span class="font-mono text-[var(--text)] flex-1 truncate"
                    >{check.name || check.check_name || 'Check'}</span
                  >
                </div>
              {/each}
            </div>
          {/if}
          <button
            onclick={() => navigate('/system/health-monitor')}
            class="text-xs text-[var(--accent)] font-sans hover:underline mt-3 block"
          >
            Detailed diagnostics →
          </button>
        </div>
      </div>

      <!-- Git -->
      {#if gitStatus.available}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
            Git Repository
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-[var(--muted)]">Branch</span><span
                  class="font-mono text-[var(--text)]">{gitStatus.branch}</span
                >
              </div>
              <div class="flex justify-between">
                <span class="text-[var(--muted)]">Modified</span><span
                  class="font-mono text-[var(--text)]">{gitStatus.modified.length}</span
                >
              </div>
              <div class="flex justify-between">
                <span class="text-[var(--muted)]">New</span><span
                  class="font-mono text-[var(--text)]">{gitStatus.created.length}</span
                >
              </div>
              <div class="flex justify-between">
                <span class="text-[var(--muted)]">Deleted</span><span
                  class="font-mono text-[var(--text)]">{gitStatus.deleted.length}</span
                >
              </div>
            </div>
            {#if gitStatus.commits.length > 0}
              <div class="space-y-2">
                {#each gitStatus.commits.slice(0, 3) as commit (commit.hash)}
                  <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-2">
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-xs font-mono text-[var(--accent)]"
                        >{commit.hash?.slice(0, 7)}</span
                      >
                      <span class="text-xs text-[var(--muted)]"
                        >{formatCommitDate(commit.date)}</span
                      >
                    </div>
                    <div class="text-xs text-[var(--text)] truncate">{commit.message}</div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
