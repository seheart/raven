<script>
  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';
  import { projectFilter } from '../projectFilterStore.js';
  import { websocketService } from '../services/websocket.js';
  import { formatDateTime, getTimeAgo } from '../timeFormat.js';
  import { logger } from '../logger.js';

  // Svelte 5 reactive state
  let agentProfiles = $state([]);
  let observations = $state([]);
  let sessionStories = $state([]);
  let patternMatches = $state([]);
  let projectMemories = $state([]);
  let agentSummary = $state(null);
  let contextSnapshot = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let lastUpdate = $state(new Date());
  let activeTab = $state('profiles'); // profiles, observations, stories, patterns, memory, agents

  // Derived reactive state
  let timeSinceUpdate = $derived(getTimeAgo(lastUpdate));

  // Helper function: Get mood emoji
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

  // Helper function: Get severity color (Tailwind classes)
  function getSeverityColor(severity) {
    const colors = {
      high: 'border-red-500',
      medium: 'border-orange-500',
      low: 'border-blue-500',
      positive: 'border-green-500',
      info: 'border-indigo-500'
    };
    return colors[severity] || 'border-gray-500';
  }

  // Load intelligence data from API
  async function loadIntelligenceData() {
    try {
      loading = true;
      const project = $projectFilter || 'raven';

      const [
        profilesData,
        observationsData,
        storiesData,
        patternsData,
        memoriesData,
        agentSummaryData,
        snapshotData
      ] = await Promise.all([
        api.get(`/agent-profiles?project=${project}`),
        api.get(`/observations?project=${project}`),
        api.get(`/session/stories?project=${project}&limit=5`),
        api.get(`/patterns/matches?project=${project}&limit=5`),
        api.get(`/memory/important?project=${project}&limit=10`),
        api.get(`/agents/summary?project=${project}&hours=24`),
        api.get(`/context/snapshot?project=${project}`)
      ]);

      agentProfiles = profilesData.profiles || [];
      observations = observationsData.observations || [];
      sessionStories = storiesData.stories || [];
      patternMatches = patternsData.matches || [];
      projectMemories = memoriesData.memories || [];
      agentSummary = agentSummaryData.summary;
      contextSnapshot = snapshotData.snapshot;

      lastUpdate = new Date();
      error = null;
    } catch {
      logger.error('Failed to load intelligence data:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // WebSocket handler for real-time updates
  const handleDataUpdate = async () => {
    await loadIntelligenceData();
  };

  onMount(async () => {
    await loadIntelligenceData();

    websocketService.connect();
    websocketService.on('file-changed', handleDataUpdate);
    websocketService.on('project-switched', handleDataUpdate);

    // Cleanup on unmount
    return () => {
      websocketService.off('file-changed', handleDataUpdate);
      websocketService.off('project-switched', handleDataUpdate);
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Panel Header -->
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">
          🧠 Intelligence Dashboard
        </h1>
        <p class="text-sm text-[var(--muted)] font-sans">
          AI behavior • Patterns • Session insights • Observations • Project memory • Cross-agent
          intel
        </p>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-xs text-[var(--muted)] font-mono">Updated: {timeSinceUpdate}</span>
        <button
          onclick={loadIntelligenceData}
          class="px-4 py-2 bg-[var(--accent)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          ↻ Refresh
        </button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex gap-2 mb-6 border-b-2 border-[var(--border)]">
      <button
        onclick={() => (activeTab = 'profiles')}
        class="px-4 py-2 bg-transparent border-b-2 text-sm font-medium transition-all -mb-0.5 {activeTab ===
        'profiles'
          ? 'text-[var(--accent)] border-[var(--accent)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'}"
      >
        📊 Agent Profiles
      </button>
      <button
        onclick={() => (activeTab = 'observations')}
        class="px-4 py-2 bg-transparent border-b-2 text-sm font-medium transition-all -mb-0.5 {activeTab ===
        'observations'
          ? 'text-[var(--accent)] border-[var(--accent)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'}"
      >
        👁️ Observations
      </button>
      <button
        onclick={() => (activeTab = 'stories')}
        class="px-4 py-2 bg-transparent border-b-2 text-sm font-medium transition-all -mb-0.5 {activeTab ===
        'stories'
          ? 'text-[var(--accent)] border-[var(--accent)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'}"
      >
        📖 Session Stories
      </button>
      <button
        onclick={() => (activeTab = 'patterns')}
        class="px-4 py-2 bg-transparent border-b-2 text-sm font-medium transition-all -mb-0.5 {activeTab ===
        'patterns'
          ? 'text-[var(--accent)] border-[var(--accent)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'}"
      >
        🔍 Pattern Matches
      </button>
      <button
        onclick={() => (activeTab = 'memory')}
        class="px-4 py-2 bg-transparent border-b-2 text-sm font-medium transition-all -mb-0.5 {activeTab ===
        'memory'
          ? 'text-[var(--accent)] border-[var(--accent)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'}"
      >
        💾 Project Memory
      </button>
      <button
        onclick={() => (activeTab = 'agents')}
        class="px-4 py-2 bg-transparent border-b-2 text-sm font-medium transition-all -mb-0.5 {activeTab ===
        'agents'
          ? 'text-[var(--accent)] border-[var(--accent)]'
          : 'text-[var(--muted)] border-transparent hover:text-[var(--text)]'}"
      >
        🤝 Cross-Agent Intel
      </button>
    </div>

    {#if loading}
      <!-- Loading State -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-16 text-center">
        <div class="text-4xl mb-3">⏳</div>
        <p class="text-[var(--text)] font-sans">Loading intelligence data...</p>
      </div>
    {:else if error}
      <!-- Error State -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-16 text-center">
        <p class="text-[var(--text)] font-sans mb-4">❌ Error: {error}</p>
        <button
          onclick={loadIntelligenceData}
          class="px-4 py-2 bg-[var(--accent)] text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Retry
        </button>
      </div>
    {:else}
      <!-- Agent Profiles Tab -->
      {#if activeTab === 'profiles'}
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-[var(--text)] mb-4">Agent Behavior Profiles</h3>
          {#if agentProfiles.length === 0}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--text)] font-sans mb-2">No agent activity detected yet</p>
              <p class="text-sm text-[var(--muted)] font-sans">
                Profiles will appear as AI agents make changes
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each agentProfiles as profile (profile.agent)}
                <div
                  class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-lg transition-shadow"
                >
                  <div class="flex justify-between items-center mb-2">
                    <div class="text-base font-semibold text-[var(--text)]">{profile.agent}</div>
                    <div class="flex items-center gap-2 px-2 py-1 bg-[var(--bg)] rounded">
                      <span class="text-base">{getMoodEmoji(profile.mood)}</span>
                      <span class="text-xs text-[var(--muted)] capitalize">{profile.mood}</span>
                    </div>
                  </div>

                  {#if profile.moodReason}
                    <div class="text-sm text-[var(--muted)] mb-2">{profile.moodReason}</div>
                  {/if}

                  {#if profile.behaviorChanges && profile.behaviorChanges.length > 0}
                    <div class="mt-2 p-2 bg-[var(--bg)] rounded">
                      <div class="text-xs text-[var(--muted)] uppercase font-semibold mb-1">
                        Behavior Changes:
                      </div>
                      {#each profile.behaviorChanges as change (change.metric)}
                        <div class="flex flex-col gap-0.5 mb-1">
                          <span class="text-xs text-[var(--accent)] capitalize font-medium">
                            {change.metric.replace(/_/g, ' ')}
                          </span>
                          <span class="text-xs text-[var(--text)]">{change.message}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  {#if profile.today && Object.keys(profile.today).length > 0}
                    <div class="flex gap-4 mt-2 pt-2 border-t border-[var(--border)]">
                      <div class="text-center">
                        <div class="text-lg font-bold font-mono text-[var(--text)]">
                          {profile.today.changes_count || 0}
                        </div>
                        <div class="text-[10px] text-[var(--muted)] uppercase">Changes Today</div>
                      </div>
                      <div class="text-center">
                        <div class="text-lg font-bold font-mono text-[var(--text)]">
                          {profile.today.avg_change_size || 0}
                        </div>
                        <div class="text-[10px] text-[var(--muted)] uppercase">Avg Size</div>
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
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-[var(--text)] mb-4">Contextual Observations</h3>
          {#if observations.length === 0}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--text)] font-sans mb-2">✅ Everything looks normal!</p>
              <p class="text-sm text-[var(--muted)] font-sans">
                Raven will notice patterns and offer insights as you work
              </p>
            </div>
          {:else}
            <div class="flex flex-col gap-4">
              {#each observations as obs (obs.type + obs.message)}
                <div
                  class="bg-[var(--surface)] border border-[var(--border)] border-l-4 {getSeverityColor(
                    obs.severity
                  )} rounded-lg p-4"
                >
                  <div class="text-sm text-[var(--text)] mb-2">{obs.message}</div>
                  {#if obs.data}
                    <div class="flex gap-2 flex-wrap">
                      {#if obs.data.editCount}
                        <span
                          class="px-2 py-0.5 bg-[var(--bg)] rounded text-xs font-mono text-[var(--muted)]"
                        >
                          Edits: {obs.data.editCount}
                        </span>
                      {/if}
                      {#if obs.data.changeCount}
                        <span
                          class="px-2 py-0.5 bg-[var(--bg)] rounded text-xs font-mono text-[var(--muted)]"
                        >
                          Changes: {obs.data.changeCount}
                        </span>
                      {/if}
                      {#if obs.data.rollbackCount}
                        <span
                          class="px-2 py-0.5 bg-[var(--bg)] rounded text-xs font-mono text-[var(--muted)]"
                        >
                          Rollbacks: {obs.data.rollbackCount}
                        </span>
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
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-[var(--text)] mb-4">Session Stories</h3>
          {#if sessionStories.length === 0}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--text)] font-sans mb-2">No session stories yet</p>
              <p class="text-sm text-[var(--muted)] font-sans">
                Stories are generated as you complete coding sessions
              </p>
            </div>
          {:else}
            <div class="flex flex-col gap-4">
              {#each sessionStories as story (story.session_id)}
                <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                  <div class="flex items-center gap-4 mb-2">
                    <span class="text-2xl">{getMoodEmoji(story.mood)}</span>
                    <div class="flex-1">
                      <div class="text-sm font-semibold text-[var(--text)]">Session Story</div>
                      <div class="text-xs text-[var(--muted)]">
                        {formatDateTime(story.created_at)}
                      </div>
                    </div>
                  </div>

                  <div class="text-sm text-[var(--text)] leading-relaxed mb-2">
                    {story.narrative}
                  </div>

                  {#if story.achievements && story.achievements.length > 0}
                    <div class="mt-2 p-2 bg-[var(--bg)] rounded">
                      <div class="text-xs font-semibold text-[var(--text)] mb-1">
                        🏆 Achievements:
                      </div>
                      <div class="flex gap-1 flex-wrap">
                        {#each story.achievements as achievement (achievement)}
                          <span
                            class="px-2 py-1 bg-[var(--accent)] text-white rounded text-[11px] font-medium"
                          >
                            {achievement}
                          </span>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if story.stats}
                    <div
                      class="flex gap-4 mt-2 pt-2 border-t border-[var(--border)] text-xs text-[var(--muted)] font-mono"
                    >
                      <span>⏱️ {story.stats.durationHours}h</span>
                      <span>✏️ {story.stats.totalChanges} changes</span>
                      <span>🎯 Focus: {story.stats.focusScore}/100</span>
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
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-[var(--text)] mb-4">Pattern Matches</h3>
          {#if patternMatches.length === 0}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--text)] font-sans mb-2">No pattern matches found</p>
              <p class="text-sm text-[var(--muted)] font-sans">
                Raven learns from history to predict outcomes
              </p>
            </div>
          {:else}
            <div class="flex flex-col gap-4">
              {#each patternMatches as match (match.id)}
                <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                  <div class="flex items-start gap-4 mb-2">
                    <span
                      class="px-3 py-1 bg-[var(--accent)] text-white rounded text-xs font-semibold font-mono"
                    >
                      {Math.round(match.similarity_score)}% match
                    </span>
                    <div class="flex-1">
                      <div class="text-sm font-mono font-semibold text-[var(--text)]">
                        {match.current_filepath}
                      </div>
                      <div class="text-xs text-[var(--muted)]">
                        {formatDateTime(match.current_timestamp)}
                      </div>
                    </div>
                  </div>

                  <div class="p-2 bg-[var(--bg)] rounded mb-2">
                    <div class="text-[11px] text-[var(--muted)] uppercase mb-1">Similar to:</div>
                    <div class="text-sm font-mono text-[var(--text)]">{match.matched_filepath}</div>
                    <div class="text-[11px] text-[var(--muted)]">
                      {formatDateTime(match.matched_timestamp)}
                    </div>
                  </div>

                  {#if match.match_reasons}
                    <div class="flex gap-1 flex-wrap">
                      {#each JSON.parse(match.match_reasons) as reason (reason)}
                        <span
                          class="px-2 py-0.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[11px] text-[var(--muted)]"
                        >
                          {reason}
                        </span>
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
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-[var(--text)] mb-4">Project Memory</h3>
          {#if projectMemories.length === 0}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--text)] font-sans mb-2">No memories recorded yet</p>
              <p class="text-sm text-[var(--muted)] font-sans">
                Important decisions and milestones will appear here
              </p>
            </div>
          {:else}
            <div class="flex flex-col gap-4 mb-6">
              {#each projectMemories as memory (memory.id)}
                <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                  <div class="flex justify-between items-start mb-2">
                    <div
                      class="px-2 py-1 rounded text-xs font-medium {memory.importance === 'high'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg)] text-[var(--muted)]'}"
                    >
                      {memory.memory_type}
                    </div>
                    <div class="text-xs text-[var(--muted)]">
                      {formatDateTime(memory.created_at)}
                    </div>
                  </div>
                  <h4 class="text-base font-semibold text-[var(--text)] mb-1">{memory.title}</h4>
                  {#if memory.description}
                    <p class="text-sm text-[var(--text)] mb-2">{memory.description}</p>
                  {/if}
                  {#if memory.tags && memory.tags.length > 0}
                    <div class="flex gap-1 flex-wrap">
                      {#each memory.tags as tag (tag)}
                        <span
                          class="px-2 py-0.5 bg-[var(--bg)] rounded text-xs text-[var(--muted)]"
                        >
                          {tag}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if contextSnapshot}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <h4 class="text-sm font-semibold text-[var(--text)] mb-3">
                📸 Today's Context Snapshot
              </h4>
              {#if contextSnapshot.main_focus}
                <div class="mb-3">
                  <strong class="text-sm text-[var(--text)]">Main Focus:</strong>
                  <span class="text-sm text-[var(--text)] ml-1">{contextSnapshot.main_focus}</span>
                </div>
              {/if}
              {#if contextSnapshot.active_files && contextSnapshot.active_files.length > 0}
                <div class="mb-3">
                  <strong class="text-sm text-[var(--text)]">Active Files:</strong>
                  <div class="flex gap-2 flex-wrap mt-1">
                    {#each contextSnapshot.active_files.slice(0, 5) as file (file)}
                      {@const fileName = file.split('/').pop()}
                      <span
                        class="px-2 py-0.5 bg-[var(--bg)] rounded text-xs font-mono text-[var(--text)]"
                      >
                        {fileName}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
              {#if contextSnapshot.achievements && contextSnapshot.achievements.length > 0}
                <div class="mb-3">
                  <strong class="text-sm text-[var(--text)]">🏆 Achievements:</strong>
                  <ul class="list-disc list-inside mt-1 text-sm text-[var(--text)]">
                    {#each contextSnapshot.achievements as achievement (achievement)}
                      <li>{achievement}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
              {#if contextSnapshot.challenges && contextSnapshot.challenges.length > 0}
                <div>
                  <strong class="text-sm text-[var(--text)]">⚠️ Challenges:</strong>
                  <ul class="list-disc list-inside mt-1 text-sm text-[var(--text)]">
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
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-[var(--text)] mb-4">Cross-Agent Intelligence</h3>
          {#if agentSummary}
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6">
              <div class="flex justify-between items-center mb-4">
                <h4 class="text-sm font-semibold text-[var(--text)]">Collaboration Health Score</h4>
                <div
                  class="text-2xl font-bold font-mono {agentSummary.collaboration_health >= 70
                    ? 'text-green-500'
                    : agentSummary.collaboration_health >= 40
                      ? 'text-orange-500'
                      : 'text-red-500'}"
                >
                  {agentSummary.collaboration_health}/100
                </div>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="text-center">
                  <div class="text-xl font-bold text-[var(--text)]">
                    {agentSummary.active_agents_count}
                  </div>
                  <div class="text-xs text-[var(--muted)]">Active Agents</div>
                </div>
                <div class="text-center">
                  <div class="text-xl font-bold text-[var(--text)]">
                    {agentSummary.handoffs_count}
                  </div>
                  <div class="text-xs text-[var(--muted)]">Handoffs</div>
                </div>
                <div class="text-center">
                  <div class="text-xl font-bold text-[var(--text)]">
                    {agentSummary.file_conflicts_count}
                  </div>
                  <div class="text-xs text-[var(--muted)]">File Conflicts</div>
                </div>
                <div class="text-center">
                  <div class="text-xl font-bold text-[var(--text)]">
                    {agentSummary.agent_conflicts_count}
                  </div>
                  <div class="text-xs text-[var(--muted)]">Agent Conflicts</div>
                </div>
              </div>
            </div>

            {#if agentSummary.active_agents && agentSummary.active_agents.length > 0}
              <div class="mb-6">
                <h4 class="text-sm font-semibold text-[var(--text)] mb-3">
                  Active Agents (Last 24h)
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {#each agentSummary.active_agents as agent (agent.agent)}
                    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
                      <div class="text-sm font-semibold text-[var(--text)] mb-1">
                        {agent.agent}
                      </div>
                      <div class="text-xs text-[var(--muted)] mb-2">
                        {agent.activity_count} changes
                      </div>
                      <div class="text-xs text-[var(--muted)]">
                        Last active: {getTimeAgo(new Date(agent.last_activity))}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if agentSummary.recent_handoffs && agentSummary.recent_handoffs.length > 0}
              <div class="mb-6">
                <h4 class="text-sm font-semibold text-[var(--text)] mb-3">Recent Agent Handoffs</h4>
                <div class="flex flex-col gap-3">
                  {#each agentSummary.recent_handoffs as handoff (handoff.filepath + handoff.first_activity_to)}
                    {@const fileName = handoff.filepath.split('/').pop()}
                    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
                      <div class="flex items-center gap-2 mb-2">
                        <span class="text-sm font-medium text-[var(--text)]">
                          {handoff.from_agent}
                        </span>
                        <span class="text-[var(--muted)]">→</span>
                        <span class="text-sm font-medium text-[var(--text)]"
                          >{handoff.to_agent}</span
                        >
                      </div>
                      <div class="text-xs font-mono text-[var(--muted)] mb-1">{fileName}</div>
                      <div
                        class="text-xs text-[var(--muted)] {handoff.handoff_type === 'immediate'
                          ? 'text-orange-500'
                          : ''}"
                      >
                        {handoff.handoff_type} ({handoff.gap_minutes}m gap)
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if agentSummary.critical_files && agentSummary.critical_files.length > 0}
              <div class="mb-6">
                <h4 class="text-sm font-semibold text-[var(--text)] mb-3">
                  Files with Multiple Agents
                </h4>
                <div class="flex flex-col gap-3">
                  {#each agentSummary.critical_files as conflict (conflict.filepath)}
                    {@const fileName = conflict.filepath.split('/').pop()}
                    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
                      <div class="text-sm font-mono text-[var(--text)] mb-2">{fileName}</div>
                      <div class="text-xs text-[var(--muted)] mb-2">
                        <strong>{conflict.agent_count} agents:</strong>
                        {conflict.agents.join(', ')}
                      </div>
                      <div class="flex items-center gap-3 text-xs text-[var(--muted)]">
                        <span
                          class="font-medium {conflict.conflict_severity === 'high'
                            ? 'text-red-500'
                            : conflict.conflict_severity === 'medium'
                              ? 'text-orange-500'
                              : 'text-[var(--muted)]'}"
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
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center"
            >
              <p class="text-[var(--text)] font-sans mb-2">No cross-agent activity detected</p>
              <p class="text-sm text-[var(--muted)] font-sans">
                Agent collaboration data will appear here
              </p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Info Box -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
        <h4 class="text-sm font-semibold text-[var(--text)] mb-2">
          🧠 About Intelligence Dashboard
        </h4>
        <ul class="list-disc list-inside text-sm text-[var(--muted)] leading-relaxed space-y-1">
          <li>
            <strong class="text-[var(--text)]">Agent Profiles:</strong> Tracks each AI agent's behavior
            patterns and moods
          </li>
          <li>
            <strong class="text-[var(--text)]">Observations:</strong> Contextual insights about your
            work patterns and flow states
          </li>
          <li>
            <strong class="text-[var(--text)]">Session Stories:</strong> Narratives of your coding sessions
            with achievements
          </li>
          <li>
            <strong class="text-[var(--text)]">Pattern Matches:</strong> Similar past changes that predict
            potential outcomes
          </li>
          <li>
            <strong class="text-[var(--text)]">Project Memory:</strong> Important decisions, milestones,
            and context snapshots
          </li>
          <li>
            <strong class="text-[var(--text)]">Cross-Agent Intel:</strong> Collaboration analysis and
            agent interaction patterns
          </li>
        </ul>
      </div>
    {/if}
  </div>
</div>
