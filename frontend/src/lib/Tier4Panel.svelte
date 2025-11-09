<script>
  import { onMount } from 'svelte';
  import { activeProject } from './projectStore.js';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

  $: project = $activeProject || 'raven';

  let activeTab = 'health'; // health, drift, productivity, personality, growth, integrations
  let loading = false;
  let error = null;
  let loadedTabs = new Set(); // Track which tabs have been loaded

  // Health Scoring data
  let healthScore = null;
  let healthHistory = [];

  // Drift Detection data
  let recentDrifts = [];
  let driftSummary = null;

  // Productivity Insights data
  let productivityInsights = null;

  // Claude Personality data
  let personalityProfile = null;

  // Growth Tracking data
  let growthSummary = null;
  let growthTimeSeries = null;

  // Integration status
  let integrationStatus = {
    github: { enabled: false, events: [] },
    discord: { enabled: false, events: [] },
    slack: { enabled: false, events: [] }
  };

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
      }
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      // Error handled silently - partial data load
    }
  }

  async function loadProductivityData() {
    try {
      const res = await fetch(`${API_BASE}/productivity/latest?project=${project}`);
      const data = await res.json();
      productivityInsights = data.metrics;
    } catch (err) {
      // Error handled silently - partial data load
    }
  }

  async function loadPersonalityData() {
    try {
      const res = await fetch(`${API_BASE}/personality/latest?project=${project}&agent=claude`);
      const data = await res.json();
      personalityProfile = data.profile;
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      // Error handled silently - partial data load
    }
  }

  async function calculateHealthScore() {
    try {
      const res = await fetch(`${API_BASE}/health/calculate?project=${project}`, {
        method: 'POST'
      });
      const data = await res.json();
      healthScore = data.healthScore;
      await loadHealthData();
    } catch (err) {
      // Error handled silently - operation failed gracefully
    }
  }

  async function detectDrifts() {
    try {
      const res = await fetch(`${API_BASE}/drift/detect?project=${project}`, { method: 'POST' });
      const data = await res.json();
      recentDrifts = data.drifts || [];
      await loadDriftData();
    } catch (err) {
      // Error handled silently - operation failed gracefully
    }
  }

  async function calculateProductivity() {
    try {
      const res = await fetch(`${API_BASE}/productivity/calculate?project=${project}&days=30`, {
        method: 'POST'
      });
      const data = await res.json();
      productivityInsights = data.insights;
    } catch (err) {
      // Error handled silently - operation failed gracefully
    }
  }

  async function analyzePersonality() {
    try {
      const res = await fetch(
        `${API_BASE}/personality/analyze?project=${project}&agent=claude&days=30`,
        { method: 'POST' }
      );
      const data = await res.json();
      personalityProfile = data.personality;
    } catch (err) {
      // Error handled silently - operation failed gracefully
    }
  }

  async function createGrowthSnapshot() {
    try {
      const res = await fetch(`${API_BASE}/growth/snapshot?project=${project}`, { method: 'POST' });
      await res.json();
      await loadGrowthData();
    } catch (err) {
      // Error handled silently - operation failed gracefully
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
                {#each JSON.parse(healthScore.recommendations) as rec (rec.message)}
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
                </div>
                <div class="drift-description">{drift.description}</div>
                <div class="drift-details">
                  <span>Baseline: {drift.baseline_value?.toFixed(2)}</span>
                  <span>Current: {drift.current_value?.toFixed(2)}</span>
                  <span>Deviation: {drift.deviation_percent}%</span>
                </div>
                <div class="drift-time">{new Date(drift.detected_at).toLocaleString()}</div>
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
          {@const insights = JSON.parse(productivityInsights.insights)}
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
          {@const insights = JSON.parse(personalityProfile.insights)}
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
                <span class="metric-value">{personalityProfile.communication_style}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Risk Tolerance</span>
                <span class="metric-value">{personalityProfile.risk_tolerance}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Creativity Score</span>
                <span class="metric-value">{personalityProfile.creativity_score}/100</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Consistency Score</span>
                <span class="metric-value">{personalityProfile.consistency_score}/100</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Problem Solving</span>
                <span class="metric-value">{personalityProfile.problem_solving_approach}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Decision Speed</span>
                <span class="metric-value">{personalityProfile.decision_speed}</span>
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
        <h3>External Integrations</h3>

        <div class="integration-cards">
          <div class="integration-card {integrationStatus.github.enabled ? 'enabled' : 'disabled'}">
            <div class="integration-header">
              <span class="integration-name">GitHub</span>
              <span class="integration-status"
                >{integrationStatus.github.enabled ? 'Enabled' : 'Disabled'}</span
              >
            </div>
            <div class="integration-info">
              <p>Recent events: {integrationStatus.github.events.length}</p>
            </div>
          </div>

          <div
            class="integration-card {integrationStatus.discord.enabled ? 'enabled' : 'disabled'}"
          >
            <div class="integration-header">
              <span class="integration-name">Discord</span>
              <span class="integration-status"
                >{integrationStatus.discord.enabled ? 'Enabled' : 'Disabled'}</span
              >
            </div>
            <div class="integration-info">
              <p>Recent events: {integrationStatus.discord.events.length}</p>
            </div>
          </div>

          <div class="integration-card {integrationStatus.slack.enabled ? 'enabled' : 'disabled'}">
            <div class="integration-header">
              <span class="integration-name">Slack</span>
              <span class="integration-status"
                >{integrationStatus.slack.enabled ? 'Enabled' : 'Disabled'}</span
              >
            </div>
            <div class="integration-info">
              <p>Recent events: {integrationStatus.slack.events.length}</p>
            </div>
          </div>
        </div>

        <div class="integration-note">
          <p>
            Configure integrations via API endpoints to enable notifications and external reporting.
          </p>
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

  .integration-card.enabled .integration-status {
    background: #51cf66;
    color: black;
  }

  .integration-card.disabled .integration-status {
    background: #666;
    color: white;
  }

  .integration-info p {
    margin: 4px 0;
    font-size: 14px;
    color: #999;
  }

  .integration-note {
    padding: 16px;
    background: #1f1f1f;
    border-radius: 6px;
    color: #999;
    font-size: 14px;
  }
</style>
