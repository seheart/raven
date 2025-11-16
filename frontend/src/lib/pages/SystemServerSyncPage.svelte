<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../apiClient.js';
  import { notifications } from '../notificationService.js';
  import { formatDateTime, formatRelativeTime, getTimeAgo } from '../timeFormat.js';

  /**
   * Server Sync Page - SSH/rsync backup system
   * Sync Raven data to remote server for backup/disaster recovery
   */

  // Server configuration state
  let config = $state({
    host: '',
    port: 22,
    user: '',
    path: '',
    syncDatabases: true,
    syncSnapshots: true,
    syncConfig: false,
    autoSync: false,
    autoSyncInterval: 3600 // seconds (default: 1 hour)
  });

  // Status state
  let connectionStatus = $state('unknown'); // unknown, testing, success, failed
  let lastConnectionTest = $state(null);
  let syncing = $state(false);
  let syncProgress = $state({ stage: '', percent: 0, message: '' });
  let lastSync = $state(null);
  let syncHistory = $state([]);
  let loading = $state(true);
  let saveStatus = $state(null);
  let remoteStats = $state(null);
  let loadingStats = $state(false);
  let lastUpdated = $state(null);
  let isManualRefresh = $state(false);
  let previousAutoSync = $state(false); // Track previous value to prevent reactive loop

  // Auto-sync interval reference
  let autoSyncInterval = null;

  // Track timeouts for cleanup
  let saveStatusTimeout = null;
  let syncProgressTimeouts = [];

  // Derived state for connection status
  const connectionStatusIcon = $derived(() => {
    switch (connectionStatus) {
      case 'success': return '✅';
      case 'failed': return '❌';
      case 'testing': return '⏳';
      default: return '❓';
    }
  });

  const connectionStatusText = $derived(() => {
    switch (connectionStatus) {
      case 'success': return `Connection successful${lastConnectionTest ? ` (tested ${formatRelativeTime(lastConnectionTest)})` : ''}`;
      case 'failed': return 'Connection failed';
      case 'testing': return 'Testing connection...';
      default: return 'Not tested';
    }
  });

  const connectionStatusClass = $derived(() => {
    switch (connectionStatus) {
      case 'success': return 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30';
      case 'failed': return 'bg-[var(--error)]/10 text-[var(--error)] border-[var(--error)]/30';
      case 'testing': return 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30';
      default: return '';
    }
  });

  // Derived "time ago" for last updated
  let timeAgo = $derived(() => {
    return getTimeAgo(lastUpdated);
  });

  // Load configuration and history
  async function loadConfig(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
      const data = await api.get('/sync/config');

      if (data.config) {
        config = { ...config, ...data.config };
      }

      if (data.lastSync) {
        lastSync = data.lastSync;
      }

      if (data.history) {
        syncHistory = data.history;
      }

      lastUpdated = new Date();
      loading = false;
      isManualRefresh = false;
    } catch (error) {
      console.error('Failed to load sync config:', error);
      loading = false;
      isManualRefresh = false;
    }
  }

  // Save configuration
  async function saveConfig() {
    try {
      saveStatus = 'saving';

      await api.post('/sync/config', config);

      saveStatus = 'success';
      notifications.success('Configuration saved', {
        title: 'Server Config'
      });

      if (saveStatusTimeout) clearTimeout(saveStatusTimeout);
      saveStatusTimeout = setTimeout(() => saveStatus = null, 3000);
    } catch (error) {
      console.error('Failed to save config:', error);
      saveStatus = 'error';
      notifications.error('Failed to save configuration', {
        title: 'Config Error'
      });
    }
  }

  // Test SSH connection
  async function testConnection() {
    if (!config.host || !config.user) {
      notifications.error('Please enter host and user', {
        title: 'Missing Configuration'
      });
      return;
    }

    try {
      connectionStatus = 'testing';
      notifications.info('Testing connection...', {
        title: 'Connection Test'
      });

      const result = await api.post('/sync/test', config);

      if (result.success) {
        connectionStatus = 'success';
        lastConnectionTest = new Date().toISOString();
        notifications.success('Connection successful!', {
          title: 'Connection Test'
        });
      } else {
        connectionStatus = 'failed';
        notifications.error(`Connection failed: ${result.error || 'Unknown error'}`, {
          title: 'Connection Failed'
        });
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      connectionStatus = 'failed';
      notifications.error('Connection test failed', {
        title: 'Connection Error'
      });
    }
  }

  // Load remote server stats
  async function loadRemoteStats() {
    if (!config.host || !config.user || !config.path) {
      return;
    }

    try {
      loadingStats = true;

      const result = await api.post('/sync/remote-stats', config);

      if (result.success) {
        remoteStats = result;
      } else {
        console.error('Failed to load remote stats:', result.error);
        remoteStats = null;
      }

      loadingStats = false;
    } catch (error) {
      console.error('Failed to load remote stats:', error);
      loadingStats = false;
      remoteStats = null;
    }
  }

  // Trigger manual sync
  async function syncNow() {
    if (!config.host || !config.user) {
      notifications.error('Please configure server first', {
        title: 'Missing Configuration'
      });
      return;
    }

    if (connectionStatus !== 'success') {
      notifications.warning('Please test connection first', {
        title: 'Connection Not Tested'
      });
      return;
    }

    try {
      syncing = true;
      syncProgress = { stage: 'preparing', percent: 10, message: 'Preparing files...' };
      notifications.info('Starting sync...', {
        title: 'Server Sync'
      });

      syncProgress = { stage: 'uploading', percent: 50, message: 'Uploading to server...' };

      const result = await api.post('/sync/trigger', config);

      syncProgress = { stage: 'finalizing', percent: 90, message: 'Finalizing...' };

      if (result.success) {
        syncProgress = { stage: 'complete', percent: 100, message: 'Sync complete!' };

        lastSync = {
          timestamp: new Date().toISOString(),
          status: 'success',
          size: result.size || 0,
          files: result.files || 0
        };

        syncHistory = [lastSync, ...syncHistory].slice(0, 10);

        notifications.success(`Sync complete! Uploaded ${formatSize(result.size)}`, {
          title: 'Sync Successful'
        });

        // Reload remote stats after successful sync
        await loadRemoteStats();
      } else {
        syncProgress = { stage: 'error', percent: 0, message: 'Sync failed' };
        notifications.error(`Sync failed: ${result.error || 'Unknown error'}`, {
          title: 'Sync Failed'
        });
      }

      syncing = false;
      const timeout1 = setTimeout(() => {
        syncProgress = { stage: '', percent: 0, message: '' };
      }, 3000);
      syncProgressTimeouts.push(timeout1);
    } catch (error) {
      console.error('Sync failed:', error);
      syncing = false;
      syncProgress = { stage: 'error', percent: 0, message: 'Sync failed' };
      notifications.error('Sync failed', {
        title: 'Sync Error'
      });
      const timeout2 = setTimeout(() => {
        syncProgress = { stage: '', percent: 0, message: '' };
      }, 3000);
      syncProgressTimeouts.push(timeout2);
    }
  }

  // Auto-sync scheduler
  function startAutoSync() {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
    }

    if (config.autoSync && config.autoSyncInterval > 0) {
      autoSyncInterval = setInterval(() => {
        if (connectionStatus === 'success' && !syncing) {
          syncNow();
        }
      }, config.autoSyncInterval * 1000);
    }
  }

  function stopAutoSync() {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
  }

  // Watch for changes to autoSync config
  $effect(() => {
    if (config.autoSync !== previousAutoSync) {
      previousAutoSync = config.autoSync;
      if (config.autoSync) {
        startAutoSync();
      } else {
        stopAutoSync();
      }
    }
  });

  // Format bytes to human-readable size
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // Handle auto-sync toggle (auto-save config)
  async function handleAutoSyncToggle() {
    await saveConfig();
  }

  // Handle interval change (auto-save config)
  async function handleIntervalChange() {
    await saveConfig();
    // Restart auto-sync with new interval
    if (config.autoSync) {
      startAutoSync();
    }
  }

  onMount(async () => {
    await loadConfig();

    // Load remote stats if config exists
    if (config.host && config.user && config.path) {
      await loadRemoteStats();
    }
  });

  onDestroy(() => {
    // Clean up auto-sync interval
    stopAutoSync();

    // Clean up timeouts
    if (saveStatusTimeout) clearTimeout(saveStatusTimeout);
    syncProgressTimeouts.forEach(timeout => clearTimeout(timeout));
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 gap-4">
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1 font-sans">🌐 Server Sync</h1>
        <p class="text-base text-[var(--muted)] font-sans">Backup Raven data to your own server via SSH</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-[var(--muted)] font-mono">Updated: {timeAgo}</span>
        <button
          onclick={() => loadConfig(true)}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors font-sans disabled:opacity-50"
        >
          <span class="inline-block transition-transform" class:animate-spin={isManualRefresh}>🔄</span>
          Refresh
        </button>
      </div>
    </div>

    {#if loading && !config.host}
      <div class="text-center py-12 text-[var(--muted)] font-mono">
        Loading configuration...
      </div>
    {:else}
      <!-- Server Configuration -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-4">
        <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-4 font-sans">Server Configuration</h3>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="col-span-2">
            <label for="host" class="block text-xs font-semibold text-[var(--text)] mb-2 font-sans">Host / IP Address</label>
            <input
              id="host"
              type="text"
              bind:value={config.host}
              placeholder="example.com or 123.45.67.89"
              class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>

          <div>
            <label for="port" class="block text-xs font-semibold text-[var(--text)] mb-2 font-sans">Port</label>
            <input
              id="port"
              type="number"
              bind:value={config.port}
              placeholder="22"
              min="1"
              max="65535"
              class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>

          <div>
            <label for="user" class="block text-xs font-semibold text-[var(--text)] mb-2 font-sans">SSH User</label>
            <input
              id="user"
              type="text"
              bind:value={config.user}
              placeholder="your-username"
              class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>

          <div class="col-span-2">
            <label for="path" class="block text-xs font-semibold text-[var(--text)] mb-2 font-sans">Remote Path</label>
            <input
              id="path"
              type="text"
              bind:value={config.path}
              placeholder="/home/you/raven-backups"
              class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            <small class="block mt-1 text-xs text-[var(--muted)] font-mono">Directory on your server where backups will be stored</small>
          </div>
        </div>

        <div class="flex gap-3 mb-4">
          <button
            onclick={testConnection}
            disabled={connectionStatus === 'testing' || !config.host || !config.user}
            class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connectionStatus === 'testing' ? '⏳ Testing...' : '🔌 Test Connection'}
          </button>

          <button
            onclick={saveConfig}
            disabled={saveStatus === 'saving'}
            class="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm hover:bg-[var(--accent)]/90 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus === 'saving' ? '💾 Saving...' : '💾 Save Settings'}
          </button>
        </div>

        {#if connectionStatus !== 'unknown'}
          <div class="flex items-center gap-3 px-4 py-3 rounded border {connectionStatusClass} font-mono text-sm">
            <span class="text-base">{connectionStatusIcon()}</span>
            <span>{connectionStatusText()}</span>
          </div>
        {/if}
      </section>

      <!-- Sync Options -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-4">
        <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-4 font-sans">What to Sync</h3>

        <div class="space-y-3">
          <label class="flex items-start gap-3 p-3 rounded hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
            <input type="checkbox" bind:checked={config.syncDatabases} class="mt-0.5 cursor-pointer" />
            <div class="flex-1">
              <span class="block text-sm font-medium text-[var(--text)] font-sans">Databases (.raven/db/*.db)</span>
              <small class="block text-xs text-[var(--muted)] font-mono mt-0.5">Main data storage with events, metrics, and logs</small>
            </div>
          </label>

          <label class="flex items-start gap-3 p-3 rounded hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
            <input type="checkbox" bind:checked={config.syncSnapshots} class="mt-0.5 cursor-pointer" />
            <div class="flex-1">
              <span class="block text-sm font-medium text-[var(--text)] font-sans">Snapshots (.raven/snapshots/)</span>
              <small class="block text-xs text-[var(--muted)] font-mono mt-0.5">Point-in-time backups of project state</small>
            </div>
          </label>

          <label class="flex items-start gap-3 p-3 rounded hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
            <input type="checkbox" bind:checked={config.syncConfig} class="mt-0.5 cursor-pointer" />
            <div class="flex-1">
              <span class="block text-sm font-medium text-[var(--text)] font-sans">Configuration (.raven/config/)</span>
              <small class="block text-xs text-[var(--muted)] font-mono mt-0.5">Settings and preferences (optional)</small>
            </div>
          </label>
        </div>
      </section>

      <!-- Sync Control -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-4">
        <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-4 font-sans">Sync Control</h3>

        {#if lastSync}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-[var(--bg)] rounded mb-4">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-[var(--muted)] font-mono uppercase tracking-wider">Last Sync</span>
              <span class="text-sm text-[var(--text)] font-mono font-semibold">{formatDateTime(lastSync.timestamp)}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-xs text-[var(--muted)] font-mono uppercase tracking-wider">Status</span>
              <span class="text-sm font-mono font-semibold" class:text-[var(--success)]={lastSync.status === 'success'} class:text-[var(--error)]={lastSync.status !== 'success'}>
                {lastSync.status === 'success' ? '✅ Success' : '❌ Failed'}
              </span>
            </div>
            {#if lastSync.size}
              <div class="flex flex-col gap-1">
                <span class="text-xs text-[var(--muted)] font-mono uppercase tracking-wider">Size</span>
                <span class="text-sm text-[var(--text)] font-mono font-semibold">{formatSize(lastSync.size)}</span>
              </div>
            {/if}
            {#if lastSync.files}
              <div class="flex flex-col gap-1">
                <span class="text-xs text-[var(--muted)] font-mono uppercase tracking-wider">Files</span>
                <span class="text-sm text-[var(--text)] font-mono font-semibold">{lastSync.files}</span>
              </div>
            {/if}
          </div>
        {:else}
          <div class="text-center py-8 text-[var(--muted)]">
            <span class="block text-3xl mb-2">📦</span>
            <p class="text-sm font-sans">No syncs yet. Click "Sync Now" to start your first backup.</p>
          </div>
        {/if}

        <button
          onclick={syncNow}
          disabled={syncing || connectionStatus !== 'success'}
          class="w-full px-4 py-2.5 bg-[var(--accent)] text-white rounded text-sm font-semibold hover:bg-[var(--accent)]/90 transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed mb-3"
        >
          {syncing ? '🔄 Syncing...' : '🚀 Sync Now'}
        </button>

        {#if syncing && syncProgress.message}
          <div class="p-4 bg-[var(--surface-2)] rounded border border-[var(--border)]">
            <div class="h-2 bg-[var(--surface)] rounded overflow-hidden mb-2">
              <div
                class="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)] transition-all duration-500 ease-out"
                style="width: {syncProgress.percent}%"
              ></div>
            </div>
            <div class="text-xs text-[var(--muted)] font-mono text-center">
              {syncProgress.message} ({syncProgress.percent}%)
            </div>
          </div>
        {/if}

        {#if connectionStatus !== 'success' && !syncing}
          <p class="text-center text-sm text-[var(--muted)] font-sans">💡 Test connection first before syncing</p>
        {/if}
      </section>

      <!-- Auto-Sync Scheduler -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-4">
        <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-4 font-sans">⏰ Auto-Sync Scheduler</h3>

        <div class="space-y-4">
          <label class="flex items-start gap-3 p-3 rounded hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
            <input type="checkbox" bind:checked={config.autoSync} onchange={handleAutoSyncToggle} class="mt-0.5 cursor-pointer" />
            <div class="flex-1">
              <span class="block text-sm font-medium text-[var(--text)] font-sans">Enable automatic sync</span>
              <small class="block text-xs text-[var(--muted)] font-mono mt-0.5">Automatically sync at regular intervals</small>
            </div>
          </label>

          {#if config.autoSync}
            <div class="ml-7 space-y-2">
              <label for="sync-interval" class="block text-xs font-semibold text-[var(--text)] font-sans">Sync Interval:</label>
              <select
                id="sync-interval"
                bind:value={config.autoSyncInterval}
                onchange={handleIntervalChange}
                class="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono cursor-pointer focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value={900}>Every 15 minutes</option>
                <option value={1800}>Every 30 minutes</option>
                <option value={3600}>Every hour (recommended)</option>
                <option value={7200}>Every 2 hours</option>
                <option value={14400}>Every 4 hours</option>
                <option value={28800}>Every 8 hours</option>
                <option value={86400}>Daily</option>
              </select>
              <small class="block text-xs font-mono">
                {#if config.autoSyncInterval < 3600}
                  <span class="text-[var(--warning)]">⚠️ Frequent syncs may increase server load</span>
                {:else}
                  <span class="text-[var(--success)]">✓ Good balance between freshness and performance</span>
                {/if}
              </small>
            </div>

            <div class="flex items-center gap-3 p-3 bg-[var(--surface-2)] rounded border border-[var(--accent)]">
              <span class="text-[var(--success)] text-base animate-pulse">●</span>
              <span class="text-sm text-[var(--text)] font-sans">Auto-sync active: Next sync in ~{Math.floor(config.autoSyncInterval / 60)} minutes</span>
            </div>
          {/if}
        </div>
      </section>

      <!-- Remote Storage Stats -->
      {#if connectionStatus === 'success' && config.host}
        <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-4">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-sm font-semibold text-[var(--text-heading)] font-sans">☁️ Cloud Storage</h3>
            <button
              onclick={loadRemoteStats}
              disabled={loadingStats}
              class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors font-sans disabled:opacity-50"
            >
              {loadingStats ? '⏳ Loading...' : '🔄 Refresh'}
            </button>
          </div>

          {#if loadingStats}
            <div class="text-center py-6 text-[var(--muted)] font-mono text-sm">Loading storage stats...</div>
          {:else if remoteStats && remoteStats.success}
            <div class="grid grid-cols-3 gap-4 mb-4">
              <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 text-center">
                <div class="text-xs text-[var(--muted)] font-mono uppercase tracking-wider mb-2">Total Size</div>
                <div class="text-lg text-[var(--accent)] font-mono font-bold">{formatSize(remoteStats.totalSize)}</div>
              </div>
              <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 text-center">
                <div class="text-xs text-[var(--muted)] font-mono uppercase tracking-wider mb-2">Projects</div>
                <div class="text-lg text-[var(--accent)] font-mono font-bold">{remoteStats.projects?.length || 0}</div>
              </div>
              <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 text-center">
                <div class="text-xs text-[var(--muted)] font-mono uppercase tracking-wider mb-2">Location</div>
                <div class="text-xs text-[var(--text)] font-mono break-all">{remoteStats.remotePath}</div>
              </div>
            </div>

            {#if remoteStats.projects && remoteStats.projects.length > 0}
              <div>
                <h4 class="text-sm font-semibold text-[var(--text)] mb-3 font-sans">Backed Up Projects</h4>
                {#each remoteStats.projects as project (project.name || project)}
                  <div class="bg-[var(--bg)] border border-[var(--border)] rounded p-4 mb-3 hover:border-[var(--accent)] transition-colors">
                    <div class="text-sm font-semibold text-[var(--text)] font-mono mb-2">{project.name}</div>
                    <div class="flex flex-wrap gap-3 text-xs font-mono text-[var(--muted)]">
                      <span class="text-[var(--accent)] font-semibold">{formatSize(project.size)}</span>
                      <span>{project.files} files</span>
                      {#if project.lastModified}
                        <span>{formatDateTime(project.lastModified)}</span>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-center py-8 text-[var(--muted)]">
                <span class="block text-3xl mb-2">📦</span>
                <p class="text-sm font-sans">No projects backed up yet. Run your first sync to start backing up!</p>
              </div>
            {/if}
          {:else if remoteStats && !remoteStats.success}
            <div class="p-4 bg-[var(--error)]/10 border border-[var(--error)]/30 rounded text-[var(--error)] text-sm font-mono text-center">
              ⚠️ {remoteStats.error || 'Failed to load storage stats'}
            </div>
          {/if}
        </section>
      {/if}

      <!-- Sync History -->
      {#if syncHistory.length > 0}
        <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-4">
          <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-4 font-sans">Recent Syncs</h3>
          <div class="space-y-2">
            {#each syncHistory as sync (sync.timestamp)}
              <div class="flex items-center gap-3 px-4 py-3 bg-[var(--bg)] rounded font-mono text-xs">
                <div class="flex-1 text-[var(--text)]">{formatDateTime(sync.timestamp)}</div>
                <div class="text-base" class:text-[var(--success)]={sync.status === 'success'} class:text-[var(--error)]={sync.status !== 'success'}>
                  {sync.status === 'success' ? '✅' : '❌'}
                </div>
                {#if sync.size}
                  <div class="text-[var(--muted)]">{formatSize(sync.size)}</div>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Help Section -->
      <section class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2 font-sans">📚 Documentation</h3>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">Learn more about server sync and backup strategies:</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <a
            href="https://rsync.samba.org/"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-all"
          >
            <span class="text-base">📖</span>
            <span class="text-sm font-medium font-sans">Rsync Documentation</span>
          </a>
          <a
            href="https://www.digitalocean.com/community/tutorials/how-to-use-rsync-to-sync-local-and-remote-directories"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-all"
          >
            <span class="text-base">🔧</span>
            <span class="text-sm font-medium font-sans">Server Setup Guide</span>
          </a>
          <a
            href="https://www.ssh.com/academy/ssh/keygen"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-all"
          >
            <span class="text-base">🔐</span>
            <span class="text-sm font-medium font-sans">SSH Key Configuration</span>
          </a>
          <a
            href="https://www.digitalocean.com/community/tutorials/ssh-essentials-working-with-ssh-servers-clients-and-keys"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-3 px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-all"
          >
            <span class="text-base">❓</span>
            <span class="text-sm font-medium font-sans">SSH Troubleshooting</span>
          </a>
        </div>
      </section>
    {/if}
  </div>
</div>
