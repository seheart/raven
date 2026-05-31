<script>
  /**
   * PersonaCard — Raven's read on *you*.
   *
   * The relationship anchor of the Narrative page. A deterministic,
   * data-derived profile (chronotype, cadence, focus, languages, rhythm)
   * rendered as an archetype title + tagline + relational trait beats.
   * Computed server-side from 30 days of telemetry; no LLM.
   *
   * @typedef {{glyph:string, tone:string, label:string, text:string}} Trait
   * @typedef {{
   *   has_data:boolean, tenure_days:number, title:string, tagline:string,
   *   current_streak:number, window_days:number,
   *   languages:Array<{language:string, share:number}>,
   *   rhythm:{active_days:number}, traits:Trait[]
   * }} Persona
   */

  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../../apiClient.js';

  const { api, abort } = createPageApi();

  /** @type {Persona|null} */
  let persona = $state(null);
  let loading = $state(true);

  function toneClass(tone) {
    switch (tone) {
      case 'accent':
        return 'text-accent';
      case 'success':
        return 'text-success';
      case 'info':
        return 'text-info';
      case 'warning':
        return 'text-warning';
      default:
        return 'text-muted';
    }
  }

  async function load() {
    try {
      const data = await api.get('/persona');
      persona = data;
    } catch {
      /* silent — supplementary surface */
    } finally {
      loading = false;
    }
  }

  onMount(load);
  onDestroy(() => abort());
</script>

<section
  class="relative overflow-hidden rounded-lg border border-border bg-surface"
  aria-labelledby="persona-title"
>
  <!-- Atmospheric depth: a single restrained accent wash bleeding from the
       top-left, not a glow on everything. "Legit, but with the nebula." -->
  <div
    class="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full opacity-[0.07] blur-3xl"
    style="background: radial-gradient(circle, var(--accent), transparent 70%);"
    aria-hidden="true"
  ></div>

  <div class="relative p-6">
    <!-- Eyebrow: identity line + tenure on the right -->
    <div class="flex items-center justify-between gap-3 mb-3">
      <div
        class="text-[10px] font-mono uppercase tracking-[0.18em] text-muted flex items-center gap-2"
      >
        <span class="text-accent" aria-hidden="true">◆</span>
        Raven's read on you
      </div>
      {#if persona?.tenure_days > 0}
        <div class="text-[10px] font-mono uppercase tracking-wide text-muted/80">
          Watching {persona.tenure_days}d
        </div>
      {/if}
    </div>

    {#if loading && !persona}
      <div class="space-y-3 animate-pulse" aria-label="Reading your patterns">
        <div class="h-7 bg-surface-2 rounded w-2/3"></div>
        <div class="h-4 bg-surface-2 rounded w-1/2"></div>
        <div class="pt-3 space-y-2">
          <div class="h-4 bg-surface-2 rounded w-5/6"></div>
          <div class="h-4 bg-surface-2 rounded w-4/6"></div>
          <div class="h-4 bg-surface-2 rounded w-3/6"></div>
        </div>
      </div>
    {:else if persona}
      <!-- Archetype title — the hook. -->
      <h2
        id="persona-title"
        class="text-3xl font-bold text-heading tracking-[-0.02em] leading-tight"
      >
        {persona.title}
      </h2>
      <p class="mt-1.5 text-base text-muted font-sans italic leading-relaxed max-w-[44rem]">
        {persona.tagline}
      </p>

      {#if persona.traits?.length}
        <ul class="mt-5 space-y-2.5 max-w-[46rem]">
          {#each persona.traits as trait (trait.text)}
            <li class="flex items-baseline gap-3">
              <span
                class="font-mono text-base flex-shrink-0 w-5 text-center {toneClass(trait.tone)}"
                aria-hidden="true">{trait.glyph}</span
              >
              <span class="text-sm text-body font-sans leading-relaxed">{trait.text}</span>
            </li>
          {/each}
        </ul>
      {/if}

      <!-- Footer stat chips — quick "vitals" of the relationship. -->
      {#if persona.has_data}
        <div class="mt-5 pt-4 border-t border-border flex flex-wrap gap-2">
          {#if persona.current_streak > 0}
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-[11px] font-mono text-body"
            >
              <span class="text-success" aria-hidden="true">▲</span>
              {persona.current_streak}-day streak
            </span>
          {/if}
          {#if persona.rhythm?.active_days > 0}
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-[11px] font-mono text-muted"
            >
              {persona.rhythm.active_days}/{persona.window_days} active days
            </span>
          {/if}
          {#each (persona.languages || []).slice(0, 3) as lang (lang.language)}
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-[11px] font-mono text-muted"
            >
              {lang.language}
              <span class="text-muted/60">{Math.round(lang.share * 100)}%</span>
            </span>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</section>
