<script>
  import { logger } from './logger.js';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { API_CONFIG } from '../config.js';

  const API_BASE = API_CONFIG.API_BASE;

  let changelog = [];
  let loading = true;
  let error = null;

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
      case 'feature':
        return '✨';
      case 'fix':
        return '🐛';
      case 'improvement':
        return '⚡';
      case 'breaking':
        return '💥';
      case 'security':
        return '🔒';
      case 'docs':
        return '📝';
      default:
        return '•';
    }
  }

  function getTypeColor(type) {
    switch (type) {
      case 'feature':
        return 'var(--success)';
      case 'fix':
        return 'var(--error)';
      case 'improvement':
        return 'var(--info)';
      case 'breaking':
        return 'var(--warning)';
      case 'security':
        return 'var(--accent-2)';
      case 'docs':
        return 'var(--muted)';
      default:
        return 'var(--muted)';
    }
  }
</script>

<div
  class="changelog-page"
  transition:fade={{ duration: 300 }}
  role="main"
  aria-label="Changelog page"
>
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
        {#each changelog as release (release.id || release.name || release)}
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
              {#each release.changes as change (change.id || change.name || change)}
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
    padding: var(--space-xl) var(--space-lg);
    color: var(--text);
    font-family: var(--mono);
  }

  .changelog-container {
    max-width: 900px;
    margin: 0 auto;
  }

  .changelog-header {
    text-align: center;
    margin-bottom: var(--space-4xl);
    padding-bottom: 30px;
    border-bottom: 2px solid var(--border);
  }

  .changelog-header h1 {
    margin: 0 0 var(--space-lg) 0;
    font-size: 12px;
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
    gap: var(--space-4xl);
  }

  .release-section {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: var(--radius-sm);
    padding: var(--space-xl);
    transition: all var(--duration-slow) var(--ease-smooth);
  }

  .release-section:hover {
    border-color: var(--accent);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .release-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-lg);
    padding-bottom: 10px;
    border-bottom: 1px solid var(--surface-2);
  }

  .release-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .release-title h2 {
    margin: 0;
    font-size: 12px;
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
    font-family: var(--mono);
    background: var(--bg);
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-sm);
    border: 1px solid var(--surface-2);
  }

  .changes-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .change-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-xl);
    padding: var(--space-xl);
    background: var(--bg);
    border-radius: var(--radius);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .change-item:hover {
    background: var(--surface);
  }

  .change-icon {
    font-size: 12px;
    flex-shrink: 0;
    margin-top: var(--space-xs);
  }

  .change-description {
    color: var(--text);
    font-size: 12px;
    line-height: 1.4;
  }

  .changelog-footer {
    text-align: center;
    padding: var(--space-2xl) var(--space-3xl);
    margin-top: var(--space-lg);
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
    padding: var(--space-lg) var(--space-xl);
    text-align: center;
  }

  .loading-state p,
  .error-state p,
  .empty-state p {
    margin: var(--space-2xl) 0 0 0;
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

  @media (max-width: 768px) {
    .changelog-header h1 {
      font-size: 12px;
    }

    .tagline {
      font-size: 12px;
    }

    .release-header {
      flex-direction: column;
      gap: var(--space-xl);
    }

    .release-title h2 {
      font-size: 12px;
    }
  }
</style>
