<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { formatTime } from './timeFormat.js';
  import { websocketService } from './websocket.js';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  let stats = {
    counts: {
      agent_interactions: 0,
      code_patterns: 0,
      workflow_events: 0,
      error_recovery: 0,
      context_switches: 0,
      preferences: 0
    },
    languages: [],
    projects: [],
    hourly_activity: []
  };
  let interactions = [];
  let patterns = [];
  let loading = true;
  let lastUpdate = null;
  let autoRefresh = false;

  // Charts
  let charts = {};
  let themeObserver;

  async function loadAllData() {
    try {
      loading = true;
      const [statsData, interactionsData, patternsData] = await Promise.all([
        api.get('/developer/stats'),
        api.get('/developer/interactions?limit=20'),
        api.get('/developer/patterns?limit=20')
      ]);

      stats = statsData;
      interactions = interactionsData.interactions || [];
      patterns = patternsData.patterns || [];
      lastUpdate = new Date();

      // Update charts after data loads
      if (!loading && stats.hourly_activity && stats.hourly_activity.length > 0) {
        setTimeout(updateCharts, 200);
      }
    } catch (error) {
      notifications.error(`Failed to load developer insights: ${error.message}`);
    } finally {
      loading = false;
    }
  }

  async function exportData() {
    try {
      const exportData = {
        exported_at: new Date().toISOString(),
        stats,
        interactions,
        patterns
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raven-developer-insights-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notifications.success('Developer insights exported successfully');
    } catch (error) {
      notifications.error(`Export failed: ${error.message}`);
    }
  }

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    if (autoRefresh) {
      await loadAllData();
    }
  };

  const handleProjectSwitched = async () => {
    await loadAllData();
  };

  $: totalDataPoints = stats.counts.agent_interactions + stats.counts.code_patterns + stats.counts.workflow_events;

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    // Only create charts if we have data
    if (!stats.hourly_activity || stats.hourly_activity.length === 0) return;

    // Helper function to safely extract color with fallback
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      return (value && (value.startsWith('#') || value.startsWith('rgb'))) ? value : fallback;
    };

    // Get theme-aware colors from body element
    const textColor = getColor('--text', '#c0caf5');
    const mutedColor = getColor('--muted', '#565f89');
    const gridColor = 'rgba(128, 128, 128, 0.15)';
    const successColor = getColor('--success', '#9ece6a');
    const accentColor = getColor('--accent', '#7aa2f7');
    const errorColor = getColor('--error', '#f7768e');
    const warningColor = getColor('--warning', '#e0af68');
    const infoColor = getColor('--info', '#7dcfff');

    // 1. Bar chart: Activity by hour of day
    const barCanvas = document.getElementById('hourly-bar-chart');
    if (barCanvas) {
      const hourlyData = Array(24).fill(0);
      stats.hourly_activity.forEach(entry => {
        hourlyData[entry.hour_of_day] = entry.count;
      });

      charts.hourlyBar = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: Array(24).fill(0).map((_, i) => `${i}:00`),
          datasets: [{
            label: 'Activity',
            data: hourlyData,
            backgroundColor: accentColor,
            borderColor: accentColor,
            borderWidth: 2,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' },
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
    }

    // 2. Pie chart: Breakdown by activity type
    const pieCanvas = document.getElementById('activity-type-pie-chart');
    if (pieCanvas) {
      charts.activityPie = new Chart(pieCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Agent Interactions', 'Code Patterns', 'Workflow Events', 'Error Recoveries', 'Context Switches'],
          datasets: [{
            data: [
              stats.counts.agent_interactions || 0,
              stats.counts.code_patterns || 0,
              stats.counts.workflow_events || 0,
              stats.counts.error_recovery || 0,
              stats.counts.context_switches || 0
            ],
            backgroundColor: [
              accentColor,
              successColor,
              infoColor,
              errorColor,
              warningColor
            ],
            borderColor: [
              accentColor,
              successColor,
              infoColor,
              errorColor,
              warningColor
            ],
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: textColor,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            }
          }
        }
      });
    }

    // 3. Line chart: Cumulative productivity over time
    const lineCanvas = document.getElementById('cumulative-line-chart');
    if (lineCanvas) {
      // Calculate cumulative totals by hour
      const cumulativeData = Array(24).fill(0);
      const hourlyData = Array(24).fill(0);
      stats.hourly_activity.forEach(entry => {
        hourlyData[entry.hour_of_day] = entry.count;
      });

      let cumulative = 0;
      for (let i = 0; i < 24; i++) {
        cumulative += hourlyData[i];
        cumulativeData[i] = cumulative;
      }

      charts.cumulativeLine = new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels: Array(24).fill(0).map((_, i) => `${i}:00`),
          datasets: [{
            label: 'Cumulative Activity',
            data: cumulativeData,
            borderColor: successColor,
            backgroundColor: successColor + '33',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: successColor,
            pointBorderColor: successColor,
            pointHoverRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' },
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
    }
  }

  function updateCharts() {
    if (stats.hourly_activity && stats.hourly_activity.length > 0) {
      createCharts();
    }
  }

  onMount(async () => {
    await loadAllData();

    // Create charts after data loads and DOM is ready
    if (stats.hourly_activity && stats.hourly_activity.length > 0) {
      setTimeout(createCharts, 200);
    }

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);

    // Watch for theme changes on body element
    themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setTimeout(createCharts, 100);
        }
      });
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);

    // Disconnect theme observer
    if (themeObserver) {
      themeObserver.disconnect();
    }

    // Destroy charts
    Object.values(charts).forEach(chart => chart?.destroy());
  });
