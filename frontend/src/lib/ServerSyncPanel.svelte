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

      setTimeout(() => saveStatus = null, 3000);
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
      setTimeout(() => {
        syncProgress = { stage: '', percent: 0, message: '' };
      }, 3000);
    } catch (error) {
      logger.error('Sync failed:', error);
      syncing = false;
      syncProgress = { stage: 'error', percent: 0, message: 'Sync failed' };
      notifications.error('Sync failed', {
        title: 'Sync Error'
      });
      setTimeout(() => {
        syncProgress = { stage: '', percent: 0, message: '' };
      }, 3000);
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

  $: {
    // Watch for changes to autoSync config
    if (config.autoSync) {
      startAutoSync();
    } else {
      stopAutoSync();
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
  function getTimeAgo() {
    if (!lastUpdated) return 'Never';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  $: timeAgo = getTimeAgo();

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
      <button on:click={() => loadConfig(true)} class="btn-refresh" disabled={loading}>
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
          class="btn btn-secondary"
          on:click={testConnection}
          disabled={connectionStatus === 'testing' || !config.host || !config.user}
        >
          {connectionStatus === 'testing' ? '⏳ Testing...' : '🔌 Test Connection'}
        </button>

        <button
          class="btn btn-primary"
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
        class="btn btn-sync"
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
            class="btn btn-sm"
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
          {#each syncHistory as sync (sync)}
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
    padding: 24px;
    position: relative;
    max-width: 1200px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
    gap: 2rem;
  }

  .header-left {
    flex: 1;
  }

  .panel-header h2 {
    font-family: var(--mono);
    font-size: 24px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 8px 0;
  }

  .subtitle {
    color: var(--muted);
    font-size: 14px;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-refresh {
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 14px;
  }

  .refresh-icon.spinning {
    animation: spin-refresh 1s linear infinite;
  }

  @keyframes spin-refresh {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .loading {
    text-align: center;
    padding: 48px;
    color: var(--muted);
    font-family: var(--mono);
  }

  section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }

  section h3 {
    font-family: var(--mono);
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 20px 0;
  }

  /* Form Styles */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-bottom: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  label {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .input {
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    transition: all 0.2s;
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
    gap: 12px;
    margin-bottom: 16px;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-2, var(--accent));
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--surface);
    border-color: var(--accent);
  }

  .btn-sync {
    width: 100%;
    padding: 14px;
    background: var(--success);
    color: white;
    font-size: 14px;
  }

  .btn-sync:hover:not(:disabled) {
    background: var(--success);
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  /* Connection Status */
  .connection-status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 6px;
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
    font-size: 16px;
  }

  /* Checkboxes */
  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
    padding: 12px;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .checkbox-label:hover {
    background: var(--surface-2);
  }

  .checkbox-label input[type="checkbox"] {
    margin-top: 2px;
    cursor: pointer;
    width: 18px;
    height: 18px;
  }

  .checkbox-label span {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
  }

  .checkbox-label small {
    display: block;
    font-size: 11px;
    color: var(--muted);
    margin-top: 4px;
  }

  /* Sync Info */
  .last-sync {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    padding: 16px;
    background: var(--bg);
    border-radius: 6px;
    margin-bottom: 20px;
  }

  .sync-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
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
    padding: 32px;
    color: var(--muted);
  }

  .no-sync .icon {
    font-size: 48px;
    display: block;
    margin-bottom: 12px;
  }

  .no-sync p {
    font-family: var(--mono);
    font-size: 13px;
    margin: 0;
  }

  .sync-hint {
    text-align: center;
    color: var(--muted);
    font-size: 12px;
    font-family: var(--mono);
    margin-top: 12px;
  }

  /* History */
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 12px;
    background: var(--bg);
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 12px;
  }

  .history-time {
    flex: 1;
    color: var(--text);
  }

  .history-status {
    font-size: 14px;
  }

  .history-size {
    color: var(--muted);
  }

  /* Help Section */
  .help-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 12px;
  }

  .help-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    text-decoration: none;
    color: var(--text);
    transition: all 0.2s;
  }

  .help-link:hover {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: translateX(2px);
  }

  .link-icon {
    font-size: 20px;
  }

  .link-text {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
  }

  /* Cloud Storage Stats */
  .stats-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 11px;
  }

  .loading-stats {
    text-align: center;
    padding: 32px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 13px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    text-align: center;
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 24px;
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
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 16px 0;
  }

  .project-item {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    margin-bottom: 12px;
    transition: all 0.2s;
  }

  .project-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .project-name {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 8px;
  }

  .project-details {
    display: flex;
    gap: 16px;
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
    padding: 32px;
    color: var(--muted);
  }

  .no-projects .icon {
    font-size: 48px;
    display: block;
    margin-bottom: 12px;
  }

  .no-projects p {
    font-family: var(--mono);
    font-size: 13px;
    margin: 0;
  }

  .stats-error {
    padding: 16px;
    background: var(--error)22;
    border: 1px solid var(--error)44;
    border-radius: 6px;
    color: var(--error);
    font-family: var(--mono);
    font-size: 13px;
    text-align: center;
  }

  @media (max-width: 768px) {
    .server-sync-panel {
      padding: 16px;
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
      gap: 8px;
    }
  }

  /* Progress Bar */
  .progress-container {
    margin-top: 16px;
    padding: 12px;
    background: var(--surface-2);
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .progress-bar {
    height: 8px;
    background: var(--surface);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2, var(--accent)));
    transition: width 0.3s ease;
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
    gap: 16px;
  }

  .interval-selector {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-left: 28px;
  }

  .interval-selector label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }

  .interval-selector select {
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
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
    margin-top: 16px;
    padding: 12px;
    background: var(--surface-2);
    border-radius: 6px;
    border: 1px solid var(--accent);
    display: flex;
    align-items: center;
    gap: 8px;
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
    margin-bottom: 12px;
  }
</style>
