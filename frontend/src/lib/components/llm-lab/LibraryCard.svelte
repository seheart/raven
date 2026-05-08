<script>
  /**
   * LibraryCard — installed model catalog with size, family, quant.
   * Polls /api/ollama/library every 30s (rarely changes).
   */
  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';

  let models = $state([]);
  let error = $state(null);
  let ollamaOffline = $state(false);
  let offlineDetail = $state('');

  function formatSize(b) {
    const gb = b / 1e9;
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(b / 1e6).toFixed(0)} MB`;
  }

  // Color-code by family so the eye can group at a glance.
  function familyColor(family) {
    const map = {
      gemma3: 'var(--accent)',
      llama: 'var(--success)',
      qwen2: 'var(--warning)',
      qwen3: 'var(--warning)',
      'nomic-bert': 'var(--muted)'
    };
    return map[family] || 'var(--muted)';
  }

  async function refresh() {
    try {
      const data = await api.get('/ollama/library');
      ollamaOffline = data.ollama_status === 'offline';
      offlineDetail = data.detail || '';
      models = (data.models || []).sort((a, b) => b.size - a.size);
      error = null;
    } catch (e) {
      error = e.message || 'fetch failed';
    }
  }

  onMount(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  });
</script>

<div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
  <div class="flex items-baseline justify-between mb-3">
    <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Library</h3>
    <span class="text-[10px] text-[var(--muted)] font-mono">{models.length} installed</span>
  </div>

  {#if error}
    <div class="text-xs text-[var(--error)] font-mono">{error}</div>
  {:else if ollamaOffline}
    <div class="text-xs text-[var(--warning)] py-6 text-center">
      <div class="font-semibold">Ollama not reachable</div>
      {#if offlineDetail}
        <div class="text-[10px] text-[var(--muted)] font-mono mt-1">{offlineDetail}</div>
      {/if}
    </div>
  {:else if models.length === 0}
    <div class="text-xs text-[var(--muted)] py-6 text-center leading-relaxed">
      <div class="font-semibold text-body">No models on disk</div>
      <div class="mt-1.5">
        Pull one with <code class="font-mono text-body">ollama pull llama3</code> and it'll show up here.
      </div>
    </div>
  {:else}
    <div class="space-y-1.5">
      {#each models as m (m.name)}
        <div
          class="flex items-baseline gap-2 text-[11px] font-mono py-1 border-b border-[var(--border)] last:border-b-0"
        >
          <span
            class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style="background: {familyColor(m.family)}"
          ></span>
          <span class="text-[var(--text)] flex-1 truncate" title={m.name}>{m.name}</span>
          <span class="text-[var(--muted)]">{m.parameter_size}</span>
          <span class="text-[var(--muted)]">{m.quantization}</span>
          <span class="text-[var(--text)] w-16 text-right">{formatSize(m.size)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
