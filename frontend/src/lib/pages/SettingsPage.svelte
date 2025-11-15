<script>
  /**
   * Settings Page - Application settings and preferences
   */
  import { settings } from '../stores/settingsStore.js';

  // Subscribe to settings
  let currentSettings = $state({});
  settings.subscribe(value => {
    currentSettings = value;
  });

  // Last modified timestamp
  let lastModified = $state(new Date());

  // Desktop notification permission state
  let notificationPermission = $state('default');

  function updateNotificationPermission() {
    if (typeof Notification !== 'undefined') {
      notificationPermission = Notification.permission;
    }
  }

  // Initialize on mount
  $effect(() => {
    updateNotificationPermission();
  });

  // Export settings as JSON
  function exportSettings() {
    const jsonContent = settings.export();
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import settings from JSON
  function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const success = settings.import(e.target.result);
        if (!success) {
          throw new Error('Invalid settings format');
        }
      } catch (err) {
        console.error('Failed to import settings:', err);
      }
    };
    reader.readAsText(file);
  }

  // Reset to defaults
  function resetToDefaults() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      settings.reset();
    }
  }

  // Request desktop notification permission
  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined' || !window.isSecureContext) {
      return;
    }

    if (Notification.permission === 'granted') {
      return;
    }

    if (Notification.permission === 'denied') {
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      updateNotificationPermission();

      if (permission === 'granted') {
        // Show a test notification
        new Notification('Raven Notifications Enabled', {
          body: 'You will now receive desktop notifications from Raven',
          icon: '/favicon.ico'
        });
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
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

  // Format time ago
  function getTimeAgo(date) {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }

  const timeAgo = $derived(getTimeAgo(lastModified));
</script>

<div class="p-6 space-y-6 max-w-4xl mx-auto">
  <!-- Header -->
  <div class="border-b border-[var(--border)] pb-4 flex justify-between items-center">
    <div>
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">⚙️ Settings</h1>
      <p class="text-xs text-[var(--muted)]">⚡ Auto-saves • Last modified: {timeAgo}</p>
    </div>
    <div class="flex gap-2">
      <button
        class="px-2.5 py-1.5 bg-[var(--surface-2)] text-[var(--text)] text-xs rounded hover:bg-[var(--surface-3)] transition-colors border border-[var(--border)] cursor-pointer font-sans"
        onclick={exportSettings}
      >
        📤 Export
      </button>
      <label
        class="px-2.5 py-1.5 bg-[var(--surface-2)] text-[var(--text)] text-xs rounded hover:bg-[var(--surface-3)] transition-colors border border-[var(--border)] cursor-pointer font-sans"
      >
        📥 Import
        <input
          type="file"
          accept=".json"
          onchange={importSettings}
          style="display: none;"
          aria-label="Import settings file"
        />
      </label>
      <button
        class="px-2.5 py-1.5 bg-[var(--surface-2)] text-[var(--text)] text-xs rounded hover:bg-[var(--surface-3)] transition-colors border border-[var(--border)] cursor-pointer font-sans"
        onclick={resetToDefaults}
      >
        🔄 Reset
      </button>
    </div>
  </div>

  <!-- Notifications Section -->
  <section class="space-y-3">
    <h3 class="text-sm font-semibold text-[var(--text-heading)] font-sans">🔔 Notifications</h3>

    <!-- Enable Notifications -->
    <div class="setting-card">
      <div class="setting-control">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.notifications.enabled}
            class="w-4 h-4 cursor-pointer"
          />
          <span class="text-sm font-medium text-[var(--text)] font-sans">Enable notifications</span>
        </label>
      </div>
      <p class="setting-help">Show notifications for events and alerts</p>
    </div>

    <!-- Toast Notifications -->
    <div class="setting-card {currentSettings.notifications?.enabled ? '' : 'disabled'}">
      <div class="setting-control">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.notifications.showToasts}
            disabled={!currentSettings.notifications?.enabled}
            class="w-4 h-4 cursor-pointer"
          />
          <span class="text-sm font-medium text-[var(--text)] font-sans">Toast notifications</span>
        </label>
      </div>
      <p class="setting-help">Display in-app toast messages</p>
    </div>

    <!-- Notification Sounds -->
    <div class="setting-card {currentSettings.notifications?.enabled ? '' : 'disabled'}">
      <div class="setting-control">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.notifications.soundEnabled}
            disabled={!currentSettings.notifications?.enabled}
            class="w-4 h-4 cursor-pointer"
          />
          <span class="text-sm font-medium text-[var(--text)] font-sans">Notification sounds</span>
        </label>
      </div>
      <p class="setting-help">Play sound for important notifications</p>
    </div>

    <!-- Desktop Notifications -->
    <div class="setting-card {currentSettings.notifications?.enabled ? '' : 'disabled'}">
      <div class="setting-control">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.notifications.desktopNotifications}
            disabled={!currentSettings.notifications?.enabled}
            class="w-4 h-4 cursor-pointer"
          />
          <span class="text-sm font-medium text-[var(--text)] font-sans">Desktop notifications</span
          >
        </label>
        <div class="flex items-center gap-2">
          <span class="permission-badge {getPermissionStatusClass()}">
            {getPermissionStatusText()}
          </span>
          {#if notificationPermission !== 'granted'}
            <button
              class="px-2 py-1 bg-[var(--accent)] text-[#ffffff] text-xs rounded hover:bg-[var(--accent-2)] transition-colors border-0 cursor-pointer font-sans"
              onclick={requestNotificationPermission}
              disabled={!currentSettings.notifications?.enabled}
            >
              Request
            </button>
          {/if}
        </div>
      </div>
      <p class="setting-help">Show desktop notifications outside the browser</p>
    </div>

    <!-- Notification Types -->
    <div class="setting-group">
      <h4 class="text-xs font-semibold text-[var(--text-heading)] mb-2 font-sans">
        Notification Types
      </h4>
      <div class="grid grid-cols-2 gap-2">
        <div
          class="setting-card-compact {currentSettings.notifications?.enabled ? '' : 'disabled'}"
        >
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={currentSettings.notifications.types.errors}
              disabled={!currentSettings.notifications?.enabled}
              class="w-3.5 h-3.5 cursor-pointer"
            />
            <span class="text-xs text-[var(--text)] font-sans">Errors</span>
          </label>
        </div>
        <div
          class="setting-card-compact {currentSettings.notifications?.enabled ? '' : 'disabled'}"
        >
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={currentSettings.notifications.types.warnings}
              disabled={!currentSettings.notifications?.enabled}
              class="w-3.5 h-3.5 cursor-pointer"
            />
            <span class="text-xs text-[var(--text)] font-sans">Warnings</span>
          </label>
        </div>
        <div
          class="setting-card-compact {currentSettings.notifications?.enabled ? '' : 'disabled'}"
        >
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={currentSettings.notifications.types.triggers}
              disabled={!currentSettings.notifications?.enabled}
              class="w-3.5 h-3.5 cursor-pointer"
            />
            <span class="text-xs text-[var(--text)] font-sans">Triggers</span>
          </label>
        </div>
        <div
          class="setting-card-compact {currentSettings.notifications?.enabled ? '' : 'disabled'}"
        >
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={currentSettings.notifications.types.performance}
              disabled={!currentSettings.notifications?.enabled}
              class="w-3.5 h-3.5 cursor-pointer"
            />
            <span class="text-xs text-[var(--text)] font-sans">Performance</span>
          </label>
        </div>
        <div
          class="setting-card-compact {currentSettings.notifications?.enabled ? '' : 'disabled'}"
        >
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={currentSettings.notifications.types.info}
              disabled={!currentSettings.notifications?.enabled}
              class="w-3.5 h-3.5 cursor-pointer"
            />
            <span class="text-xs text-[var(--text)] font-sans">Info</span>
          </label>
        </div>
      </div>
    </div>
  </section>

  <!-- UI Section -->
  <section class="space-y-3">
    <h3 class="text-sm font-semibold text-[var(--text-heading)] font-sans">🎨 User Interface</h3>

    <!-- Theme -->
    <div class="setting-card">
      <div class="setting-control">
        <label for="theme-select" class="text-sm font-medium text-[var(--text)] font-sans"
          >Theme</label
        >
        <select
          id="theme-select"
          bind:value={currentSettings.ui.theme}
          class="px-2.5 py-1.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded text-xs font-sans"
          onchange={() => settings.updateUI({ theme: currentSettings.ui.theme })}
        >
          <option value="tokyo-night">Tokyo Night</option>
          <option value="catppuccin">Catppuccin</option>
          <option value="everforest">Everforest</option>
          <option value="gruvbox">Gruvbox</option>
          <option value="gruvbox-light">Gruvbox Light</option>
          <option value="osaka-jade">Osaka Jade</option>
          <option value="kanagawa">Kanagawa</option>
          <option value="nord">Nord</option>
          <option value="matte-black">Matte Black</option>
          <option value="ristretto">Ristretto</option>
          <option value="flexoki-light">Flexoki Light</option>
          <option value="rose-pine">Rose Pine</option>
          <option value="catppuccin-latte">Catppuccin Latte</option>
        </select>
      </div>
      <p class="setting-help">Color theme for the application</p>
    </div>

    <!-- Time Format -->
    <div class="setting-card">
      <div class="setting-control">
        <label for="time-format-select" class="text-sm font-medium text-[var(--text)] font-sans"
          >Time Format</label
        >
        <select
          id="time-format-select"
          bind:value={currentSettings.ui.timeFormat}
          class="px-2.5 py-1.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded text-xs font-sans"
        >
          <option value="12h">12-hour (AM/PM)</option>
          <option value="24h">24-hour</option>
        </select>
      </div>
      <p class="setting-help">How times are displayed throughout the app</p>
    </div>

    <!-- UI Toggles -->
    <div class="grid grid-cols-2 gap-2">
      <div class="setting-card-compact">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.ui.compactMode}
            class="w-3.5 h-3.5 cursor-pointer"
          />
          <span class="text-xs text-[var(--text)] font-sans">Compact mode</span>
        </label>
      </div>
      <div class="setting-card-compact">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.ui.animationsEnabled}
            class="w-3.5 h-3.5 cursor-pointer"
          />
          <span class="text-xs text-[var(--text)] font-sans">Animations</span>
        </label>
      </div>
      <div class="setting-card-compact">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.ui.autoRefresh}
            class="w-3.5 h-3.5 cursor-pointer"
          />
          <span class="text-xs text-[var(--text)] font-sans">Auto-refresh</span>
        </label>
      </div>
    </div>

    <!-- Refresh Interval -->
    <div class="setting-card {currentSettings.ui?.autoRefresh ? '' : 'disabled'}">
      <div class="setting-control">
        <label for="refresh-interval" class="text-sm font-medium text-[var(--text)] font-sans"
          >Refresh Interval</label
        >
        <div class="flex items-center gap-2">
          <input
            id="refresh-interval"
            type="number"
            min="5"
            max="60"
            bind:value={currentSettings.ui.refreshInterval}
            disabled={!currentSettings.ui?.autoRefresh}
            class="w-16 px-2.5 py-1.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded text-xs text-center font-mono"
          />
          <span class="text-xs text-[var(--muted)] font-sans">seconds</span>
        </div>
      </div>
      <p class="setting-help">How often to refresh data automatically</p>
    </div>
  </section>

  <!-- Editor Section -->
  <section class="space-y-3">
    <h3 class="text-sm font-semibold text-[var(--text-heading)] font-sans">📝 Editor</h3>

    <div class="setting-card">
      <div class="setting-control">
        <label for="default-editor" class="text-sm font-medium text-[var(--text)] font-sans"
          >Default Editor</label
        >
        <select
          id="default-editor"
          bind:value={currentSettings.editor.defaultEditor}
          class="px-2.5 py-1.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded text-xs font-sans"
        >
          <option value="auto">🖥️ System Default</option>
          <option value="vscode">💻 VS Code</option>
          <option value="cursor">⚡ Cursor</option>
          <option value="sublime">📝 Sublime Text</option>
          <option value="intellij">🧠 IntelliJ IDEA</option>
          <option value="vim">🟢 Vim</option>
          <option value="nvim">🟩 Neovim</option>
        </select>
      </div>
      <p class="setting-help">Which editor opens files from error panels</p>
    </div>
  </section>

  <!-- Performance Section -->
  <section class="space-y-3">
    <h3 class="text-sm font-semibold text-[var(--text-heading)] font-sans">⚡ Performance</h3>

    <!-- Enable Metrics -->
    <div class="setting-card">
      <div class="setting-control">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.performance.enableMetrics}
            class="w-4 h-4 cursor-pointer"
          />
          <span class="text-sm font-medium text-[var(--text)] font-sans">Metrics collection</span>
        </label>
      </div>
      <p class="setting-help">Collect system performance metrics</p>
    </div>

    <!-- Metrics Interval -->
    <div class="setting-card {currentSettings.performance?.enableMetrics ? '' : 'disabled'}">
      <div class="setting-control">
        <label for="metrics-interval" class="text-sm font-medium text-[var(--text)] font-sans"
          >Metrics Interval</label
        >
        <div class="flex items-center gap-2">
          <input
            id="metrics-interval"
            type="number"
            min="5"
            max="60"
            bind:value={currentSettings.performance.metricsInterval}
            disabled={!currentSettings.performance?.enableMetrics}
            class="w-16 px-2.5 py-1.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded text-xs text-center font-mono"
          />
          <span class="text-xs text-[var(--muted)] font-sans">seconds</span>
        </div>
      </div>
      <p class="setting-help">How often to collect performance metrics</p>
    </div>

    <!-- File Watcher -->
    <div class="setting-card">
      <div class="setting-control">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={currentSettings.performance.enableFileWatcher}
            class="w-4 h-4 cursor-pointer"
          />
          <span class="text-sm font-medium text-[var(--text)] font-sans">File watcher</span>
        </label>
      </div>
      <p class="setting-help">Monitor file changes in real-time</p>
    </div>

    <!-- Max Events -->
    <div class="setting-card">
      <div class="setting-control">
        <label for="max-events" class="text-sm font-medium text-[var(--text)] font-sans"
          >Max Events</label
        >
        <input
          id="max-events"
          type="number"
          min="50"
          max="1000"
          step="50"
          bind:value={currentSettings.performance.maxEventsDisplay}
          class="w-20 px-2.5 py-1.5 bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] rounded text-xs text-center font-mono"
        />
      </div>
      <p class="setting-help">Maximum number of events to show in lists</p>
    </div>
  </section>
</div>

<style>
  .setting-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    transition: opacity 0.2s;
  }

  .setting-card.disabled {
    opacity: 0.5;
  }

  .setting-card-compact {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.5rem;
    transition: opacity 0.2s;
  }

  .setting-card-compact.disabled {
    opacity: 0.5;
  }

  .setting-control {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.375rem;
  }

  .setting-help {
    margin: 0;
    font-size: 0.6875rem;
    color: var(--muted);
    line-height: 1.4;
  }

  .setting-group {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
  }

  .permission-badge {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
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

  select,
  input[type='number'] {
    cursor: pointer;
  }

  input[type='number']:disabled {
    cursor: not-allowed;
  }
</style>
