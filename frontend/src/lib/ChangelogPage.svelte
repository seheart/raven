<script>
  import { logger } from './logger.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  import { API_CONFIG } from '../config.js';

  const dispatch = createEventDispatcher();

  const API_BASE = API_CONFIG.API_BASE;

  let changelog = [];
  let loading = true;
  let error = null;

  function close() {
    dispatch('close');
  }

  onMount(async () => {
    try {
      const response = await fetch(`${API_BASE}/changelog`);
      const data = await response.json();
      changelog = data;
      loading = false;
    } catch (err) {
      logger.error('Failed to load changelog:', err);
      error = 'Failed to load changelog';
      loading = false;
    }
  });

  function getTypeIcon(type) {
    switch (type) {
    case 'feature': return '✨';
    case 'fix': return '🐛';
    case 'improvement': return '⚡️';
    case 'breaking': return '💥';
    case 'security': return '🔒';
    case 'docs': return '📝';
    default: return '•';
    }
  }

  function getTypeColor(type) {
    switch (type) {
    case 'feature': return 'var(--success)';
    case 'fix': return 'var(--error)';
    case 'improvement': return 'var(--info)';
    case 'breaking': return 'var(--warning)';
    case 'security': return 'var(--accent-2)';
    case 'docs': return 'var(--muted)';
    default: return 'var(--muted)';
    }
  }
</script>

<div class="changelog-page" transition:fade={{ duration: 300 }} role="main" aria-label="Changelog page">
  <div class="changelog-container">
    <div class="changelog-header">
      <h1 id="changelog-heading"><span aria-hidden="true">📋</span> Changelog</h1>
      <p class="tagline">Track Raven's development progress and updates</p>
    </div>

    <div class="changelog-content" role="region" aria-labelledby="changelog-heading">
      {#if loading}
        <div class="loading-state" role="status" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <p>Loading changelog from git history...</p>
        </div>
      {:else if error}
        <div class="error-state" role="alert">
          <p><span aria-hidden="true">⚠️</span> {error}</p>
        </div>
      {:else if changelog.length === 0}
        <div class="empty-state" role="status">
          <p>No changelog entries found</p>
        </div>
      {:else}
        {#each changelog as release}
        <article class="release-section" aria-labelledby="version-{release.version}">
          <div class="release-header">
            <div class="release-title">
              <h2 id="version-{release.version}">Version {release.version}</h2>
              {#if release.title}
                <span class="release-subtitle">{release.title}</span>
              {/if}
            </div>
            <div class="release-date"><time datetime={release.date}>{release.date}</time></div>
          </div>

          <div class="changes-list" role="list" aria-label="Changes in version {release.version}">
            {#each release.changes as change}
              <div class="change-item" role="listitem">
                <span
                  class="change-icon"
                  style="color: {getTypeColor(change.type)}"
                  aria-hidden="true"
                >
                  {getTypeIcon(change.type)}
                </span>
                <span class="change-description">{change.description}</span>
              </div>
            {/each}
          </div>
        </article>
        {/each}

        <div class="changelog-footer" role="contentinfo">
          <p>More updates coming soon! <span aria-hidden="true">🚀</span></p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .changelog-page {
    position: relative;
    background: var(--bg);
    width: 100%;
    min-height: 100vh;
    overflow-y: auto;
    padding: 48px 24px;
    color: var(--text);
    font-family: var(--mono);
  }

  .changelog-container {
    max-width: 900px;
    margin: 0 auto;
  }

  .changelog-header {
    text-align: center;
    margin-bottom: 60px;
    padding-bottom: 30px;
    border-bottom: 2px solid var(--border);
  }

  .changelog-header h1 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }

  .tagline {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .changelog-content {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  .release-section {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 12px;
    padding: 12px;
    transition: all 0.3s;
  }

  .release-section:hover {
    border-color: var(--accent);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .release-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--surface-2);
  }

  .release-title {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .release-title h2 {
    margin: 0;
    font-size: 15px;
    color: var(--accent);
    font-weight: 600;
  }

  .release-subtitle {
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .release-date {
    font-size: 12px;
    color: var(--muted);
    font-family: 'Courier New', monospace;
    background: var(--bg);
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--surface-2);
  }

  .changes-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .change-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    background: var(--bg);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .change-item:hover {
    background: var(--surface);
  }

  .change-icon {
    font-size: 12px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .change-description {
    color: var(--text);
    font-size: 12px;
    line-height: 1.4;
  }

  .changelog-footer {
    text-align: center;
    padding: 16px 20px;
    margin-top: 20px;
  }

  .changelog-footer p {
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
    margin: 0;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
  }

  .loading-state p,
  .error-state p,
  .empty-state p {
    margin: 16px 0 0 0;
    font-size: 13px;
    color: var(--muted);
  }

  .error-state p {
    color: var(--error);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--surface-2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .changelog-header h1 {
      font-size: 18px;
    }

    .tagline {
      font-size: 12px;
    }

    .release-header {
      flex-direction: column;
      gap: 12px;
    }

    .release-title h2 {
      font-size: 15px;
    }
  }
</style>
