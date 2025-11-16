<script>
  import { onMount, onDestroy } from 'svelte';
  import { notifications } from './notificationService.js';
  import { settings as settingsStore } from './settingsStore.js';
  import { logger } from './logger.js';
  import { getTimeAgo } from './timeFormat.js';

  // Use reactive settings store
  let settings = {};
  let lastModified = null;
  const unsubscribe = settingsStore.subscribe(value => {
    settings = value;
    if (Object.keys(value).length > 0) {
      lastModified = new Date();
    }
  });

  // Clean up subscription on destroy
  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });

  // Settings are auto-saved via the store, no need for manual save
  // function saveSettings() {
  //   // Settings are already saved automatically via the store
  //   // This just shows a confirmation message
  //   notifications.success('Settings saved successfully', {
  //     title: 'Settings Updated'
  //   });
  // }

  // Reset to defaults
  function resetToDefaults() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      settingsStore.reset();
      notifications.info('Settings reset to defaults', {
        title: 'Settings Reset'
      });
    }
  }

  // Export settings as JSON
  function exportSettings() {
    const jsonContent = settingsStore.export();
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notifications.success('Settings exported', {
      title: 'Export Complete'
    });
  }

  // Import settings from JSON
  function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const success = settingsStore.import(e.target.result);
        if (success) {
          notifications.success('Settings imported and applied', {
            title: 'Import Successful'
          });
        } else {
          throw new Error('Invalid settings format');
        }
      } catch {
        notifications.error('Failed to import settings: Invalid file', {
          title: 'Import Error'
        });
      }
    };
    reader.readAsText(file);
  }

  // ===== COMPACT MODE =====
  // Apply/remove compact mode class on body element
  $: {
    if (typeof document !== 'undefined') {
      if (settings.ui?.compactMode) {
        document.body.classList.add('compact-mode');
      } else {
        document.body.classList.remove('compact-mode');
      }
    }
  }

  // ===== DESKTOP NOTIFICATION PERMISSIONS =====
  let notificationPermission = 'default';

  function updateNotificationPermission() {
    if (typeof Notification !== 'undefined') {
      notificationPermission = Notification.permission;
    }
  }

  onMount(() => {
    updateNotificationPermission();

    // Start live timestamp updates
    // Time updates now reactive via $: timeAgo
  });

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined' || !window.isSecureContext) {
      notifications.error('Desktop notifications require a secure context (HTTPS)', {
        title: 'Not Supported'
      });
      return;
    }

    if (Notification.permission === 'granted') {
      notifications.info('Desktop notifications are already enabled', {
        title: 'Already Enabled'
      });
      return;
    }

    if (Notification.permission === 'denied') {
      notifications.warning(
        'Desktop notifications were previously denied. Please enable them in your browser settings.',
        {
          title: 'Permission Denied'
        }
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      updateNotificationPermission();

      if (permission === 'granted') {
        notifications.success('Desktop notifications enabled successfully!', {
          title: 'Permission Granted'
        });
        // Show a test notification
        new Notification('Raven Notifications Enabled', {
          body: 'You will now receive desktop notifications from Raven',
          icon: '/favicon.ico'
        });
      } else {
        notifications.warning('Desktop notification permission was not granted', {
          title: 'Permission Denied'
        });
      }
    } catch {
      logger.error('Error requesting notification permission:', err);
      notifications.error('Failed to request notification permission:', {
        title: 'Error'
      });
    }
  }

  function getPermissionStatusText() {
    switch (notificationPermission) {
      case 'granted':
        return '✓ Granted';
      case 'denied':
        return '✗ Denied';
      case 'default':
        return '? Not requested';
      default:
        return 'Unknown';
    }
  }

  function getPermissionStatusClass() {
    switch (notificationPermission) {
      case 'granted':
        return 'permission-granted';
      case 'denied':
        return 'permission-denied';
      case 'default':
        return 'permission-default';
      default:
        return '';
    }
  }

  // Reactive "time ago" - updates when lastModified changes (no polling!)
  $: timeAgo = getTimeAgo(lastModified);
</script>

