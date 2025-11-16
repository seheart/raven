<script>
  import { api } from '../apiClient.js';
  /**
   * Changelog Page - Track Raven's development progress
   * Modern, clean layout with timeline-style changelog
   */

  let changelog = $state([]);
  let loading = $state(true);
  let error = $state(null);

  // Load changelog from API
  async function loadChangelog() {
    try {
      const response = await api.get('/changelog');
      const data = await response.json()
      changelog = data;
      loading = false;
    } catch (err) {
      console.error('Failed to load changelog:', err);
      error = 'Failed to load changelog';
      loading = false;
    }
  }

  // Get icon for change type
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

  // Get color for change type
  function getTypeColor(type) {
    switch (type) {
      case 'feature':
        return 'text-[var(--success)]';
      case 'fix':
        return 'text-[var(--error)]';
      case 'improvement':
        return 'text-[var(--info)]';
      case 'breaking':
        return 'text-[var(--warning)]';
      case 'security':
        return 'text-[var(--accent)]';
      case 'docs':
        return 'text-[var(--muted)]';
      default:
        return 'text-[var(--muted)]';
    }
  }

  // Load on mount
  $effect(() => {
    loadChangelog();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="text-center mb-12 pb-8 border-b-2 border-[var(--border)]">
      <h1 class="text-3xl font-bold text-[var(--text-heading)] mb-3">📋 Changelog</h1>
      <p class="text-sm text-[var(--muted)] font-sans">
        Track Raven's development progress and updates
      </p>
    </div>

    <!-- Content -->
    {#if loading}
      <div class="flex flex-col items-center justify-center py-20">
        <div
          class="w-12 h-12 border-4 border-[var(--surface-2)] border-t-[var(--accent)] rounded-full animate-spin"
        ></div>
        <p class="text-sm text-[var(--muted)] mt-6 font-sans">
          Loading changelog from git history...
        </p>
      </div>
    {:else if error}
      <div class="text-center py-20">
        <p class="text-[var(--error)] text-sm font-sans">⚠️ {error}</p>
      </div>
    {:else if changelog.length === 0}
      <div class="text-center py-20">
        <p class="text-[var(--muted)] text-sm font-sans">No changelog entries found</p>
      </div>
    {:else}
      <!-- Changelog Timeline -->
      <div class="space-y-8">
        {#each changelog as release (release.id || release.version)}
          <article
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 hover:border-[var(--accent)] transition-all"
          >
            <!-- Release Header -->
            <div
              class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-4 border-b border-[var(--border)]"
            >
              <div class="flex flex-col gap-1.5">
                <h2 class="text-lg font-semibold text-[var(--accent)]">
                  Version {release.version}
                </h2>
                {#if release.title}
                  <span class="text-sm text-[var(--muted)] font-sans">{release.title}</span>
                {/if}
              </div>
              <div
                class="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-xs font-mono text-[var(--muted)]"
              >
                {release.date}
              </div>
            </div>

            <!-- Changes List -->
            <div class="space-y-3">
              {#each release.changes as change (change.id || change.description)}
                <div
                  class="flex items-start gap-3 p-3 bg-[var(--bg)] rounded hover:bg-[var(--surface)] transition-all"
                >
                  <span class="{getTypeColor(change.type)} text-base mt-0.5 flex-shrink-0">
                    {getTypeIcon(change.type)}
                  </span>
                  <p class="text-sm text-[var(--text)] leading-relaxed font-sans">
                    {change.description}
                  </p>
                </div>
              {/each}
            </div>
          </article>
        {/each}
      </div>

      <!-- Footer -->
      <div class="text-center mt-12 pt-8">
        <p class="text-sm text-[var(--muted)] italic font-sans">More updates coming soon! 🚀</p>
      </div>
    {/if}
  </div>
</div>
