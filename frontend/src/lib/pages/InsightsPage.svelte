<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();

  let insights = $state([]);
  let status = $state({ available: false, generating: false, models: [] });
  let loading = $state(false);
  let generating = $state(false);
  let selectedModel = $state('');
  let windowMinutes = $state(60);
  let filterType = $state('all');

  const filteredInsights = $derived(
    filterType === 'all' ? insights : insights.filter(i => i.type === filterType)
  );

  async function loadInsights() {
    loading = true;
    try {
      const [insightsData, statusData] = await Promise.all([
        api.get('/insights?limit=50'),
        api.get('/insights/status')
      ]);
      insights = insightsData || [];
      status = statusData || { available: false, generating: false, models: [] };
      if (!selectedModel && status.models.length > 0) {
        selectedModel = status.models[0];
      }
    } catch (err) {
      console.error('Failed to load insights:', err);
    }
    loading = false;
  }

  async function setModelAndGenerate(fn) {
    generating = true;
    try {
      if (selectedModel) await api.put('/insights/model', { model: selectedModel });
      const result = await fn();
      if (result?.id) await loadInsights();
    } catch (err) {
      console.error('Generation failed:', err);
    }
    generating = false;
  }

  function generateSummary() {
    setModelAndGenerate(() => api.post('/insights/generate/summary', { windowMinutes }, { timeout: 120000 }));
  }

  function generateReview() {
    setModelAndGenerate(() => api.post('/insights/generate/review', {}, { timeout: 120000 }));
  }

  function generateDigest() {
    setModelAndGenerate(() => api.post('/insights/generate/digest', {}, { timeout: 180000 }));
  }

  function generateAgentComparison() {
    setModelAndGenerate(() => api.post('/insights/generate/agent-comparison', {}, { timeout: 180000 }));
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function typeLabel(type) {
    const labels = {
      session_summary: 'Summary',
      code_review: 'Code Review',
      anomaly: 'Anomaly',
      daily_digest: 'Digest',
      diff_risk: 'Risk Score',
      agent_comparison: 'Agent Comparison',
      project_health: 'Project Health'
    };
    return labels[type] || type;
  }

  function typeColor(type) {
    const colors = {
      session_summary: 'var(--accent)',
      code_review: 'var(--success)',
      anomaly: 'var(--warning)',
      daily_digest: 'var(--accent)',
      diff_risk: 'var(--error)',
      agent_comparison: 'var(--success)',
      project_health: 'var(--accent)'
    };
    return colors[type] || 'var(--muted)';
  }

  function renderMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(
        /^### (.+)$/gm,
        '<h4 class="font-semibold text-[var(--text-heading)] mt-3 mb-1">$1</h4>'
      )
      .replace(
        /^## (.+)$/gm,
        '<h3 class="font-semibold text-[var(--text-heading)] mt-3 mb-1">$1</h3>'
      )
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--text-heading)]">$1</strong>')
      .replace(
        /`([^`]+)`/g,
        '<code class="px-1 py-0.5 bg-[var(--bg)] rounded text-[var(--accent)] text-[11px] font-mono">$1</code>'
      )
      .replace(
        /^- (.+)$/gm,
        '<div class="flex gap-2 ml-2"><span class="text-[var(--muted)]">-</span><span>$1</span></div>'
      )
      .replace(/\n/g, '<br>');
  }

  onMount(() => {
    loadInsights();
  });

  onDestroy(() => abortRequests());
</script>

<div class="min-h-screen p-4 pb-16 bg-[var(--bg)]">
  <div class="mx-auto px-2">
    <!-- Header -->
    <div class="flex justify-between items-center mb-4 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <h1 class="text-xl font-bold text-[var(--text-heading)]">Insights</h1>
        <span class="text-xs text-[var(--muted)] font-sans">Local LLM-powered analysis</span>
      </div>
      <div class="flex items-center gap-3">
        {#if status.available}
          <span class="flex items-center gap-1.5 text-xs text-[var(--success)] font-mono">
            <span class="w-1.5 h-1.5 bg-[var(--success)] rounded-full"></span>
            Ollama
          </span>
        {:else}
          <span class="flex items-center gap-1.5 text-xs text-[var(--error)] font-mono">
            <span class="w-1.5 h-1.5 bg-[var(--error)] rounded-full"></span>
            Ollama offline
          </span>
        {/if}
      </div>
    </div>

    <!-- Controls -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-4">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <label class="text-xs text-[var(--muted)] font-sans" for="model-select">Model</label>
          <select
            id="model-select"
            bind:value={selectedModel}
            class="px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-xs font-mono text-[var(--text)]"
          >
            {#each status.models as model (model)}
              <option value={model}>{model}</option>
            {/each}
          </select>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs text-[var(--muted)] font-sans" for="window-select">Window</label>
          <select
            id="window-select"
            bind:value={windowMinutes}
            class="px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-xs font-mono text-[var(--text)]"
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
            <option value={180}>3 hours</option>
            <option value={720}>12 hours</option>
            <option value={1440}>24 hours</option>
          </select>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button
            onclick={generateSummary}
            disabled={generating || !status.available}
            class="px-3 py-1.5 bg-[var(--accent)] text-white rounded text-xs font-sans hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {generating ? 'Generating...' : 'Summary'}
          </button>
          <button
            onclick={generateReview}
            disabled={generating || !status.available}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs font-sans text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40"
          >
            Code Review
          </button>
          <button
            onclick={generateDigest}
            disabled={generating || !status.available}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs font-sans text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40"
          >
            Daily Digest
          </button>
          <button
            onclick={generateAgentComparison}
            disabled={generating || !status.available}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs font-sans text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40"
          >
            Agent Comparison
          </button>
        </div>
        {#if generating}
          <span class="text-xs text-[var(--muted)] font-mono animate-pulse">Running local LLM...</span>
        {/if}
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="flex items-center gap-1 mb-4 flex-wrap">
      {#each [
        { value: 'all', label: 'All' },
        { value: 'session_summary', label: 'Summaries' },
        { value: 'code_review', label: 'Reviews' },
        { value: 'daily_digest', label: 'Digests' },
        { value: 'agent_comparison', label: 'Comparisons' },
        { value: 'anomaly', label: 'Anomalies' },
        { value: 'diff_risk', label: 'Risk Scores' },
        { value: 'project_health', label: 'Project Health' }
      ] as tab (tab.value)}
        <button
          class="px-2.5 py-1 text-xs font-sans rounded transition-colors {filterType === tab.value ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]'}"
          onclick={() => (filterType = tab.value)}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Insights List -->
    {#if loading}
      <div class="text-center py-12 text-sm text-[var(--muted)]">Loading insights...</div>
    {:else if filteredInsights.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-lg text-[var(--muted)] mb-2">No insights yet</div>
        <p class="text-sm text-[var(--muted)] font-sans mb-4">
          Use the buttons above to generate AI-powered analysis of your development activity.
        </p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each filteredInsights as insight (insight.id)}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
            <div
              class="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)]"
            >
              <div class="flex items-center gap-3">
                <span
                  class="px-1.5 py-0.5 text-[9px] font-bold rounded text-white"
                  style="background: {typeColor(insight.type)}">{typeLabel(insight.type)}</span
                >
                <span class="text-xs font-semibold text-[var(--text)] font-sans"
                  >{insight.title}</span
                >
              </div>
              <div class="flex items-center gap-3 text-[10px] text-[var(--muted)] font-mono">
                <span>{formatDate(insight.timestamp)} {formatTime(insight.timestamp)}</span>
                <span>{insight.model}</span>
                <span>{(insight.duration_ms / 1000).toFixed(1)}s</span>
                <span>{insight.context_events} events</span>
              </div>
            </div>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- Content is HTML-escaped in renderMarkdown -->
            <div class="p-4 text-sm text-[var(--text)] font-sans leading-relaxed">
              {@html renderMarkdown(insight.content)}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
