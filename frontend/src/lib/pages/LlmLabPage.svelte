<script>
  /**
   * LLM Lab — prototype area for live local-LLM monitoring widgets.
   * Once a layout/visualization feels right, we shrink the AI Pulse
   * on the Overview page and merge winning cards into that space.
   */
  import ActiveModelCard from '../components/llm-lab/ActiveModelCard.svelte';
  import GpuHealthCard from '../components/llm-lab/GpuHealthCard.svelte';
  import RecentInferencesCard from '../components/llm-lab/RecentInferencesCard.svelte';
  import LibraryCard from '../components/llm-lab/LibraryCard.svelte';
  import CompactActiveModel from '../components/llm-lab/CompactActiveModel.svelte';
  import CompactGpuHealth from '../components/llm-lab/CompactGpuHealth.svelte';
  import CombinedLlmCard from '../components/llm-lab/CombinedLlmCard.svelte';
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-[1600px] mx-auto">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Local LLM Lab</h1>
      <p class="text-sm text-[var(--muted)]">
        Prototype area for live Ollama monitoring. All cards refresh on their own interval (or
        stream live via websocket). Once a layout feels right we'll shrink the AI Pulse and merge
        the winners into the Overview.
      </p>
    </div>

    <!-- ── Dashboard column treatments ─────────────────────────────────
         Three options for what goes in the column we'd carve out of the
         current AI Pulse. Each preview is the actual width that column
         would render at on the live dashboard (~1/3 of the page). Pick
         the one that reads best at this size. -->
    <div class="mb-8">
      <h2 class="text-base font-semibold text-[var(--text-heading)] mb-1">
        Dashboard column treatments
      </h2>
      <p class="text-xs text-[var(--muted)] mb-4">
        Each preview shows what the LLM area would look like in the dashboard's narrow column (≈ 1/3
        of the page, the space currently used by the AI Pulse's extra width). Pick the treatment
        that reads best.
      </p>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <!-- Option 1 — Full cards stacked (the current lab cards) -->
        <div>
          <div class="text-[11px] font-mono uppercase tracking-wide text-[var(--muted)] mb-2 px-1">
            Option 1 · Full cards
          </div>
          <div class="flex flex-col gap-3">
            <ActiveModelCard />
            <GpuHealthCard />
          </div>
        </div>

        <!-- Option 2 — Compact stacked -->
        <div>
          <div class="text-[11px] font-mono uppercase tracking-wide text-[var(--muted)] mb-2 px-1">
            Option 2 · Compact pair
          </div>
          <div class="flex flex-col gap-3">
            <CompactActiveModel />
            <CompactGpuHealth />
          </div>
        </div>

        <!-- Option 3 — Combined single card -->
        <div>
          <div class="text-[11px] font-mono uppercase tracking-wide text-[var(--muted)] mb-2 px-1">
            Option 3 · Combined tile
          </div>
          <CombinedLlmCard />
        </div>
      </div>
    </div>

    <!-- ── Existing wide-format lab cards (the long-form / dedicated-page treatment) -->
    <h2 class="text-base font-semibold text-[var(--text-heading)] mb-1">
      Long-form (dedicated-page) treatment
    </h2>
    <p class="text-xs text-[var(--muted)] mb-4">
      Where the deeper inference history and library would live — `/system/llms` or similar.
    </p>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <ActiveModelCard />
      <GpuHealthCard />
    </div>

    <!-- Middle row — live activity -->
    <div class="grid grid-cols-1 mb-4">
      <RecentInferencesCard />
    </div>

    <!-- Bottom row — slower-moving reference -->
    <div class="grid grid-cols-1">
      <LibraryCard />
    </div>
  </div>
</div>
