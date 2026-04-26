<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { settings } from '../stores/settingsStore.js';

  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  const { api } = createPageApi();

  let currentSettings = $state(get(settings));
  let notificationPermission = $state('default');
  let networkInfo = $state(null);

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
    api.get('/network-info').then(data => { networkInfo = data; }).catch(() => {});
    const unsubscribe = settings.subscribe(value => {
      currentSettings = value;
    });
    return unsubscribe;
  });
</script>

<PageLayout>
  <PageHeader title="Settings" description="Application preferences and configuration">
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <button
          onclick={exportSettings}
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors"
        >
          Export
        </button>
        <label
          class="px-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors cursor-pointer"
        >
          Import
          <input type="file" accept=".json" onchange={importSettings} class="hidden" />
        </label>
        <button
          onclick={resetToDefaults}
          class="px-3 py-1.5 bg-surface border border-error rounded text-sm font-sans text-error hover:bg-error hover:text-white transition-colors"
        >
          Reset
        </button>
      </div>
    {/snippet}
  </PageHeader>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- User Interface -->
      <div class="bg-surface border border-border rounded-lg p-5">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
          User Interface
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Time Format</span>
            <select
              bind:value={currentSettings.ui.timeFormat}
              class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body cursor-pointer"
            >
              <option value="12h">12-hour</option>
              <option value="24h">24-hour</option>
            </select>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Timezone</span>
            <select
              bind:value={currentSettings.ui.timezone}
              class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body cursor-pointer max-w-[200px]"
            >
              {#each Intl.supportedValuesOf('timeZone') as tz (tz)}
                <option value={tz}>{tz.replace(/_/g, ' ')}</option>
              {/each}
            </select>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Compact Mode</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.ui.compactMode}
              class="cursor-pointer"
            />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Animations</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.ui.animationsEnabled}
              class="cursor-pointer"
            />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Auto-refresh</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.ui.autoRefresh}
              class="cursor-pointer"
            />
          </div>
          {#if currentSettings.ui.autoRefresh}
            <div class="flex justify-between items-center">
              <span class="text-sm text-muted">Refresh Interval</span>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="60"
                  bind:value={currentSettings.ui.refreshInterval}
                  class="w-16 px-2 py-1 bg-canvas border border-border rounded text-sm font-mono text-body text-center"
                />
                <span class="text-xs text-muted">sec</span>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Notifications -->
      <div class="bg-surface border border-border rounded-lg p-5">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
          Notifications
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Enable Notifications</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.notifications.enabled}
              class="cursor-pointer"
            />
          </div>
          {#if currentSettings.notifications.enabled}
            <div class="flex justify-between items-center">
              <span class="text-sm text-muted">Toast Messages</span>
              <input
                type="checkbox"
                bind:checked={currentSettings.notifications.showToasts}
                class="cursor-pointer"
              />
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-muted">Sound</span>
              <input
                type="checkbox"
                bind:checked={currentSettings.notifications.soundEnabled}
                class="cursor-pointer"
              />
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-muted">Desktop Notifications</span>
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  bind:checked={currentSettings.notifications.desktopNotifications}
                  class="cursor-pointer"
                />
                {#if notificationPermission !== 'granted'}
                  <button
                    onclick={requestNotificationPermission}
                    class="px-2 py-1 bg-canvas border border-border rounded text-xs font-sans hover:border-accent transition-colors"
                  >
                    Allow
                  </button>
                {:else}
                  <span class="flex items-center gap-1 text-xs text-success">
                    <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                    Granted
                  </span>
                {/if}
              </div>
            </div>
            <div class="pt-3 border-t border-border">
              <div class="text-xs text-muted mb-2">Notification Types</div>
              <div class="grid grid-cols-2 gap-2">
                {#each Object.keys(currentSettings.notifications.types) as type (type)}
                  <label class="flex items-center gap-2 text-sm text-body cursor-pointer">
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
      <div class="bg-surface border border-border rounded-lg p-5">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
          Editor
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Default Editor</span>
            <select
              bind:value={currentSettings.editor.defaultEditor}
              class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body cursor-pointer"
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
      <div class="bg-surface border border-border rounded-lg p-5">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
          Performance
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Metrics Collection</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.performance.enableMetrics}
              class="cursor-pointer"
            />
          </div>
          {#if currentSettings.performance.enableMetrics}
            <div class="flex justify-between items-center">
              <span class="text-sm text-muted">Metrics Interval</span>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="60"
                  bind:value={currentSettings.performance.metricsInterval}
                  class="w-16 px-2 py-1 bg-canvas border border-border rounded text-sm font-mono text-body text-center"
                />
                <span class="text-xs text-muted">sec</span>
              </div>
            </div>
          {/if}
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">File Watcher</span>
            <input
              type="checkbox"
              bind:checked={currentSettings.performance.enableFileWatcher}
              class="cursor-pointer"
            />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-muted">Max Events Display</span>
            <input
              type="number"
              min="50"
              max="1000"
              step="50"
              bind:value={currentSettings.performance.maxEventsDisplay}
              class="w-20 px-2 py-1 bg-canvas border border-border rounded text-sm font-mono text-body text-center"
            />
          </div>
        </div>
      </div>

      <!-- Billing Mode -->
      <div class="bg-surface border border-border rounded-lg p-5">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
          Billing Mode
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <div>
              <div class="text-sm text-body">Plan Type</div>
              <div class="text-xs text-muted">Controls how token usage is displayed</div>
            </div>
            <select
              bind:value={currentSettings.billing.mode}
              class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body cursor-pointer"
            >
              <option value="subscription">Subscription (Max/Pro)</option>
              <option value="api">API (pay-per-token)</option>
            </select>
          </div>
          {#if currentSettings.billing?.mode === 'subscription'}
            <div class="flex justify-between items-center">
              <div>
                <div class="text-sm text-body">Plan Name</div>
                <div class="text-xs text-muted">Shown as a badge on the Token Usage page</div>
              </div>
              <select
                bind:value={currentSettings.billing.planName}
                class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body cursor-pointer"
              >
                <option value="Claude Max">Claude Max ($100/mo)</option>
                <option value="Claude Pro">Claude Pro ($20/mo)</option>
                <option value="Claude Team">Claude Team</option>
                <option value="Claude Enterprise">Claude Enterprise</option>
                <option value="Free">Free</option>
              </select>
            </div>
            <div class="text-xs text-muted bg-canvas rounded p-3">
              On a subscription plan, token usage is tracked for visibility but you are not billed per token.
              Cost estimates are hidden. Switch to API mode if you use pay-per-token billing.
            </div>
          {:else}
            <div class="text-xs text-warning bg-canvas rounded p-3">
              API mode shows estimated costs based on published per-token pricing.
              These are estimates — actual billing may differ.
            </div>
          {/if}
        </div>
      </div>

      <!-- Mobile Access -->
      <div class="bg-surface border border-border rounded-lg p-5">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
          Mobile Access
        </h3>
        <div class="space-y-3">
          {#if networkInfo?.lan_url}
            <div>
              <div class="text-sm text-body mb-1">LAN Dashboard URL</div>
              <div class="text-xs text-muted mb-2">Access Raven from any device on your local network</div>
              <code class="block bg-canvas border border-border rounded px-3 py-2 text-sm font-mono text-accent select-all">
                {networkInfo.lan_url}
              </code>
            </div>
            <div>
              <div class="text-sm text-body mb-1">LAN API URL</div>
              <code class="block bg-canvas border border-border rounded px-3 py-2 text-sm font-mono text-muted select-all">
                {networkInfo.backend_url}
              </code>
            </div>
            <div class="text-xs text-muted">
              Open the dashboard URL on your phone while connected to the same Wi-Fi network.
            </div>
          {:else}
            <div class="text-sm text-muted">
              No LAN address detected. Raven is accessible on localhost only.
            </div>
          {/if}
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="bg-surface border border-error rounded-lg p-5">
        <h3 class="text-xs font-semibold text-error uppercase tracking-wide mb-4">
          Danger Zone
        </h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <div>
              <div class="text-sm text-body">Reset All Settings</div>
              <div class="text-xs text-muted">Restore defaults. Cannot be undone.</div>
            </div>
            <button
              onclick={resetToDefaults}
              class="px-3 py-1.5 bg-error text-white rounded text-sm font-sans hover:opacity-90 transition-opacity"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
</PageLayout>
