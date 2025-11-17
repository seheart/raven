<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Anomaly Alerts Page
   * Statistical analysis, pattern recognition, and risk scoring
   */

  import { onMount } from 'svelte';

  // State
  let anomalies = $state([]);
  let stats = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let limit = $state(20);
  let lastUpdate = $state(new Date());
  let filterRiskLevel = $state('all'); // all, high, medium, low

  // Derived
  const filteredAnomalies = $derived(
    filterRiskLevel === 'all' ? anomalies : anomalies.filter(a => a.risk_level === filterRiskLevel)
  );

  const highCount = $derived(stats?.high_risk || 0);
  const mediumCount = $derived(stats?.medium_risk || 0);
  const lowCount = $derived(stats?.low_risk || 0);
  const totalCount = $derived(stats?.total_anomalies || 0);
  const avgScore = $derived(stats?.avg_score || 0);

  const timeSinceUpdate = $derived.by(() => {
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  });

  async function loadAnomalies() {
    try {
      loading = true;
      const project = 'raven';

      const [statsData, anomaliesData] = await Promise.all([
        api.get(`/anomalies/stats?project=${project}`),
        api.get(`/anomalies/recent?project=${project}&limit=${limit}`)
      ]);

      stats = statsData;
      anomalies = anomaliesData.anomalies || [];

      lastUpdate = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load anomalies:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function getRiskIcon(riskLevel) {
    return { high: '🔴', medium: '⚠️', low: '🔵' }[riskLevel] || '📊';
  }

  function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function handleExportCSV() {
    const headers = [
      'Timestamp',
      'File',
      'ChangeType',
      'Score',
      'RiskLevel',
      'Agent',
      'Confidence'
    ];
    const rows = anomalies.map(a => [
      a.timestamp,
      a.filepath,
      a.change_type,
      a.anomaly_score,
      a.risk_level,
      a.agent || 'unknown',
      a.anomaly_confidence
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anomalies-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onMount(() => {
    loadAnomalies();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex justify-between items-start mb-6 flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🚨 Anomaly Detection</h1>
        <p class="text-base text-[var(--muted)] font-sans">
          Statistical analysis • Pattern recognition • Risk scoring
        </p>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-sm text-[var(--muted)] font-mono">Updated: {timeSinceUpdate}</span>
        <button
          onclick={handleExportCSV}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          CSV
        </button>
        <button
          onclick={loadAnomalies}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          <span class:animate-spin={loading}>↻</span> Refresh
        </button>
      </div>
    </div>

    <!-- Controls -->
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 mb-6 flex gap-6 flex-wrap"
    >
      <div class="flex items-center gap-3">
        <label for="limit-select" class="text-sm text-[var(--muted)] font-sans">Show:</label>
        <select
          id="limit-select"
          bind:value={limit}
          onchange={loadAnomalies}
          class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="10">10 anomalies</option>
          <option value="20">20 anomalies</option>
          <option value="50">50 anomalies</option>
          <option value="100">100 anomalies</option>
        </select>
      </div>
      <div class="flex items-center gap-3">
        <label for="risk-filter" class="text-sm text-[var(--muted)] font-sans"
          >Filter by risk:</label
        >
        <select
          id="risk-filter"
          bind:value={filterRiskLevel}
          class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="all">All Levels</option>
          <option value="high">High Risk Only</option>
          <option value="medium">Medium Risk Only</option>
          <option value="low">Low Risk Only</option>
        </select>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div
        class="bg-[var(--surface)] border-2 border-[var(--accent)] rounded-lg p-4 flex items-center gap-3"
      >
        <span class="text-2xl">📊</span>
        <div>
          <div class="text-2xl font-bold text-[var(--accent)] font-mono">{totalCount}</div>
          <div class="text-xs text-[var(--muted)] font-sans uppercase">Total</div>
        </div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        style="border-color: #ef4444"
      >
        <span class="text-2xl">🔴</span>
        <div>
          <div class="text-2xl font-bold font-mono" style="color: #ef4444">{highCount}</div>
          <div class="text-xs text-[var(--muted)] font-sans uppercase">High Risk</div>
        </div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        style="border-color: #f59e0b"
      >
        <span class="text-2xl">⚠️</span>
        <div>
          <div class="text-2xl font-bold font-mono" style="color: #f59e0b">{mediumCount}</div>
          <div class="text-xs text-[var(--muted)] font-sans uppercase">Medium</div>
        </div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
        style="border-color: #3b82f6"
      >
        <span class="text-2xl">🔵</span>
        <div>
          <div class="text-2xl font-bold font-mono" style="color: #3b82f6">{lowCount}</div>
          <div class="text-xs text-[var(--muted)] font-sans uppercase">Low</div>
        </div>
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-3"
      >
        <span class="text-2xl">⭐</span>
        <div>
          <div class="text-2xl font-bold text-[var(--text)] font-mono">{avgScore}</div>
          <div class="text-xs text-[var(--muted)] font-sans uppercase">Avg Score</div>
        </div>
      </div>
    </div>

    <!-- Anomalies List -->
    {#if loading}
      <div class="space-y-3">
        {#each Array(5) as _, i (i)}
          <div
            class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if error}
      <div
        class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-4 flex justify-between items-center"
      >
        <span class="text-sm text-[var(--error)] font-sans">❌ Error: {error}</span>
        <button
          onclick={loadAnomalies}
          class="px-3 py-1.5 bg-[var(--error)] text-white rounded text-sm font-sans"
        >
          Retry
        </button>
      </div>
    {:else if filteredAnomalies.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-4xl mb-3">✅</div>
        <p class="text-lg text-[var(--text)] font-sans mb-2">No anomalies detected</p>
        <p class="text-sm text-[var(--muted)] font-sans">All patterns look normal</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each filteredAnomalies as anomaly, i (anomaly.id || i)}
          {@const borderColor =
            anomaly.risk_level === 'high'
              ? '#ef4444'
              : anomaly.risk_level === 'medium'
                ? '#f59e0b'
                : '#3b82f6'}
          <div
            class="bg-[var(--surface)] border-l-4 border-r border-t border-b border-[var(--border)] rounded-lg p-4 hover:bg-[var(--bg)] transition-all hover:translate-x-1"
            style="border-left-color: {borderColor}"
          >
            <div class="flex items-start gap-3 mb-2">
              <span class="text-xl">{getRiskIcon(anomaly.risk_level)}</span>
              <div class="flex-1">
                <div class="font-semibold text-[var(--text)] font-mono text-sm mb-1">
                  {anomaly.filepath}
                </div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <time class="text-[var(--muted)] font-sans"
                    >{formatTimestamp(anomaly.timestamp)}</time
                  >
                  <span
                    class="px-2 py-0.5 bg-[var(--bg)] border border-[var(--border)] rounded font-mono text-[var(--text)]"
                    >{anomaly.change_type}</span
                  >
                  {#if anomaly.agent}
                    <span
                      class="px-2 py-0.5 bg-[var(--bg)] border border-[var(--border)] rounded font-mono text-[var(--text)]"
                      >🤖 {anomaly.agent}</span
                    >
                  {/if}
                </div>
              </div>
              <div class="text-center px-3 py-1 bg-[var(--bg)] rounded">
                <div class="text-xl font-bold font-mono text-[var(--text)]">
                  {anomaly.anomaly_score}
                </div>
                <div class="text-xs text-[var(--muted)] font-sans uppercase">score</div>
              </div>
            </div>

            {#if anomaly.anomaly_reasons && anomaly.anomaly_reasons.length > 0}
              <div class="bg-[var(--bg)] rounded p-3 mt-2">
                <div class="text-xs text-[var(--muted)] font-sans uppercase mb-2 font-semibold">
                  Detection Reasons:
                </div>
                {#each anomaly.anomaly_reasons as reason, j (j)}
                  <div class="flex gap-2 items-center text-xs py-1">
                    <span class="text-[var(--accent)] font-sans capitalize"
                      >{reason.type.replace(/_/g, ' ')}</span
                    >
                    <span class="text-[var(--text)] font-sans flex-1">{reason.message}</span>
                    {#if reason.zScore}
                      <span
                        class="px-2 py-0.5 bg-[var(--surface)] border border-[var(--border)] rounded font-mono text-[var(--muted)]"
                        >{reason.zScore}σ</span
                      >
                    {/if}
                    {#if reason.rarity}
                      <span
                        class="px-2 py-0.5 bg-[var(--surface)] border border-[var(--border)] rounded font-mono text-[var(--muted)]"
                        >{reason.rarity}% rare</span
                      >
                    {/if}
                    {#if reason.score}
                      <span
                        class="px-2 py-0.5 bg-[var(--surface)] border border-[var(--border)] rounded font-mono text-[var(--muted)]"
                        >+{reason.score}</span
                      >
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}

            <div
              class="flex gap-4 mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--muted)]"
            >
              <span>Confidence: {anomaly.anomaly_confidence}%</span>
              <span>Risk: {anomaly.risk_level}</span>
              {#if anomaly.event_size}
                <span>{(anomaly.event_size / 1024).toFixed(1)} KB</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
