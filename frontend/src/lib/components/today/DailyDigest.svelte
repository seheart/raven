<script>
  /**
   * DailyDigest — the day's recap, narrated against your recent baseline.
   *
   * Sibling to WeekRecap: a lead sentence + supporting beats for the
   * current calendar day. Computed server-side (/digests/daily) with a
   * short TTL so "today" stays live as work lands.
   *
   * @typedef {{glyph:string, tone:string, text:string}} Beat
   * @typedef {{kind:string, text:string}} Lead
   * @typedef {{day:string, day_label:string, day_start:string, lead:Lead, beats:Beat[], stats:Record<string,any>}} Digest
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../../apiClient.js';
  import { toneClass } from '../../utils/tone.js';

  const { api, abort } = createPageApi();

  /** @type {Digest|null} */
  let digest = $state(null);
  /** @type {ReturnType<typeof setInterval>|null} */
  let ticker = null;

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function load() {
    try {
      const data = await api.get('/digests/daily');
      if (data?.lead?.text) digest = data;
    } catch {
      /* silent — supplementary surface */
    }
  }

  onMount(() => {
    load();
    // Refresh every 2 min so the day's recap keeps pace as work lands.
    ticker = setInterval(load, 120_000);
  });
  onDestroy(() => {
    if (ticker) clearInterval(ticker);
    abort();
  });
</script>

{#if digest && digest.lead?.text}
  <section
    class="bg-surface border border-border rounded-lg overflow-hidden h-full"
    aria-labelledby="daily-digest-title"
  >
    <header class="px-5 pt-4 pb-2">
      <div class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
        {digest.day_label} · {fmtDate(digest.day_start)}
      </div>
      <h3 id="daily-digest-title" class="text-lg font-bold text-heading tracking-[-0.015em]">
        {digest.lead.text}
      </h3>
    </header>
    {#if digest.beats?.length}
      <ul class="px-5 pb-4 space-y-1.5">
        {#each digest.beats as beat (beat.text)}
          <li class="flex items-start gap-3 text-sm">
            <span
              class="text-base leading-none {toneClass(
                beat.tone
              )} flex-shrink-0 select-none w-4 text-center"
              aria-hidden="true">{beat.glyph}</span
            >
            <span class="text-body font-sans leading-relaxed">{beat.text}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
