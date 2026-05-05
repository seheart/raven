<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { dataService } from '../dataService.js';
  import { formatShortDateTime } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton, ToolbarButton } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { logger } from '../logger.js';

  let storage = $state(null);
  let projectStats = $state([]);
  let retention = $state({
    enabled: false,
    retentionDays: 30,
    autoCleanup: false,
    cleanupInterval: 'weekly'
  });
  let loading = $state(true);
  let actionLoading = $state('');
  let actionResult = $state(null);
  let cleanupDays = $state(30);

  const totalDbSize = $derived(
    storage ? storage.databases.reduce((sum, db) => sum + db.size, 0) : 0
  );

  const totalEvents = $derived(projectStats.reduce((sum, p) => sum + p.event_count, 0));

  const maxProjectEvents = $derived(
    projectStats.length > 0 ? Math.max(...projectStats.map(p => p.event_count)) : 1
  );

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function formatDate(d) {
    if (!d) return '';
    return formatShortDateTime(d);
  }

  function formatNumber(n) {
    return n?.toLocaleString() || '0';
  }

  function timeAgo(d) {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function sizePercent(size) {
    if (!totalDbSize) return 0;
    return ((size / totalDbSize) * 100).toFixed(1);
  }

  async function loadData() {
    try {
      loading = true;
      const [storageData, retentionData, projectData] = await Promise.all([
        dataService.fetch('/storage', { ttl: 30000 }).catch(() => null),
        api.get('/storage/retention').catch(() => retention),
        dataService.fetch('/storage/projects', { ttl: 10000 }).catch(() => [])
      ]);
      if (storageData) storage = storageData;
      retention = retentionData;
      projectStats = Array.isArray(projectData) ? projectData : [];
    } catch (err) {
      logger.error('Failed to load storage data:', err);
    } finally {
      loading = false;
    }
  }

  async function vacuumDb(dbName) {
    actionLoading = `vacuum-${dbName}`;
    actionResult = null;
    try {
      const result = await api.post(`/storage/vacuum/${dbName}`);
      actionResult = {
        type: 'success',
        message: `${dbName}: saved ${formatBytes(result.spaceSaved)} (${result.percentSaved}% reduction)`
      };
      await loadData();
    } catch (err) {
      actionResult = { type: 'error', message: `Vacuum failed: ${err.message}` };
    } finally {
      actionLoading = '';
    }
  }

  async function cleanDb(dbName) {
    actionLoading = `clean-${dbName}`;
    actionResult = null;
    try {
      const result = await api.post(`/storage/clean/${dbName}`, { days: cleanupDays });
      actionResult = {
        type: 'success',
        message: `${dbName}: deleted ${result.totalDeleted} records older than ${cleanupDays} days`
      };
      await loadData();
    } catch (err) {
      actionResult = { type: 'error', message: `Cleanup failed: ${err.message}` };
    } finally {
      actionLoading = '';
    }
  }

  async function saveRetention() {
    actionLoading = 'retention';
    actionResult = null;
    try {
      await api.post('/storage/retention', retention);
      actionResult = { type: 'success', message: 'Retention policy saved' };
    } catch (err) {
      actionResult = { type: 'error', message: `Failed to save: ${err.message}` };
    } finally {
      actionLoading = '';
    }
  }

  onMount(() => loadData());

  onDestroy(() => abortRequests());
</script>

<PageLayout>
  <PageHeader
    title="Storage"
    description="Database sizes, project usage, and retention"
  >
    {#snippet actions()}
      <RefreshButton onClick={loadData} loading={loading} />
    {/snippet}
  </PageHeader>

    <!-- Action result banner -->
    {#if actionResult}
      <div
        class="mb-4 px-4 py-2 rounded text-sm font-sans border {actionResult.type === 'success'
          ? 'bg-success-subtle border-success text-success'
          : 'bg-error-subtle border-error text-error'}"
      >
        {actionResult.message}
      </div>
    {/if}

    {#if loading && !storage}
      <div class="text-sm text-muted text-center py-12">Loading storage data...</div>
    {:else if storage}
      <!-- Top Stats -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Total Size
          </div>
          <div class="text-sm font-mono text-body">{formatBytes(storage.totalSize)}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Projects
          </div>
          <div class="text-sm font-mono text-body">{projectStats.length}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Events
          </div>
          <div class="text-sm font-mono text-body">{formatNumber(totalEvents)}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Databases
          </div>
          <div class="text-sm font-mono text-body">{storage.databases.length}</div>
        </div>
        <div class="bg-surface border border-border rounded p-4">
          <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Snapshots
          </div>
          <div class="text-sm font-mono text-body">{storage.snapshots.length}</div>
        </div>
      </div>

      <!-- Storage by Project -->
      {#if projectStats.length > 0}
        <div class="bg-surface border border-border rounded-lg p-5 mb-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            Storage by Project
          </h3>
          <div class="space-y-2">
            {#each projectStats as project (project.project_name)}
              <div class="py-3 px-4 bg-canvas rounded border border-border">
                <div class="flex items-center gap-4">
                  <!-- Project name -->
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-mono text-body truncate">
                      {project.project_name}
                    </div>
                    <div class="text-xs text-muted font-sans mt-0.5">
                      {formatNumber(project.file_count)} files &middot; Last active {timeAgo(
                        project.last_event
                      )}
                    </div>
                  </div>

                  <!-- Event bar -->
                  <div class="w-40 hidden md:block">
                    <div
                      class="h-2 bg-canvas rounded overflow-hidden border border-border"
                    >
                      <div
                        class="h-full bg-accent transition-all"
                        style="width: {((project.event_count / maxProjectEvents) * 100).toFixed(
                          1
                        )}%"
                      ></div>
                    </div>
                  </div>

                  <!-- Stats -->
                  <div class="flex gap-4 text-right">
                    <div>
                      <div class="text-sm font-mono text-body">
                        {formatNumber(project.event_count)}
                      </div>
                      <div class="text-[10px] text-muted uppercase">events</div>
                    </div>
                    {#if project.agent_event_count > 0}
                      <div>
                        <div class="text-sm font-mono text-body">
                          {formatNumber(project.agent_event_count)}
                        </div>
                        <div class="text-[10px] text-muted uppercase">agent</div>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Databases -->
      <div class="bg-surface border border-border rounded-lg p-5 mb-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
            Databases
          </h3>
          <div class="flex items-center gap-2 text-xs text-muted font-sans">
            <label for="cleanup-days">Purge older than</label>
            <select
              id="cleanup-days"
              bind:value={cleanupDays}
              class="bg-canvas border border-border rounded px-2 py-1 text-xs font-mono text-body"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>
        </div>

        <div class="space-y-2">
          {#each storage.databases as db (db.name)}
            <div
              class="flex items-center gap-4 py-3 px-4 bg-canvas rounded border border-border"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-mono text-body truncate">{db.name}</span>
                  {#if db.isActive}
                    <span
                      class="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-success text-white rounded"
                      >active</span
                    >
                  {/if}
                </div>
                <div class="text-xs text-muted font-sans mt-0.5">
                  Modified {formatDate(db.modified)}
                </div>
              </div>

              <div class="w-32 hidden md:block">
                <div
                  class="h-2 bg-canvas rounded overflow-hidden border border-border"
                >
                  <div
                    class="h-full bg-accent transition-all"
                    style="width: {sizePercent(db.size)}%"
                  ></div>
                </div>
              </div>

              <div class="text-sm font-mono text-body w-20 text-right">
                {formatBytes(db.size)}
              </div>

              <div class="flex gap-2">
                <button
                  onclick={() => vacuumDb(db.name)}
                  disabled={actionLoading === `vacuum-${db.name}`}
                  class="px-2 py-1 text-xs font-sans bg-surface border border-border rounded hover:border-accent transition-colors disabled:opacity-50"
                  title="Compact database"
                >
                  {actionLoading === `vacuum-${db.name}` ? '...' : 'Compact'}
                </button>
                <button
                  onclick={() => cleanDb(db.name)}
                  disabled={actionLoading === `clean-${db.name}`}
                  class="px-2 py-1 text-xs font-sans bg-surface border border-error border-opacity-30 rounded hover:border-error text-error transition-colors disabled:opacity-50"
                  title="Delete records older than {cleanupDays} days"
                >
                  {actionLoading === `clean-${db.name}` ? '...' : 'Purge'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Snapshots -->
      {#if storage.snapshots.length > 0}
        <div class="bg-surface border border-border rounded-lg p-5 mb-6">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
            Snapshots
          </h3>
          <div class="space-y-2">
            {#each storage.snapshots as snap (snap.project)}
              <div
                class="flex items-center justify-between py-2 px-4 bg-canvas rounded border border-border"
              >
                <span class="text-sm font-mono text-body">{snap.project}</span>
                <span class="text-xs text-muted font-mono">{snap.files} file(s)</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Retention Policy -->
      <div class="bg-surface border border-border rounded-lg p-5">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
          Retention Policy
        </h3>
        <div class="space-y-4">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={retention.enabled}
              class="accent-accent"
            />
            <span class="text-sm text-body font-sans">Enable automatic cleanup</span>
          </label>

          {#if retention.enabled}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pl-7">
              <div>
                <label for="ret-days" class="text-xs text-muted font-sans block mb-1"
                  >Keep data for</label
                >
                <select
                  id="ret-days"
                  bind:value={retention.retentionDays}
                  class="w-full bg-canvas border border-border rounded px-3 py-2 text-sm font-mono text-body"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </div>
              <div>
                <label for="ret-interval" class="text-xs text-muted font-sans block mb-1"
                  >Cleanup frequency</label
                >
                <select
                  id="ret-interval"
                  bind:value={retention.cleanupInterval}
                  class="w-full bg-canvas border border-border rounded px-3 py-2 text-sm font-mono text-body"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
          {/if}

          <div class="pt-2">
            <ToolbarButton variant="primary" onClick={saveRetention} disabled={actionLoading === 'retention'}>
              {actionLoading === 'retention' ? 'Saving...' : 'Save Policy'}
            </ToolbarButton>
          </div>
        </div>
      </div>
    {/if}
</PageLayout>
