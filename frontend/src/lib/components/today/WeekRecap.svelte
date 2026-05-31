<script>
  /**
   * WeekRecap — inline replacement for WeeklyDigestModal.
   *
   * Shows the current ISO-week's lead sentence + supporting beats as
   * a Today card. No popup, no schedule — always visible when there's
   * a digest with events to report.
   *
   * @typedef {{glyph:string, tone:string, text:string}} Beat
   * @typedef {{kind:string, text:string}} Lead
   * @typedef {{week_key:string, week_start:string, week_end:string, lead:Lead, beats:Beat[], stats:Record<string,any>}} Digest
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../../apiClient.js';
  import { toneClass } from '../../utils/tone.js';

  const { api, abort } = createPageApi();

  /** @type {Digest|null} */
  let digest = $state(null);

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }

  async function load() {
    try {
      const data = await api.get('/digests/weekly');
      // Skip empty weeks (no events to talk about) and malformed payloads.
      if (data?.lead?.text && data.stats?.events > 0) digest = data;
    } catch {
      /* silent — supplementary surface */
    }
  }

  onMount(load);
  onDestroy(() => abort());
</script>

{#if digest && digest.lead?.text}
  <section
    class="bg-surface border border-border rounded-lg overflow-hidden h-full"
    aria-labelledby="week-recap-title"
  >
    <header class="px-5 pt-4 pb-2">
      <div class="text-[10px] font-mono uppercase tracking-wide text-muted mb-1">
        Your week · {fmtDate(digest.week_start)} – {fmtDate(digest.week_end)}
      </div>
      <h3 id="week-recap-title" class="text-lg font-bold text-heading tracking-[-0.015em]">
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