</script>

<div class="insights-panel" role="region" aria-label="Developer insights panel">
  <!-- Controls -->
  <div class="controls" role="toolbar" aria-label="Insights panel actions">
    <label class="auto-refresh">
      <input type="checkbox" bind:checked={autoRefresh} aria-label="Enable auto-refresh on file changes" />
      Auto-refresh
    </label>

    <button class="btn-refresh" on:click={loadAllData} disabled={loading} aria-label={loading ? 'Loading insights data' : 'Refresh insights data'}>
      <span aria-hidden="true">{#if loading}⏳{:else}🔄{/if}</span> Refresh
    </button>

    <button class="btn-export" on:click={exportData} aria-label="Export developer insights to JSON file">
      <span aria-hidden="true">📤</span> Export
    </button>

    {#if lastUpdate}
      <div class="last-update" role="status" aria-live="polite">
        Updated: {formatTime(lastUpdate.toISOString())}
      </div>
    {/if}
  </div>

  {#if loading}
    <LoadingSkeleton count={5} height="120px" />
  {:else if totalDataPoints === 0}
    <!-- Empty State -->
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true">🌱</div>
      <h2 id="empty-heading">Your Developer Persona is Growing</h2>
      <p>Raven is learning about your development patterns, but needs data to provide insights.</p>

      <div class="empty-info">
        <h3>What Gets Tracked:</h3>
        <ul>
          <li><strong>Agent Interactions:</strong> Your prompts to AI, responses received, code changes accepted/rejected</li>
          <li><strong>Code Patterns:</strong> Languages used, indentation style, naming conventions, comment density</li>
          <li><strong>Workflow Events:</strong> When you code (hour/day), focus duration, interruptions, productivity score</li>
          <li><strong>Error Recovery:</strong> How you debug, time to fix, approaches used, repeated patterns</li>
          <li><strong>Context Switches:</strong> How often you switch projects, what triggers switches, completion rates</li>
        </ul>

        <h3>Privacy First:</h3>
        <p>All data stays <strong>100% local</strong> on your machine. Nothing is sent to external servers.</p>
        <p>This database is at: <code>~/.raven/db/developer.db</code></p>

        <h3>To Start Collecting Data:</h3>
        <p>Data collection hooks are not yet active. When implemented, Raven will automatically track your development activity in real-time.</p>
      </div>
    </div>
  {:else}
    <!-- Stats Overview -->
    <div class="stats-grid" role="list" aria-label="Developer insights statistics">
      <article class="stat-card" role="listitem">
        <div class="stat-icon" aria-hidden="true">🤖</div>
        <div class="stat-content">
          <div class="stat-label">Agent Interactions</div>
          <div class="stat-value" role="status">{stats.counts.agent_interactions.toLocaleString()}</div>
          <div class="stat-desc">Prompts & responses tracked</div>
        </div>
      </article>

      <article class="stat-card" role="listitem">
        <div class="stat-icon" aria-hidden="true">💻</div>
        <div class="stat-content">
          <div class="stat-label">Code Patterns</div>
          <div class="stat-value" role="status">{stats.counts.code_patterns.toLocaleString()}</div>
          <div class="stat-desc">Coding style observations</div>
        </div>
      </article>

      <article class="stat-card" role="listitem">
        <div class="stat-icon" aria-hidden="true">⚡</div>
        <div class="stat-content">
          <div class="stat-label">Workflow Events</div>
          <div class="stat-value" role="status">{stats.counts.workflow_events.toLocaleString()}</div>
          <div class="stat-desc">Work pattern data points</div>
        </div>
      </article>

      <article class="stat-card" role="listitem">
        <div class="stat-icon" aria-hidden="true">🔧</div>
        <div class="stat-content">
          <div class="stat-label">Error Recoveries</div>
          <div class="stat-value" role="status">{stats.counts.error_recovery.toLocaleString()}</div>
          <div class="stat-desc">Debugging patterns learned</div>
        </div>
      </article>

      <article class="stat-card" role="listitem">
        <div class="stat-icon" aria-hidden="true">🔄</div>
        <div class="stat-content">
          <div class="stat-label">Context Switches</div>
          <div class="stat-value" role="status">{stats.counts.context_switches.toLocaleString()}</div>
          <div class="stat-desc">Project switches tracked</div>
        </div>
      </article>

      <article class="stat-card" role="listitem">
        <div class="stat-icon" aria-hidden="true">⚙️</div>
        <div class="stat-content">
          <div class="stat-label">Preferences</div>
          <div class="stat-value" role="status">{stats.counts.preferences.toLocaleString()}</div>
          <div class="stat-desc">Learned preferences</div>
        </div>
      </article>
    </div>

    <!-- Language Breakdown -->
    {#if stats.languages.length > 0}
      <section class="section" aria-labelledby="languages-heading">
        <h2 class="section-title" id="languages-heading"><span aria-hidden="true">🔤</span> Language Breakdown</h2>
        <div class="languages-grid" role="list" aria-label="Programming languages used">
          {#each stats.languages as lang (lang.language)}
            <article class="language-card" role="listitem">
              <div class="language-name">{lang.language}</div>
              <div class="language-count" role="status">{lang.count.toLocaleString()} patterns</div>
              <div class="language-bar" role="img" aria-label="{lang.language} usage: {((lang.count / stats.languages[0].count) * 100).toFixed(0)}%">
                <div
                  class="language-bar-fill"
                  style="width: {(lang.count / stats.languages[0].count) * 100}%"
                  aria-hidden="true"
                ></div>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Project Activity -->
    {#if stats.projects.length > 0}
      <section class="section" aria-labelledby="projects-heading">
        <h2 class="section-title" id="projects-heading"><span aria-hidden="true">📊</span> Project Activity</h2>
        <div class="projects-grid" role="list" aria-label="Project interaction counts">
          {#each stats.projects as proj (proj.project)}
            <article class="project-card" role="listitem">
              <div class="project-name">{proj.project}</div>
              <div class="project-count" role="status">{proj.count.toLocaleString()} interactions</div>
              <div class="project-bar" role="img" aria-label="{proj.project} activity: {((proj.count / stats.projects[0].count) * 100).toFixed(0)}%">
                <div
                  class="project-bar-fill"
                  style="width: {(proj.count / stats.projects[0].count) * 100}%"
                  aria-hidden="true"
                ></div>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Activity Charts -->
    {#if stats.hourly_activity.length > 0}
      <!-- Bar chart: Activity by hour of day -->
      <section class="section" aria-labelledby="hourly-bar-heading">
        <h2 class="section-title" id="hourly-bar-heading"><span aria-hidden="true">📊</span> Activity by Hour of Day</h2>
        <div class="chart-container" style="height: 280px;">
          <canvas id="hourly-bar-chart" aria-label="Bar chart showing coding activity by hour of day"></canvas>
        </div>
      </section>

      <!-- Pie chart: Breakdown by activity type -->
      <section class="section" aria-labelledby="activity-pie-heading">
        <h2 class="section-title" id="activity-pie-heading"><span aria-hidden="true">📈</span> Activity Type Breakdown</h2>
        <div class="chart-container" style="height: 280px;">
          <canvas id="activity-type-pie-chart" aria-label="Pie chart showing breakdown of activity types"></canvas>
        </div>
      </section>

      <!-- Line chart: Cumulative productivity over time -->
      <section class="section" aria-labelledby="cumulative-line-heading">
        <h2 class="section-title" id="cumulative-line-heading"><span aria-hidden="true">📉</span> Cumulative Productivity Over Time</h2>
        <div class="chart-container" style="height: 280px;">
          <canvas id="cumulative-line-chart" aria-label="Line chart showing cumulative productivity throughout the day"></canvas>
        </div>
      </section>
    {/if}

    <!-- Recent Interactions -->
    {#if interactions.length > 0}
      <section class="section" aria-labelledby="interactions-heading">
        <h2 class="section-title" id="interactions-heading"><span aria-hidden="true">🤖</span> Recent Agent Interactions</h2>
        <div class="interactions-list" role="list" aria-label="Recent AI agent interactions">
          {#each interactions as interaction (interaction.id || interaction.timestamp)}
            <article class="interaction-item" role="listitem">
              <div class="interaction-header">
                <span class="interaction-project">{interaction.project || 'Unknown'}</span>
                <span class="interaction-agent">{interaction.agent_name}</span>
                <span class="interaction-time">{formatTime(interaction.timestamp)}</span>
              </div>
              {#if interaction.prompt}
                <div class="interaction-prompt">{interaction.prompt.substring(0, 150)}...</div>
              {/if}
              <div class="interaction-meta">
                {#if interaction.file_path}
                  <span class="meta-tag">📄 {interaction.file_path}</span>
                {/if}
                {#if interaction.language}
                  <span class="meta-tag">🔤 {interaction.language}</span>
                {/if}
                {#if interaction.lines_changed}
                  <span class="meta-tag">±{interaction.lines_changed} lines</span>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Recent Code Patterns -->
    {#if patterns.length > 0}
      <section class="section" aria-labelledby="patterns-heading">
        <h2 class="section-title" id="patterns-heading"><span aria-hidden="true">💻</span> Recent Code Patterns</h2>
        <div class="patterns-list" role="list" aria-label="Recent coding patterns detected">
          {#each patterns as pattern (pattern.id || pattern.timestamp)}
            <article class="pattern-item" role="listitem">
              <div class="pattern-header">
                <span class="pattern-lang">{pattern.language || 'Unknown'}</span>
                <span class="pattern-type">{pattern.edit_type || 'Edit'}</span>
                <span class="pattern-time">{formatTime(pattern.timestamp)}</span>
              </div>
              <div class="pattern-stats">
                <span class="pattern-stat">+{pattern.lines_added || 0} / -{pattern.lines_removed || 0}</span>
                {#if pattern.indent_style}
                  <span class="pattern-stat">Indent: {pattern.indent_style} ({pattern.indent_size || 2})</span>
                {/if}
                {#if pattern.uses_types}
                  <span class="pattern-badge">TypeScript</span>
                {/if}
                {#if pattern.uses_tests}
                  <span class="pattern-badge">Tests</span>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .insights-panel {
    padding: 8px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .controls {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 16px;
    margin-bottom: 8px;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .auto-refresh {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .btn-refresh, .btn-export {
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 3px;
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-refresh:hover, .btn-export:hover {
    filter: brightness(1.2);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-refresh:focus,
  .btn-export:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .last-update {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted);
  }

  .empty-state {
    text-align: center;
    padding: 64px 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
  }

  .empty-icon {
    font-size: 11px;
    margin-bottom: 8px;
  }

  .empty-state h2 {
    color: var(--accent);
    margin-bottom: 6px;
  }

  .empty-state p {
    color: var(--text-muted);
    max-width: 600px;
    margin: 0 auto 32px;
  }

  .empty-info {
    max-width: 800px;
    margin: 0 auto;
    text-align: left;
    padding: 8px;
    background: var(--bg);
    border-radius: 4px;
  }

  .empty-info h3 {
    color: var(--accent);
    margin: 24px 0 12px 0;
    font-size: 11px;
  }

  .empty-info h3:first-child {
    margin-top: 0;
  }

  .empty-info ul {
    margin: 0 0 24px 20px;
    color: var(--text);
  }

  .empty-info li {
    margin-bottom: 8px;
    line-height: 1.6;
  }

  .empty-info code {
    background: var(--surface);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--mono);
    font-size: 13px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 8px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stat-icon {
    font-size: 11px;
  }

  .stat-content {
    flex: 1;
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 600;
    color: var(--accent);
    font-family: var(--mono);
    margin-bottom: 4px;
  }

  .stat-desc {
    font-size: 11px;
    color: var(--text-muted);
  }

  .section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 8px;
    margin-bottom: 8px;
  }

  .section-title {
    margin: 0 0 20px 0;
    font-size: 12px;
    color: var(--accent);
  }

  .languages-grid, .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }

  .language-card, .project-card {
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .language-name, .project-name {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--text);
  }

  .language-count, .project-count {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .language-bar, .project-bar {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  .language-bar-fill, .project-bar-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s;
  }

  .chart-container {
    position: relative;
    width: 100%;
    padding: 8px;
  }

  .chart-container canvas {
    display: block;
    max-width: 100%;
    height: 100%;
  }

  .interactions-list, .patterns-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .interaction-item, .pattern-item {
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .interaction-header, .pattern-header {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .interaction-project, .pattern-lang {
    font-weight: 600;
    color: var(--accent);
  }

  .interaction-agent, .pattern-type {
    font-size: 12px;
    padding: 2px 8px;
    background: var(--surface);
    border-radius: 3px;
    color: var(--text-muted);
  }

  .interaction-time, .pattern-time {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted);
  }

  .interaction-prompt {
    color: var(--text);
    font-size: 11px;
    line-height: 1.6;
    margin-bottom: 8px;
  }

  .interaction-meta, .pattern-stats {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .meta-tag, .pattern-stat {
    font-size: 11px;
    padding: 2px 8px;
    background: var(--surface);
    border-radius: 3px;
    color: var(--text-muted);
  }

  .pattern-badge {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--accent);
    color: white;
    border-radius: 4px;
    font-weight: 600;
  }
</style>
