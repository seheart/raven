<script>
  import { onMount } from 'svelte';
  import { api } from './apiClient.js';
  import { formatDateTime } from './timeFormat.js';

  export let eventId;
  export let project = 'raven';
  export let limit = 5;

  let similarChanges = [];
  let loading = true;
  let error = null;
  let prediction = null;

  async function loadSimilarChanges() {
    if (!eventId) return;

    loading = true;
    error = null;

    try {
      const data = await api.post(`/changes/${eventId}/similar?project=${project}&limit=${limit}`);
      similarChanges = data.similar || [];

      // Calculate prediction based on similar changes
      if (similarChanges.length > 0) {
        const keptCount = similarChanges.filter(c => c.outcome === 'kept').length;
        const rolledBackCount = similarChanges.filter(c => c.outcome === 'rolled_back').length;
        const successRate = keptCount / similarChanges.length;

        prediction = {
          successRate: successRate,
          confidence: similarChanges.length > 10 ? 'high' : similarChanges.length > 5 ? 'medium' : 'low',
          sampleSize: similarChanges.length,
          keptCount,
          rolledBackCount
        };
      }
    } catch (err) {
      console.error('Failed to load similar changes:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadSimilarChanges();
  });

  function getSimilarityColor(similarity) {
    if (similarity >= 0.8) return '#9ece6a'; // High similarity - green
    if (similarity >= 0.6) return '#e0af68'; // Medium - orange
    return '#f7768e'; // Low - red
  }

  function getOutcomeBadge(outcome) {
    if (outcome === 'kept') {
      return { icon: '✅', text: 'Kept', color: '#9ece6a' };
    } else {
      return { icon: '↩️', text: 'Rolled Back', color: '#f7768e' };
    }
  }
</script>

<div class="similar-changes-panel">
  <div class="panel-header">
    <h3>🔍 Similar Past Changes</h3>
    {#if similarChanges.length > 0}
      <span class="count-badge">{similarChanges.length} found</span>
    {/if}
  </div>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Analyzing historical patterns...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p>❌ Failed to find similar changes</p>
      <p class="error-detail">{error}</p>
    </div>
  {:else if similarChanges.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🎯</div>
      <p class="empty-title">No similar changes found</p>
      <p class="empty-hint">This appears to be a unique change pattern</p>
    </div>
  {:else}
    <!-- Prediction Summary -->
    {#if prediction}
      <div class="prediction-box" class:high-risk={prediction.successRate < 0.5}>
        <div class="prediction-header">
          <span class="prediction-icon">
            {#if prediction.successRate >= 0.8}
              ✅
            {:else if prediction.successRate >= 0.5}
              ⚡
            {:else}
              ⚠️
            {/if}
          </span>
          <span class="prediction-title">Historical Outcome Prediction</span>
        </div>

        <div class="prediction-stats">
          <div class="stat-item">
            <div class="stat-label">Success Rate</div>
            <div class="stat-value" style="color: {prediction.successRate >= 0.7 ? '#9ece6a' : prediction.successRate >= 0.5 ? '#e0af68' : '#f7768e'}">
              {(prediction.successRate * 100).toFixed(0)}%
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Confidence</div>
            <div class="stat-value confidence-{prediction.confidence}">
              {prediction.confidence}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Sample Size</div>
            <div class="stat-value">{prediction.sampleSize}</div>
          </div>
        </div>

        <div class="outcome-breakdown">
          <div class="outcome-bar">
            <div
              class="outcome-segment kept"
              style="width: {(prediction.keptCount / prediction.sampleSize) * 100}%"
              title="{prediction.keptCount} kept"
            >
              {#if prediction.keptCount > 0}
                <span class="segment-label">{prediction.keptCount}</span>
              {/if}
            </div>
            <div
              class="outcome-segment rolled-back"
              style="width: {(prediction.rolledBackCount / prediction.sampleSize) * 100}%"
              title="{prediction.rolledBackCount} rolled back"
            >
              {#if prediction.rolledBackCount > 0}
                <span class="segment-label">{prediction.rolledBackCount}</span>
              {/if}
            </div>
          </div>
          <div class="outcome-legend">
            <span class="legend-item kept">✅ Kept: {prediction.keptCount}</span>
            <span class="legend-item rolled-back">↩️ Rolled Back: {prediction.rolledBackCount}</span>
          </div>
        </div>

        {#if prediction.successRate < 0.5}
          <div class="warning-message">
            ⚠️ Warning: Similar changes were rolled back more often than kept. Review carefully!
          </div>
        {:else if prediction.successRate >= 0.8}
          <div class="success-message">
            ✅ Good signs: Similar changes were usually successful.
          </div>
        {/if}
      </div>
    {/if}

    <!-- Similar Changes List -->
    <div class="changes-list">
      {#each similarChanges as change (change.id)}
        <div class="change-card" class:rolled-back={change.outcome === 'rolled_back'}>
          <div class="change-header">
            <div class="similarity-badge" style="background: {getSimilarityColor(change.similarity)}33; border-color: {getSimilarityColor(change.similarity)};">
              <span class="similarity-percent">{(change.similarity * 100).toFixed(0)}%</span>
              <span class="similarity-label">match</span>
            </div>

            <div
              class="outcome-badge"
              style="background: {getOutcomeBadge(change.outcome).color}33; border-color: {getOutcomeBadge(change.outcome).color}; color: {getOutcomeBadge(change.outcome).color};"
            >
              <span class="outcome-icon">{getOutcomeBadge(change.outcome).icon}</span>
              <span class="outcome-text">{getOutcomeBadge(change.outcome).text}</span>
            </div>
          </div>

          <div class="change-details">
            <div class="detail-row">
              <span class="detail-label">File:</span>
              <span class="detail-value filepath">{change.filepath}</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">When:</span>
              <span class="detail-value">{formatDateTime(change.timestamp)}</span>
            </div>

            {#if change.agent}
              <div class="detail-row">
                <span class="detail-label">Agent:</span>
                <span class="detail-value">{change.agent}</span>
              </div>
            {/if}

            {#if change.rollback_reason}
              <div class="rollback-reason">
                <span class="reason-label">Rollback Reason:</span>
                <span class="reason-text">"{change.rollback_reason}"</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .similar-changes-panel {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }

  .count-badge {
    padding: 4px 12px;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .loading {
    padding: 60px 20px;
    text-align: center;
    color: var(--muted);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state, .error-state {
    padding: 60px 20px;
    text-align: center;
    color: var(--muted);
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 8px 0;
  }

  .empty-hint {
    font-size: 13px;
    margin: 0;
  }

  .error-detail {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--error);
    margin-top: 8px;
  }

  /* Prediction Box */
  .prediction-box {
    margin: 20px;
    padding: 20px;
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: 8px;
  }

  .prediction-box.high-risk {
    border-color: var(--error);
    background: color-mix(in srgb, var(--error) 5%, var(--bg));
  }

  .prediction-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .prediction-icon {
    font-size: 24px;
  }

  .prediction-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }

  .prediction-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 16px;
  }

  .stat-item {
    text-align: center;
  }

  .stat-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: 6px;
  }

  .stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .stat-value.confidence-high {
    color: var(--success);
  }

  .stat-value.confidence-medium {
    color: var(--warning);
  }

  .stat-value.confidence-low {
    color: var(--muted);
  }

  .outcome-breakdown {
    margin-top: 16px;
  }

  .outcome-bar {
    display: flex;
    height: 32px;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 12px;
    background: var(--surface-2);
  }

  .outcome-segment {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
  }

  .outcome-segment.kept {
    background: var(--success);
  }

  .outcome-segment.rolled-back {
    background: var(--error);
  }

  .segment-label {
    font-size: 12px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  .outcome-legend {
    display: flex;
    gap: 20px;
    justify-content: center;
    font-size: 12px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-item.kept {
    color: var(--success);
  }

  .legend-item.rolled-back {
    color: var(--error);
  }

  .warning-message {
    margin-top: 16px;
    padding: 12px;
    background: color-mix(in srgb, var(--error) 15%, transparent);
    border-left: 4px solid var(--error);
    border-radius: 4px;
    color: var(--error);
    font-size: 13px;
    font-weight: 600;
  }

  .success-message {
    margin-top: 16px;
    padding: 12px;
    background: color-mix(in srgb, var(--success) 15%, transparent);
    border-left: 4px solid var(--success);
    border-radius: 4px;
    color: var(--success);
    font-size: 13px;
    font-weight: 600;
  }

  /* Changes List */
  .changes-list {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .change-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-left: 4px solid var(--success);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s;
  }

  .change-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .change-card.rolled-back {
    border-left-color: var(--error);
    background: color-mix(in srgb, var(--error) 3%, var(--bg));
  }

  .change-header {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }

  .similarity-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 12px;
    border: 1px solid;
    border-radius: 6px;
    min-width: 70px;
  }

  .similarity-percent {
    font-size: 16px;
    font-weight: 700;
    font-family: var(--mono);
  }

  .similarity-label {
    font-size: 9px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .outcome-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px solid;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }

  .change-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .detail-row {
    display: flex;
    gap: 8px;
    font-size: 12px;
  }

  .detail-label {
    color: var(--muted);
    font-weight: 600;
    min-width: 60px;
  }

  .detail-value {
    color: var(--text);
  }

  .detail-value.filepath {
    font-family: var(--mono);
    font-size: 11px;
  }

  .rollback-reason {
    margin-top: 8px;
    padding: 10px;
    background: var(--surface-2);
    border-radius: 4px;
    font-size: 12px;
  }

  .reason-label {
    display: block;
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: 4px;
    font-weight: 600;
  }

  .reason-text {
    color: var(--text);
    font-style: italic;
  }
</style>
