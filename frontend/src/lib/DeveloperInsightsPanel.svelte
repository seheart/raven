<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';
  import { notifications } from './notificationService.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { formatTime } from './timeFormat.js';
  import { websocketService } from './websocket.js';

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
  let autoRefreshInterval = null;

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

  onMount(() => {
    loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
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

    <!-- Hourly Activity Heatmap -->
    {#if stats.hourly_activity.length > 0}
      <section class="section" aria-labelledby="heatmap-heading">
        <h2 class="section-title" id="heatmap-heading"><span aria-hidden="true">🕐</span> Coding Hours Heatmap</h2>
        <div class="heatmap" role="img" aria-label="24-hour coding activity heatmap showing most active hours">
          {#each Array(24).fill(0).map((_, i) => i) as hour (hour)}
            {@const activity = stats.hourly_activity.find(a => a.hour_of_day === hour)}
            {@const count = activity ? activity.count : 0}
            {@const maxCount = Math.max(...stats.hourly_activity.map(a => a.count))}
            {@const intensity = maxCount > 0 ? (count / maxCount) : 0}
            <div
              class="heatmap-cell"
              class:active={count > 0}
              style="background: color-mix(in srgb, var(--accent) {intensity * 100}%, transparent)"
              title="{hour}:00 - {count} events"
              aria-hidden="true"
            >
              <div class="hour-label">{hour}</div>
              {#if count > 0}
                <div class="hour-count">{count}</div>
              {/if}
            </div>
          {/each}
        </div>
        <div class="heatmap-legend" aria-hidden="true">
          <span>Midnight</span>
          <span>Noon</span>
          <span>Midnight</span>
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

  .heatmap {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: 4px;
    margin-bottom: 12px;
  }

  .heatmap-cell {
    aspect-ratio: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .heatmap-cell:hover {
    transform: scale(1.1);
    z-index: 10;
  }

  .hour-label {
    font-size: 11px;
    color: var(--text-muted);
  }

  .hour-count {
    font-size: 10px;
    font-weight: 600;
    color: white;
  }

  .heatmap-legend {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-muted);
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
