<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { settings } from '../stores/settingsStore.js';

  let currentSettings = $state(get(settings));
  let notificationPermission = $state('default');

  function _save() {
    settings.set(currentSettings);
  }

  function updateNotificationPermission() {
    if (typeof Notification !== 'undefined') {
      notificationPermission = Notification.permission;
    }
  }

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;
    try {
      await Notification.requestPermission();
      updateNotificationPermission();
    } catch (err) {
      logger.error('Notification permission error:', err);
    }
  }

  function exportSettings() {
    const blob = new Blob([settings.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const success = settings.import(e.target.result);
      if (success) {
        currentSettings = get(settings);
      }
    };
    reader.readAsText(file);
  }

  function resetToDefaults() {
    if (confirm('Reset all settings to defaults?')) {
      settings.reset();
      currentSettings = get(settings);
    }
  }

  // Auto-save on any change
  $effect(() => {
    // Track all nested properties by serializing
    const serialized = JSON.stringify(currentSettings);
    if (serialized) {
      settings.set(currentSettings);
    }
  });

  onMount(() => {
    updateNotificationPermission();
    const unsubscribe = settings.subscribe(value => {
      currentSettings = value;
    });
    return unsubscribe;
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Settings</h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          Application preferences and configuration
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button
          onclick={exportSettings}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          Export
        </button>
        <label
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors cursor-pointer"
        >
          Import
          <input type="file" accept=".json" onchange={importSettings} class="hidden" />
        </label>
        <button
          onclick={resetToDefaults}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--error)] rounded text-sm font-sans text-[var(--error)] hover:bg-[var(--error)] hover:text-white transition-colors"
        >
          Reset
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- User Interface -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          User Interface
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Time Format</span>
            <select
              bind:value={currentSettings.ui.timeFormat}
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] cursor-pointer"
            >
              <option value="12h">12-hour</option>
              <option value="24h">24-hour</option>
            </select>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Timezone</span>
            <select
              bind:value={currentSettings.ui.timezone}
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] cursor-pointer max-w-[200px]"
            >
              {#each Intl.supportedValuesOf('timeZone') as tz (tz)}
                <option value={tz}>{tz.replace(/_/g, ' ')}</option>
              {/each}
            </select>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Compact Mode</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.ui.compactMode}
              class="cursor-pointer"
            />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Animations</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.ui.animationsEnabled}
              class="cursor-pointer"
            />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Auto-refresh</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.ui.autoRefresh}
              class="cursor-pointer"
            />
          </div>
          {#if currentSettings.ui.autoRefresh}
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--muted)]">Refresh Interval</span>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="60"
                  bind:value={currentSettings.ui.refreshInterval}
                  class="w-16 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] text-center"
                />
                <span class="text-xs text-[var(--muted)]">sec</span>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Notifications -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          Notifications
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Enable Notifications</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.notifications.enabled}
              class="cursor-pointer"
            />
          </div>
          {#if currentSettings.notifications.enabled}
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--muted)]">Toast Messages</span>
              <input
                type="checkbox"
                bind:checked={currentSettings.notifications.showToasts}
                class="cursor-pointer"
              />
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--muted)]">Sound</span>
              <input
                type="checkbox"
                bind:checked={currentSettings.notifications.soundEnabled}
                class="cursor-pointer"
              />
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--muted)]">Desktop Notifications</span>
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  bind:checked={currentSettings.notifications.desktopNotifications}
                  class="cursor-pointer"
                />
                {#if notificationPermission !== 'granted'}
                  <button
                    onclick={requestNotificationPermission}
                    class="px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-xs font-sans hover:border-[var(--accent)] transition-colors"
                  >
                    Allow
                  </button>
                {:else}
                  <span class="flex items-center gap-1 text-xs text-[var(--success)]">
                    <span class="w-1.5 h-1.5 rounded-full bg-[var(--success)]"></span>
                    Granted
                  </span>
                {/if}
              </div>
            </div>
            <div class="pt-3 border-t border-[var(--border)]">
              <div class="text-xs text-[var(--muted)] mb-2">Notification Types</div>
              <div class="grid grid-cols-2 gap-2">
                {#each Object.keys(currentSettings.notifications.types) as type (type)}
                  <label class="flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={currentSettings.notifications.types[type]}
                      class="cursor-pointer"
                    />
                    <span class="capitalize">{type}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Editor -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          Editor
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Default Editor</span>
            <select
              bind:value={currentSettings.editor.defaultEditor}
              class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] cursor-pointer"
            >
              <option value="auto">System Default</option>
              <option value="vscode">VS Code</option>
              <option value="cursor">Cursor</option>
              <option value="sublime">Sublime Text</option>
              <option value="intellij">IntelliJ IDEA</option>
              <option value="vim">Vim</option>
              <option value="nvim">Neovim</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Performance -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          Performance
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Metrics Collection</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.performance.enableMetrics}
              class="cursor-pointer"
            />
          </div>
          {#if currentSettings.performance.enableMetrics}
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--muted)]">Metrics Interval</span>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="60"
                  bind:value={currentSettings.performance.metricsInterval}
                  class="w-16 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] text-center"
                />
                <span class="text-xs text-[var(--muted)]">sec</span>
              </div>
            </div>
          {/if}
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">File Watcher</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.performance.enableFileWatcher}
              class="cursor-pointer"
            />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-[var(--muted)]">Max Events Display</span>
            <input
              type="number"
              min="50"
              max="1000"
              step="50"
              bind:value={currentSettings.performance.maxEventsDisplay}
              class="w-20 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] text-center"
            />
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="bg-[var(--surface)] border border-[var(--error)] rounded-lg p-5">
        <h3 class="text-xs font-semibold text-[var(--error)] uppercase tracking-wide mb-4">
          Danger Zone
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <div>
              <div class="text-sm text-[var(--text)]">Reset All Settings</div>
              <div class="text-xs text-[var(--muted)]">Restore defaults. Cannot be undone.</div>
            </div>
            <button
              onclick={resetToDefaults}
              class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans hover:opacity-90 transition-opacity"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
