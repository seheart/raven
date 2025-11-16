<script>
  /**
   * Intelligence Page - AI insights and pattern analysis
   */
  import { onMount } from 'svelte';

  let loading = $state(true);

  onMount(async () => {
    try {
      await fetch('http://localhost:3030/api/intelligence');
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🧠 Intelligence</h1>
    <p class="text-base text-[var(--muted)] font-sans mb-6">AI insights and pattern analysis</p>

    {#if loading}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-4xl mb-3">⏳</div>
        <p class="text-[var(--text)] font-sans">Loading intelligence data...</p>
      </div>
    {:else}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-4xl mb-3">🧠</div>
        <p class="text-[var(--text)] font-sans mb-2">Intelligence System</p>
        <p class="text-sm text-[var(--muted)] font-sans">AI-powered insights coming soon</p>
      </div>
    {/if}
  </div>
</div>
