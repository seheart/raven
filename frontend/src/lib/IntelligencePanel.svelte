<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatDateTime, getTimeAgo } from './timeFormat.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';
  import { activeProject } from './projectStore.js';

  const API_BASE = API_CONFIG.API_BASE;

  let agentProfiles = [];
  let observations = [];
  let sessionStories = [];
  let patternMatches = [];
  let projectMemories = [];
  let agentSummary = null;
  let contextSnapshot = null;
  let loading = true;
  let error = null;
  let lastUpdate = new Date();
  let activeTab = 'profiles'; // profiles, observations, stories, patterns, memory, agents

  // WebSocket handlers
  const handleDataUpdate = async () => {
    await loadIntelligenceData();
  };

  onMount(async () => {
    await loadIntelligenceData();

    websocketService.connect();
    websocketService.on('file-changed', handleDataUpdate);
    websocketService.on('project-switched', handleDataUpdate);
  });

  onDestroy(() => {
    websocketService.off('file-changed', handleDataUpdate);
    websocketService.off('project-switched', handleDataUpdate);
  });

  async function loadIntelligenceData() {
    try {
      loading = true;
      const project = $activeProject || 'raven';

      const [
        profilesRes,
        observationsRes,
        storiesRes,
        patternsRes,
        memoriesRes,
        agentSummaryRes,
        snapshotRes
      ] = await Promise.all([
        fetch(`${API_BASE}/agent-profiles?project=${project}`),
        fetch(`${API_BASE}/observations?project=${project}`),
        fetch(`${API_BASE}/session/stories?project=${project}&limit=5`),
        fetch(`${API_BASE}/patterns/matches?project=${project}&limit=5`),
        fetch(`${API_BASE}/memory/important?project=${project}&limit=10`),
        fetch(`${API_BASE}/agents/summary?project=${project}&hours=24`),
        fetch(`${API_BASE}/context/snapshot?project=${project}`)
      ]);

      if (
        !profilesRes.ok ||
        !observationsRes.ok ||
        !storiesRes.ok ||
        !patternsRes.ok ||
        !memoriesRes.ok ||
        !agentSummaryRes.ok
      ) {
        throw new Error('Failed to fetch intelligence data');
      }

      const profilesData = await profilesRes.json();
      const observationsData = await observationsRes.json();
      const storiesData = await storiesRes.json();
      const patternsData = await patternsRes.json();
      const memoriesData = await memoriesRes.json();
      const agentSummaryData = await agentSummaryRes.json();
      const snapshotData = await snapshotRes.json();

      agentProfiles = profilesData.profiles || [];
      observations = observationsData.observations || [];
      sessionStories = storiesData.stories || [];
      patternMatches = patternsData.matches || [];
      projectMemories = memoriesData.memories || [];
      agentSummary = agentSummaryData.summary;
      contextSnapshot = snapshotData.snapshot;

      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load intelligence data:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function getMoodEmoji(mood) {
    const moods = {
      aggressive: '🔴',
      conservative: '🟢',
      productive: '🟡',
      normal: '⚪',
      challenging: '🟠'
    };
    return moods[mood] || '⚪';
  }

  function getSeverityColor(severity) {
    const colors = {
      high: '#ef4444',
      medium: '#f59e0b',
      low: '#3b82f6',
      positive: '#10b981',
      info: '#6366f1'
    };
    return colors[severity] || '#6b7280';
  }

  $: timeSinceUpdate = getTimeAgo(lastUpdate);
</script>

<div class="intelligence-panel">
  <div class="panel-header">
    <div class="header-left">
      <h2>🧠 Intelligence Dashboard</h2>
      <p class="subtitle">
        AI behavior • Patterns • Session insights • Observations • Project memory • Cross-agent
        intel
      </p>
    </div>
    <div class="header-right">
      <span class="last-update">Updated: {timeSinceUpdate}</span>
      <button class="btn-primary" on:click={loadIntelligenceData}>↻ Refresh</button>
    </div>
  </div>

  <!-- Tab Navigation -->
  <div class="tab-nav">
    <button
      class="tab-button"
      class:active={activeTab === 'profiles'}
      on:click={() => (activeTab = 'profiles')}
    >
      📊 Agent Profiles
    </button>
    <button
      class="tab-button"
      class:active={activeTab === 'observations'}
      on:click={() => (activeTab = 'observations')}
    >
      👁️ Observations
    </button>
    <button
      class="tab-button"
      class:active={activeTab === 'stories'}
      on:click={() => (activeTab = 'stories')}
    >
      📖 Session Stories
    </button>
    <button
      class="tab-button"
      class:active={activeTab === 'patterns'}
      on:click={() => (activeTab = 'patterns')}
    >
      🔍 Pattern Matches
    </button>
    <button
      class="tab-button"
      class:active={activeTab === 'memory'}
      on:click={() => (activeTab = 'memory')}
    >
      💾 Project Memory
    </button>
    <button
      class="tab-button"
      class:active={activeTab === 'agents'}
      on:click={() => (activeTab = 'agents')}
    >
      🤝 Cross-Agent Intel
    </button>
  </div>

  {#if loading}
    <LoadingSkeleton />
  {:else if error}
    <div class="error-state">
      <p>❌ Error: {error}</p>
      <button on:click={loadIntelligenceData}>Retry</button>
    </div>
  {:else}
    <!-- Agent Profiles Tab -->
    {#if activeTab === 'profiles'}
      <div class="section">
        <h3>Agent Behavior Profiles</h3>
        {#if agentProfiles.length === 0}
          <div class="empty-box">
            <p>No agent activity detected yet</p>
            <p class="hint">Profiles will appear as AI agents make changes</p>
          </div>
        {:else}
          <div class="profiles-grid">
            {#each agentProfiles as profile (profile.agent)}
              <div class="profile-card">
                <div class="profile-header">
                  <div class="agent-name">{profile.agent}</div>
                  <div class="mood-badge">
                    <span class="mood-emoji">{getMoodEmoji(profile.mood)}</span>
                    <span class="mood-label">{profile.mood}</span>
                  </div>
                </div>

                {#if profile.moodReason}
                  <div class="mood-reason">{profile.moodReason}</div>
                {/if}

                {#if profile.behaviorChanges && profile.behaviorChanges.length > 0}
                  <div class="behavior-changes">
                    <div class="changes-title">Behavior Changes:</div>
                    {#each profile.behaviorChanges as change (change.metric)}
                      <div class="change-item">
                        <span class="change-metric">{change.metric.replace(/_/g, ' ')}</span>
                        <span class="change-message">{change.message}</span>
                      </div>
                    {/each}
                  </div>
                {/if}

                {#if profile.today && Object.keys(profile.today).length > 0}
                  <div class="stats-row">
                    <div class="stat">
                      <div class="stat-value">{profile.today.changes_count || 0}</div>
                      <div class="stat-label">Changes Today</div>
                    </div>
                    <div class="stat">
                      <div class="stat-value">{profile.today.avg_change_size || 0}</div>
                      <div class="stat-label">Avg Size</div>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Observations Tab -->
    {#if activeTab === 'observations'}
      <div class="section">
        <h3>Contextual Observations</h3>
        {#if observations.length === 0}
          <div class="empty-box">
            <p>✅ Everything looks normal!</p>
            <p class="hint">Raven will notice patterns and offer insights as you work</p>
          </div>
        {:else}
          <div class="observations-list">
            {#each observations as obs (obs.type + obs.message)}
              <div
                class="observation-card"
                style="border-left-color: {getSeverityColor(obs.severity)}"
              >
                <div class="observation-message">{obs.message}</div>
                {#if obs.data}
                  <div class="observation-data">
                    {#if obs.data.editCount}
                      <span class="data-badge">Edits: {obs.data.editCount}</span>
                    {/if}
                    {#if obs.data.changeCount}
                      <span class="data-badge">Changes: {obs.data.changeCount}</span>
                    {/if}
                    {#if obs.data.rollbackCount}
                      <span class="data-badge">Rollbacks: {obs.data.rollbackCount}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Session Stories Tab -->
    {#if activeTab === 'stories'}
      <div class="section">
        <h3>Session Stories</h3>
        {#if sessionStories.length === 0}
          <div class="empty-box">
            <p>No session stories yet</p>
            <p class="hint">Stories are generated as you complete coding sessions</p>
          </div>
        {:else}
          <div class="stories-list">
            {#each sessionStories as story (story.session_id)}
              <div class="story-card">
                <div class="story-header">
                  <span class="story-mood">{getMoodEmoji(story.mood)}</span>
                  <div class="story-info">
                    <div class="story-title">Session Story</div>
                    <div class="story-time">{formatDateTime(story.created_at)}</div>
                  </div>
                </div>

                <div class="story-narrative">{story.narrative}</div>

                {#if story.achievements && story.achievements.length > 0}
                  <div class="achievements">
                    <div class="achievements-title">🏆 Achievements:</div>
                    <div class="achievement-tags">
                      {#each story.achievements as achievement (achievement)}
                        <span class="achievement-tag">{achievement}</span>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if story.stats}
                  <div class="story-stats">
                    <span class="stat-item">⏱️ {story.stats.durationHours}h</span>
                    <span class="stat-item">✏️ {story.stats.totalChanges} changes</span>
                    <span class="stat-item">🎯 Focus: {story.stats.focusScore}/100</span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Pattern Matches Tab -->
    {#if activeTab === 'patterns'}
      <div class="section">
        <h3>Pattern Matches</h3>
        {#if patternMatches.length === 0}
          <div class="empty-box">
            <p>No pattern matches found</p>
            <p class="hint">Raven learns from history to predict outcomes</p>
          </div>
        {:else}
          <div class="patterns-list">
            {#each patternMatches as match (match.id)}
              <div class="pattern-card">
                <div class="pattern-header">
                  <span class="similarity-badge">{Math.round(match.similarity_score)}% match</span>
                  <div class="pattern-info">
                    <div class="pattern-file">{match.current_filepath}</div>
                    <div class="pattern-time">{formatDateTime(match.current_timestamp)}</div>
                  </div>
                </div>

                <div class="pattern-match">
                  <div class="match-label">Similar to:</div>
                  <div class="matched-file">{match.matched_filepath}</div>
                  <div class="matched-time">{formatDateTime(match.matched_timestamp)}</div>
                </div>

                {#if match.match_reasons}
                  <div class="match-reasons">
                    {#each JSON.parse(match.match_reasons) as reason (reason)}
                      <span class="reason-tag">{reason}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Project Memory Tab -->
    {#if activeTab === 'memory'}
      <div class="section">
        <h3>Project Memory</h3>
        {#if projectMemories.length === 0}
          <div class="empty-box">
            <p>No memories recorded yet</p>
            <p class="hint">Important decisions and milestones will appear here</p>
          </div>
        {:else}
          <div class="memories-list">
            {#each projectMemories as memory (memory.id)}
              <div class="memory-card">
                <div class="memory-header">
                  <div class="memory-type-badge" class:high={memory.importance === 'high'}>
                    {memory.memory_type}
                  </div>
                  <div class="memory-time">{formatDateTime(memory.created_at)}</div>
                </div>
                <h4 class="memory-title">{memory.title}</h4>
                {#if memory.description}
                  <p class="memory-description">{memory.description}</p>
                {/if}
                {#if memory.tags && memory.tags.length > 0}
                  <div class="memory-tags">
                    {#each memory.tags as tag (tag)}
                      <span class="tag">{tag}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        {#if contextSnapshot}
          <div class="context-snapshot">
            <h4>📸 Today's Context Snapshot</h4>
            {#if contextSnapshot.main_focus}
              <div class="snapshot-item">
                <strong>Main Focus:</strong>
                {contextSnapshot.main_focus}
              </div>
            {/if}
            {#if contextSnapshot.active_files && contextSnapshot.active_files.length > 0}
              <div class="snapshot-item">
                <strong>Active Files:</strong>
                <div class="file-list">
                  {#each contextSnapshot.active_files.slice(0, 5) as file (file)}
                    <span class="file-name">{file.split('/').pop()}</span>
                  {/each}
                </div>
              </div>
            {/if}
            {#if contextSnapshot.achievements && contextSnapshot.achievements.length > 0}
              <div class="snapshot-item">
                <strong>🏆 Achievements:</strong>
                <ul>
                  {#each contextSnapshot.achievements as achievement (achievement)}
                    <li>{achievement}</li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if contextSnapshot.challenges && contextSnapshot.challenges.length > 0}
              <div class="snapshot-item">
                <strong>⚠️ Challenges:</strong>
                <ul>
                  {#each contextSnapshot.challenges as challenge (challenge)}
                    <li>{challenge}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Cross-Agent Intelligence Tab -->
    {#if activeTab === 'agents'}
      <div class="section">
        <h3>Cross-Agent Intelligence</h3>
        {#if agentSummary}
          <div class="agent-summary-card">
            <div class="summary-header">
              <h4>Collaboration Health Score</h4>
              <div
                class="health-score"
                class:good={agentSummary.collaboration_health >= 70}
                class:medium={agentSummary.collaboration_health >= 40 &&
                  agentSummary.collaboration_health < 70}
                class:poor={agentSummary.collaboration_health < 40}
              >
                {agentSummary.collaboration_health}/100
              </div>
            </div>

            <div class="summary-stats">
              <div class="stat-item">
                <div class="stat-value">{agentSummary.active_agents_count}</div>
                <div class="stat-label">Active Agents</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{agentSummary.handoffs_count}</div>
                <div class="stat-label">Handoffs</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{agentSummary.file_conflicts_count}</div>
                <div class="stat-label">File Conflicts</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{agentSummary.agent_conflicts_count}</div>
                <div class="stat-label">Agent Conflicts</div>
              </div>
            </div>
          </div>

          {#if agentSummary.active_agents && agentSummary.active_agents.length > 0}
            <div class="active-agents-section">
              <h4>Active Agents (Last 24h)</h4>
              <div class="agents-grid">
                {#each agentSummary.active_agents as agent (agent.agent)}
                  <div class="agent-activity-card">
                    <div class="agent-name">{agent.agent}</div>
                    <div class="agent-stats">
                      <span>{agent.activity_count} changes</span>
                    </div>
                    <div class="agent-times">
                      <div class="time-label">Last active:</div>
                      <div class="time-value">{getTimeAgo(new Date(agent.last_activity))}</div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if agentSummary.recent_handoffs && agentSummary.recent_handoffs.length > 0}
            <div class="handoffs-section">
              <h4>Recent Agent Handoffs</h4>
              <div class="handoffs-list">
                {#each agentSummary.recent_handoffs as handoff (handoff.filepath + handoff.first_activity_to)}
                  <div class="handoff-card">
                    <div class="handoff-agents">
                      <span class="from-agent">{handoff.from_agent}</span>
                      <span class="arrow">→</span>
                      <span class="to-agent">{handoff.to_agent}</span>
                    </div>
                    <div class="handoff-file">{handoff.filepath.split('/').pop()}</div>
                    <div
                      class="handoff-type"
                      class:immediate={handoff.handoff_type === 'immediate'}
                    >
                      {handoff.handoff_type} ({handoff.gap_minutes}m gap)
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if agentSummary.critical_files && agentSummary.critical_files.length > 0}
            <div class="conflicts-section">
              <h4>Files with Multiple Agents</h4>
              <div class="conflicts-list">
                {#each agentSummary.critical_files as conflict (conflict.filepath)}
                  <div class="conflict-card">
                    <div class="conflict-file">{conflict.filepath.split('/').pop()}</div>
                    <div class="conflict-agents">
                      <strong>{conflict.agent_count} agents:</strong>
                      {conflict.agents.join(', ')}
                    </div>
                    <div class="conflict-stats">
                      <span
                        class="severity"
                        class:high={conflict.conflict_severity === 'high'}
                        class:medium={conflict.conflict_severity === 'medium'}
                      >
                        {conflict.conflict_severity} severity
                      </span>
                      <span>{conflict.total_changes} total changes</span>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {:else}
          <div class="empty-box">
            <p>No cross-agent activity detected</p>
            <p class="hint">Agent collaboration data will appear here</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Info Box -->
    <div class="info-box">
      <h4>🧠 About Intelligence Dashboard</h4>
      <ul>
        <li>
          <strong>Agent Profiles:</strong> Tracks each AI agent's behavior patterns and moods
        </li>
        <li>
          <strong>Observations:</strong> Contextual insights about your work patterns and flow states
        </li>
        <li>
          <strong>Session Stories:</strong> Narratives of your coding sessions with achievements
        </li>
        <li>
          <strong>Pattern Matches:</strong> Similar past changes that predict potential outcomes
        </li>
        <li>
          <strong>Project Memory:</strong> Important decisions, milestones, and context snapshots
        </li>
        <li>
          <strong>Cross-Agent Intel:</strong> Collaboration analysis and agent interaction patterns
        </li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .intelligence-panel {
    padding: var(--space-lg);
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-lg);
  }

  .header-left h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 24px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .header-right {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .last-update {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .btn-primary {
    padding: 8px 16px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    background: var(--accent);
    color: white;
    border: 1px solid var(--accent);
    transition: all 0.2s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .tab-nav {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
    border-bottom: 2px solid var(--border);
  }

  .tab-button {
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab-button:hover {
    color: var(--text);
  }

  .tab-button.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .section {
    margin-bottom: var(--space-xl);
  }

  .section h3 {
    margin: 0 0 var(--space-md) 0;
    font-size: 18px;
    color: var(--text);
  }

  /* Agent Profiles */
  .profiles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-md);
  }

  .profile-card {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: all 0.2s;
  }

  .profile-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .profile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
  }

  .agent-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  .mood-badge {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 4px 8px;
    background: var(--bg);
    border-radius: 4px;
  }

  .mood-emoji {
    font-size: 16px;
  }

  .mood-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: capitalize;
  }

  .mood-reason {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: var(--space-sm);
  }

  .behavior-changes {
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg);
    border-radius: var(--radius);
  }

  .changes-title {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: var(--space-xs);
    font-weight: 600;
  }

  .change-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: var(--space-xs);
  }

  .change-metric {
    font-size: 12px;
    color: var(--accent);
    text-transform: capitalize;
    font-weight: 500;
  }

  .change-message {
    font-size: 12px;
    color: var(--text);
  }

  .stats-row {
    display: flex;
    gap: var(--space-md);
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
  }

  .stat {
    text-align: center;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .stat-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
  }

  /* Observations */
  .observations-list,
  .stories-list,
  .patterns-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .observation-card {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid;
    border-radius: var(--radius);
  }

  .observation-message {
    font-size: 14px;
    color: var(--text);
    margin-bottom: var(--space-sm);
  }

  .observation-data {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .data-badge {
    padding: 2px 8px;
    background: var(--bg);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--mono);
    color: var(--muted);
  }

  /* Session Stories */
  .story-card {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .story-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-sm);
  }

  .story-mood {
    font-size: 24px;
  }

  .story-info {
    flex: 1;
  }

  .story-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .story-time {
    font-size: 12px;
    color: var(--muted);
  }

  .story-narrative {
    font-size: 14px;
    color: var(--text);
    line-height: 1.6;
    margin-bottom: var(--space-sm);
  }

  .achievements {
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    background: var(--bg);
    border-radius: var(--radius);
  }

  .achievements-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: var(--space-xs);
  }

  .achievement-tags {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .achievement-tag {
    padding: 4px 8px;
    background: var(--accent);
    color: white;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
  }

  .story-stats {
    display: flex;
    gap: var(--space-md);
    margin-top: var(--space-sm);
    padding-top: var(--space-sm);
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
  }

  .stat-item {
    font-family: var(--mono);
  }

  /* Pattern Matches */
  .pattern-card {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .pattern-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    margin-bottom: var(--space-sm);
  }

  .similarity-badge {
    padding: 4px 12px;
    background: var(--accent);
    color: white;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--mono);
  }

  .pattern-info {
    flex: 1;
  }

  .pattern-file {
    font-size: 14px;
    font-family: var(--mono);
    color: var(--text);
    font-weight: 600;
  }

  .pattern-time {
    font-size: 12px;
    color: var(--muted);
  }

  .pattern-match {
    padding: var(--space-sm);
    background: var(--bg);
    border-radius: var(--radius);
    margin-bottom: var(--space-sm);
  }

  .match-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .matched-file {
    font-size: 13px;
    font-family: var(--mono);
    color: var(--text);
  }

  .matched-time {
    font-size: 11px;
    color: var(--muted);
  }

  .match-reasons {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .reason-tag {
    padding: 2px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 11px;
    color: var(--muted);
  }

  /* Common */
  .empty-box {
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .empty-box p {
    margin: var(--space-sm) 0;
    color: var(--text);
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }

  .error-state {
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .error-state p {
    margin: 0 0 var(--space-md) 0;
    color: var(--text);
  }

  .error-state button {
    padding: 8px 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .info-box {
    padding: var(--space-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .info-box h4 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 14px;
    color: var(--text);
  }

  .info-box ul {
    margin: 0;
    padding-left: var(--space-lg);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
  }

  .info-box li {
    margin-bottom: 4px;
  }

  .info-box strong {
    color: var(--text);
  }
</style>
