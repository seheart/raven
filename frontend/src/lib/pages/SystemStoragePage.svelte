<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { dataService } from '../dataService.js';
  import { formatShortDateTime } from '../timeFormat.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  import { RefreshButton, ToolbarButton, LinkButton } from '../components/ui/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { logger } from '../logger.js';

  let storage = $state(null);
  let projectStats = $state([]);
  // Per-project disk + DB byte breakdown, populated by /storage/projects-disk.
  // The disk scan is slow (du per project) so this fetches separately and
  // doesn't block the rest of the page.
  let projectDisk = $state(null);
  let diskLoading = $state(false);
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
  let diskSort = $state('disk'); // 'disk' | 'db' | 'name'

  const totalDbSize = $derived(
    storage ? storage.databases.reduce((sum, db) => sum + db.size, 0) : 0
  );

  const totalEvents = $derived(projectStats.reduce((sum, p) => sum + p.event_count, 0));

  const sortedDiskRows = $derived.by(() => {
    if (!projectDisk?.rows) return [];
    const rows = [...projectDisk.rows];
    if (diskSort === 'db') {
      rows.sort((a, b) => b.db_bytes - a.db_bytes);
    } else if (diskSort === 'name') {
      rows.sort((a, b) => a.project_name.localeCompare(b.project_name));
    }
    // 'disk' sort is the server's default, leave as-is
    return rows;
  });

  const maxDiskBytes = $derived(sortedDiskRows.reduce((m, r) => Math.max(m, r.disk_bytes ?? 0), 1));
  const maxDbBytes = $derived(sortedDiskRows.reduce((m, r) => Math.max(m, r.db_bytes ?? 0), 1));

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
    // Disk scan runs in background — page renders the rest without waiting.
    loadDiskUsage();
  }

  async function loadDiskUsage() {
    diskLoading = true;
    try {
      const data = await api.get('/storage/projects-disk');
      projectDisk = data;
    } catch (err) {
      logger.error('Failed to load disk usage:', err);
      projectDisk = { rows: [], totals: {} };
    } finally {
      diskLoading = false;
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
  <PageHeader title="Storage" description="Database sizes, project usage, and retention">
    {#snippet actions()}
      <RefreshButton onClick={loadData} {loading} />
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
          Project disk
        </div>
        <div class="text-sm font-mono text-body">
          {projectDisk
            ? formatBytes(projectDisk.totals?.disk_bytes || 0)
            : diskLoading
              ? 'scanning…'
              : '—'}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Raven DB</div>
        <div class="text-sm font-mono text-body">{formatBytes(storage.totalSize)}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Projects</div>
        <div class="text-sm font-mono text-body">
          {projectDisk?.totals?.project_count ?? projectStats.length}
        </div>
      </div>
      <div
        class="bg-surface border border-border rounded p-4"
        title={projectDisk
          ? 'Files Raven sees on disk across all tracked projects.'
          : 'Lifetime file events recorded in the database.'}
      >
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          {projectDisk ? 'Files on disk' : 'Tracked file events'}
        </div>
        <div class="text-sm font-mono text-body">
          {projectDisk
            ? formatNumber(projectDisk.totals?.disk_files || 0)
            : diskLoading
              ? '…'
              : formatNumber(totalEvents)}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Snapshots</div>
        <div class="text-sm font-mono text-body">{storage.snapshots.length}</div>
      </div>
    </div>

    <!-- Disk usage by Project — the headline. Two bars per row: source-tree
           bytes on disk (du, ignores applied) and Raven's tracking footprint
           in the DB (sum of LENGTH(diff)+payload columns by project_name). -->
    <div class="bg-surface border border-border rounded-lg p-5 mb-6">
      <div class="flex justify-between items-baseline mb-4">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
          Storage by project
          {#if diskLoading}<span class="ml-2 text-muted normal-case font-normal animate-pulse"
              >scanning disk…</span
            >{/if}
        </h3>
        <div class="flex items-center gap-1 text-[10px] font-mono text-muted">
          <span>sort:</span>
          {#each [{ k: 'disk', l: 'disk' }, { k: 'db', l: 'db' }, { k: 'name', l: 'name' }] as opt (opt.k)}
            <button
              onclick={() => (diskSort = opt.k)}
              class="px-1.5 py-0.5 rounded transition-colors {diskSort === opt.k
                ? 'bg-accent-subtle text-accent'
                : 'hover:text-body'}"
            >
              {opt.l}
            </button>
          {/each}
        </div>
      </div>
      {#if !projectDisk && !diskLoading}
        <div class="text-xs text-muted text-center py-6">No disk data yet.</div>
      {:else if projectDisk && projectDisk.rows.length === 0}
        <div class="text-xs text-muted text-center py-6">No projects to scan.</div>
      {:else}
        <table class="w-full text-xs font-mono">
          <thead class="text-muted uppercase tracking-wide">
            <tr class="border-b border-border">
              <th class="text-left py-2 font-normal">Project</th>
              <th class="text-right py-2 font-normal w-32">Disk</th>
              <th class="text-right py-2 font-normal hidden md:table-cell w-20">Files</th>
              <th class="text-left py-2 font-normal hidden md:table-cell w-1/3"> Source size </th>
              <th class="text-right py-2 font-normal w-28">DB stored</th>
              <th class="text-left py-2 font-normal hidden lg:table-cell w-1/4">
                Raven tracking size
              </th>
            </tr>
          </thead>
          <tbody>
            {#each sortedDiskRows as row (row.project_name)}
              <tr class="border-b border-border/60 hover:bg-canvas/60 transition-colors">
                <td class="py-2 pr-2">
                  <div class="text-body truncate max-w-[18rem]">{row.project_name}</div>
                  {#if row.path}
                    <div class="text-[10px] text-muted truncate max-w-[18rem]" title={row.path}>
                      {row.path}
                    </div>
                  {:else}
                    <div class="text-[10px] text-warning">unconfigured (DB-only)</div>
                  {/if}
                </td>
                <td class="py-2 pr-2 text-right text-body tabular-nums">
                  {row.path_exists
                    ? row.disk_bytes != null
                      ? formatBytes(row.disk_bytes)
                      : '—'
                    : row.path
                      ? 'missing'
                      : '—'}
                </td>
                <td class="py-2 pr-2 text-right text-muted tabular-nums hidden md:table-cell">
                  {row.disk_files != null ? formatNumber(row.disk_files) : '—'}
                </td>
                <td class="py-2 pr-2 hidden md:table-cell">
                  {#if row.disk_bytes != null}
                    <div class="h-1.5 bg-canvas rounded overflow-hidden border border-border">
                      <div
                        class="h-full bg-accent transition-all"
                        style="width: {((row.disk_bytes / maxDiskBytes) * 100).toFixed(1)}%"
                      ></div>
                    </div>
                  {/if}
                </td>
                <td class="py-2 pr-2 text-right text-body tabular-nums">
                  {formatBytes(row.db_bytes)}
                </td>
                <td class="py-2 pr-2 hidden lg:table-cell">
                  {#if row.db_bytes > 0}
                    <div class="h-1.5 bg-canvas rounded overflow-hidden border border-border">
                      <div
                        class="h-full bg-success/70 transition-all"
                        style="width: {((row.db_bytes / maxDbBytes) * 100).toFixed(1)}%"
                      ></div>
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <!-- Databases -->
    <div class="bg-surface border border-border rounded-lg p-5 mb-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Databases</h3>
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
          <div class="flex items-center gap-4 py-3 px-4 bg-canvas rounded border border-border">
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
              <div class="h-2 bg-canvas rounded overflow-hidden border border-border">
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
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">Snapshots</h3>
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
          <input type="checkbox" bind:checked={retention.enabled} class="accent-accent" />
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
          <ToolbarButton
            variant="primary"
            onClick={saveRetention}
            disabled={actionLoading === 'retention'}
          >
            {actionLoading === 'retention' ? 'Saving...' : 'Save Policy'}
          </ToolbarButton>
        </div>
      </div>
    </div>

    <!-- Export Data — delivers on the "your data is yours" pitch. Each link
         triggers a browser download from /api/export; nothing leaves this
         machine. -->
    <div class="bg-surface border border-border rounded-lg p-5 mt-6">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
        Export your data
      </h3>
      <p class="text-sm text-muted font-sans mb-4">
        Download your full Raven history. Nothing is sent anywhere — this is a direct dump of the
        local database.
      </p>
      <div class="flex flex-wrap gap-2">
        <LinkButton
          href="/api/export?format=sqlite"
          size="sm"
          title="Hot-copy of the live SQLite database (.db). Best for full fidelity."
        >
          SQLite (.db)
        </LinkButton>
        <LinkButton
          href="/api/export?format=jsonl"
          size="sm"
          title="Line-delimited JSON of every high-value table. Best for grep / jq pipelines."
        >
          JSONL
        </LinkButton>
        <LinkButton
          href="/api/export?format=csv"
          size="sm"
          title="Gzipped tarball with one CSV per table. Best for spreadsheets."
        >
          CSV (.tar.gz)
        </LinkButton>
      </div>
    </div>
  {/if}
</PageLayout>
