<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { notifications } from './notificationService.js';
  import { formatDateTime } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { api } from './apiClient.js';

  const API_BASE = API_CONFIG.API_BASE;

  // Server configuration
  let config = {
    host: '',
    port: 22,
    user: '',
    path: '',
    syncDatabases: true,
    syncSnapshots: true,
    syncConfig: false,
    autoSync: false,
    autoSyncInterval: 3600 // seconds (default: 1 hour)
  };

  // Status
  let connectionStatus = 'unknown'; // unknown, testing, success, failed
  let lastConnectionTest = null;
  let syncing = false;
  let syncProgress = { stage: '', percent: 0, message: '' };
  let lastSync = null;
  let syncHistory = [];
  let loading = true;
  let saveStatus = null;
  let remoteStats = null;
  let loadingStats = false;
  let autoSyncInterval = null;
  let lastUpdated = null;
  let isManualRefresh = false;
  let previousAutoSync = false; // Track previous value to prevent reactive loop

  // Track timeouts for cleanup
  let saveStatusTimeout = null;
  let syncProgressTimeouts = [];

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
      logger.error('Failed to load sync config:', error);
      loading = false;
      isManualRefresh = false;
    }
  }

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
      logger.error('Failed to save config:', error);
      saveStatus = 'error';
      notifications.error('Failed to save configuration', {
        title: 'Config Error'
      });
    }
  }

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
      logger.error('Connection test failed:', error);
      connectionStatus = 'failed';
      notifications.error('Connection test failed', {
        title: 'Connection Error'
      });
    }
  }

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
        logger.error('Failed to load remote stats:', result.error);
        remoteStats = null;
      }

      loadingStats = false;
    } catch (error) {
      logger.error('Failed to load remote stats:', error);
      loadingStats = false;
      remoteStats = null;
    }
  }

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
      logger.error('Sync failed:', error);
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

  // Watch for changes to autoSync config (fix: track previous value to prevent infinite loop)
  $: {
    if (config.autoSync !== previousAutoSync) {
      previousAutoSync = config.autoSync;
      if (config.autoSync) {
        startAutoSync();
      } else {
        stopAutoSync();
      }
    }
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function getConnectionStatusIcon() {
    switch (connectionStatus) {
    case 'success': return '✅';
    case 'failed': return '❌';
    case 'testing': return '⏳';
    default: return '❓';
    }
  }

  function getConnectionStatusText() {
    switch (connectionStatus) {
    case 'success': return `Connection successful${lastConnectionTest ? ` (tested ${formatRelativeTime(lastConnectionTest)})` : ''}`;
    case 'failed': return 'Connection failed';
    case 'testing': return 'Testing connection...';
    default: return 'Not tested';
    }
  }

  function formatRelativeTime(timestamp) {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  // Format "time ago" for last updated timestamp

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  let timeAgo = 'Just now';
  // Update time ago when lastUpdated changes (prevents infinite loop)
  $: if (lastUpdated) {
    if (!lastUpdated) timeAgo = 'Just now';
    else {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 10) timeAgo = 'Just now';
      else if (seconds < 60) timeAgo = `${seconds}s ago`;
      else if (seconds < 3600) timeAgo = `${Math.floor(seconds / 60)}m ago`;
      else timeAgo = `${Math.floor(seconds / 3600)}h ago`;
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

<div class="server-sync-panel">
  <div class="panel-header">
    <div class="header-left">
      <h2>🌐 Server Sync</h2>
      <p class="subtitle">Backup Raven data to your own server via SSH</p>
    </div>
    <div class="header-actions">
      <span class="last-updated">Updated: {timeAgo}</span>
      <button on:click={() => loadConfig(true)} class="btn btn-secondary btn-sm" disabled={loading}>
        <span class="refresh-icon" class:spinning={isManualRefresh}>🔄</span>
        Refresh
      </button>
    </div>
  </div>

  {#if loading && !config.host}
    <LoadingSkeleton count={6} height="100px" />
  {:else}
    <!-- Server Configuration -->
    <section class="config-section">
      <h3>Server Configuration</h3>
      <div class="form-grid">
        <div class="form-group full-width">
          <label for="host">Host / IP Address</label>
          <input
            id="host"
            type="text"
            bind:value={config.host}
            placeholder="example.com or 123.45.67.89"
            class="input"
          />
        </div>

        <div class="form-group">
          <label for="port">Port</label>
          <input
            id="port"
            type="number"
            bind:value={config.port}
            placeholder="22"
            class="input"
            min="1"
            max="65535"
          />
        </div>

        <div class="form-group">
          <label for="user">SSH User</label>
          <input
            id="user"
            type="text"
            bind:value={config.user}
            placeholder="your-username"
            class="input"
          />
        </div>

        <div class="form-group full-width">
          <label for="path">Remote Path</label>
          <input
            id="path"
            type="text"
            bind:value={config.path}
            placeholder="/home/you/raven-backups"
            class="input"
          />
          <small class="hint">Directory on your server where backups will be stored</small>
        </div>
      </div>

      <div class="action-buttons">
        <button
          class="btn btn-secondary btn-sm"
          on:click={testConnection}
          disabled={connectionStatus === 'testing' || !config.host || !config.user}
        >
          {connectionStatus === 'testing' ? '⏳ Testing...' : '🔌 Test Connection'}
        </button>

        <button
          class="btn btn-primary btn-sm"
          on:click={saveConfig}
          disabled={saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? '💾 Saving...' : '💾 Save Settings'}
        </button>
      </div>

      {#if connectionStatus !== 'unknown'}
        <div class="connection-status status-{connectionStatus}">
          <span class="status-icon">{getConnectionStatusIcon()}</span>
          <span class="status-text">{getConnectionStatusText()}</span>
        </div>
      {/if}
    </section>

    <!-- Sync Options -->
    <section class="options-section">
      <h3>What to Sync</h3>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={config.syncDatabases} />
          <span>Databases (.raven/db/*.db)</span>
          <small>Main data storage with events, metrics, and logs</small>
        </label>

        <label class="checkbox-label">
          <input type="checkbox" bind:checked={config.syncSnapshots} />
          <span>Snapshots (.raven/snapshots/)</span>
          <small>Point-in-time backups of project state</small>
        </label>

        <label class="checkbox-label">
          <input type="checkbox" bind:checked={config.syncConfig} />
          <span>Configuration (.raven/config/)</span>
          <small>Settings and preferences (optional)</small>
        </label>
      </div>
    </section>

    <!-- Sync Actions -->
    <section class="sync-section">
      <h3>Sync Control</h3>

      {#if lastSync}
        <div class="last-sync">
          <div class="sync-info">
            <span class="label">Last sync:</span>
            <span class="value">{formatDateTime(lastSync.timestamp)}</span>
          </div>
          <div class="sync-info">
            <span class="label">Status:</span>
            <span class="value status-{lastSync.status}">
              {lastSync.status === 'success' ? '✅ Success' : '❌ Failed'}
            </span>
          </div>
          {#if lastSync.size}
            <div class="sync-info">
              <span class="label">Size:</span>
              <span class="value">{formatSize(lastSync.size)}</span>
            </div>
          {/if}
          {#if lastSync.files}
            <div class="sync-info">
              <span class="label">Files:</span>
              <span class="value">{lastSync.files}</span>
            </div>
          {/if}
        </div>
      {:else}
        <div class="no-sync">
          <span class="icon">📦</span>
          <p>No syncs yet. Click "Sync Now" to start your first backup.</p>
        </div>
      {/if}

      <button
        class="btn btn-primary btn-md"
        on:click={syncNow}
        disabled={syncing || connectionStatus !== 'success'}
      >
        {syncing ? '🔄 Syncing...' : '🚀 Sync Now'}
      </button>

      {#if syncing && syncProgress.message}
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" style="width: {syncProgress.percent}%"></div>
          </div>
          <div class="progress-message">
            {syncProgress.message} ({syncProgress.percent}%)
          </div>
        </div>
      {/if}

      {#if connectionStatus !== 'success' && !syncing}
        <p class="sync-hint">💡 Test connection first before syncing</p>
      {/if}
    </section>

    <!-- Auto-Sync Scheduler -->
    <section class="sync-section">
      <h3>⏰ Auto-Sync Scheduler</h3>

      <div class="scheduler-controls">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={config.autoSync} on:change={saveConfig} />
          <span>Enable automatic sync</span>
          <small>Automatically sync at regular intervals</small>
        </label>

        {#if config.autoSync}
          <div class="interval-selector">
            <label for="sync-interval">Sync Interval:</label>
            <select id="sync-interval" bind:value={config.autoSyncInterval} on:change={saveConfig}>
              <option value={900}>Every 15 minutes</option>
              <option value={1800}>Every 30 minutes</option>
              <option value={3600}>Every hour (recommended)</option>
              <option value={7200}>Every 2 hours</option>
              <option value={14400}>Every 4 hours</option>
              <option value={28800}>Every 8 hours</option>
              <option value={86400}>Daily</option>
            </select>
            <small class="help-text">
              {#if config.autoSyncInterval < 3600}
                ⚠️ Frequent syncs may increase server load
              {:else}
                ✓ Good balance between freshness and performance
              {/if}
            </small>
          </div>
        {/if}
      </div>

      {#if config.autoSync}
        <div class="auto-sync-status">
          <span class="status-indicator active">●</span>
          <span>Auto-sync active: Next sync in ~{Math.floor(config.autoSyncInterval / 60)} minutes</span>
        </div>
      {/if}
    </section>

    <!-- Remote Storage Stats -->
    {#if connectionStatus === 'success' && config.host}
      <section class="stats-section">
        <div class="section-header-row">
          <h3>☁️ Cloud Storage</h3>
          <button
            class="btn btn-secondary btn-sm"
            on:click={loadRemoteStats}
            disabled={loadingStats}
          >
            {loadingStats ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {#if loadingStats}
          <div class="loading-stats">Loading storage stats...</div>
        {:else if remoteStats && remoteStats.success}
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Total Size</div>
              <div class="stat-value">{formatSize(remoteStats.totalSize)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Projects</div>
              <div class="stat-value">{remoteStats.projects?.length || 0}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Location</div>
              <div class="stat-value-small">{remoteStats.remotePath}</div>
            </div>
          </div>

          {#if remoteStats.projects && remoteStats.projects.length > 0}
            <div class="projects-list">
              <h4>Backed Up Projects</h4>
              {#each remoteStats.projects as project (project.name || project)}
                <div class="project-item">
                  <div class="project-name">{project.name}</div>
                  <div class="project-details">
                    <span class="project-size">{formatSize(project.size)}</span>
                    <span class="project-files">{project.files} files</span>
                    {#if project.lastModified}
                      <span class="project-date">{formatDateTime(project.lastModified)}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="no-projects">
              <span class="icon">📦</span>
              <p>No projects backed up yet. Run your first sync to start backing up!</p>
            </div>
          {/if}
        {:else if remoteStats && !remoteStats.success}
          <div class="stats-error">
            ⚠️ {remoteStats.error || 'Failed to load storage stats'}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Sync History -->
    {#if syncHistory.length > 0}
      <section class="history-section">
        <h3>Recent Syncs</h3>
        <div class="history-list">
          {#each syncHistory as sync (sync.timestamp)}
            <div class="history-item">
              <div class="history-time">{formatDateTime(sync.timestamp)}</div>
              <div class="history-status status-{sync.status}">
                {sync.status === 'success' ? '✅' : '❌'}
              </div>
              {#if sync.size}
                <div class="history-size">{formatSize(sync.size)}</div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Help Section -->
    <section class="help-section">
      <h3>📚 Documentation</h3>
      <p class="help-intro">Learn more about server sync and backup strategies:</p>
      <div class="help-links">
        <a href="https://rsync.samba.org/" target="_blank" rel="noopener noreferrer" class="help-link">
          <span class="link-icon">📖</span>
          <span class="link-text">Rsync Documentation</span>
        </a>
        <a href="https://www.digitalocean.com/community/tutorials/how-to-use-rsync-to-sync-local-and-remote-directories" target="_blank" rel="noopener noreferrer" class="help-link">
          <span class="link-icon">🔧</span>
          <span class="link-text">Server Setup Guide</span>
        </a>
        <a href="https://www.ssh.com/academy/ssh/keygen" target="_blank" rel="noopener noreferrer" class="help-link">
          <span class="link-icon">🔐</span>
          <span class="link-text">SSH Key Configuration</span>
        </a>
        <a href="https://www.digitalocean.com/community/tutorials/ssh-essentials-working-with-ssh-servers-clients-and-keys" target="_blank" rel="noopener noreferrer" class="help-link">
          <span class="link-icon">❓</span>
          <span class="link-text">SSH Troubleshooting</span>
        </a>
      </div>
    </section>
  {/if}
</div>

<style>
  .server-sync-panel {
    padding: var(--space-lg);
    position: relative;
    max-width: 1200px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-4xl);
    gap: var(--space-2xl);
  }

  .header-left {
    flex: 1;
  }

  .panel-header h2 {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-lg) 0;
  }

  .subtitle {
    color: var(--muted);
    font-size: 11px;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  /* Button styles removed - using global .btn classes */

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin-refresh 1s linear infinite;
  }

  .loading {
    text-align: center;
    padding: var(--space-3xl);
    color: var(--muted);
    font-family: var(--mono);
  }

  section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  section h3 {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-3xl) 0;
  }

  /* Form Styles */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  label {
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .input {
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent)33;
  }

  .input::placeholder {
    color: var(--muted);
  }

  .hint {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  /* Buttons */
  .action-buttons {
    display: flex;
    gap: var(--space-xl);
    margin-bottom: var(--space-md);
  }

  /* Connection Status */
  .connection-status {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-lg);
    border-radius: var(--radius-sm);
    font-family: var(--mono);
    font-size: 13px;
  }

  .status-success {
    background: var(--success)22;
    color: var(--success);
    border: 1px solid var(--success)44;
  }

  .status-failed {
    background: var(--error)22;
    color: var(--error);
    border: 1px solid var(--error)44;
  }

  .status-testing {
    background: var(--warning)22;
    color: var(--warning);
    border: 1px solid var(--warning)44;
  }

  .status-icon {
    font-size: 11px;
  }

  /* Checkboxes */
  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: var(--space-xl);
    cursor: pointer;
    padding: var(--space-xl);
    border-radius: var(--radius-sm);
    transition: background var(--duration-base) var(--ease-smooth);
  }

  .checkbox-label:hover {
    background: var(--surface-2);
  }

  .checkbox-label input[type="checkbox"] {
    margin-top: var(--space-xs);
    cursor: pointer;
    width: var(--icon-sm);
    height: var(--icon-sm);
  }

  .checkbox-label span {
    font-family: var(--sans);
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
  }

  .checkbox-label small {
    display: block;
    font-size: 11px;
    color: var(--muted);
    margin-top: var(--space-sm);
  }

  /* Sync Info */
  .last-sync {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg);
    padding: var(--space-2xl);
    background: var(--bg);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-lg);
  }

  .sync-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .sync-info .label {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sync-info .value {
    font-size: 13px;
    color: var(--text);
    font-family: var(--mono);
    font-weight: 600;
  }

  .no-sync {
    text-align: center;
    padding: var(--space-xl);
    color: var(--muted);
  }

  .no-sync .icon {
    font-size: 11px;
    display: block;
    margin-bottom: var(--space-xl);
  }

  .no-sync p {
    font-family: var(--sans);
    font-size: 13px;
    margin: 0;
  }

  .sync-hint {
    text-align: center;
    color: var(--muted);
    font-size: 12px;
    font-family: var(--sans);
    margin-top: var(--space-xl);
  }

  /* History */
  .history-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border-radius: var(--radius-sm);
    font-family: var(--mono);
    font-size: 12px;
  }

  .history-time {
    flex: 1;
    color: var(--text);
  }

  .history-status {
    font-size: 11px;
  }

  .history-size {
    color: var(--muted);
  }

  /* Help Section */
  .help-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--space-xl);
  }

  .help-link {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-md) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--text);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .help-link:hover {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: translateX(2px);
  }

  .link-icon {
    font-size: 13px;
  }

  .link-text {
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 500;
  }

  /* Cloud Storage Stats */
  .stats-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  /* Button styles removed - using global .btn classes */

  .loading-stats {
    text-align: center;
    padding: var(--space-xl);
    color: var(--muted);
    font-family: var(--mono);
    font-size: 13px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .stat-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2xl);
    text-align: center;
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-lg);
  }

  .stat-value {
    font-size: 11px;
    color: var(--accent);
    font-family: var(--mono);
    font-weight: 700;
  }

  .stat-value-small {
    font-size: 12px;
    color: var(--text);
    font-family: var(--mono);
    word-break: break-all;
  }

  .projects-list h4 {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-lg) 0;
  }

  .project-item {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-xl) var(--space-2xl);
    margin-bottom: var(--space-xl);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .project-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .project-name {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: var(--space-lg);
  }

  .project-details {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  .project-size {
    color: var(--accent);
    font-weight: 600;
  }

  .no-projects {
    text-align: center;
    padding: var(--space-xl);
    color: var(--muted);
  }

  .no-projects .icon {
    font-size: 11px;
    display: block;
    margin-bottom: var(--space-xl);
  }

  .no-projects p {
    font-family: var(--sans);
    font-size: 13px;
    margin: 0;
  }

  .stats-error {
    padding: var(--space-2xl);
    background: var(--error)22;
    border: 1px solid var(--error)44;
    border-radius: var(--radius-sm);
    color: var(--error);
    font-family: var(--mono);
    font-size: 13px;
    text-align: center;
  }

  @media (max-width: 768px) {
    .server-sync-panel {
      padding: var(--space-2xl);
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .action-buttons {
      flex-direction: column;
    }

    .btn {
      width: 100%;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .project-details {
      flex-direction: column;
      gap: var(--space-lg);
    }
  }

  /* Progress Bar */
  .progress-container {
    margin-top: var(--space-2xl);
    padding: var(--space-xl);
    background: var(--surface-2);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .progress-bar {
    height: 8px;
    background: var(--surface);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: var(--space-lg);
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2, var(--accent)));
    transition: width var(--duration-slow) var(--ease-smooth);
  }

  .progress-message {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
    text-align: center;
  }

  /* Scheduler Controls */
  .scheduler-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .interval-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    margin-left: var(--space-3xl);
  }

  .interval-selector label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }

  .interval-selector select {
    padding: var(--space-lg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    cursor: pointer;
  }

  .interval-selector select:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .help-text {
    font-size: 12px;
    color: var(--muted);
    display: block;
  }

  .auto-sync-status {
    margin-top: var(--space-2xl);
    padding: var(--space-xl);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--accent);
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    font-size: 13px;
  }

  .status-indicator.active {
    color: var(--success);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Help Section */
  .help-intro {
    color: var(--muted);
    font-size: 13px;
    margin-bottom: var(--space-xl);
  }
</style>
