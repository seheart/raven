<script>
  import RavenLogo from '../ui/RavenLogo.svelte';
  import HeartbeatIndicator from './HeartbeatIndicator.svelte';
  import HeaderLlmPill from './HeaderLlmPill.svelte';
  import EndpointHealthPill from './EndpointHealthPill.svelte';
  import { navigate } from '../../utils/router.svelte.js';
  import { onMount } from 'svelte';
  import { dataService } from '../../dataService.js';
  import { projectFilter, availableProjects } from '../../projectFilterStore.js';
  import { settings } from '../../stores/settingsStore.js';
  import { get } from 'svelte/store';
  import { formatUsd } from '../../utils/formatUsd.js';

  let { activeTab = 'overview', activeSubTab = '', _onLogoutClick = () => {} } = $props();

  // Header strip frames today's file activity against a 14-day baseline
  // so the number means something. Raw counts ("121 files") have no
  // reference point — a multiplier ("1.4× usual") tells you whether
  // today is a busy day or a quiet one. The previous +/- styling read
  // like a git line-diff but actually counted file create/delete events,
  // which silently misled anyone who'd ever used `git diff --stat`.
  let stats = $state({ filesToday: 0, filesAvg: 0, costToday: 0 });
  // CPU/MEM display moved to VitalsStrip; state removed.
  let projects = $state([]);
  let currentFilter = $state(get(projectFilter));
  let billingMode = $state(get(settings)?.billing?.mode || 'subscription');
  const unsubBilling = settings.subscribe(s => {
    billingMode = s?.billing?.mode || 'subscription';
  });

  // Bucket today's file count against the 14-day baseline. The bands
  // (0.85–1.15 = typical) are wide enough that day-to-day noise reads
  // as "typical pace" rather than oscillating between "busy" and
  // "quiet" for no real reason.
  const framing = $derived.by(() => {
    if (stats.filesAvg <= 0) return { label: '', tone: 'muted' };
    const ratio = stats.filesToday / stats.filesAvg;
    if (ratio >= 1.15) return { label: `${ratio.toFixed(1)}× usual`, tone: 'body' };
    if (ratio >= 0.85) return { label: 'typical pace', tone: 'muted' };
    if (stats.filesToday === 0) return { label: 'quiet so far', tone: 'muted' };
    return { label: 'quieter than usual', tone: 'muted' };
  });
  const baselineTip = $derived(
    stats.filesAvg > 0
      ? `vs your 14-day average of ${stats.filesAvg.toFixed(0)} files/day`
      : 'Distinct files touched since local midnight (no baseline yet)'
  );

  // Compact dollar formatting. Header has no room for "$1,234.56" so
  // anything four-figure rounds to whole dollars; sub-dollar shows cents.
  // Uses the canonical formatter to keep comma grouping consistent
  // with the rest of the app.
  function formatCostShort(usd) {
    if (!usd || usd <= 0) return '';
    if (usd >= 10) return formatUsd(usd, { precision: 0 });
    return formatUsd(usd);
  }
  const costLabel = $derived(billingMode === 'api' ? formatCostShort(stats.costToday) : '');

  // Sync filter store to local state so the <select> reflects the
  // current filter even when changed elsewhere.
  const unsubFilter = projectFilter.subscribe(v => {
    currentFilter = v;
  });

  function setProjectFilter(value) {
    projectFilter.set(value);
  }

  // Five top-level tabs after the May 2026 IA refactor.
  // Dashboard = the home view (vitals + activity at a glance) plus Narrative
  // as a sub-tab; Activity = "what happened" (live + history of file/code
  // events); Agents = "what are my agents doing"; Insights = the narrated
  // reflection layer (costs, trends, Wrapped); System = ops + config.
  // The route id stays 'today' so existing /today links and tests still work.
  const tabs = [
    { id: 'today', label: 'Dashboard', path: '/today' },
    { id: 'activity', label: 'Activity', path: '/activity' },
    { id: 'agents', label: 'Agents', path: '/agents' },
    { id: 'insights', label: 'Insights', path: '/insights' },
    { id: 'system', label: 'System', path: '/system' }
  ];

  const subTabs = {
    today: [
      { id: 'narrative', label: 'Narrative' },
      { id: '', label: 'Overview' }
    ],
    activity: [
      { id: '', label: 'Overview' },
      { id: 'live', label: 'Live' },
      { id: 'changes', label: 'Changes' },
      { id: 'timeline', label: 'Timeline' },
      { id: 'files', label: 'Files' },
      { id: 'projects', label: 'Projects' },
      { id: 'health', label: 'Health' },
      { id: 'search', label: 'Search' }
    ],
    agents: [
      { id: '', label: 'Monitor' },
      { id: 'stats', label: 'Stats' },
      { id: 'convos', label: 'Conversations' },
      { id: 'sub-agents', label: 'Sub-Agents' },
      { id: 'sessions', label: 'Sessions' },
      { id: 'network', label: 'Network' },
      { id: 'models', label: 'Models' },
      { id: 'performance', label: 'Performance' }
    ],
    insights: [
      { id: '', label: 'Overview' },
      { id: 'costs', label: 'Costs' },
      { id: 'trends', label: 'Trends' },
      { id: 'wrapped', label: 'Looking Back' }
    ],
    system: [
      { id: '', label: 'Overview' },
      { id: 'code-health', label: 'Code Health' },
      { id: 'health-monitor', label: 'Health Monitor' },
      { id: 'safety', label: 'Safety' },
      { id: 'errors', label: 'Errors' },
      { id: 'projects', label: 'Projects' },
      { id: 'storage', label: 'Storage' },
      { id: 'plugins', label: 'Plugins' },
      { id: 'triggers', label: 'Triggers' }
    ],
    settings: []
  };

  const currentSubTabs = $derived(subTabs[activeTab] || []);

  function handleNavClick(event, path) {
    event.preventDefault();
    navigate(path);
  }

  function handleSubNavClick(event, subId) {
    event.preventDefault();
    const path = subId ? `/${activeTab}/${subId}` : `/${activeTab}`;
    navigate(path);
  }

  async function loadStats() {
    try {
      const data = await dataService.fetchDashboardStats();
      stats = {
        filesToday: data.active_files_today || 0,
        filesAvg: data.files_avg_14d || 0,
        costToday: data.cost_today_usd || 0
      };
    } catch {
      // Silent fail — stats are supplementary
    }
  }

  async function loadProjects() {
    try {
      const list = await dataService.fetchProjects();
      const names = list.filter(p => p.enabled).map(p => p.name);
      projects = names;
      availableProjects.set(names);
    } catch {
      // Silent fail
    }
  }

  onMount(() => {
    loadStats();
    loadProjects();
    // dataService.startBackgroundRefresh() already refreshes dashboardStats every 15s.
    const unsubStats = dataService.stores.dashboardStats.subscribe(d => {
      if (!d || typeof d !== 'object') return;
      stats = {
        filesToday: d.active_files_today || 0,
        filesAvg: d.files_avg_14d || 0,
        costToday: d.cost_today_usd || 0
      };
    });
    return () => {
      unsubStats();
      unsubFilter();
      unsubBilling();
    };
  });
