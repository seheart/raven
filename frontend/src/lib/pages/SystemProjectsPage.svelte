<script>
  /**
   * Projects Page - Monitored projects configuration
   */
  import { onMount } from 'svelte';

  let projects = $state([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const res = await fetch('http://localhost:3030/api/health/projects');
      const data = await res.json();
      projects = data.projects || [];
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">📂 Projects Configuration</h1>
    <p class="text-base text-[var(--muted)] font-sans mb-6">Manage monitored projects</p>

    {#if loading}
      <div class="space-y-3">
        {#each Array(3) as _, i (i)}
          <div
            class="h-20 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each projects as project, i (project.name || i)}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <div class="flex items-center gap-3 mb-3">
              <span class="text-2xl">📁</span>
              <div class="flex-1">
                <div class="font-semibold text-[var(--text)] font-mono">{project.name}</div>
                <div class="text-xs text-[var(--muted)] font-sans">
                  Status: {project.status || 'unknown'}
                </div>
              </div>
            </div>
            <div class="text-sm text-[var(--muted)] font-sans">
              Events: {project.recent_events || 0} • Health: {project.health_score || 0}%
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
