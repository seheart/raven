<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  import { notifications } from '../notificationService.js';

  /**
   * System Integrations Page
   * Configure external integrations: GitHub, Discord, Slack
   */

  // State for each integration
  let githubConfig = $state({
    token: '',
    owner: '',
    repo: '',
    enabled: false
  });

  let discordConfig = $state({
    webhookUrl: '',
    enabled: false
  });

  let slackConfig = $state({
    webhookUrl: '',
    enabled: false
  });

  // UI state
  let loading = $state(false);
  let testingService = $state(null);
  let activeTab = $state('github'); // github, discord, slack, events
  let recentEvents = $state([]);
  let stats = $state(null);

  // Load configurations on mount
  $effect(() => {
    loadAllConfigs();
    loadRecentEvents();
    loadStats();
  });

  async function loadAllConfigs() {
    try {
      const [github, discord, slack] = await Promise.all([
        api.get('/api/integrations/github/config'),
        api.get('/api/integrations/discord/config'),
        api.get('/api/integrations/slack/config')
      ]);

      if (github.enabled) {
        githubConfig = { ...github.config, enabled: github.enabled };
      }
      if (discord.enabled) {
        discordConfig = { ...discord.config, enabled: discord.enabled };
      }
      if (slack.enabled) {
        slackConfig = { ...slack.config, enabled: slack.enabled };
      }
    } catch (error) {
      logger.error('Failed to load integrations:', error);
    }
  }

  async function loadRecentEvents() {
    try {
      const data = await api.get('/api/integrations/all/events?limit=20');
      recentEvents = data.events || [];
    } catch (error) {
      logger.error('Failed to load events:', error);
    }
  }

  async function loadStats() {
    try {
      stats = await api.get('/api/integrations/stats');
    } catch (error) {
      logger.error('Failed to load stats:', error);
    }
  }

  async function saveGitHub() {
    loading = true;
    try {
      await api.post('/api/integrations/github/config', {
        config: {
          token: githubConfig.token,
          owner: githubConfig.owner,
          repo: githubConfig.repo
        },
        enabled: githubConfig.enabled
      });

      notifications.success('GitHub integration saved!');
      await loadAllConfigs();
    } catch (error) {
      notifications.error('Failed to save GitHub config');
      logger.error(error);
    } finally {
      loading = false;
    }
  }

  async function saveDiscord() {
    loading = true;
    try {
      await api.post('/api/integrations/discord/config', {
        config: {
          webhookUrl: discordConfig.webhookUrl
        },
        enabled: discordConfig.enabled
      });

      notifications.success('Discord integration saved!');
      await loadAllConfigs();
    } catch (error) {
      notifications.error('Failed to save Discord config');
      logger.error(error);
    } finally {
      loading = false;
    }
  }

  async function saveSlack() {
    loading = true;
    try {
      await api.post('/api/integrations/slack/config', {
        config: {
          webhookUrl: slackConfig.webhookUrl
        },
        enabled: slackConfig.enabled
      });

      notifications.success('Slack integration saved!');
      await loadAllConfigs();
    } catch (error) {
      notifications.error('Failed to save Slack config');
      logger.error(error);
    } finally {
      loading = false;
    }
  }

  async function testIntegration(service) {
    testingService = service;
    try {
      let config;
      if (service === 'github')
        config = { token: githubConfig.token, owner: githubConfig.owner, repo: githubConfig.repo };
      else if (service === 'discord') config = { webhookUrl: discordConfig.webhookUrl };
      else if (service === 'slack') config = { webhookUrl: slackConfig.webhookUrl };

      const result = await api.post(`/api/integrations/${service}/test`, { config });

      if (result.success) {
        notifications.success(`${service} test successful! Check your ${service} channel.`);
      } else {
        notifications.error(`${service} test failed: ${result.error}`);
      }
    } catch (error) {
      notifications.error(`Failed to test ${service}`);
      logger.error(error);
    } finally {
      testingService = null;
    }
  }

  function getEventStatusColor(status) {
    return status === 'success' ? 'text-[var(--success)]' : 'text-[var(--error)]';
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-2">🔌 Integrations</h1>
      <p class="text-sm text-[var(--muted)] font-sans">
        Connect Raven to GitHub, Discord, and Slack for real-time notifications
      </p>
    </div>

    <!-- Tab Navigation -->
    <div class="flex gap-2 mb-6 border-b border-[var(--border)]">
      <button
        class="px-4 py-2 text-sm font-medium transition-all {activeTab === 'github'
          ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
          : 'text-[var(--muted)] hover:text-[var(--text)]'}"
        onclick={() => (activeTab = 'github')}
      >
        GitHub
      </button>
      <button
        class="px-4 py-2 text-sm font-medium transition-all {activeTab === 'discord'
          ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
          : 'text-[var(--muted)] hover:text-[var(--text)]'}"
        onclick={() => (activeTab = 'discord')}
      >
        Discord
      </button>
      <button
        class="px-4 py-2 text-sm font-medium transition-all {activeTab === 'slack'
          ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
          : 'text-[var(--muted)] hover:text-[var(--text)]'}"
        onclick={() => (activeTab = 'slack')}
      >
        Slack
      </button>
      <button
        class="px-4 py-2 text-sm font-medium transition-all {activeTab === 'events'
          ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
          : 'text-[var(--muted)] hover:text-[var(--text)]'}"
        onclick={() => (activeTab = 'events')}
      >
        Recent Events
      </button>
    </div>

    <!-- GitHub Tab -->
    {#if activeTab === 'github'}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-lg font-semibold text-[var(--text-heading)]">GitHub Integration</h2>
            <p class="text-sm text-[var(--muted)] mt-1 font-sans">
              Create GitHub issues for critical Raven alerts
            </p>
          </div>
          <label class="flex items-center gap-3 cursor-pointer">
            <span class="text-sm text-[var(--muted)] font-sans">Enabled</span>
            <input
              type="checkbox"
              bind:checked={githubConfig.enabled}
              class="w-5 h-5 rounded border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
            />
          </label>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-[var(--text)] mb-2">
              Personal Access Token
            </label>
            <input
              type="password"
              bind:value={githubConfig.token}
              placeholder="ghp_xxxxxxxxxxxx"
              class="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono text-sm"
            />
            <p class="text-xs text-[var(--muted)] mt-1 font-sans">
              Create a token at <a
                href="https://github.com/settings/tokens"
                target="_blank"
                class="text-[var(--accent)] hover:underline">github.com/settings/tokens</a
              > with 'repo' scope
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-[var(--text)] mb-2"> Owner </label>
              <input
                type="text"
                bind:value={githubConfig.owner}
                placeholder="username or org"
                class="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-[var(--text)] mb-2"> Repository </label>
              <input
                type="text"
                bind:value={githubConfig.repo}
                placeholder="repo-name"
                class="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] text-sm"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              onclick={saveGitHub}
              disabled={loading}
              class="px-6 py-2 bg-[var(--accent)] text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              onclick={() => testIntegration('github')}
              disabled={!githubConfig.token || testingService === 'github'}
              class="px-6 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] rounded-lg font-medium text-sm hover:bg-[var(--bg)] disabled:opacity-50 transition-all"
            >
              {testingService === 'github' ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Discord Tab -->
    {#if activeTab === 'discord'}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-lg font-semibold text-[var(--text-heading)]">Discord Integration</h2>
            <p class="text-sm text-[var(--muted)] mt-1 font-sans">
              Send Raven alerts to a Discord channel
            </p>
          </div>
          <label class="flex items-center gap-3 cursor-pointer">
            <span class="text-sm text-[var(--muted)] font-sans">Enabled</span>
            <input
              type="checkbox"
              bind:checked={discordConfig.enabled}
              class="w-5 h-5 rounded border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
            />
          </label>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-[var(--text)] mb-2"> Webhook URL </label>
            <input
              type="text"
              bind:value={discordConfig.webhookUrl}
              placeholder="https://discord.com/api/webhooks/..."
              class="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono text-sm"
            />
            <p class="text-xs text-[var(--muted)] mt-1 font-sans">
              Create a webhook in Discord: Server Settings → Integrations → Webhooks
            </p>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              onclick={saveDiscord}
              disabled={loading}
              class="px-6 py-2 bg-[var(--accent)] text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              onclick={() => testIntegration('discord')}
              disabled={!discordConfig.webhookUrl || testingService === 'discord'}
              class="px-6 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] rounded-lg font-medium text-sm hover:bg-[var(--bg)] disabled:opacity-50 transition-all"
            >
              {testingService === 'discord' ? 'Testing...' : 'Test Webhook'}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Slack Tab -->
    {#if activeTab === 'slack'}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-lg font-semibold text-[var(--text-heading)]">Slack Integration</h2>
            <p class="text-sm text-[var(--muted)] mt-1 font-sans">
              Send Raven alerts to a Slack channel
            </p>
          </div>
          <label class="flex items-center gap-3 cursor-pointer">
            <span class="text-sm text-[var(--muted)] font-sans">Enabled</span>
            <input
              type="checkbox"
              bind:checked={slackConfig.enabled}
              class="w-5 h-5 rounded border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
            />
          </label>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-[var(--text)] mb-2"> Webhook URL </label>
            <input
              type="text"
              bind:value={slackConfig.webhookUrl}
              placeholder="https://hooks.slack.com/services/..."
              class="w-full px-4 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono text-sm"
            />
            <p class="text-xs text-[var(--muted)] mt-1 font-sans">
              Create a webhook at <a
                href="https://api.slack.com/messaging/webhooks"
                target="_blank"
                class="text-[var(--accent)] hover:underline">api.slack.com/messaging/webhooks</a
              >
            </p>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              onclick={saveSlack}
              disabled={loading}
              class="px-6 py-2 bg-[var(--accent)] text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              onclick={() => testIntegration('slack')}
              disabled={!slackConfig.webhookUrl || testingService === 'slack'}
              class="px-6 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] rounded-lg font-medium text-sm hover:bg-[var(--bg)] disabled:opacity-50 transition-all"
            >
              {testingService === 'slack' ? 'Testing...' : 'Test Webhook'}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Events Tab -->
    {#if activeTab === 'events'}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h2 class="text-lg font-semibold text-[var(--text-heading)] mb-4">Recent Events</h2>

        {#if stats}
          <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-[var(--bg)] p-4 rounded-lg">
              <div class="text-2xl font-bold text-[var(--accent)]">{stats.total_events}</div>
              <div class="text-sm text-[var(--muted)] font-sans">Total Events</div>
            </div>
            <div class="bg-[var(--bg)] p-4 rounded-lg">
              <div class="text-2xl font-bold text-[var(--success)]">
                {stats.by_status?.find(s => s.status === 'success')?.count || 0}
              </div>
              <div class="text-sm text-[var(--muted)] font-sans">Successful</div>
            </div>
            <div class="bg-[var(--bg)] p-4 rounded-lg">
              <div class="text-2xl font-bold text-[var(--error)]">
                {stats.by_status?.find(s => s.status === 'error')?.count || 0}
              </div>
              <div class="text-sm text-[var(--muted)] font-sans">Failed</div>
            </div>
          </div>
        {/if}

        <div class="space-y-2">
          {#each recentEvents as event (event.id)}
            <div class="bg-[var(--bg)] p-4 rounded-lg flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium text-[var(--text)] capitalize">
                    {event.service}
                  </span>
                  <span class="text-xs text-[var(--muted)] font-sans">{event.event_type}</span>
                  <span class="{getEventStatusColor(event.status)} text-xs font-semibold">
                    {event.status}
                  </span>
                </div>
                {#if event.message}
                  <p class="text-sm text-[var(--muted)] mt-1 font-sans">{event.message}</p>
                {/if}
              </div>
              <div class="text-xs text-[var(--muted)] font-mono">
                {formatTimestamp(event.timestamp)}
              </div>
            </div>
          {:else}
            <div class="text-center py-8 text-[var(--muted)] text-sm font-sans">
              No events yet. Configure and test an integration above!
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