</script>

<header class="sticky top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)] font-sans">
  <div class="flex items-center gap-2 lg:gap-4 px-2 lg:px-3 py-2 h-12">
    <!-- Logo -->
    <button
      onclick={e => handleNavClick(e, '/today')}
      class="flex items-center gap-2 font-semibold text-[var(--text-heading)] text-base hover:text-[var(--accent)] transition-colors font-sans bg-transparent border-0 cursor-pointer p-0 shrink-0"
      aria-label="Go to Today"
    >
      <RavenLogo size={18} />
      <span class="hidden lg:inline">Raven</span>
    </button>

    <!-- Main Navigation -->
    <nav
      class="flex gap-0.5 lg:gap-1 flex-1 font-sans overflow-x-auto"
      aria-label="Main navigation"
    >
      {#each tabs as tab (tab.id)}
        <button
          onclick={e => handleNavClick(e, tab.path)}
          class={`px-2 lg:px-3 py-1.5 rounded text-sm transition-colors font-sans border-0 cursor-pointer whitespace-nowrap ${
            activeTab === tab.id
              ? 'bg-[var(--accent)] text-canvas font-semibold'
              : 'bg-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] font-medium'
          }`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <!-- Activity Strip — file count framed against a 14-day baseline,
         plus today's API cost (USD billing only). Project focus lives
         in the filter dropdown to the right rather than as a passive
         display, since users routinely work across multiple projects
         and the "top project" framing was misleading. Hidden until xl
         so the nav has room at typical laptop widths. -->
    <div
      class="hidden xl:flex items-baseline gap-2 lg:gap-3 text-xs font-mono pl-2 lg:pl-4 border-l border-[var(--border)] shrink-0"
      title={baselineTip}
    >
      <span class="text-[10px] uppercase tracking-wide text-[var(--muted)]/70">Today</span>
      <span class="text-[var(--text)]">{stats.filesToday} files</span>
      {#if framing.label}
        <span class="text-[var(--border)]">·</span>
        <span class={framing.tone === 'body' ? 'text-[var(--text)]' : 'text-[var(--muted)]'}
          >{framing.label}</span
        >
      {/if}
      {#if costLabel}
        <span class="text-[var(--border)]">·</span>
        <button
          onclick={e => handleNavClick(e, '/insights/costs')}
          class="text-[var(--text)] bg-transparent border-0 cursor-pointer p-0 hover:text-[var(--accent)] transition-colors"
          title="Estimated Claude API cost since local midnight. Click for the full breakdown."
          >{costLabel}</button
        >
      {/if}
    </div>

    <!-- Endpoint health pill — only renders when one or more /system page
         endpoints are currently failing the periodic HealthChecker sweep.
         Hidden when all green; red + count when not. Click → diagnostic. -->
    <EndpointHealthPill />

    <!-- Local LLM status pill — always-on view of what's resident in
         VRAM, GPU temp, and model library size. Sits between the
         activity strip and the heartbeat so the eyebrow tells a complete
         "what's happening right now" story across project work, local
         LLM, and agent activity. Hidden under xl to make room for nav. -->
    <HeaderLlmPill />

    <!-- Persistent agent heartbeat — global presence element. Visible on
         every page; rhythm + color reflect the most-active agent's state.
         Honest stillness when nothing is happening. -->
    <HeartbeatIndicator />

    <!-- CPU / MEM bars moved to the global VitalsStrip below the header. -->

    <!-- Project Filter — hidden on small screens -->
    {#if projects.length > 0}
      <div class="hidden sm:block pl-2 lg:pl-3 border-l border-[var(--border)] shrink-0">
        <select
          value={currentFilter}
          onchange={e => setProjectFilter(e.target.value)}
          class="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono text-[var(--text)] cursor-pointer hover:border-[var(--accent)] transition-colors"
          aria-label="Filter by project"
        >
          <option value="all">All Projects</option>
          {#each projects as proj (proj)}
            <option value={proj}>{proj}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <!-- Sub-Navigation -->
  {#if currentSubTabs.length > 0}
    <div class="border-t border-[var(--border)] bg-[var(--bg)]">
      <nav class="flex gap-1 px-3 py-1.5 font-sans overflow-x-auto" aria-label="Sub navigation">
        {#each currentSubTabs as subTab (subTab.id)}
          <button
            onclick={e => handleSubNavClick(e, subTab.id)}
            class={`px-3 py-1 rounded text-xs transition-colors font-sans border-0 cursor-pointer whitespace-nowrap ${
              activeSubTab === subTab.id
                ? 'bg-[var(--accent)] text-canvas font-semibold'
                : 'bg-transparent text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] font-medium'
            }`}
            aria-current={activeSubTab === subTab.id ? 'page' : undefined}
          >
            {subTab.label}
          </button>
        {/each}
      </nav>
    </div>
  {/if}
</header>
