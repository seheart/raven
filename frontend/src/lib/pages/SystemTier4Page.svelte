<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  import { projectFilter } from '../projectFilterStore.js';

  /**
   * Tier 4 Advanced Features Page
   *
   * Comprehensive dashboard with 9 tabs:
   * 1. Health Scoring - Project health metrics with recommendations
   * 2. Drift Detection - Baseline drift monitoring
   * 3. Productivity Insights - Developer productivity analytics
   * 4. Claude Personality - AI personality analysis
   * 5. Growth Tracking - Project growth metrics and milestones
   * 6. Integrations - GitHub/Discord/Slack configuration
   * 7. Gamification - Achievements and badges
   * 8. Easter Eggs - Seasonal messages and discoveries
   * 9. Social - Export stats and team management
   */

  // Active tab state
  let activeTab = $state('health');
  let loading = $state(false);
  let error = $state(null);
  let loadedTabs = $state(new Set());

  // Health Scoring data
  let healthScore = $state(null);
  let healthHistory = $state([]);

  // Drift Detection data
  let recentDrifts = $state([]);
  let driftSummary = $state(null);

  // Productivity Insights data
  let productivityInsights = $state(null);

  // Claude Personality data
  let personalityProfile = $state(null);

  // Growth Tracking data
  let growthSummary = $state(null);
  let growthTimeSeries = $state(null);

  // Integration status
  let integrationStatus = $state({
    github: { enabled: false, events: [] },
    discord: { enabled: false, events: [] },
    slack: { enabled: false, events: [] }
  });

  // Gamification data
  let userStats = $state(null);
  let achievements = $state([]);
  let recentAchievements = $state([]);

  // Easter Eggs data
  let easterEggs = $state([]);
  let seasonalMessage = $state(null);

  // Social data
  let shareHistory = $state([]);
  let teamMembers = $state([]);
  let exportFormat = $state('json');

  // Integration configuration forms
  let githubConfig = $state({ token: '', owner: '', repo: '' });
  let discordConfig = $state({ webhookUrl: '' });
  let slackConfig = $state({ webhookUrl: '' });
  let configSaveStatus = $state('');

  // Current project from filter
  const project = $derived($projectFilter === 'all' ? 'raven' : $projectFilter);

  // Helper functions
  function getHealthScoreColor(score) {
    if (!score) return 'rgb(107, 114, 128)'; // gray
    if (score >= 80) return 'rgb(81, 207, 102)'; // green
    if (score >= 60) return 'rgb(255, 212, 59)'; // yellow
    if (score >= 40) return 'rgb(255, 146, 43)'; // orange
    return 'rgb(255, 107, 107)'; // red
  }

  function getSeverityColor(severity) {
    const colors = {
      critical: 'rgb(255, 107, 107)',
      high: 'rgb(255, 146, 43)',
      medium: 'rgb(255, 212, 59)',
      low: 'rgb(116, 192, 252)',
      info: 'rgb(153, 233, 242)'
    };
    return colors[severity] || colors.info;
  }

  // Data loading functions
  async function loadTabData(tab) {
    if (loadedTabs.has(tab)) return;

    loading = true;
    error = null;
    loadedTabs.add(tab);

    try {
      switch (tab) {
        case 'health':
          await loadHealthData();
          break;
        case 'drift':
          await loadDriftData();
          break;
        case 'productivity':
          await loadProductivityData();
          break;
        case 'personality':
          await loadPersonalityData();
          break;
        case 'growth':
          await loadGrowthData();
          break;
        case 'integrations':
          await loadIntegrationStatus();
          break;
        case 'gamification':
          await loadGamificationData();
          break;
        case 'easter-eggs':
          await loadEasterEggsData();
          break;
        case 'social':
          await loadSocialData();
          break;
      }
    } catch (err) {
      error = err.message;
      loadedTabs.delete(tab);
    } finally {
      loading = false;
    }
  }

  async function loadHealthData() {
    try {
      const [latestData, historyData] = await Promise.all([
        api.get(`/health/latest?project=${project}`).catch(() => ({ score: null })),
        api.get(`/health/history?project=${project}&days=30`).catch(() => ({ history: [] }))
      ]);

      healthScore = latestData.score;
      healthHistory = historyData.history || [];
    } catch (err) {
      logger.error('Error loading health data:', err);
    }
  }

  async function loadDriftData() {
    try {
      const [recentData, summaryData] = await Promise.all([
        api.get(`/drift/recent?project=${project}&hours=24`).catch(() => ({ drifts: [] })),
        api.get(`/drift/summary?project=${project}&days=7`).catch(() => ({ summary: null }))
      ]);

      recentDrifts = recentData.drifts || [];
      driftSummary = summaryData.summary;
    } catch (err) {
      logger.error('Error loading drift data:', err);
    }
  }

  async function loadProductivityData() {
    try {
      const data = await api
        .get(`/productivity/latest?project=${project}`)
        .catch(() => ({ metrics: null }));
      productivityInsights = data.metrics;
    } catch (err) {
      logger.error('Error loading productivity data:', err);
    }
  }

  async function loadPersonalityData() {
    try {
      const data = await api
        .get(`/personality/latest?project=${project}&agent=claude`)
        .catch(() => ({ profile: null }));
      personalityProfile = data.profile;
    } catch (err) {
      logger.error('Error loading personality data:', err);
    }
  }

  async function loadGrowthData() {
    try {
      const [summaryData, timeSeriesData] = await Promise.all([
        api.get(`/growth/summary?project=${project}&days=30`).catch(() => ({ summary: null })),
        api
          .get(`/growth/timeseries?project=${project}&days=30&metric=all`)
          .catch(() => ({ timeSeries: null }))
      ]);

      growthSummary = summaryData.summary;
      growthTimeSeries = timeSeriesData.timeSeries;
    } catch (err) {
      logger.error('Error loading growth data:', err);
    }
  }

  async function loadIntegrationStatus() {
    try {
      const [githubData, discordData, slackData] = await Promise.all([
        api
          .get(`/integrations/github/events?project=${project}&hours=24`)
          .catch(() => ({ events: [] })),
        api
          .get(`/integrations/discord/events?project=${project}&hours=24`)
          .catch(() => ({ events: [] })),
        api
          .get(`/integrations/slack/events?project=${project}&hours=24`)
          .catch(() => ({ events: [] }))
      ]);

      integrationStatus.github.events = githubData.events || [];
      integrationStatus.github.enabled = githubData.events?.length > 0;

      integrationStatus.discord.events = discordData.events || [];
      integrationStatus.discord.enabled = discordData.events?.length > 0;

      integrationStatus.slack.events = slackData.events || [];
      integrationStatus.slack.enabled = slackData.events?.length > 0;
    } catch (err) {
      logger.error('Error loading integration status:', err);
    }
  }

  async function loadGamificationData() {
    try {
      const [statsData, achievementsData, recentData] = await Promise.all([
        api.get(`/gamification/stats?project=${project}`).catch(() => ({ stats: null })),
        api
          .get(`/gamification/achievements?project=${project}`)
          .catch(() => ({ achievements: [] })),
        api.get(`/gamification/recent?project=${project}`).catch(() => ({ achievements: [] }))
      ]);

      userStats = statsData.stats;
      achievements = achievementsData.achievements || [];
      recentAchievements = recentData.achievements || [];
    } catch (err) {
      logger.error('Error loading gamification data:', err);
    }
  }

  async function loadEasterEggsData() {
    try {
      const [eggsData, seasonalData] = await Promise.all([
        api.get(`/easter-eggs?project=${project}`).catch(() => ({ eggs: [] })),
        api.get(`/easter-eggs/seasonal?project=${project}`).catch(() => ({ messages: [] }))
      ]);

      easterEggs = eggsData.eggs || [];
      seasonalMessage = seasonalData.messages?.[0] || null;
    } catch (err) {
      logger.error('Error loading easter eggs data:', err);
    }
  }

  async function loadSocialData() {
    try {
      const [historyData, teamData] = await Promise.all([
        api.get(`/social/share-history?project=${project}&limit=20`).catch(() => ({ history: [] })),
        api.get(`/social/team?project=${project}`).catch(() => ({ members: [] }))
      ]);

      shareHistory = historyData.history || [];
      teamMembers = teamData.members || [];
    } catch (err) {
      logger.error('Error loading social data:', err);
    }
  }

  // Action functions
  async function calculateHealthScore() {
    try {
      loading = true;
      const data = await api.post(`/health/calculate?project=${project}`, {});
      healthScore = data.healthScore;
      await loadHealthData();
    } catch (err) {
      logger.error('Error calculating health score:', err);
    } finally {
      loading = false;
    }
  }

  async function detectDrifts() {
    try {
      loading = true;
      const data = await api.post(`/drift/detect?project=${project}`, {});
      recentDrifts = data.drifts || [];
      await loadDriftData();
    } catch (err) {
      logger.error('Error detecting drifts:', err);
    } finally {
      loading = false;
    }
  }

  async function resolveDrift(driftId) {
    try {
      await api.post(`/drift/${driftId}/resolve?project=${project}`, {});
      await loadDriftData();
    } catch (err) {
      logger.error('Error resolving drift:', err);
    }
  }

  async function calculateProductivity() {
    try {
      loading = true;
      const data = await api.post(`/productivity/calculate?project=${project}&days=30`, {});
      productivityInsights = data.insights;
    } catch (err) {
      logger.error('Error calculating productivity:', err);
    } finally {
      loading = false;
    }
  }

  async function analyzePersonality() {
    try {
      loading = true;
      const data = await api.post(
        `/personality/analyze?project=${project}&agent=claude&days=30`,
        {}
      );
      personalityProfile = data.personality;
    } catch (err) {
      logger.error('Error analyzing personality:', err);
    } finally {
      loading = false;
    }
  }

  async function createGrowthSnapshot() {
    try {
      loading = true;
      await api.post(`/growth/snapshot?project=${project}`, {});
      await loadGrowthData();
    } catch (err) {
      logger.error('Error creating growth snapshot:', err);
    } finally {
      loading = false;
    }
  }

  // Integration config functions
  async function saveGitHubConfig() {
    try {
      configSaveStatus = 'Saving GitHub configuration...';
      const data = await api.post(`/integrations/github/config?project=${project}`, githubConfig);
      if (data.success) {
        configSaveStatus = 'GitHub configuration saved successfully!';
        integrationStatus.github.enabled = true;
        setTimeout(() => (configSaveStatus = ''), 3000);
      } else {
        configSaveStatus = `Error: ${data.error}`;
      }
    } catch (err) {
      configSaveStatus = `Error saving GitHub config: ${err.message}`;
    }
  }

  async function saveDiscordConfig() {
    try {
      configSaveStatus = 'Saving Discord configuration...';
      const data = await api.post(`/integrations/discord/config?project=${project}`, discordConfig);
      if (data.success) {
        configSaveStatus = 'Discord configuration saved successfully!';
        integrationStatus.discord.enabled = true;
        setTimeout(() => (configSaveStatus = ''), 3000);
      } else {
        configSaveStatus = `Error: ${data.error}`;
      }
    } catch (err) {
      configSaveStatus = `Error saving Discord config: ${err.message}`;
    }
  }

  async function saveSlackConfig() {
    try {
      configSaveStatus = 'Saving Slack configuration...';
      const data = await api.post(`/integrations/slack/config?project=${project}`, slackConfig);
      if (data.success) {
        configSaveStatus = 'Slack configuration saved successfully!';
        integrationStatus.slack.enabled = true;
        setTimeout(() => (configSaveStatus = ''), 3000);
      } else {
        configSaveStatus = `Error: ${data.error}`;
      }
    } catch (err) {
      configSaveStatus = `Error saving Slack config: ${err.message}`;
    }
  }

  async function testGitHubConnection() {
    try {
      configSaveStatus = 'Testing GitHub connection...';
      const data = await api.get(`/integrations/github/test?project=${project}`);
      if (data.result?.success) {
        configSaveStatus = `✓ GitHub connected: ${data.result.repo_name}`;
      } else {
        configSaveStatus = `✗ GitHub test failed: ${data.result?.error}`;
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function testDiscordConnection() {
    try {
      configSaveStatus = 'Testing Discord connection...';
      const data = await api.get(`/integrations/discord/test?project=${project}`);
      if (data.result?.success) {
        configSaveStatus = '✓ Discord webhook is valid!';
      } else {
        configSaveStatus = `✗ Discord test failed: ${data.result?.error}`;
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function testSlackConnection() {
    try {
      configSaveStatus = 'Testing Slack connection...';
      const data = await api.get(`/integrations/slack/test?project=${project}`);
      if (data.result?.success) {
        configSaveStatus = '✓ Slack webhook is valid!';
      } else {
        configSaveStatus = `✗ Slack test failed: ${data.result?.error}`;
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function sendHealthToGitHub() {
    try {
      configSaveStatus = 'Posting health score to GitHub...';
      const data = await api.post(`/integrations/github/send-health?project=${project}`, {});
      if (data.success) {
        configSaveStatus = '✓ Health score posted to GitHub!';
      } else {
        configSaveStatus = '✗ Failed to post to GitHub';
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function sendHealthToDiscord() {
    try {
      configSaveStatus = 'Sending health score to Discord...';
      const data = await api.post(`/integrations/discord/send-health?project=${project}`, {});
      if (data.result?.success) {
        configSaveStatus = '✓ Health score sent to Discord!';
      } else {
        configSaveStatus = '✗ Failed to send to Discord';
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function sendHealthToSlack() {
    try {
      configSaveStatus = 'Sending health score to Slack...';
      const data = await api.post(`/integrations/slack/send-health?project=${project}`, {});
      if (data.result?.success) {
        configSaveStatus = '✓ Health score sent to Slack!';
      } else {
        configSaveStatus = '✗ Failed to send to Slack';
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function disableGitHub() {
    try {
      configSaveStatus = 'Disabling GitHub integration...';
      await api.post(`/integrations/github/disable?project=${project}`, {});
      configSaveStatus = 'GitHub integration disabled';
      integrationStatus.github.enabled = false;
      setTimeout(() => (configSaveStatus = ''), 3000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 3000);
    }
  }

  async function disableDiscord() {
    try {
      configSaveStatus = 'Disabling Discord integration...';
      await api.post(`/integrations/discord/disable?project=${project}`, {});
      configSaveStatus = 'Discord integration disabled';
      integrationStatus.discord.enabled = false;
      setTimeout(() => (configSaveStatus = ''), 3000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 3000);
    }
  }

  async function disableSlack() {
    try {
      configSaveStatus = 'Disabling Slack integration...';
      await api.post(`/integrations/slack/disable?project=${project}`, {});
      configSaveStatus = 'Slack integration disabled';
      integrationStatus.slack.enabled = false;
      setTimeout(() => (configSaveStatus = ''), 3000);
    } catch (err) {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 3000);
    }
  }

  function refreshCurrentTab() {
    loadedTabs.delete(activeTab);
    loadTabData(activeTab);
  }

  // Watch for tab changes and load data
  $effect(() => {
    if (activeTab && !loadedTabs.has(activeTab)) {
      loadTabData(activeTab);
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Advanced Features</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Analytics, integrations, and experimental features
        </p>
      </div>
      <button
        onclick={() => refreshCurrentTab()}
        disabled={loading}
        class="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Loading...' : 'Refresh Tab'}
      </button>
    </div>

    {#if error}
      <div class="mb-6 p-4 bg-red-900/20 border-l-4 border-red-500 text-red-400">
        {error}
      </div>
    {/if}

    <!-- Tabs -->
    <div class="flex gap-2 mb-6 border-b border-[var(--border)] pb-2 overflow-x-auto">
      <button
        onclick={() => (activeTab = 'health')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'health'}
        class:border-[var(--accent)]={activeTab === 'health'}
        class:text-[var(--muted)]={activeTab !== 'health'}
        class:border-transparent={activeTab !== 'health'}
      >
        Health Scoring
      </button>
      <button
        onclick={() => (activeTab = 'drift')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'drift'}
        class:border-[var(--accent)]={activeTab === 'drift'}
        class:text-[var(--muted)]={activeTab !== 'drift'}
        class:border-transparent={activeTab !== 'drift'}
      >
        Drift Detection
      </button>
      <button
        onclick={() => (activeTab = 'productivity')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'productivity'}
        class:border-[var(--accent)]={activeTab === 'productivity'}
        class:text-[var(--muted)]={activeTab !== 'productivity'}
        class:border-transparent={activeTab !== 'productivity'}
      >
        Productivity
      </button>
      <button
        onclick={() => (activeTab = 'personality')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'personality'}
        class:border-[var(--accent)]={activeTab === 'personality'}
        class:text-[var(--muted)]={activeTab !== 'personality'}
        class:border-transparent={activeTab !== 'personality'}
      >
        Personality
      </button>
      <button
        onclick={() => (activeTab = 'growth')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'growth'}
        class:border-[var(--accent)]={activeTab === 'growth'}
        class:text-[var(--muted)]={activeTab !== 'growth'}
        class:border-transparent={activeTab !== 'growth'}
      >
        Growth Tracking
      </button>
      <button
        onclick={() => (activeTab = 'integrations')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'integrations'}
        class:border-[var(--accent)]={activeTab === 'integrations'}
        class:text-[var(--muted)]={activeTab !== 'integrations'}
        class:border-transparent={activeTab !== 'integrations'}
      >
        Integrations
      </button>
      <button
        onclick={() => (activeTab = 'gamification')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'gamification'}
        class:border-[var(--accent)]={activeTab === 'gamification'}
        class:text-[var(--muted)]={activeTab !== 'gamification'}
        class:border-transparent={activeTab !== 'gamification'}
      >
        Gamification
      </button>
      <button
        onclick={() => (activeTab = 'easter-eggs')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'easter-eggs'}
        class:border-[var(--accent)]={activeTab === 'easter-eggs'}
        class:text-[var(--muted)]={activeTab !== 'easter-eggs'}
        class:border-transparent={activeTab !== 'easter-eggs'}
      >
        Easter Eggs
      </button>
      <button
        onclick={() => (activeTab = 'social')}
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
        class:text-[var(--accent)]={activeTab === 'social'}
        class:border-[var(--accent)]={activeTab === 'social'}
        class:text-[var(--muted)]={activeTab !== 'social'}
        class:border-transparent={activeTab !== 'social'}
      >
        Social
      </button>
    </div>

    <!-- Tab Content -->
    <div class="mt-6">
      {#if activeTab === 'health'}
        <!-- Health Scoring Tab -->
        <div class="space-y-6">
          <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold text-[var(--text)]">Project Health Score</h3>
            <button
              onclick={calculateHealthScore}
              class="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium transition-colors hover:bg-[var(--accent-hover)]"
            >
              Calculate Now
            </button>
          </div>

          {#if healthScore}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
              <!-- Overall Score Display -->
              <div
                class="text-center mb-8 p-6 border-4 rounded-xl"
                style="border-color: {getHealthScoreColor(healthScore.overall_score)}"
              >
                <div
                  class="text-6xl font-bold mb-2"
                  style="color: {getHealthScoreColor(healthScore.overall_score)}"
                >
                  {healthScore.overall_score}
                </div>
                <div class="text-lg text-[var(--muted)]">Overall Score</div>
              </div>

              <!-- Score Breakdown -->
              <div class="space-y-4 mb-6">
                {#each [{ name: 'Code Quality', score: healthScore.code_quality_score }, { name: 'Test Coverage', score: healthScore.test_coverage_score }, { name: 'Documentation', score: healthScore.documentation_score }, { name: 'Velocity', score: healthScore.velocity_score }, { name: 'Stability', score: healthScore.stability_score }, { name: 'Security', score: healthScore.security_score }] as item (item.name)}
                  <div class="grid grid-cols-[150px_1fr_50px] gap-3 items-center">
                    <span class="text-sm text-[var(--text)]">{item.name}</span>
                    <div class="h-6 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                      <div
                        class="h-full transition-all"
                        style="width: {item.score}%; background: {getHealthScoreColor(item.score)}"
                      ></div>
                    </div>
                    <span class="text-sm font-bold text-right text-[var(--text)]">{item.score}</span
                    >
                  </div>
                {/each}
              </div>

              <!-- Recommendations -->
              {#if healthScore.recommendations}
                <div class="mt-6">
                  <h4 class="text-lg font-semibold text-[var(--text)] mb-3">Recommendations</h4>
                  <div class="space-y-2">
                    {#each healthScore.recommendations as rec (rec.message)}
                      {@const severity = rec.severity}
                      <div class="flex gap-3 p-3 bg-[var(--bg)] rounded-lg">
                        <span class="text-xl">
                          {severity === 'high' ? '⚠️' : severity === 'medium' ? '💡' : 'ℹ️'}
                        </span>
                        <span class="flex-1 text-sm text-[var(--text)]">{rec.message}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--muted)]">
                No health score data available. Click "Calculate Now" to generate.
              </p>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'drift'}
        <!-- Drift Detection Tab -->
        <div class="space-y-6">
          <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold text-[var(--text)]">Drift Detection</h3>
            <button
              onclick={detectDrifts}
              class="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium transition-colors hover:bg-[var(--accent-hover)]"
            >
              Detect Now
            </button>
          </div>

          {#if driftSummary}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
            >
              <div class="text-4xl font-bold text-[var(--accent)]">
                {driftSummary.total_active_drifts}
              </div>
              <div class="text-sm text-[var(--muted)] mt-2">Active Drifts</div>
            </div>
          {/if}

          {#if recentDrifts.length > 0}
            <div class="space-y-3">
              {#each recentDrifts as drift (drift.id)}
                <div
                  class="bg-[var(--surface)] border-l-4 rounded-lg p-4"
                  style="border-left-color: {getSeverityColor(drift.severity)}"
                >
                  <div class="flex justify-between items-start mb-2">
                    <span class="font-bold text-sm text-[var(--text)]"
                      >{drift.drift_type.toUpperCase()}</span
                    >
                    <div class="flex items-center gap-2">
                      <span
                        class="px-2 py-1 rounded text-xs font-bold uppercase"
                        style="background: {getSeverityColor(
                          drift.severity
                        )}; color: {drift.severity === 'medium' || drift.severity === 'low'
                          ? 'black'
                          : 'white'}"
                      >
                        {drift.severity}
                      </span>
                      {#if !drift.resolved_at}
                        <button
                          onclick={() => resolveDrift(drift.id)}
                          class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                        >
                          Mark Resolved
                        </button>
                      {:else}
                        <span
                          class="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold"
                          >Resolved</span
                        >
                      {/if}
                    </div>
                  </div>
                  <div class="text-sm text-[var(--text-secondary)] mb-2">{drift.description}</div>
                  <div class="flex gap-5 text-xs text-[var(--muted)] mb-2">
                    <span>Baseline: {drift.baseline_value?.toFixed(2)}</span>
                    <span>Current: {drift.current_value?.toFixed(2)}</span>
                    <span>Deviation: {drift.deviation_percent}%</span>
                  </div>
                  <div class="text-xs text-[var(--muted)]">
                    Detected: {new Date(drift.detected_at).toLocaleString()}
                    {#if drift.resolved_at}
                      <span class="text-green-400 font-medium ml-2">
                        | Resolved: {new Date(drift.resolved_at).toLocaleString()}
                      </span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--muted)]">No recent drift events detected.</p>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'productivity'}
        <!-- Productivity Insights Tab -->
        <div class="space-y-6">
          <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold text-[var(--text)]">Productivity Insights</h3>
            <button
              onclick={calculateProductivity}
              class="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium transition-colors hover:bg-[var(--accent-hover)]"
            >
              Calculate Now
            </button>
          </div>

          {#if productivityInsights}
            {@const insights = productivityInsights}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {#if insights.peak_hours}
                <div
                  class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
                >
                  <div class="text-3xl mb-3">🌟</div>
                  <div class="text-sm text-[var(--muted)] mb-2">Peak Hour</div>
                  <div class="text-2xl font-bold text-[var(--accent)]">
                    {insights.peak_hours.peak_hour}:00
                  </div>
                </div>
              {/if}

              {#if insights.session_patterns}
                <div
                  class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
                >
                  <div class="text-3xl mb-3">⏱️</div>
                  <div class="text-sm text-[var(--muted)] mb-2">Optimal Session</div>
                  <div class="text-2xl font-bold text-[var(--accent)]">
                    {insights.session_patterns.optimal_session_duration?.toFixed(1)}h
                  </div>
                </div>
              {/if}

              {#if insights.focus_metrics}
                <div
                  class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
                >
                  <div class="text-3xl mb-3">🎯</div>
                  <div class="text-sm text-[var(--muted)] mb-2">Focus Score</div>
                  <div class="text-2xl font-bold text-[var(--accent)]">
                    {insights.focus_metrics.avg_focus_score?.toFixed(1)}/10
                  </div>
                </div>
              {/if}

              {#if insights.productivity_trends}
                <div
                  class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
                >
                  <div class="text-3xl mb-3">
                    {insights.productivity_trends.trend === 'improving'
                      ? '📈'
                      : insights.productivity_trends.trend === 'declining'
                        ? '📉'
                        : '➡️'}
                  </div>
                  <div class="text-sm text-[var(--muted)] mb-2">Trend</div>
                  <div class="text-2xl font-bold text-[var(--accent)] capitalize">
                    {insights.productivity_trends.trend}
                  </div>
                </div>
              {/if}
            </div>

            {#if insights.recommendations && insights.recommendations.length > 0}
              <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
                <h4 class="text-lg font-semibold text-[var(--text)] mb-3">Recommendations</h4>
                <div class="space-y-2">
                  {#each insights.recommendations as rec (rec.message)}
                    <div class="flex gap-3 p-3 bg-[var(--bg)] rounded-lg">
                      <span class="text-xl">💡</span>
                      <span class="flex-1 text-sm text-[var(--text)]">{rec.message}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--muted)]">
                No productivity insights available. Click "Calculate Now" to generate.
              </p>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'personality'}
        <!-- Personality Tab -->
        <div class="space-y-6">
          <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold text-[var(--text)]">Claude Personality Analysis</h3>
            <button
              onclick={analyzePersonality}
              class="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium transition-colors hover:bg-[var(--accent-hover)]"
            >
              Analyze Now
            </button>
          </div>

          {#if personalityProfile}
            {@const insights = personalityProfile}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
              <div class="mb-6">
                <h4 class="text-2xl font-bold text-[var(--accent)] mb-3">
                  {insights.overall_profile.type}
                </h4>
                <p class="text-[var(--text-secondary)] leading-relaxed">
                  {insights.overall_profile.summary}
                </p>
              </div>

              <div class="mb-6">
                <h5 class="text-lg font-semibold text-[var(--text)] mb-3">Traits</h5>
                <div class="flex flex-wrap gap-2">
                  {#each insights.overall_profile.traits as trait (trait)}
                    <span
                      class="px-3 py-1 bg-[var(--bg)] border border-[var(--accent)] rounded-full text-sm text-[var(--accent)]"
                    >
                      {trait}
                    </span>
                  {/each}
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="flex justify-between p-3 bg-[var(--bg)] rounded-lg">
                  <span class="text-sm text-[var(--muted)]">Communication Style</span>
                  <span class="text-sm font-bold text-[var(--accent)]"
                    >{insights.communication_style.style}</span
                  >
                </div>
                <div class="flex justify-between p-3 bg-[var(--bg)] rounded-lg">
                  <span class="text-sm text-[var(--muted)]">Risk Tolerance</span>
                  <span class="text-sm font-bold text-[var(--accent)]"
                    >{insights.risk_profile.tolerance}</span
                  >
                </div>
                <div class="flex justify-between p-3 bg-[var(--bg)] rounded-lg">
                  <span class="text-sm text-[var(--muted)]">Creativity Score</span>
                  <span class="text-sm font-bold text-[var(--accent)]"
                    >{insights.creativity_score.score}/100</span
                  >
                </div>
                <div class="flex justify-between p-3 bg-[var(--bg)] rounded-lg">
                  <span class="text-sm text-[var(--muted)]">Consistency Score</span>
                  <span class="text-sm font-bold text-[var(--accent)]"
                    >{insights.consistency_metrics.score}/100</span
                  >
                </div>
                <div class="flex justify-between p-3 bg-[var(--bg)] rounded-lg">
                  <span class="text-sm text-[var(--muted)]">Problem Solving</span>
                  <span class="text-sm font-bold text-[var(--accent)]"
                    >{insights.problem_solving.approach}</span
                  >
                </div>
                <div class="flex justify-between p-3 bg-[var(--bg)] rounded-lg">
                  <span class="text-sm text-[var(--muted)]">Decision Speed</span>
                  <span class="text-sm font-bold text-[var(--accent)]"
                    >{insights.decision_speed.speed}</span
                  >
                </div>
              </div>

              {#if insights.overall_profile.strengths && insights.overall_profile.strengths.length > 0}
                <div>
                  <h5 class="text-lg font-semibold text-[var(--text)] mb-3">Strengths</h5>
                  <div class="space-y-2">
                    {#each insights.overall_profile.strengths as strength (strength)}
                      <div class="p-2 bg-[var(--bg)] rounded-lg text-sm text-[var(--text)]">
                        ✅ {strength}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--muted)]">
                No personality analysis available. Click "Analyze Now" to generate.
              </p>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'growth'}
        <!-- Growth Tracking Tab -->
        <div class="space-y-6">
          <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold text-[var(--text)]">Growth Tracking</h3>
            <button
              onclick={createGrowthSnapshot}
              class="px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium transition-colors hover:bg-[var(--accent-hover)]"
            >
              Create Snapshot
            </button>
          </div>

          {#if growthSummary}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
              >
                <div class="text-sm text-[var(--muted)] mb-2">Avg Daily Events</div>
                <div class="text-3xl font-bold text-[var(--accent)]">
                  {growthSummary.statistics.avg_daily_events?.toFixed(0)}
                </div>
              </div>
              <div
                class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
              >
                <div class="text-sm text-[var(--muted)] mb-2">Avg Quality Score</div>
                <div class="text-3xl font-bold text-[var(--accent)]">
                  {growthSummary.statistics.avg_quality_score?.toFixed(0)}
                </div>
              </div>
              <div
                class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
              >
                <div class="text-sm text-[var(--muted)] mb-2">Avg Health Score</div>
                <div class="text-3xl font-bold text-[var(--accent)]">
                  {growthSummary.statistics.avg_health_score?.toFixed(0)}
                </div>
              </div>
              <div
                class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center"
              >
                <div class="text-sm text-[var(--muted)] mb-2">Peak Events</div>
                <div class="text-3xl font-bold text-[var(--accent)]">
                  {growthSummary.statistics.peak_events}
                </div>
              </div>
            </div>

            {#if growthSummary.milestones && growthSummary.milestones.length > 0}
              <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
                <h4 class="text-lg font-semibold text-[var(--text)] mb-3">Milestones</h4>
                <div class="space-y-2">
                  {#each growthSummary.milestones as milestone (milestone.date + milestone.message)}
                    <div class="flex items-center gap-3 p-3 bg-[var(--bg)] rounded-lg">
                      <span class="text-xl">
                        {milestone.type === 'peak_activity'
                          ? '🔥'
                          : milestone.type === 'best_quality'
                            ? '⭐'
                            : '📈'}
                      </span>
                      <span class="flex-1 text-sm text-[var(--text)]">{milestone.message}</span>
                      <span class="text-xs text-[var(--muted)]">{milestone.date}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if growthSummary.trends && growthSummary.trends.length > 0}
              <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
                <h4 class="text-lg font-semibold text-[var(--text)] mb-3">Trends</h4>
                <div class="space-y-2">
                  {#each growthSummary.trends as trend (trend.metric)}
                    <div class="flex justify-between items-center p-3 bg-[var(--bg)] rounded-lg">
                      <span class="text-sm font-bold text-[var(--text)] capitalize"
                        >{trend.metric}</span
                      >
                      <span
                        class="text-sm font-medium"
                        class:text-green-400={trend.direction === 'increasing'}
                        class:text-red-400={trend.direction === 'decreasing'}
                      >
                        {trend.direction === 'increasing' ? '↗️' : '↘️'}
                        {Math.abs(trend.change_percent)}%
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--muted)]">No growth data available.</p>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'integrations'}
        <!-- Integrations Tab -->
        <div class="space-y-6">
          <h3 class="text-xl font-semibold text-[var(--text)]">
            External Integrations Configuration
          </h3>

          {#if configSaveStatus}
            <div class="p-3 bg-[var(--bg)] border-l-4 border-green-500 text-[var(--text)]">
              {configSaveStatus}
            </div>
          {/if}

          <div class="space-y-6">
            <!-- GitHub Integration -->
            <div class="bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg p-6">
              <div
                class="flex justify-between items-center pb-3 mb-4 border-b border-[var(--border)]"
              >
                <h4 class="text-lg font-semibold text-[var(--text)]">GitHub Integration</h4>
                <span
                  class="px-3 py-1 rounded-full text-xs font-semibold"
                  class:bg-green-500={integrationStatus.github.enabled}
                  class:text-black={integrationStatus.github.enabled}
                  class:bg-gray-600={!integrationStatus.github.enabled}
                  class:text-gray-300={!integrationStatus.github.enabled}
                >
                  {integrationStatus.github.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div class="space-y-4 mb-4">
                <div>
                  <label
                    for="github-token"
                    class="block text-sm font-medium text-[var(--text-secondary)] mb-2"
                    >Personal Access Token</label
                  >
                  <input
                    id="github-token"
                    type="password"
                    bind:value={githubConfig.token}
                    placeholder="ghp_xxxxxxxxxxxxx"
                    class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-gray-600 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>
                <div>
                  <label
                    for="github-owner"
                    class="block text-sm font-medium text-[var(--text-secondary)] mb-2"
                    >Repository Owner</label
                  >
                  <input
                    id="github-owner"
                    type="text"
                    bind:value={githubConfig.owner}
                    placeholder="username or organization"
                    class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-gray-600 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>
                <div>
                  <label
                    for="github-repo"
                    class="block text-sm font-medium text-[var(--text-secondary)] mb-2"
                    >Repository Name</label
                  >
                  <input
                    id="github-repo"
                    type="text"
                    bind:value={githubConfig.repo}
                    placeholder="repo-name"
                    class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-gray-600 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>

                <button
                  onclick={saveGitHubConfig}
                  class="w-full px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-semibold hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Save GitHub Config
                </button>

                <div class="flex gap-2">
                  <button
                    onclick={testGitHubConnection}
                    class="flex-1 px-3 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 transition-colors"
                  >
                    Test Connection
                  </button>
                  <button
                    onclick={sendHealthToGitHub}
                    class="flex-1 px-3 py-2 bg-green-600 text-white rounded font-medium text-sm hover:bg-green-700 transition-colors"
                  >
                    Send Health
                  </button>
                  <button
                    onclick={disableGitHub}
                    class="flex-1 px-3 py-2 bg-red-600 text-white rounded font-medium text-sm hover:bg-red-700 transition-colors"
                  >
                    Disable
                  </button>
                </div>
              </div>

              <div class="pt-3 border-t border-[var(--border)]">
                <p class="text-sm text-[var(--text-secondary)]">
                  Recent events: {integrationStatus.github.events.length}
                </p>
                <p class="text-xs text-[var(--muted)] italic mt-1">
                  Create issues for critical errors and post health reports to commits
                </p>
              </div>
            </div>

            <!-- Discord Integration -->
            <div class="bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg p-6">
              <div
                class="flex justify-between items-center pb-3 mb-4 border-b border-[var(--border)]"
              >
                <h4 class="text-lg font-semibold text-[var(--text)]">Discord Integration</h4>
                <span
                  class="px-3 py-1 rounded-full text-xs font-semibold"
                  class:bg-green-500={integrationStatus.discord.enabled}
                  class:text-black={integrationStatus.discord.enabled}
                  class:bg-gray-600={!integrationStatus.discord.enabled}
                  class:text-gray-300={!integrationStatus.discord.enabled}
                >
                  {integrationStatus.discord.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div class="space-y-4 mb-4">
                <div>
                  <label
                    for="discord-webhook"
                    class="block text-sm font-medium text-[var(--text-secondary)] mb-2"
                    >Webhook URL</label
                  >
                  <input
                    id="discord-webhook"
                    type="url"
                    bind:value={discordConfig.webhookUrl}
                    placeholder="https://discord.com/api/webhooks/..."
                    class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-gray-600 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>

                <button
                  onclick={saveDiscordConfig}
                  class="w-full px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-semibold hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Save Discord Config
                </button>

                <div class="flex gap-2">
                  <button
                    onclick={testDiscordConnection}
                    class="flex-1 px-3 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 transition-colors"
                  >
                    Test Connection
                  </button>
                  <button
                    onclick={sendHealthToDiscord}
                    class="flex-1 px-3 py-2 bg-green-600 text-white rounded font-medium text-sm hover:bg-green-700 transition-colors"
                  >
                    Send Health
                  </button>
                  <button
                    onclick={disableDiscord}
                    class="flex-1 px-3 py-2 bg-red-600 text-white rounded font-medium text-sm hover:bg-red-700 transition-colors"
                  >
                    Disable
                  </button>
                </div>
              </div>

              <div class="pt-3 border-t border-[var(--border)]">
                <p class="text-sm text-[var(--text-secondary)]">
                  Recent events: {integrationStatus.discord.events.length}
                </p>
                <p class="text-xs text-[var(--muted)] italic mt-1">
                  Send notifications to Discord channel for monitoring alerts
                </p>
              </div>
            </div>

            <!-- Slack Integration -->
            <div class="bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg p-6">
              <div
                class="flex justify-between items-center pb-3 mb-4 border-b border-[var(--border)]"
              >
                <h4 class="text-lg font-semibold text-[var(--text)]">Slack Integration</h4>
                <span
                  class="px-3 py-1 rounded-full text-xs font-semibold"
                  class:bg-green-500={integrationStatus.slack.enabled}
                  class:text-black={integrationStatus.slack.enabled}
                  class:bg-gray-600={!integrationStatus.slack.enabled}
                  class:text-gray-300={!integrationStatus.slack.enabled}
                >
                  {integrationStatus.slack.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div class="space-y-4 mb-4">
                <div>
                  <label
                    for="slack-webhook"
                    class="block text-sm font-medium text-[var(--text-secondary)] mb-2"
                    >Webhook URL</label
                  >
                  <input
                    id="slack-webhook"
                    type="url"
                    bind:value={slackConfig.webhookUrl}
                    placeholder="https://hooks.slack.com/services/..."
                    class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-gray-600 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>

                <button
                  onclick={saveSlackConfig}
                  class="w-full px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-semibold hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Save Slack Config
                </button>

                <div class="flex gap-2">
                  <button
                    onclick={testSlackConnection}
                    class="flex-1 px-3 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 transition-colors"
                  >
                    Test Connection
                  </button>
                  <button
                    onclick={sendHealthToSlack}
                    class="flex-1 px-3 py-2 bg-green-600 text-white rounded font-medium text-sm hover:bg-green-700 transition-colors"
                  >
                    Send Health
                  </button>
                  <button
                    onclick={disableSlack}
                    class="flex-1 px-3 py-2 bg-red-600 text-white rounded font-medium text-sm hover:bg-red-700 transition-colors"
                  >
                    Disable
                  </button>
                </div>
              </div>

              <div class="pt-3 border-t border-[var(--border)]">
                <p class="text-sm text-[var(--text-secondary)]">
                  Recent events: {integrationStatus.slack.events.length}
                </p>
                <p class="text-xs text-[var(--muted)] italic mt-1">
                  Send notifications to Slack channel for team collaboration
                </p>
              </div>
            </div>
          </div>
        </div>
      {:else if activeTab === 'gamification'}
        <!-- Gamification Tab -->
        <div class="space-y-6">
          <h3 class="text-xl font-semibold text-[var(--text)]">Gamification & Achievements</h3>

          {#if userStats}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
              <h4 class="text-lg font-semibold text-[var(--text)] mb-4">Your Stats</h4>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="text-center">
                  <div class="text-sm text-[var(--muted)] mb-1">Level</div>
                  <div class="text-2xl font-bold text-[var(--accent)]">{userStats.level || 1}</div>
                </div>
                <div class="text-center">
                  <div class="text-sm text-[var(--muted)] mb-1">Total Points</div>
                  <div class="text-2xl font-bold text-[var(--accent)]">
                    {userStats.total_points || 0}
                  </div>
                </div>
                <div class="text-center">
                  <div class="text-sm text-[var(--muted)] mb-1">Streak</div>
                  <div class="text-2xl font-bold text-[var(--accent)]">
                    {userStats.streak_days || 0} days
                  </div>
                </div>
                <div class="text-center">
                  <div class="text-sm text-[var(--muted)] mb-1">Badges</div>
                  <div class="text-2xl font-bold text-[var(--accent)]">
                    {userStats.badges_unlocked || 0}
                  </div>
                </div>
              </div>
            </div>
          {/if}

          <div>
            <h4 class="text-lg font-semibold text-[var(--text)] mb-4">
              Unlocked Achievements ({achievements.length})
            </h4>
            {#if achievements.length > 0}
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each achievements as achievement (achievement.title)}
                  <div
                    class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4"
                    class:border-yellow-500={achievement.rarity === 'legendary'}
                    class:border-purple-500={achievement.rarity === 'epic'}
                    class:border-blue-500={achievement.rarity === 'rare'}
                  >
                    <div class="text-3xl text-center mb-2">
                      {achievement.icon || achievement.title.split(' ')[0]}
                    </div>
                    <div class="text-center font-bold text-[var(--text)] mb-1">
                      {achievement.title}
                    </div>
                    <div class="text-xs text-center text-[var(--muted)] mb-2">
                      {achievement.description}
                    </div>
                    <div class="text-center text-sm font-semibold text-[var(--accent)]">
                      +{achievement.points} pts
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div
                class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
              >
                <p class="text-[var(--muted)]">No achievements unlocked yet. Keep coding!</p>
              </div>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'easter-eggs'}
        <!-- Easter Eggs Tab -->
        <div class="space-y-6">
          <h3 class="text-xl font-semibold text-[var(--text)]">Easter Eggs & Seasonal Messages</h3>

          {#if seasonalMessage}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
              <h4 class="text-xl font-bold text-[var(--accent)] mb-2">{seasonalMessage.title}</h4>
              <p class="text-[var(--text-secondary)]">{seasonalMessage.message}</p>
            </div>
          {/if}

          <div>
            <h4 class="text-lg font-semibold text-[var(--text)] mb-4">
              Discovered Easter Eggs ({easterEggs.length})
            </h4>
            {#if easterEggs.length > 0}
              <div class="space-y-3">
                {#each easterEggs as egg (egg.title + egg.discovered_at)}
                  <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                    <div class="font-bold text-[var(--text)] mb-1">{egg.title}</div>
                    <div class="text-sm text-[var(--text-secondary)] mb-2">{egg.message}</div>
                    <div class="flex justify-between text-xs text-[var(--muted)]">
                      <span class="px-2 py-1 bg-[var(--bg)] rounded">{egg.trigger_type}</span>
                      <span>{new Date(egg.discovered_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div
                class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
              >
                <p class="text-[var(--muted)]">
                  No easter eggs discovered yet. Try coding on special dates or using special
                  patterns!
                </p>
              </div>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'social'}
        <!-- Social Tab -->
        <div class="space-y-6">
          <h3 class="text-xl font-semibold text-[var(--text)]">Social Features</h3>

          <!-- Export Section -->
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
            <h4 class="text-lg font-semibold text-[var(--text)] mb-4">Export Your Stats</h4>
            <div class="flex gap-3">
              <select
                bind:value={exportFormat}
                class="flex-1 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <option value="json">JSON</option>
                <option value="markdown">Markdown</option>
                <option value="text">Plain Text</option>
              </select>
              <button
                onclick={() => {
                  window.open(
                    `/api/social/export?project=${project}&format=${exportFormat}`,
                    '_blank'
                  );
                }}
                class="px-6 py-2 bg-[var(--accent)] text-white rounded-lg font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Download Export
              </button>
            </div>
          </div>

          <!-- Share History -->
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
            <h4 class="text-lg font-semibold text-[var(--text)] mb-4">Share History</h4>
            {#if shareHistory.length > 0}
              <div class="space-y-2">
                {#each shareHistory as share (share.shared_at + share.share_type)}
                  <div class="flex justify-between items-center p-3 bg-[var(--bg)] rounded-lg">
                    <div class="flex gap-3">
                      <span class="text-sm font-medium text-[var(--text)]">{share.share_type}</span>
                      <span class="text-sm text-[var(--muted)]">{share.platform}</span>
                    </div>
                    <span class="text-xs text-[var(--muted)]"
                      >{new Date(share.shared_at).toLocaleString()}</span
                    >
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-center text-[var(--muted)] py-6">
                No shares yet. Share your achievements!
              </p>
            {/if}
          </div>

          <!-- Team Members -->
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
            <h4 class="text-lg font-semibold text-[var(--text)] mb-4">
              Team Members ({teamMembers.length})
            </h4>
            {#if teamMembers.length > 0}
              <div class="space-y-2">
                {#each teamMembers as member (member.member_name)}
                  <div class="flex justify-between items-center p-3 bg-[var(--bg)] rounded-lg">
                    <div>
                      <div class="text-sm font-medium text-[var(--text)]">{member.member_name}</div>
                      <div class="text-xs text-[var(--muted)]">{member.role}</div>
                    </div>
                    <span class="text-xs text-[var(--muted)]"
                      >{new Date(member.joined_at).toLocaleDateString()}</span
                    >
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-center text-[var(--muted)] py-6">No team members yet.</p>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
