<script>
  import { logger } from './logger.js';
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
          confidence:
            similarChanges.length > 10 ? 'high' : similarChanges.length > 5 ? 'medium' : 'low',
          sampleSize: similarChanges.length,
          keptCount,
          rolledBackCount
        };
      }
    } catch (error) {
      logger.error('Failed to load similar changes:', error);
      errorMessage = error.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadSimilarChanges();
  });

  function getSimilarityColor(similarity) {
    if (similarity >= 0.8) return 'var(--success)'; // High similarity - green
    if (similarity >= 0.6) return 'var(--warning)'; // Medium - orange
    return 'var(--error)'; // Low - red
  }

  function getOutcomeBadge(outcome) {
    if (outcome === 'kept') {
      return { icon: '', text: 'Kept', color: 'var(--success)' };
    } else {
      return { icon: '', text: 'Rolled Back', color: 'var(--error)' };
    }
  }
</script>

<div class="similar-changes-panel" role="region" aria-label="Similar past changes panel">
  <div class="panel-header">
    <h3 id="similar-changes-heading"><span aria-hidden="true"></span> Similar Past Changes</h3>
    {#if similarChanges.length > 0}
      <span class="count-badge" role="status">{similarChanges.length} found</span>
    {/if}
  </div>

  {#if loading}
    <div class="loading" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>Analyzing historical patterns...</p>
    </div>
  {:else if error}
    <div class="error-state" role="alert">
      <p><span aria-hidden="true"></span> Failed to find similar changes</p>
      <p class="error-detail">{error}</p>
    </div>
  {:else if similarChanges.length === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon" aria-hidden="true"></div>
      <p class="empty-title">No similar changes found</p>
      <p class="empty-hint">This appears to be a unique change pattern</p>
    </div>
  {:else}
    <!-- Prediction Summary -->
    {#if prediction}
      <div
        class="prediction-box"
        class:high-risk={prediction.successRate < 0.5}
        role="region"
        aria-labelledby="prediction-heading"
      >
        <div class="prediction-header">
          <span class="prediction-icon" aria-hidden="true">
            {#if prediction.successRate >= 0.8}{:else if prediction.successRate >= 0.5}{:else}{/if}
          </span>
          <span class="prediction-title" id="prediction-heading">Historical Outcome Prediction</span
          >
        </div>

        <div class="prediction-stats" role="list" aria-label="Prediction statistics">
          <div class="stat-item" role="listitem">
            <div class="stat-label">Success Rate</div>
            <div
              class="stat-value"
              role="status"
              style="color: {prediction.successRate >= 0.7
                ? 'var(--success)'
                : prediction.successRate >= 0.5
                  ? 'var(--warning)'
                  : 'var(--error)'}"
            >
              {(prediction.successRate * 100).toFixed(0)}%
            </div>
          </div>
          <div class="stat-item" role="listitem">
            <div class="stat-label">Confidence</div>
            <div class="stat-value confidence-{prediction.confidence}" role="status">
              {prediction.confidence}
            </div>
          </div>
          <div class="stat-item" role="listitem">
            <div class="stat-label">Sample Size</div>
            <div class="stat-value" role="status">{prediction.sampleSize}</div>
          </div>
        </div>

        <div class="outcome-breakdown">
          <div
            class="outcome-bar"
            role="img"
            aria-label="Outcome distribution: {prediction.keptCount} kept, {prediction.rolledBackCount} rolled back"
          >
            <div
              class="outcome-segment kept"
              style="width: {(prediction.keptCount / prediction.sampleSize) * 100}%"
              title="{prediction.keptCount} kept"
              aria-hidden="true"
            >
              {#if prediction.keptCount > 0}
                <span class="segment-label">{prediction.keptCount}</span>
              {/if}
            </div>
            <div
              class="outcome-segment rolled-back"
              style="width: {(prediction.rolledBackCount / prediction.sampleSize) * 100}%"
              title="{prediction.rolledBackCount} rolled back"
              aria-hidden="true"
            >
              {#if prediction.rolledBackCount > 0}
                <span class="segment-label">{prediction.rolledBackCount}</span>
              {/if}
            </div>
          </div>
          <div class="outcome-legend" role="list" aria-label="Outcome legend">
            <span class="legend-item kept" role="listitem"
              ><span aria-hidden="true"></span> Kept: {prediction.keptCount}</span
            >
            <span class="legend-item rolled-back" role="listitem"
              ><span aria-hidden="true"></span> Rolled Back: {prediction.rolledBackCount}</span
            >
          </div>
        </div>

        {#if prediction.successRate < 0.5}
          <div class="warning-message" role="alert">
            <span aria-hidden="true"></span> Warning: Similar changes were rolled back more often than
            kept. Review carefully!
          </div>
        {:else if prediction.successRate >= 0.8}
          <div class="success-message" role="status">
            <span aria-hidden="true"></span> Good signs: Similar changes were usually successful.
          </div>
        {/if}
      </div>
    {/if}

    <!-- Similar Changes List -->
    <div class="changes-list" role="list" aria-labelledby="similar-changes-heading">
      {#each similarChanges as change (change.id)}
        <article
          class="change-card"
          class:rolled-back={change.outcome === 'rolled_back'}
          role="listitem"
        >
          <div class="change-header">
            <div
              class="similarity-badge"
              style="background: {getSimilarityColor(
                change.similarity
              )}33; border-color: {getSimilarityColor(change.similarity)};"
              role="img"
              aria-label="{(change.similarity * 100).toFixed(0)}% similarity match"
            >
              <span class="similarity-percent" aria-hidden="true"
                >{(change.similarity * 100).toFixed(0)}%</span
              >
              <span class="similarity-label" aria-hidden="true">match</span>
            </div>

            <div
              class="outcome-badge"
              style="background: {getOutcomeBadge(change.outcome)
                .color}33; border-color: {getOutcomeBadge(change.outcome)
                .color}; color: {getOutcomeBadge(change.outcome).color};"
              role="status"
            >
              <span class="outcome-icon" aria-hidden="true"
                >{getOutcomeBadge(change.outcome).icon}</span
              >
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
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .similar-changes-panel {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2xl) var(--space-3xl);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
  }

  .count-badge {
    padding: var(--space-sm) var(--space-xl);
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
  }

  .loading {
    padding: var(--space-lg) var(--space-xl);
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
    margin: 0 auto var(--space-2xl);
  }

  .empty-state,
  .error-state {
    padding: var(--space-lg) var(--space-xl);
    text-align: center;
    color: var(--muted);
  }

  .empty-icon {
    font-size: 11px;
    margin-bottom: var(--space-md);
  }

  .empty-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-lg) 0;
  }

  .empty-hint {
    font-size: 13px;
    margin: 0;
  }

  .error-detail {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--error);
    margin-top: var(--space-lg);
  }

  /* Prediction Box */
  .prediction-box {
    margin: var(--space-3xl);
    padding: var(--space-lg);
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: var(--radius);
  }

  .prediction-box.high-risk {
    border-color: var(--error);
    background: color-mix(in srgb, var(--error) 5%, var(--bg));
  }

  .prediction-header {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
    margin-bottom: var(--space-md);
  }

  .prediction-icon {
    font-size: 11px;
  }

  .prediction-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
  }

  .prediction-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
  }

  .stat-item {
    text-align: center;
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: block;
    margin-bottom: var(--space-md);
  }

  .stat-value {
    font-size: 13px;
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
    margin-top: var(--space-2xl);
  }

  .outcome-bar {
    display: flex;
    height: var(--icon-lg);
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-bottom: var(--space-xl);
    background: var(--surface-2);
  }

  .outcome-segment {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-slow) var(--ease-smooth);
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
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .outcome-legend {
    display: flex;
    gap: var(--space-lg);
    justify-content: center;
    font-size: 12px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .legend-item.kept {
    color: var(--success);
  }

  .legend-item.rolled-back {
    color: var(--error);
  }

  .warning-message {
    margin-top: var(--space-2xl);
    padding: var(--space-xl);
    background: color-mix(in srgb, var(--error) 15%, transparent);
    border-left: 4px solid var(--error);
    border-radius: var(--radius);
    color: var(--error);
    font-size: 13px;
    font-weight: 600;
  }

  .success-message {
    margin-top: var(--space-2xl);
    padding: var(--space-xl);
    background: color-mix(in srgb, var(--success) 15%, transparent);
    border-left: 4px solid var(--success);
    border-radius: var(--radius);
    color: var(--success);
    font-size: 13px;
    font-weight: 600;
  }

  /* Changes List */
  .changes-list {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .change-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-left: 4px solid var(--success);
    border-radius: var(--radius);
    padding: var(--space-2xl);
    transition: all var(--duration-base) var(--ease-smooth);
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
    gap: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .similarity-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-lg) var(--space-xl);
    border: 1px solid;
    border-radius: var(--radius-sm);
    min-width: 70px;
  }

  .similarity-percent {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
  }

  .similarity-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .outcome-badge {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-lg) var(--space-xl);
    border: 1px solid;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
  }

  .change-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .detail-row {
    display: flex;
    gap: var(--space-lg);
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
    margin-top: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface-2);
    border-radius: var(--radius);
    font-size: 12px;
  }

  .reason-label {
    display: block;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: var(--space-sm);
    font-weight: 600;
  }

  .reason-text {
    color: var(--text);
    font-style: italic;
  }
</style>