<div class="settings-panel" role="region" aria-label="User settings">
  <div class="settings-header">
    <div class="header-left">
      <h2 id="settings-heading">⚙️ User Settings</h2>
      <p class="auto-save-note" role="status" aria-live="polite">⚡ Settings save automatically</p>
    </div>
    <div class="header-actions" role="toolbar" aria-label="Settings actions">
      <span class="last-updated" role="status" aria-live="polite">Modified: {timeAgo}</span>
      <button
        class="btn btn-secondary btn-sm"
        on:click={exportSettings}
        aria-label="Export settings"
      >
        <span aria-hidden="true">📤</span> Export
      </button>
      <label class="btn btn-secondary btn-sm">
        <span aria-hidden="true">📥</span> Import
        <input
          type="file"
          accept=".json"
          on:change={importSettings}
          style="display: none;"
          aria-label="Import settings file"
        />
      </label>
      <button
        class="btn btn-secondary btn-sm"
        on:click={resetToDefaults}
        aria-label="Reset settings to defaults"
      >
        <span aria-hidden="true">🔄</span> Reset
      </button>
    </div>
  </div>

  <div class="settings-content">
    <!-- Notifications Section -->
    <section class="settings-section" aria-labelledby="notifications-heading">
      <h3 id="notifications-heading"><span aria-hidden="true">🔔</span> Notifications</h3>

      <div class="setting-row">
        <label>
          <input
            type="checkbox"
            bind:checked={settings.notifications.enabled}
            aria-describedby="notif-enabled-desc"
          />
          Enable notifications
        </label>
        <span class="setting-description" id="notif-enabled-desc"
          >Show notifications for events and alerts</span
        >
      </div>

      <div class="setting-row" class:disabled={!settings.notifications.enabled}>
        <label>
          <input
            type="checkbox"
            bind:checked={settings.notifications.showToasts}
            disabled={!settings.notifications.enabled}
          />
          Show toast notifications
        </label>
        <span class="setting-description">Display in-app toast messages</span>
      </div>

      <div class="setting-row" class:disabled={!settings.notifications.enabled}>
        <label>
          <input
            type="checkbox"
            bind:checked={settings.notifications.soundEnabled}
            disabled={!settings.notifications.enabled}
          />
          Enable notification sounds
        </label>
        <span class="setting-description">Play sound for important notifications</span>
      </div>

      <div class="setting-row desktop-notif-row" class:disabled={!settings.notifications.enabled}>
        <label>
          <input
            type="checkbox"
            bind:checked={settings.notifications.desktopNotifications}
            disabled={!settings.notifications.enabled}
          />
          Enable desktop notifications
        </label>
        <div class="permission-controls">
          <span
            class="permission-status {getPermissionStatusClass()}"
            role="status"
            aria-live="polite"
            aria-label="Desktop notification permission status: {getPermissionStatusText()}"
          >
            {getPermissionStatusText()}
          </span>
          {#if notificationPermission !== 'granted'}
            <button
              class="btn btn-primary btn-sm"
              on:click={requestNotificationPermission}
              disabled={!settings.notifications.enabled}
              aria-label="Request desktop notification permission"
            >
              Request Permission
            </button>
          {/if}
        </div>
      </div>

      <fieldset class="subsection">
        <legend>Notification Types</legend>

        <div class="setting-row" class:disabled={!settings.notifications.enabled}>
          <label>
            <input
              type="checkbox"
              bind:checked={settings.notifications.types.errors}
              disabled={!settings.notifications.enabled}
            />
            Errors
          </label>
          <span class="setting-description">Critical errors and failures</span>
        </div>

        <div class="setting-row" class:disabled={!settings.notifications.enabled}>
          <label>
            <input
              type="checkbox"
              bind:checked={settings.notifications.types.warnings}
              disabled={!settings.notifications.enabled}
            />
            Warnings
          </label>
          <span class="setting-description">Warning messages and alerts</span>
        </div>

        <div class="setting-row" class:disabled={!settings.notifications.enabled}>
          <label>
            <input
              type="checkbox"
              bind:checked={settings.notifications.types.triggers}
              disabled={!settings.notifications.enabled}
            />
            Triggers
          </label>
          <span class="setting-description">Custom trigger alerts</span>
        </div>

        <div class="setting-row" class:disabled={!settings.notifications.enabled}>
          <label>
            <input
              type="checkbox"
              bind:checked={settings.notifications.types.performance}
              disabled={!settings.notifications.enabled}
            />
            Performance
          </label>
          <span class="setting-description">Performance threshold alerts</span>
        </div>

        <div class="setting-row" class:disabled={!settings.notifications.enabled}>
          <label>
            <input
              type="checkbox"
              bind:checked={settings.notifications.types.info}
              disabled={!settings.notifications.enabled}
            />
            Info
          </label>
          <span class="setting-description">Informational messages</span>
        </div>
      </fieldset>
    </section>

    <!-- UI Section -->
    <section class="settings-section" aria-labelledby="ui-heading">
      <h3 id="ui-heading"><span aria-hidden="true">🎨</span> User Interface</h3>

      <div class="setting-row">
        <label for="theme-select">Theme</label>
        <select id="theme-select" bind:value={settings.ui.theme} aria-describedby="theme-desc">
          <option value="theme--day">Day (Gruvbox)</option>
          <option value="theme--dusk">Dusk (Ristretto)</option>
          <option value="theme--night">Night (Tokyo Night)</option>
        </select>
        <span class="setting-description" id="theme-desc">Choose your color theme</span>
      </div>

      <div class="setting-row">
        <label for="time-format-select">Time Format</label>
        <select
          id="time-format-select"
          bind:value={settings.ui.timeFormat}
          aria-describedby="time-format-desc"
        >
          <option value="12h">12-hour (AM/PM)</option>
          <option value="24h">24-hour</option>
        </select>
        <span class="setting-description" id="time-format-desc"
          >Choose how times are displayed throughout the app</span
        >
      </div>

      <div class="setting-row">
        <label>
          <input type="checkbox" bind:checked={settings.ui.compactMode} />
          Compact mode
        </label>
        <span class="setting-description">Use smaller spacing and font sizes</span>
      </div>

      <div class="setting-row">
        <label>
          <input type="checkbox" bind:checked={settings.ui.animationsEnabled} />
          Enable animations
        </label>
        <span class="setting-description">Show UI transitions and animations</span>
      </div>

      <div class="setting-row">
        <label>
          <input type="checkbox" bind:checked={settings.ui.autoRefresh} />
          Auto-refresh data
        </label>
        <span class="setting-description">Automatically refresh panels</span>
      </div>

      <div class="setting-row" class:disabled={!settings.ui.autoRefresh}>
        <label for="refresh-interval">Refresh interval (seconds)</label>
        <input
          id="refresh-interval"
          type="number"
          min="5"
          max="60"
          bind:value={settings.ui.refreshInterval}
          disabled={!settings.ui.autoRefresh}
          aria-describedby="refresh-interval-desc"
        />
        <span id="refresh-interval-desc" class="setting-description">How often to refresh data</span
        >
      </div>
    </section>

    <!-- Editor Section -->
    <section class="settings-section" aria-labelledby="editor-heading">
      <h3 id="editor-heading"><span aria-hidden="true">📝</span> Editor</h3>

      <div class="setting-row">
        <label for="default-editor">Default Editor</label>
        <select
          id="default-editor"
          bind:value={settings.editor.defaultEditor}
          aria-describedby="editor-desc"
        >
          <option value="auto">🖥️ System Default</option>
          <option value="vscode">💻 VS Code</option>
          <option value="cursor">⚡ Cursor</option>
          <option value="sublime">📝 Sublime Text</option>
          <option value="intellij">🧠 IntelliJ IDEA</option>
          <option value="vim">🟢 Vim</option>
          <option value="nvim">🟩 Neovim</option>
        </select>
        <span class="setting-description" id="editor-desc"
          >Choose which editor opens files from error panels</span
        >
      </div>
    </section>

    <!-- Performance Section -->
    <section class="settings-section" aria-labelledby="performance-heading">
      <h3 id="performance-heading"><span aria-hidden="true">⚡</span> Performance</h3>

      <div class="setting-row">
        <label>
          <input type="checkbox" bind:checked={settings.performance.enableMetrics} />
          Enable metrics collection
        </label>
        <span class="setting-description">Collect system performance metrics</span>
      </div>

      <div class="setting-row" class:disabled={!settings.performance.enableMetrics}>
        <label for="metrics-interval">Metrics interval (seconds)</label>
        <input
          id="metrics-interval"
          type="number"
          min="5"
          max="60"
          bind:value={settings.performance.metricsInterval}
          disabled={!settings.performance.enableMetrics}
        />
        <span class="setting-description">How often to collect metrics</span>
      </div>

      <div class="setting-row">
        <label>
          <input type="checkbox" bind:checked={settings.performance.enableFileWatcher} />
          Enable file watcher
        </label>
        <span class="setting-description">Monitor file changes in real-time</span>
      </div>

      <div class="setting-row">
        <label for="max-events">Max events to display</label>
        <input
          id="max-events"
          type="number"
          min="50"
          max="1000"
          step="50"
          bind:value={settings.performance.maxEventsDisplay}
          aria-describedby="max-events-desc"
        />
        <span id="max-events-desc" class="setting-description"
          >Maximum number of events to show in lists</span
        >
      </div>
    </section>
  </div>
</div>

<style>
  .settings-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-lg);
    position: relative;
    overflow: hidden;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-2xl);
    border-bottom: 2px solid var(--border);
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .settings-header h2 {
    margin: 0;
    color: var(--text);
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    font-family: var(--mono);
  }

  .auto-save-note {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .unsaved-indicator {
    color: var(--warning);
    font-size: 11px;
    font-weight: 600;
    margin-right: var(--space-lg);
  }

  /* Button styles removed - now using global .btn classes */

  .settings-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4xl);
  }

  .settings-section {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
  }

  .settings-section h3 {
    margin: 0 0 var(--space-3xl) 0;
    color: var(--text);
    font-size: 11px;
    font-family: var(--mono);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .subsection {
    margin-top: var(--space-lg);
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  /* (removed unused .subsection h4) */

  .setting-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
    align-items: center;
    padding: var(--space-md) 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .setting-row:last-child {
    border-bottom: none;
  }

  .setting-row.disabled {
    opacity: 0.5;
  }

  .setting-row label {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    color: var(--text);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .setting-description {
    color: var(--muted);
    font-size: 12px;
    grid-column: 2;
  }

  input[type='checkbox'] {
    width: var(--icon-sm);
    height: var(--icon-sm);
    cursor: pointer;
  }

  input[type='number'],
  select {
    padding: var(--space-sm) var(--space-lg);
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 11px;
    font-family: var(--mono);
  }

  input[type='number']:focus,
  select:focus {
    outline: none;
    border-color: var(--accent);
  }

  input[type='number']:disabled,
  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .settings-content::-webkit-scrollbar {
    width: 8px;
  }

  .settings-content::-webkit-scrollbar-track {
    background: var(--surface);
  }

  .settings-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: var(--radius);
  }

  .settings-content::-webkit-scrollbar-thumb:hover {
    background: var(--muted);
  }

  /* Desktop Notification Permission Controls */
  .desktop-notif-row {
    grid-template-rows: auto auto;
  }

  .permission-controls {
    grid-column: 2;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-lg);
  }

  .permission-status {
    font-size: 12px;
    font-weight: 600;
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius);
    border: 1px solid;
  }

  .permission-granted {
    color: var(--success);
    background: rgba(152, 195, 121, 0.1);
    border-color: var(--success);
  }

  .permission-denied {
    color: var(--error);
    background: rgba(224, 108, 117, 0.1);
    border-color: var(--error);
  }

  .permission-default {
    color: var(--warning);
    background: rgba(229, 192, 123, 0.1);
    border-color: var(--warning);
  }

  /* Permission button styles removed - now using global .btn classes */

  .auto-save-note {
    color: var(--success);
    font-size: 11px;
    font-weight: 600;
    margin: 0;
  }

  /* ===== GLOBAL COMPACT MODE STYLES ===== */
  /* Applied to <body> when compact mode is enabled */
  /* These styles affect the entire app, not just Settings */

  :global(body.compact-mode) {
    /* Reduce all font sizes by ~15% */
    --font-size-base: 13px;
    --font-size-sm: 11px;
    --font-size-xs: 10px;
  }

  :global(body.compact-mode .settings-panel),
  :global(body.compact-mode .status-panel),
  :global(body.compact-mode .storage-panel),
  :global(body.compact-mode .notifications-panel),
  :global(body.compact-mode .error-log),
  :global(body.compact-mode .api-health-monitor),
  :global(body.compact-mode .server-sync-panel),
  :global(body.compact-mode .activity-feed),
  :global(body.compact-mode .analysis-panel),
  :global(body.compact-mode .performance-panel) {
    padding: var(--space-md) !important;
  }

  :global(body.compact-mode h1) {
    font-size: 12px !important;
  }

  :global(body.compact-mode h2) {
    font-size: 11px !important;
  }

  :global(body.compact-mode h3) {
    font-size: 11px !important;
  }

  :global(body.compact-mode h4) {
    font-size: 11px !important;
  }

  :global(body.compact-mode p),
  :global(body.compact-mode span),
  :global(body.compact-mode div),
  :global(body.compact-mode label) {
    font-size: 12px !important;
    line-height: 1.4 !important;
  }

  :global(body.compact-mode .setting-row),
  :global(body.compact-mode .info-row),
  :global(body.compact-mode .db-row),
  :global(body.compact-mode .notification-item),
  :global(body.compact-mode .error-item),
  :global(body.compact-mode .event-item) {
    padding: var(--space-lg) 0 !important;
  }

  :global(body.compact-mode .settings-section),
  :global(body.compact-mode .status-section),
  :global(body.compact-mode .card) {
    padding: var(--space-lg) !important;
    margin-bottom: var(--space-md) !important;
  }

  :global(body.compact-mode button) {
    padding: var(--space-md) var(--space-xl) !important;
    font-size: 12px !important;
  }

  :global(
    body.compact-mode input[type='text'],
    body.compact-mode input[type='number'],
    body.compact-mode select,
    body.compact-mode textarea
  ) {
    padding: var(--space-md) var(--space-lg) !important;
    font-size: 12px !important;
  }

  :global(body.compact-mode .table-row),
  :global(body.compact-mode .grid-row) {
    min-height: var(--icon-lg) !important;
  }

  :global(body.compact-mode .chart),
  :global(body.compact-mode .graph) {
    height: 180px !important;
  }

  :global(body.compact-mode .sidebar) {
    width: 200px !important;
  }

  :global(body.compact-mode .badge),
  :global(body.compact-mode .tag) {
    padding: var(--space-xs) var(--space-md) !important;
    font-size: 11px !important;
  }
</style>
