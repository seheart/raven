<script>
  import { onMount } from 'svelte';
  import { activeProject } from './projectStore.js';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

  $: project = $activeProject && $activeProject !== 'Loading...' ? $activeProject : 'raven';

  let activeTab = 'health'; // health, drift, productivity, personality, growth, integrations, gamification, easter-eggs, social
  let loading = false;
  let error = null;
  let loadedTabs = new Set(); // Track which tabs have been loaded

  // Health Scoring data
  let healthScore = null;

  // Drift Detection data
  let recentDrifts = [];
  let driftSummary = null;

  // Productivity Insights data
  let productivityInsights = null;

  // Claude Personality data
  let personalityProfile = null;

  // Growth Tracking data
  let growthSummary = null;

  // Integration status
  let integrationStatus = {
    github: { enabled: false, events: [] },
    discord: { enabled: false, events: [] },
    slack: { enabled: false, events: [] }
  };

  // Gamification data
  let userStats = null;
  let achievements = [];

  // Easter Eggs data
  let easterEggs = [];
  let seasonalMessage = null;

  // Social data
  let shareHistory = [];
  let teamMembers = [];
  let exportFormat = 'json';

  // Integration configuration forms
  let githubConfig = { token: '', owner: '', repo: '' };
  let discordConfig = { webhookUrl: '' };
  let slackConfig = { webhookUrl: '' };
  let configSaveStatus = '';

  // Lazy load data when tab changes
  $: if (activeTab && !loadedTabs.has(activeTab)) {
    loadTabData(activeTab);
  }

  onMount(() => {
    // Only load initial tab on mount
    loadTabData(activeTab);
  });

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
    } catch {
      error = err.message;
      loadedTabs.delete(tab); // Allow retry on error
    } finally {
      loading = false;
    }
  }

  async function loadHealthData() {
    try {
      const [latestRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/health/latest?project=${project}`),
        fetch(`${API_BASE}/health/history?project=${project}&days=30`)
      ]);

      const latestData = await latestRes.json();
      const historyData = await historyRes.json();

      healthScore = latestData.score;
      healthHistory = historyData.history || [];
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function loadDriftData() {
    try {
      const [recentRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/drift/recent?project=${project}&hours=24`),
        fetch(`${API_BASE}/drift/summary?project=${project}&days=7`)
      ]);

      const recentData = await recentRes.json();
      const summaryData = await summaryRes.json();

      recentDrifts = recentData.drifts || [];
      driftSummary = summaryData.summary;
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function loadProductivityData() {
    try {
      await fetch(`${API_BASE}/productivity/latest?project=${project}`);
      const data = await response.json();
      productivityInsights = data.metrics;
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function loadPersonalityData() {
    try {
      await fetch(`${API_BASE}/personality/latest?project=${project}&agent=claude`);
      const data = await response.json();
      personalityProfile = data.profile;
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function loadGrowthData() {
    try {
      const [summaryRes, timeSeriesRes] = await Promise.all([
        fetch(`${API_BASE}/growth/summary?project=${project}&days=30`),
        fetch(`${API_BASE}/growth/timeseries?project=${project}&days=30&metric=all`)
      ]);

      const summaryData = await summaryRes.json();
      const timeSeriesData = await timeSeriesRes.json();

      growthSummary = summaryData.summary;
      growthTimeSeries = timeSeriesData.timeSeries;
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function loadIntegrationStatus() {
    try {
      const [githubRes, discordRes, slackRes] = await Promise.all([
        fetch(`${API_BASE}/integrations/github/events?project=${project}&hours=24`).catch(() => ({
          json: () => ({ events: [] })
        })),
        fetch(`${API_BASE}/integrations/discord/events?project=${project}&hours=24`).catch(() => ({
          json: () => ({ events: [] })
        })),
        fetch(`${API_BASE}/integrations/slack/events?project=${project}&hours=24`).catch(() => ({
          json: () => ({ events: [] })
        }))
      ]);

      const githubData = await githubRes.json();
      const discordData = await discordRes.json();
      const slackData = await slackRes.json();

      integrationStatus.github.events = githubData.events || [];
      integrationStatus.github.enabled = githubData.events?.length > 0;

      integrationStatus.discord.events = discordData.events || [];
      integrationStatus.discord.enabled = discordData.events?.length > 0;

      integrationStatus.slack.events = slackData.events || [];
      integrationStatus.slack.enabled = slackData.events?.length > 0;
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function loadGamificationData() {
    try {
      const [statsRes, achievementsRes, recentRes] = await Promise.all([
        fetch(`${API_BASE}/gamification/stats?project=${project}`),
        fetch(`${API_BASE}/gamification/achievements?project=${project}`),
        fetch(`${API_BASE}/gamification/recent?project=${project}`)
      ]);

      const statsData = await statsRes.json();
      const achievementsData = await achievementsRes.json();
      const recentData = await recentRes.json();

      userStats = statsData.stats;
      achievements = achievementsData.achievements || [];
      recentAchievements = recentData.achievements || [];
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function loadEasterEggsData() {
    try {
      const [eggsRes, seasonalRes] = await Promise.all([
        fetch(`${API_BASE}/easter-eggs?project=${project}`),
        fetch(`${API_BASE}/easter-eggs/seasonal?project=${project}`)
      ]);

      const eggsData = await eggsRes.json();
      const seasonalData = await seasonalRes.json();

      easterEggs = eggsData.eggs || [];
      seasonalMessage = seasonalData.messages?.[0] || null;
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function loadSocialData() {
    try {
      const [historyRes, teamRes] = await Promise.all([
        fetch(`${API_BASE}/social/share-history?project=${project}&limit=20`),
        fetch(`${API_BASE}/social/team?project=${project}`)
      ]);

      const historyData = await historyRes.json();
      const teamData = await teamRes.json();

      shareHistory = historyData.history || [];
      teamMembers = teamData.members || [];
    } catch {
      // Error handled silently - partial data load
    }
  }

  async function calculateHealthScore() {
    try {
      await fetch(`${API_BASE}/health/calculate?project=${project}`, {
        method: 'POST'
      });
      const data = await response.json();
      healthScore = data.healthScore;
      await loadHealthData();
    } catch {
      // Error handled silently - operation failed gracefully
    }
  }

  async function detectDrifts() {
    try {
      await fetch(`${API_BASE}/drift/detect?project=${project}`, { method: 'POST' });
      const data = await response.json();
      recentDrifts = data.drifts || [];
      await loadDriftData();
    } catch {
      // Error handled silently - operation failed gracefully
    }
  }

  async function resolveDrift(driftId) {
    try {
      await fetch(`${API_BASE}/drift/${driftId}/resolve?project=${project}`, {
        method: 'POST'
      });
      if (res.ok) {
        // Reload drift data after resolution
        await loadDriftData();
      }
    } catch {
      // Error handled silently - operation failed gracefully
    }
  }

  async function calculateProductivity() {
    try {
      await fetch(`${API_BASE}/productivity/calculate?project=${project}&days=30`, {
        method: 'POST'
      });
      const data = await response.json();
      productivityInsights = data.insights;
    } catch {
      // Error handled silently - operation failed gracefully
    }
  }

  async function analyzePersonality() {
    try {
      await fetch(`${API_BASE}/personality/analyze?project=${project}&agent=claude&days=30`, {
        method: 'POST'
      });
      const data = await response.json();
      personalityProfile = data.personality;
    } catch {
      // Error handled silently - operation failed gracefully
    }
  }

  async function createGrowthSnapshot() {
    try {
      await fetch(`${API_BASE}/growth/snapshot?project=${project}`, { method: 'POST' });
      // removed - api already returns JSON
      await loadGrowthData();
    } catch {
      // Error handled silently - operation failed gracefully
    }
  }

  async function saveGitHubConfig() {
    try {
      configSaveStatus = 'Saving GitHub configuration...';
      await fetch(`${API_BASE}/integrations/github/config?project=${project}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(githubConfig)
      });
      const data = await response.json();
      if (data.success) {
        configSaveStatus = 'GitHub configuration saved successfully!';
        integrationStatus.github.enabled = true;
        setTimeout(() => (configSaveStatus = ''), 3000);
      } else {
        configSaveStatus = `Error: ${data.error}`;
      }
    } catch {
      configSaveStatus = `Error saving GitHub config: ${err.message}`;
    }
  }

  async function saveDiscordConfig() {
    try {
      configSaveStatus = 'Saving Discord configuration...';
      await fetch(`${API_BASE}/integrations/discord/config?project=${project}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordConfig)
      });
      const data = await response.json();
      if (data.success) {
        configSaveStatus = 'Discord configuration saved successfully!';
        integrationStatus.discord.enabled = true;
        setTimeout(() => (configSaveStatus = ''), 3000);
      } else {
        configSaveStatus = `Error: ${data.error}`;
      }
    } catch {
      configSaveStatus = `Error saving Discord config: ${err.message}`;
    }
  }

  async function saveSlackConfig() {
    try {
      configSaveStatus = 'Saving Slack configuration...';
      await fetch(`${API_BASE}/integrations/slack/config?project=${project}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackConfig)
      });
      const data = await response.json();
      if (data.success) {
        configSaveStatus = 'Slack configuration saved successfully!';
        integrationStatus.slack.enabled = true;
        setTimeout(() => (configSaveStatus = ''), 3000);
      } else {
        configSaveStatus = `Error: ${data.error}`;
      }
    } catch {
      configSaveStatus = `Error saving Slack config: ${err.message}`;
    }
  }

  // Integration action functions
  async function testGitHubConnection() {
    try {
      configSaveStatus = 'Testing GitHub connection...';
      await fetch(`${API_BASE}/integrations/github/test?project=${project}`);
      const data = await response.json();
      if (data.result.success) {
        configSaveStatus = `✓ GitHub connected: ${data.result.repo_name}`;
      } else {
        configSaveStatus = `✗ GitHub test failed: ${data.result.error}`;
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function testDiscordConnection() {
    try {
      configSaveStatus = 'Testing Discord connection...';
      await fetch(`${API_BASE}/integrations/discord/test?project=${project}`);
      const data = await response.json();
      if (data.result.success) {
        configSaveStatus = '✓ Discord webhook is valid!';
      } else {
        configSaveStatus = `✗ Discord test failed: ${data.result.error}`;
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function testSlackConnection() {
    try {
      configSaveStatus = 'Testing Slack connection...';
      await fetch(`${API_BASE}/integrations/slack/test?project=${project}`);
      const data = await response.json();
      if (data.result.success) {
        configSaveStatus = '✓ Slack webhook is valid!';
      } else {
        configSaveStatus = `✗ Slack test failed: ${data.result.error}`;
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function sendHealthToGitHub() {
    try {
      configSaveStatus = 'Posting health score to GitHub...';
      await fetch(`${API_BASE}/integrations/github/post-health?project=${project}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        configSaveStatus = '✓ Health score posted to GitHub!';
      } else {
        configSaveStatus = '✗ Failed to post to GitHub';
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function sendHealthToDiscord() {
    try {
      configSaveStatus = 'Sending health score to Discord...';
      await fetch(`${API_BASE}/integrations/discord/send-health?project=${project}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.result.success) {
        configSaveStatus = '✓ Health score sent to Discord!';
      } else {
        configSaveStatus = '✗ Failed to send to Discord';
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function sendHealthToSlack() {
    try {
      configSaveStatus = 'Sending health score to Slack...';
      await fetch(`${API_BASE}/integrations/slack/send-health?project=${project}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.result.success) {
        configSaveStatus = '✓ Health score sent to Slack!';
      } else {
        configSaveStatus = '✗ Failed to send to Slack';
      }
      setTimeout(() => (configSaveStatus = ''), 5000);
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 5000);
    }
  }

  async function disableGitHub() {
    try {
      configSaveStatus = 'Disabling GitHub integration...';
      await fetch(`${API_BASE}/integrations/github/disable?project=${project}`, {
        method: 'POST'
      });
      if (res.ok) {
        configSaveStatus = 'GitHub integration disabled';
        integrationStatus.github.enabled = false;
        setTimeout(() => (configSaveStatus = ''), 3000);
      }
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 3000);
    }
  }

  async function disableDiscord() {
    try {
      configSaveStatus = 'Disabling Discord integration...';
      await fetch(`${API_BASE}/integrations/discord/disable?project=${project}`, {
        method: 'POST'
      });
      if (res.ok) {
        configSaveStatus = 'Discord integration disabled';
        integrationStatus.discord.enabled = false;
        setTimeout(() => (configSaveStatus = ''), 3000);
      }
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 3000);
    }
  }

  async function disableSlack() {
    try {
      configSaveStatus = 'Disabling Slack integration...';
      await fetch(`${API_BASE}/integrations/slack/disable?project=${project}`, {
        method: 'POST'
      });
      if (res.ok) {
        configSaveStatus = 'Slack integration disabled';
        integrationStatus.slack.enabled = false;
        setTimeout(() => (configSaveStatus = ''), 3000);
      }
    } catch {
      configSaveStatus = `✗ Error: ${err.message}`;
      setTimeout(() => (configSaveStatus = ''), 3000);
    }
  }

  function getHealthScoreColor(score) {
    if (!score) return '#gray';
    if (score >= 80) return '#51cf66';
    if (score >= 60) return '#ffd43b';
    if (score >= 40) return '#ff922b';
    return '#ff6b6b';
  }

  function getSeverityColor(severity) {
    const colors = {
      critical: '#ff6b6b',
      high: '#ff922b',
      medium: '#ffd43b',
      low: '#74c0fc',
      info: '#99e9f2'
    };
    return colors[severity] || colors.info;
  }

  function refreshCurrentTab() {
    // Remove current tab from loaded set to force reload
    loadedTabs.delete(activeTab);
    loadTabData(activeTab);
  }
</script>

<div class="tier4-panel">
  <div class="panel-header">
    <h2>🚀 Tier 4 Advanced Features</h2>
    <button class="refresh-button" on:click={refreshCurrentTab} disabled={loading}>
      {loading ? 'Loading...' : 'Refresh Tab'}
    </button>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="tabs">
    <button class:active={activeTab === 'health'} on:click={() => (activeTab = 'health')}>
      Health Scoring
    </button>
    <button class:active={activeTab === 'drift'} on:click={() => (activeTab = 'drift')}>
      Drift Detection
    </button>
    <button
      class:active={activeTab === 'productivity'}
      on:click={() => (activeTab = 'productivity')}
    >
      Productivity
    </button>
    <button class:active={activeTab === 'personality'} on:click={() => (activeTab = 'personality')}>
      Personality
    </button>
    <button class:active={activeTab === 'growth'} on:click={() => (activeTab = 'growth')}>
      Growth Tracking
    </button>
    <button
      class:active={activeTab === 'integrations'}
      on:click={() => (activeTab = 'integrations')}
    >
      Integrations
    </button>
    <button
      class:active={activeTab === 'gamification'}
      on:click={() => (activeTab = 'gamification')}
    >
      Gamification
    </button>
    <button class:active={activeTab === 'easter-eggs'} on:click={() => (activeTab = 'easter-eggs')}>
      Easter Eggs
    </button>
    <button class:active={activeTab === 'social'} on:click={() => (activeTab = 'social')}>
      Social
    </button>
  </div>

  <div class="tab-content">
    {#if activeTab === 'health'}
      <div class="health-tab">
        <div class="tab-header">
          <h3>Project Health Score</h3>
          <button class="action-button" on:click={calculateHealthScore}> Calculate Now </button>
        </div>

        {#if healthScore}
          <div class="health-score-card">
            <div
              class="score-display"
              style="border-color: {getHealthScoreColor(healthScore.overall_score)}"
            >
              <div
                class="score-value"
                style="color: {getHealthScoreColor(healthScore.overall_score)}"
              >
                {healthScore.overall_score}
              </div>
              <div class="score-label">Overall Score</div>
            </div>

            <div class="score-breakdown">
              <div class="score-item">
                <span class="score-name">Code Quality</span>
                <div class="score-bar">
                  <div
                    class="score-fill"
                    style="width: {healthScore.code_quality_score}%; background: {getHealthScoreColor(
                      healthScore.code_quality_score
                    )}"
                  ></div>
                </div>
                <span class="score-number">{healthScore.code_quality_score}</span>
              </div>
              <div class="score-item">
                <span class="score-name">Test Coverage</span>
                <div class="score-bar">
                  <div
                    class="score-fill"
                    style="width: {healthScore.test_coverage_score}%; background: {getHealthScoreColor(
                      healthScore.test_coverage_score
                    )}"
                  ></div>
                </div>
                <span class="score-number">{healthScore.test_coverage_score}</span>
              </div>
              <div class="score-item">
                <span class="score-name">Documentation</span>
                <div class="score-bar">
                  <div
                    class="score-fill"
                    style="width: {healthScore.documentation_score}%; background: {getHealthScoreColor(
                      healthScore.documentation_score
                    )}"
                  ></div>
                </div>
                <span class="score-number">{healthScore.documentation_score}</span>
              </div>
              <div class="score-item">
                <span class="score-name">Velocity</span>
                <div class="score-bar">
                  <div
                    class="score-fill"
                    style="width: {healthScore.velocity_score}%; background: {getHealthScoreColor(
                      healthScore.velocity_score
                    )}"
                  ></div>
                </div>
                <span class="score-number">{healthScore.velocity_score}</span>
              </div>
              <div class="score-item">
                <span class="score-name">Stability</span>
                <div class="score-bar">
                  <div
                    class="score-fill"
                    style="width: {healthScore.stability_score}%; background: {getHealthScoreColor(
                      healthScore.stability_score
                    )}"
                  ></div>
                </div>
                <span class="score-number">{healthScore.stability_score}</span>
              </div>
              <div class="score-item">
                <span class="score-name">Security</span>
                <div class="score-bar">
                  <div
                    class="score-fill"
                    style="width: {healthScore.security_score}%; background: {getHealthScoreColor(
                      healthScore.security_score
                    )}"
                  ></div>
                </div>
                <span class="score-number">{healthScore.security_score}</span>
              </div>
            </div>

            {#if healthScore.recommendations}
              <div class="recommendations">
                <h4>Recommendations</h4>
                {#each healthScore.recommendations as rec (rec.message)}
                  <div class="recommendation-item {rec.severity}">
                    <span class="rec-icon"
                      >{rec.severity === 'high'
                        ? '⚠️'
                        : rec.severity === 'medium'
                          ? '💡'
                          : 'ℹ️'}</span
                    >
                    <span class="rec-message">{rec.message}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div class="empty-state">
            No health score data available. Click "Calculate Now" to generate.
          </div>
        {/if}
      </div>
    {:else if activeTab === 'drift'}
      <div class="drift-tab">
        <div class="tab-header">
          <h3>Drift Detection</h3>
          <button class="action-button" on:click={detectDrifts}> Detect Now </button>
        </div>

        {#if driftSummary}
          <div class="drift-summary">
            <div class="summary-stat">
              <span class="stat-value">{driftSummary.total_active_drifts}</span>
              <span class="stat-label">Active Drifts</span>
            </div>
          </div>
        {/if}

        {#if recentDrifts.length > 0}
          <div class="drift-list">
            {#each recentDrifts as drift (drift.id)}
              <div class="drift-item" style="border-left-color: {getSeverityColor(drift.severity)}">
                <div class="drift-header">
                  <span class="drift-type">{drift.drift_type.toUpperCase()}</span>
                  <span class="drift-severity {drift.severity}">{drift.severity}</span>
                  {#if !drift.resolved_at}
                    <button class="resolve-button" on:click={() => resolveDrift(drift.id)}>
                      Mark Resolved
                    </button>
                  {:else}
                    <span class="resolved-badge">Resolved</span>
                  {/if}
                </div>
                <div class="drift-description">{drift.description}</div>
                <div class="drift-details">
                  <span>Baseline: {drift.baseline_value?.toFixed(2)}</span>
                  <span>Current: {drift.current_value?.toFixed(2)}</span>
                  <span>Deviation: {drift.deviation_percent}%</span>
                </div>
                <div class="drift-time">
                  Detected: {new Date(drift.detected_at).toLocaleString()}
                  {#if drift.resolved_at}
                    <span class="resolved-time">
                      | Resolved: {new Date(drift.resolved_at).toLocaleString()}
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">No recent drift events detected.</div>
        {/if}
      </div>
    {:else if activeTab === 'productivity'}
      <div class="productivity-tab">
        <div class="tab-header">
          <h3>Productivity Insights</h3>
          <button class="action-button" on:click={calculateProductivity}> Calculate Now </button>
        </div>

        {#if productivityInsights}
          {@const insights = productivityInsights}
          <div class="productivity-grid">
            {#if insights.peak_hours}
              <div class="insight-card">
                <div class="card-icon">🌟</div>
                <div class="card-title">Peak Hour</div>
                <div class="card-value">{insights.peak_hours.peak_hour}:00</div>
              </div>
            {/if}

            {#if insights.session_patterns}
              <div class="insight-card">
                <div class="card-icon">⏱️</div>
                <div class="card-title">Optimal Session</div>
                <div class="card-value">
                  {insights.session_patterns.optimal_session_duration?.toFixed(1)}h
                </div>
              </div>
            {/if}

            {#if insights.focus_metrics}
              <div class="insight-card">
                <div class="card-icon">🎯</div>
                <div class="card-title">Focus Score</div>
                <div class="card-value">
                  {insights.focus_metrics.avg_focus_score?.toFixed(1)}/10
                </div>
              </div>
            {/if}

            {#if insights.productivity_trends}
              <div class="insight-card">
                <div class="card-icon">
                  {insights.productivity_trends.trend === 'improving'
                    ? '📈'
                    : insights.productivity_trends.trend === 'declining'
                      ? '📉'
                      : '➡️'}
                </div>
                <div class="card-title">Trend</div>
                <div class="card-value">{insights.productivity_trends.trend}</div>
              </div>
            {/if}
          </div>

          {#if insights.recommendations && insights.recommendations.length > 0}
            <div class="recommendations">
              <h4>Recommendations</h4>
              {#each insights.recommendations as rec (rec.message)}
                <div class="recommendation-item">
                  <span class="rec-icon">💡</span>
                  <span class="rec-message">{rec.message}</span>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="empty-state">
            No productivity insights available. Click "Calculate Now" to generate.
          </div>
        {/if}
      </div>
    {:else if activeTab === 'personality'}
      <div class="personality-tab">
        <div class="tab-header">
          <h3>Claude Personality Analysis</h3>
          <button class="action-button" on:click={analyzePersonality}> Analyze Now </button>
        </div>

        {#if personalityProfile}
          {@const insights = personalityProfile}
          <div class="personality-card">
            <div class="personality-type">
              <h4>{insights.overall_profile.type}</h4>
              <p>{insights.overall_profile.summary}</p>
            </div>

            <div class="personality-traits">
              <h5>Traits</h5>
              <div class="trait-tags">
                {#each insights.overall_profile.traits as trait (trait)}
                  <span class="trait-tag">{trait}</span>
                {/each}
              </div>
            </div>

            <div class="personality-metrics">
              <div class="metric-item">
                <span class="metric-label">Communication Style</span>
                <span class="metric-value">{insights.communication_style.style}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Risk Tolerance</span>
                <span class="metric-value">{insights.risk_profile.tolerance}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Creativity Score</span>
                <span class="metric-value">{insights.creativity_score.score}/100</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Consistency Score</span>
                <span class="metric-value">{insights.consistency_metrics.score}/100</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Problem Solving</span>
                <span class="metric-value">{insights.problem_solving.approach}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Decision Speed</span>
                <span class="metric-value">{insights.decision_speed.speed}</span>
              </div>
            </div>

            {#if insights.overall_profile.strengths && insights.overall_profile.strengths.length > 0}
              <div class="strengths">
                <h5>Strengths</h5>
                {#each insights.overall_profile.strengths as strength (strength)}
                  <div class="strength-item">✅ {strength}</div>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div class="empty-state">
            No personality analysis available. Click "Analyze Now" to generate.
          </div>
        {/if}
      </div>
    {:else if activeTab === 'growth'}
      <div class="growth-tab">
        <div class="tab-header">
          <h3>Growth Tracking</h3>
          <button class="action-button" on:click={createGrowthSnapshot}> Create Snapshot </button>
        </div>

        {#if growthSummary}
          <div class="growth-stats">
            <div class="stat-card">
              <div class="stat-label">Avg Daily Events</div>
              <div class="stat-value">{growthSummary.statistics.avg_daily_events?.toFixed(0)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Avg Quality Score</div>
              <div class="stat-value">{growthSummary.statistics.avg_quality_score?.toFixed(0)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Avg Health Score</div>
              <div class="stat-value">{growthSummary.statistics.avg_health_score?.toFixed(0)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Peak Events</div>
              <div class="stat-value">{growthSummary.statistics.peak_events}</div>
            </div>
          </div>

          {#if growthSummary.milestones && growthSummary.milestones.length > 0}
            <div class="milestones">
              <h4>Milestones</h4>
              {#each growthSummary.milestones as milestone (milestone.date + milestone.type)}
                <div class="milestone-item">
                  <span class="milestone-icon">
                    {milestone.type === 'peak_activity'
                      ? '🔥'
                      : milestone.type === 'best_quality'
                        ? '⭐'
                        : '📈'}
                  </span>
                  <span class="milestone-message">{milestone.message}</span>
                  <span class="milestone-date">{milestone.date}</span>
                </div>
              {/each}
            </div>
          {/if}

          {#if growthSummary.trends && growthSummary.trends.length > 0}
            <div class="trends">
              <h4>Trends</h4>
              {#each growthSummary.trends as trend (trend.metric)}
                <div class="trend-item">
                  <span class="trend-metric">{trend.metric}</span>
                  <span class="trend-direction {trend.direction}">
                    {trend.direction === 'increasing' ? '↗️' : '↘️'}
                    {Math.abs(trend.change_percent)}%
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="empty-state">No growth data available.</div>
        {/if}
      </div>
    {:else if activeTab === 'integrations'}
      <div class="integrations-tab">
        <h3>External Integrations Configuration</h3>

        {#if configSaveStatus}
          <div class="config-status">{configSaveStatus}</div>
        {/if}

        <div class="integration-config-cards">
          <!-- GitHub Configuration -->
          <div class="config-card">
            <div class="config-header">
              <h4>GitHub Integration</h4>
              <span class="config-status-badge {integrationStatus.github.enabled ? 'enabled' : ''}"
                >{integrationStatus.github.enabled ? 'Enabled' : 'Disabled'}</span
              >
            </div>
            <div class="config-form">
              <div class="form-group">
                <label for="github-token">Personal Access Token</label>
                <input
                  id="github-token"
                  type="password"
                  bind:value={githubConfig.token}
                  placeholder="ghp_xxxxxxxxxxxxx"
                />
              </div>
              <div class="form-group">
                <label for="github-owner">Repository Owner</label>
                <input
                  id="github-owner"
                  type="text"
                  bind:value={githubConfig.owner}
                  placeholder="username or organization"
                />
              </div>
              <div class="form-group">
                <label for="github-repo">Repository Name</label>
                <input
                  id="github-repo"
                  type="text"
                  bind:value={githubConfig.repo}
                  placeholder="repo-name"
                />
              </div>
              <button class="save-button" on:click={saveGitHubConfig}>Save GitHub Config</button>
              <div class="action-buttons">
                <button class="test-button" on:click={testGitHubConnection}>Test Connection</button>
                <button class="send-button" on:click={sendHealthToGitHub}>Send Health</button>
                <button class="disable-button" on:click={disableGitHub}>Disable</button>
              </div>
            </div>
            <div class="config-info">
              <p>Recent events: {integrationStatus.github.events.length}</p>
              <p class="help-text">
                Create issues for critical errors and post health reports to commits
              </p>
            </div>
          </div>

          <!-- Discord Configuration -->
          <div class="config-card">
            <div class="config-header">
              <h4>Discord Integration</h4>
              <span class="config-status-badge {integrationStatus.discord.enabled ? 'enabled' : ''}"
                >{integrationStatus.discord.enabled ? 'Enabled' : 'Disabled'}</span
              >
            </div>
            <div class="config-form">
              <div class="form-group">
                <label for="discord-webhook">Webhook URL</label>
                <input
                  id="discord-webhook"
                  type="url"
                  bind:value={discordConfig.webhookUrl}
                  placeholder="https://discord.com/api/webhooks/..."
                />
              </div>
              <button class="save-button" on:click={saveDiscordConfig}>Save Discord Config</button>
              <div class="action-buttons">
                <button class="test-button" on:click={testDiscordConnection}>Test Connection</button
                >
                <button class="send-button" on:click={sendHealthToDiscord}>Send Health</button>
                <button class="disable-button" on:click={disableDiscord}>Disable</button>
              </div>
            </div>
            <div class="config-info">
              <p>Recent events: {integrationStatus.discord.events.length}</p>
              <p class="help-text">Send notifications to Discord channel for monitoring alerts</p>
            </div>
          </div>

          <!-- Slack Configuration -->
          <div class="config-card">
            <div class="config-header">
              <h4>Slack Integration</h4>
              <span class="config-status-badge {integrationStatus.slack.enabled ? 'enabled' : ''}"
                >{integrationStatus.slack.enabled ? 'Enabled' : 'Disabled'}</span
              >
            </div>
            <div class="config-form">
              <div class="form-group">
                <label for="slack-webhook">Webhook URL</label>
                <input
                  id="slack-webhook"
                  type="url"
                  bind:value={slackConfig.webhookUrl}
                  placeholder="https://hooks.slack.com/services/..."
                />
              </div>
              <button class="save-button" on:click={saveSlackConfig}>Save Slack Config</button>
              <div class="action-buttons">
                <button class="test-button" on:click={testSlackConnection}>Test Connection</button>
                <button class="send-button" on:click={sendHealthToSlack}>Send Health</button>
                <button class="disable-button" on:click={disableSlack}>Disable</button>
              </div>
            </div>
            <div class="config-info">
              <p>Recent events: {integrationStatus.slack.events.length}</p>
              <p class="help-text">Send notifications to Slack channel for team collaboration</p>
            </div>
          </div>
        </div>
      </div>
    {:else if activeTab === 'gamification'}
      <div class="gamification-tab">
        <h3>Gamification & Achievements</h3>

        {#if userStats}
          <div class="stats-card">
            <h4>Your Stats</h4>
            <div class="stat-grid">
              <div class="stat-item">
                <div class="stat-label">Level</div>
                <div class="stat-value">{userStats.level || 1}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Total Points</div>
                <div class="stat-value">{userStats.total_points || 0}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Streak</div>
                <div class="stat-value">{userStats.streak_days || 0} days</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Badges</div>
                <div class="stat-value">{userStats.badges_unlocked || 0}</div>
              </div>
            </div>
          </div>
        {/if}

        <div class="achievements-section">
          <h4>Unlocked Achievements ({achievements.length})</h4>
          {#if achievements.length > 0}
            <div class="achievements-grid">
              {#each achievements as achievement (achievement.achievement_id || achievement.id)}
                <div class="achievement-card {achievement.rarity}">
                  <div class="achievement-icon">
                    {achievement.icon || achievement.title.split(' ')[0]}
                  </div>
                  <div class="achievement-title">{achievement.title}</div>
                  <div class="achievement-desc">{achievement.description}</div>
                  <div class="achievement-points">+{achievement.points} pts</div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-state">No achievements unlocked yet. Keep coding!</p>
          {/if}
        </div>
      </div>
    {:else if activeTab === 'easter-eggs'}
      <div class="easter-eggs-tab">
        <h3>Easter Eggs & Seasonal Messages</h3>

        {#if seasonalMessage}
          <div class="seasonal-message">
            <h4>{seasonalMessage.title}</h4>
            <p>{seasonalMessage.message}</p>
          </div>
        {/if}

        <div class="discovered-eggs">
          <h4>Discovered Easter Eggs ({easterEggs.length})</h4>
          {#if easterEggs.length > 0}
            <div class="eggs-list">
              {#each easterEggs as egg (egg.egg_id || egg.id)}
                <div class="egg-card">
                  <div class="egg-title">{egg.title}</div>
                  <div class="egg-message">{egg.message}</div>
                  <div class="egg-meta">
                    <span class="egg-type">{egg.trigger_type}</span>
                    <span class="egg-date">{new Date(egg.discovered_at).toLocaleDateString()}</span>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-state">
              No easter eggs discovered yet. Try coding on special dates or using special patterns!
            </p>
          {/if}
        </div>
      </div>
    {:else if activeTab === 'social'}
      <div class="social-tab">
        <h3>Social Features</h3>

        <div class="export-section">
          <h4>Export Your Stats</h4>
          <div class="export-controls">
            <select bind:value={exportFormat} class="format-select">
              <option value="json">JSON</option>
              <option value="markdown">Markdown</option>
              <option value="text">Plain Text</option>
            </select>
            <button
              class="action-button"
              on:click={() => {
                window.open(
                  `${API_BASE}/social/export?project=${project}&format=${exportFormat}`,
                  '_blank'
                );
              }}
            >
              Download Export
            </button>
          </div>
        </div>

        <div class="share-history-section">
          <h4>Share History</h4>
          {#if shareHistory.length > 0}
            <div class="share-list">
              {#each shareHistory as share (share.id)}
                <div class="share-item">
                  <div class="share-type">{share.share_type}</div>
                  <div class="share-platform">{share.platform}</div>
                  <div class="share-date">{new Date(share.shared_at).toLocaleString()}</div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-state">No shares yet. Share your achievements!</p>
          {/if}
        </div>

        <div class="team-section">
          <h4>Team Members ({teamMembers.length})</h4>
          {#if teamMembers.length > 0}
            <div class="team-list">
              {#each teamMembers as member (member.id || member.member_name)}
                <div class="team-member">
                  <div class="member-name">{member.member_name}</div>
                  <div class="member-role">{member.role}</div>
                  <div class="member-joined">{new Date(member.joined_at).toLocaleDateString()}</div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-state">No team members yet.</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .tier4-panel {
    padding: 20px;
    background: var(--bg-primary, #1a1a1a);
    color: var(--text-primary, #e0e0e0);
    height: 100%;
    overflow-y: auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 24px;
  }

  .refresh-button,
  .action-button {
    padding: 8px 16px;
    background: #4a9eff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  .refresh-button:hover,
  .action-button:hover {
    background: #3a8eef;
  }

  .refresh-button:disabled {
    background: #666;
    cursor: not-allowed;
  }

  .tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    border-bottom: 2px solid #333;
    flex-wrap: wrap;
  }

  .tabs button {
    padding: 10px 16px;
    background: transparent;
    color: #999;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .tabs button:hover {
    color: #ccc;
  }

  .tabs button.active {
    color: #4a9eff;
    border-bottom-color: #4a9eff;
  }

  .tab-content {
    margin-top: 20px;
  }

  .tab-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .tab-header h3 {
    margin: 0;
  }

  .error-message {
    padding: 12px;
    background: #ff6b6b22;
    border-left: 4px solid #ff6b6b;
    color: #ff6b6b;
    margin-bottom: 20px;
  }

  .empty-state {
    padding: 40px;
    text-align: center;
    color: #666;
    font-size: 16px;
  }

  /* Health Scoring Styles */
  .health-score-card {
    background: #252525;
    border-radius: 8px;
    padding: 24px;
  }

  .score-display {
    text-align: center;
    margin-bottom: 30px;
    padding: 20px;
    border: 3px solid;
    border-radius: 12px;
  }

  .score-value {
    font-size: 64px;
    font-weight: bold;
  }

  .score-label {
    font-size: 18px;
    color: #999;
    margin-top: 8px;
  }

  .score-breakdown {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }

  .score-item {
    display: grid;
    grid-template-columns: 150px 1fr 50px;
    gap: 12px;
    align-items: center;
  }

  .score-name {
    font-size: 14px;
  }

  .score-bar {
    height: 24px;
    background: #333;
    border-radius: 12px;
    overflow: hidden;
  }

  .score-fill {
    height: 100%;
    transition: width 0.3s ease;
  }

  .score-number {
    text-align: right;
    font-weight: bold;
  }

  .recommendations {
    margin-top: 24px;
  }

  .recommendations h4 {
    margin-bottom: 12px;
  }

  .recommendation-item {
    padding: 12px;
    background: #1f1f1f;
    border-radius: 6px;
    margin-bottom: 8px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .rec-icon {
    font-size: 20px;
  }

  .rec-message {
    flex: 1;
    line-height: 1.5;
  }

  /* Drift Detection Styles */
  .drift-summary {
    display: flex;
    gap: 20px;
    margin-bottom: 24px;
  }

  .summary-stat {
    background: #252525;
    padding: 20px;
    border-radius: 8px;
    text-align: center;
  }

  .stat-value {
    font-size: 36px;
    font-weight: bold;
    color: #4a9eff;
    display: block;
  }

  .stat-label {
    font-size: 14px;
    color: #999;
    margin-top: 8px;
    display: block;
  }

  .drift-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .drift-item {
    background: #252525;
    border-left: 4px solid;
    border-radius: 6px;
    padding: 16px;
  }

  .drift-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .drift-type {
    font-weight: bold;
    font-size: 14px;
  }

  .drift-severity {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    text-transform: uppercase;
  }

  .drift-severity.critical {
    background: #ff6b6b;
    color: white;
  }
  .drift-severity.high {
    background: #ff922b;
    color: white;
  }
  .drift-severity.medium {
    background: #ffd43b;
    color: black;
  }
  .drift-severity.low {
    background: #74c0fc;
    color: black;
  }

  .drift-description {
    margin-bottom: 8px;
    color: #ccc;
  }

  .drift-details {
    display: flex;
    gap: 20px;
    font-size: 12px;
    color: #999;
    margin-bottom: 8px;
  }

  .drift-time {
    font-size: 12px;
    color: #666;
  }

  .drift-time .resolved-time {
    color: #51cf66;
    font-weight: 500;
  }

  .resolve-button {
    padding: 4px 12px;
    background: #228be6;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
    margin-left: auto;
  }

  .resolve-button:hover {
    background: #1c7ed6;
  }

  .resolved-badge {
    padding: 4px 12px;
    background: #51cf66;
    color: white;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    margin-left: auto;
  }

  /* Productivity Styles */
  .productivity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .insight-card {
    background: #252525;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
  }

  .card-icon {
    font-size: 32px;
    margin-bottom: 12px;
  }

  .card-title {
    font-size: 14px;
    color: #999;
    margin-bottom: 8px;
  }

  .card-value {
    font-size: 24px;
    font-weight: bold;
    color: #4a9eff;
  }

  /* Personality Styles */
  .personality-card {
    background: #252525;
    border-radius: 8px;
    padding: 24px;
  }

  .personality-type h4 {
    font-size: 24px;
    margin-bottom: 12px;
    color: #4a9eff;
  }

  .personality-type p {
    color: #ccc;
    line-height: 1.6;
    margin-bottom: 24px;
  }

  .personality-traits {
    margin-bottom: 24px;
  }

  .personality-traits h5 {
    margin-bottom: 12px;
  }

  .trait-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .trait-tag {
    padding: 6px 12px;
    background: #1f1f1f;
    border: 1px solid #4a9eff;
    border-radius: 16px;
    font-size: 13px;
    color: #4a9eff;
  }

  .personality-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .metric-item {
    display: flex;
    justify-content: space-between;
    padding: 12px;
    background: #1f1f1f;
    border-radius: 6px;
  }

  .metric-label {
    color: #999;
    font-size: 14px;
  }

  .metric-value {
    font-weight: bold;
    color: #4a9eff;
  }

  .strengths h5 {
    margin-bottom: 12px;
  }

  .strength-item {
    padding: 8px 12px;
    background: #1f1f1f;
    border-radius: 6px;
    margin-bottom: 8px;
  }

  /* Growth Tracking Styles */
  .growth-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: #252525;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
  }

  .stat-card .stat-label {
    display: block;
    font-size: 14px;
    color: #999;
    margin-bottom: 8px;
  }

  .stat-card .stat-value {
    display: block;
    font-size: 32px;
    font-weight: bold;
    color: #4a9eff;
  }

  .milestones,
  .trends {
    background: #252525;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
  }

  .milestones h4,
  .trends h4 {
    margin-bottom: 12px;
  }

  .milestone-item {
    padding: 12px;
    background: #1f1f1f;
    border-radius: 6px;
    margin-bottom: 8px;
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .milestone-icon {
    font-size: 20px;
  }

  .milestone-message {
    flex: 1;
  }

  .milestone-date {
    font-size: 12px;
    color: #666;
  }

  .trend-item {
    padding: 12px;
    background: #1f1f1f;
    border-radius: 6px;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .trend-metric {
    font-weight: bold;
  }

  .trend-direction {
    font-size: 14px;
  }

  .trend-direction.increasing {
    color: #51cf66;
  }

  .trend-direction.decreasing {
    color: #ff6b6b;
  }

  /* Integration Styles */
  .integration-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .integration-card {
    background: #252525;
    border-radius: 8px;
    padding: 20px;
  }

  .integration-card.enabled {
    border: 2px solid #51cf66;
  }

  .integration-card.disabled {
    border: 2px solid #666;
    opacity: 0.7;
  }

  .integration-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .integration-name {
    font-weight: bold;
    font-size: 16px;
  }

  .integration-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
  }

  .integration-note {
    padding: 16px;
    background: #1f1f1f;
    border-radius: 6px;
    color: #999;
    font-size: 14px;
  }

  /* Integration Configuration Styles */
  .integration-config-cards {
    display: flex;
    flex-direction: column;
    gap: 24px;
    margin-top: 20px;
  }

  .config-card {
    background: var(--bg-secondary, #222);
    border-radius: 8px;
    padding: 20px;
    border: 2px solid var(--border-color, #333);
  }

  .config-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color, #333);
  }

  .config-header h4 {
    margin: 0;
    font-size: 18px;
    color: var(--text-primary, #fff);
  }

  .config-status-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    background: #444;
    color: #999;
  }

  .config-status-badge.enabled {
    background: #51cf66;
    color: #000;
  }

  .config-form {
    margin: 16px 0;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary, #ccc);
  }

  .form-group input {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-primary, #1a1a1a);
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    color: var(--text-primary, #fff);
    font-size: 14px;
    font-family: inherit;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--accent-color, #51cf66);
    box-shadow: 0 0 0 2px rgba(81, 207, 102, 0.1);
  }

  .form-group input::placeholder {
    color: #666;
  }

  .save-button {
    padding: 10px 20px;
    background: var(--accent-color, #51cf66);
    color: #000;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .save-button:hover {
    background: #69db7c;
    transform: translateY(-1px);
  }

  .save-button:active {
    transform: translateY(0);
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .action-buttons button {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .test-button {
    background: #228be6;
    color: white;
  }

  .test-button:hover {
    background: #1c7ed6;
  }

  .send-button {
    background: #40c057;
    color: white;
  }

  .send-button:hover {
    background: #37b24d;
  }

  .disable-button {
    background: #fa5252;
    color: white;
  }

  .disable-button:hover {
    background: #e03131;
  }

  .config-info {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #333);
  }

  .config-info p {
    margin: 4px 0;
    font-size: 14px;
    color: var(--text-secondary, #ccc);
  }

  .help-text {
    color: #999 !important;
    font-size: 13px !important;
    font-style: italic;
  }

  .config-status {
    padding: 12px;
    margin-bottom: 16px;
    background: #1f1f1f;
    border-left: 3px solid #51cf66;
    border-radius: 4px;
    color: #ccc;
    font-size: 14px;
  }
</style>
