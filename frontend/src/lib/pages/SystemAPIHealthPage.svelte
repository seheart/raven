<script>
  /**
   * API Health Page - Endpoint monitoring and health checks
   */
  import { onMount } from 'svelte';

  let healthChecks = $state([]);
  let summary = $state({ total: 0, passed: 0, failed: 0 });
  let loading = $state(true);

  onMount(async () => {
    try {
      const res = await fetch('http://localhost:3030/api/health-checks');
      const data = await res.json();
      healthChecks = data.checks || [];
      summary = data.summary || { total: 0, passed: 0, failed: 0 };
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🏥 API Health</h1>
    <p class="text-base text-[var(--muted)] font-sans mb-6">
      Endpoint monitoring and health checks
    </p>

    <!-- Summary -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 text-center">
        <div class="text-3xl font-bold text-[var(--text)] font-mono mb-1">{summary.total}</div>
        <div class="text-sm text-[var(--muted)] font-sans uppercase">Total Checks</div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 text-center">
        <div class="text-3xl font-bold text-[var(--success)] font-mono mb-1">{summary.passed}</div>
        <div class="text-sm text-[var(--muted)] font-sans uppercase">Passed</div>
      </div>

      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 text-center">
        <div class="text-3xl font-bold text-[var(--error)] font-mono mb-1">{summary.failed}</div>
        <div class="text-sm text-[var(--muted)] font-sans uppercase">Failed</div>
      </div>
    </div>

    <!-- Health Checks List -->
    {#if loading}
      <div class="space-y-3">
        {#each Array(6) as _, i (i)}
          <div
            class="h-16 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if healthChecks.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-4xl mb-3">🏥</div>
        <p class="text-[var(--text)] font-sans mb-2">No health checks configured</p>
        <p class="text-sm text-[var(--muted)] font-sans">
          Add API health checks to monitor endpoints
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-3">
        {#each healthChecks as check, i (check.endpoint || i)}
          {@const isHealthy = check.status === 'healthy' || check.passed}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4"
          >
            <div class="text-2xl">{isHealthy ? '✅' : '❌'}</div>
            <div class="flex-1">
              <div class="font-semibold text-[var(--text)] font-mono text-sm">
                {check.endpoint || check.name}
              </div>
              <div class="text-xs text-[var(--muted)] font-sans mt-1">
                {check.description || 'Health check'}
              </div>
            </div>
            <div
              class="px-3 py-1 rounded text-xs font-mono"
              class:bg-[var(--success-subtle)]={isHealthy}
              class:text-[var(--success)]={isHealthy}
              class:bg-[var(--error-subtle)]={!isHealthy}
              class:text-[var(--error)]={!isHealthy}
            >
              {isHealthy ? 'Healthy' : 'Failed'}
            </div>
            {#if check.response_time}
              <div class="text-xs text-[var(--muted)] font-mono">{check.response_time}ms</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
