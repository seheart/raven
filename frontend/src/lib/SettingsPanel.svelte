<script>
  import { onMount } from 'svelte';
  import { notifications } from './notificationService.js';
  import { settings as settingsStore } from './settingsStore.js';
  import PageInfo from './PageInfo.svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';

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
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });

  // Settings are auto-saved via the store, no need for manual save
  function saveSettings() {
    // Settings are already saved automatically via the store
    // This just shows a confirmation message
    notifications.success('Settings saved successfully', {
      title: 'Settings Updated'
    });
  }

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
    reader.onload = (e) => {
      try {
        const success = settingsStore.import(e.target.result);
        if (success) {
          notifications.success('Settings imported and applied', {
            title: 'Import Successful'
          });
        } else {
          throw new Error('Invalid settings format');
        }
      } catch (err) {
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
    if (typeof Notification === 'undefined') {
      notifications.error('Desktop notifications are not supported in this browser', {
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
      notifications.warning('Desktop notifications were previously denied. Please enable them in your browser settings.', {
        title: 'Permission Denied'
      });
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
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      notifications.error('Failed to request notification permission', {
        title: 'Error'
      });
    }
  }

  function getPermissionStatusText() {
    switch (notificationPermission) {
    case 'granted': return '✓ Granted';
    case 'denied': return '✗ Denied';
    case 'default': return '? Not requested';
    default: return 'Unknown';
    }
  }

  function getPermissionStatusClass() {
    switch (notificationPermission) {
    case 'granted': return 'permission-granted';
    case 'denied': return 'permission-denied';
    case 'default': return 'permission-default';
    default: return '';
    }
  }

  // Format "time ago" for last modified timestamp
  function getTimeAgo() {
    if (!lastModified) return 'Never';
    const seconds = Math.floor((Date.now() - lastModified.getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  // Reactive "time ago" - updates when lastModified changes (no polling!)
  $: timeAgo = getTimeAgo();
</script>

<div class="settings-panel">
  <PageInfo
    title="Settings & Preferences"
    description="This is your Raven configuration center - like the Settings app on your phone, but for customizing how Raven looks, behaves, and notifies you. All settings on this page are saved to your browser's `localStorage`, meaning they're **personal to your browser** and persist across Raven restarts. Changes take effect immediately (except theme, which applies on next page load)."
    keyPoints={[
      '**Notifications Section** - Master toggle to enable/disable all notifications. Individual toggles for: Toast notifications (in-app popups), Sound (play audio on alerts), Desktop notifications (browser notifications outside Raven). Notification Types subsection lets you filter by category: Errors (red, critical), Warnings (yellow, important), Triggers (custom alerts you define), Performance (threshold breaches), Info (general messages). Disable types you do not care about.',
      '**User Interface Section** - Theme dropdown: "Day (Gruvbox)" = warm light theme, "Dusk (Ristretto)" = purple twilight theme, "Night (Tokyo Night)" = dark blue theme (default). Compact mode checkbox: Reduces spacing and font sizes for more data on screen. Animations toggle: Disables UI transitions if they feel sluggish. Auto-refresh toggle: Enables/disables automatic data polling. Refresh interval slider: How often panels reload (5-60 seconds). Lower = more real-time but higher CPU/network usage.',
      '**Performance Section** - Enable metrics collection: Tracks CPU/memory usage for the Performance page. Metrics interval: How often to sample metrics (5-60 seconds). Enable file watcher: Master toggle for file monitoring (disabling stops all file tracking). Max events to display: Limits list lengths (50-1000). Higher = more history but slower rendering.',
      '**Unsaved Changes Indicator** - Orange dot "● Unsaved changes" appears when you modify something. Settings are not applied until you click "💾 Save Settings" button. If you leave the page without saving, changes are lost.',
      '**Export/Import Buttons** - 📤 Export: Downloads settings as a JSON file named `raven-settings-2025-01-15.json`. Useful for backing up or sharing your config. 📥 Import: Load settings from a previously exported JSON file. Opens file picker to select the file.',
      '**Reset Button** - 🔄 Reset: Reverts ALL settings to defaults (asks for confirmation first). Cannot be undone! Use if settings get corrupted or you want to start fresh.',
      '**Theme Application** - When you change theme and save, Raven applies it by changing the `<body>` class to `theme--day`, `theme--night`, or `theme--dusk`. CSS variables update automatically. You\'ll see the color change instantly.'
    ]}
    whenToCheck="Visit Settings **when first setting up Raven** (to pick your theme and notification preferences), **if Raven feels too slow** (reduce refresh intervals or disable animations), **if you\'re getting too many notifications** (tune notification types), or **to backup your config** before major changes."
    warnings={[
      '**Disabling all notifications** - You will not see ANY alerts, including critical errors. Keep at least "Errors" and "Warnings" enabled to catch problems.',
      '**Refresh interval below 5 seconds** - NOT ALLOWED. Minimum is 5 seconds to prevent hammering the backend. Very short intervals (5-10s) can cause high CPU usage on both frontend and backend.',
      '**Max events set very high (>500)** - Large lists (especially on Live Code Feed or Activity Log) can make the UI sluggish. If pages feel slow, reduce this to 100-200.',
      '**Disabling file watcher** - CRITICAL! Turns off all file monitoring. Raven will stop detecting file changes entirely. Only disable for testing or if you want to pause monitoring temporarily.',
      '**Settings not saving** - If you click Save but changes do not persist after refresh, your browser\'s localStorage might be disabled, full, or in incognito mode. Check browser console for errors like "QuotaExceededError".',
      '**Imported settings look wrong** - Make sure the JSON file is from Raven (has `notifications`, `ui`, `performance` keys). Importing random JSON will break settings. If corrupted, click Reset to fix.'
    ]}
  />

  <div class="settings-header">
    <div class="header-left">
      <h2>⚙️ User Settings</h2>
      <p class="auto-save-note">⚡ Settings save automatically</p>
    </div>
    <div class="header-actions">
      <span class="last-updated">Modified: {timeAgo}</span>
      <button class="btn-secondary" on:click={exportSettings}>
        📤 Export
      </button>
      <label class="btn-secondary">
        📥 Import
        <input type="file" accept=".json" on:change={importSettings} style="display: none;" />
      </label>
      <button class="btn-secondary" on:click={resetToDefaults}>
        🔄 Reset
      </button>
    </div>
  </div>

  <div class="settings-content">
    <!-- Notifications Section -->
    <div class="settings-section">
      <h3>🔔 Notifications</h3>

      <div class="setting-row">
        <label>
          <input
            type="checkbox"
            bind:checked={settings.notifications.enabled}
          />
          Enable notifications
        </label>
        <span class="setting-description">Show notifications for events and alerts</span>
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
          <span class="permission-status {getPermissionStatusClass()}">
            {getPermissionStatusText()}
          </span>
          {#if notificationPermission !== 'granted'}
            <button
              class="btn-permission"
              on:click={requestNotificationPermission}
              disabled={!settings.notifications.enabled}
            >
              Request Permission
            </button>
          {/if}
        </div>
      </div>

      <div class="subsection">
        <h4>Notification Types</h4>

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
      </div>
    </div>

    <!-- UI Section -->
    <div class="settings-section">
      <h3>🎨 User Interface</h3>

      <div class="setting-row">
        <label for="theme-select">Theme</label>
        <select
          id="theme-select"
          bind:value={settings.ui.theme}
        >
          <option value="theme--day">Day (Gruvbox)</option>
          <option value="theme--dusk">Dusk (Ristretto)</option>
          <option value="theme--night">Night (Tokyo Night)</option>
        </select>
        <span class="setting-description">Choose your color theme</span>
      </div>

      <div class="setting-row">
        <label>
          <input
            type="checkbox"
            bind:checked={settings.ui.compactMode}
          />
          Compact mode
        </label>
        <span class="setting-description">Use smaller spacing and font sizes</span>
      </div>

      <div class="setting-row">
        <label>
          <input
            type="checkbox"
            bind:checked={settings.ui.animationsEnabled}
          />
          Enable animations
        </label>
        <span class="setting-description">Show UI transitions and animations</span>
      </div>

      <div class="setting-row">
        <label>
          <input
            type="checkbox"
            bind:checked={settings.ui.autoRefresh}
          />
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
        />
        <span class="setting-description">How often to refresh data</span>
      </div>
    </div>

    <!-- Performance Section -->
    <div class="settings-section">
      <h3>⚡ Performance</h3>

      <div class="setting-row">
        <label>
          <input
            type="checkbox"
            bind:checked={settings.performance.enableMetrics}
          />
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
          <input
            type="checkbox"
            bind:checked={settings.performance.enableFileWatcher}
          />
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
        />
        <span class="setting-description">Maximum number of events to show in lists</span>
      </div>
    </div>
  </div>
</div>

<style>
  .settings-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border);
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .settings-header h2 {
    margin: 0;
    color: var(--text);
    font-size: 24px;
    font-family: var(--mono);
  }

  .auto-save-note {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .unsaved-indicator {
    color: var(--warning);
    font-size: 13px;
    font-weight: 600;
    margin-right: 8px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--surface);
    border-color: var(--accent);
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .settings-section {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
  }

  .settings-section h3 {
    margin: 0 0 20px 0;
    color: var(--text);
    font-size: 18px;
    font-family: var(--mono);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .subsection {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .subsection h4 {
    margin: 0 0 12px 0;
    color: var(--muted);
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .setting-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    align-items: center;
    padding: 12px 0;
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
    gap: 8px;
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .setting-description {
    color: var(--muted);
    font-size: 12px;
    grid-column: 2;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  input[type="number"],
  select {
    padding: 8px 12px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--mono);
  }

  input[type="number"]:focus,
  select:focus {
    outline: none;
    border-color: var(--accent);
  }

  input[type="number"]:disabled,
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
    border-radius: 4px;
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
    gap: 12px;
    margin-top: 8px;
  }

  .permission-status {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
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

  .btn-permission {
    padding: 6px 12px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-permission:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .btn-permission:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .auto-save-note {
    color: var(--success);
    font-size: 13px;
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
    padding: 16px !important;
  }

  :global(body.compact-mode h1) {
    font-size: 20px !important;
  }

  :global(body.compact-mode h2) {
    font-size: 18px !important;
  }

  :global(body.compact-mode h3) {
    font-size: 15px !important;
  }

  :global(body.compact-mode h4) {
    font-size: 13px !important;
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
    padding: 8px 0 !important;
  }

  :global(body.compact-mode .settings-section),
  :global(body.compact-mode .status-section),
  :global(body.compact-mode .card) {
    padding: 14px !important;
    margin-bottom: 12px !important;
  }

  :global(body.compact-mode button) {
    padding: 6px 12px !important;
    font-size: 12px !important;
  }

  :global(body.compact-mode input[type="text"],
  body.compact-mode input[type="number"],
  body.compact-mode select,
  body.compact-mode textarea) {
    padding: 6px 10px !important;
    font-size: 12px !important;
  }

  :global(body.compact-mode .table-row),
  :global(body.compact-mode .grid-row) {
    min-height: 32px !important;
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
    padding: 2px 6px !important;
    font-size: 10px !important;
  }
</style>
