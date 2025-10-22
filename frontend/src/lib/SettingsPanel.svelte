<script>
  import { onMount } from 'svelte';
  import { notifications } from './notificationService.js';

  // Default settings
  let settings = {
    notifications: {
      enabled: true,
      showToasts: true,
      soundEnabled: false,
      desktopNotifications: false,
      types: {
        errors: true,
        warnings: true,
        triggers: true,
        performance: false,
        info: true
      }
    },
    ui: {
      theme: 'theme--night',
      compactMode: false,
      animationsEnabled: true,
      autoRefresh: true,
      refreshInterval: 10
    },
    performance: {
      enableMetrics: true,
      metricsInterval: 10,
      enableFileWatcher: true,
      maxEventsDisplay: 100
    }
  };

  let unsavedChanges = false;

  // Load settings from localStorage
  function loadSettings() {
    const saved = localStorage.getItem('raven-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        settings = { ...settings, ...parsed };
      } catch (e) {
        console.error('Failed to parse saved settings:', e);
      }
    }
  }

  // Save settings to localStorage
  async function saveSettings() {
    try {
      localStorage.setItem('raven-settings', JSON.stringify(settings));

      // Apply theme change immediately
      if (settings.ui.theme) {
        document.body.className = settings.ui.theme;
        localStorage.setItem('raven-theme', settings.ui.theme);
      }

      unsavedChanges = false;
      notifications.success('Settings saved successfully', {
        title: 'Settings Updated'
      });
    } catch (e) {
      console.error('Failed to save settings:', e);
      notifications.error('Failed to save settings', {
        title: 'Save Error'
      });
    }
  }

  // Reset to defaults
  function resetToDefaults() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      localStorage.removeItem('raven-settings');
      loadSettings();
      unsavedChanges = false;
      notifications.info('Settings reset to defaults', {
        title: 'Settings Reset'
      });
    }
  }

  // Mark as changed when any setting is modified
  function markChanged() {
    unsavedChanges = true;
  }

  // Export settings as JSON
  function exportSettings() {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
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
        const imported = JSON.parse(e.target.result);
        settings = { ...settings, ...imported };
        unsavedChanges = true;
        notifications.success('Settings imported - click Save to apply', {
          title: 'Import Successful'
        });
      } catch (err) {
        notifications.error('Failed to import settings: Invalid file', {
          title: 'Import Error'
        });
      }
    };
    reader.readAsText(file);
  }

  onMount(() => {
    loadSettings();
  });
</script>

<div class="settings-panel">
  <div class="settings-header">
    <h2>⚙️ User Settings</h2>
    <div class="header-actions">
      {#if unsavedChanges}
        <span class="unsaved-indicator">● Unsaved changes</span>
      {/if}
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
      <button class="btn-primary" on:click={saveSettings} disabled={!unsavedChanges}>
        💾 Save Settings
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
            on:change={markChanged}
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
            on:change={markChanged}
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
            on:change={markChanged}
            disabled={!settings.notifications.enabled}
          />
          Enable notification sounds
        </label>
        <span class="setting-description">Play sound for important notifications</span>
      </div>

      <div class="setting-row" class:disabled={!settings.notifications.enabled}>
        <label>
          <input
            type="checkbox"
            bind:checked={settings.notifications.desktopNotifications}
            on:change={markChanged}
            disabled={!settings.notifications.enabled}
          />
          Enable desktop notifications
        </label>
        <span class="setting-description">Show browser notifications (requires permission)</span>
      </div>

      <div class="subsection">
        <h4>Notification Types</h4>

        <div class="setting-row" class:disabled={!settings.notifications.enabled}>
          <label>
            <input
              type="checkbox"
              bind:checked={settings.notifications.types.errors}
              on:change={markChanged}
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
              on:change={markChanged}
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
              on:change={markChanged}
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
              on:change={markChanged}
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
              on:change={markChanged}
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
          on:change={markChanged}
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
            on:change={markChanged}
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
            on:change={markChanged}
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
            on:change={markChanged}
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
          on:change={markChanged}
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
            on:change={markChanged}
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
          on:change={markChanged}
          disabled={!settings.performance.enableMetrics}
        />
        <span class="setting-description">How often to collect metrics</span>
      </div>

      <div class="setting-row">
        <label>
          <input
            type="checkbox"
            bind:checked={settings.performance.enableFileWatcher}
            on:change={markChanged}
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
          on:change={markChanged}
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

  .settings-header h2 {
    margin: 0;
    color: var(--text);
    font-size: 24px;
    font-family: var(--mono);
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
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
</style>
