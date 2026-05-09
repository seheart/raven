<script>
  import RavenLogo from '../ui/RavenLogo.svelte';
  import HeartbeatIndicator from './HeartbeatIndicator.svelte';
  import { navigate } from '../../utils/router.svelte.js';
  import { onMount } from 'svelte';
  import { dataService } from '../../dataService.js';
  import { projectFilter, availableProjects } from '../../projectFilterStore.js';
  import { get } from 'svelte/store';

  let { activeTab = 'overview', activeSubTab = '', _onLogoutClick = () => {} } = $props();

  // Header strip shows TODAY's activity, not lifetime totals. The +/-
  // styling reads like a diff, so it should mean "today's net activity"
  // not "every event ever recorded".
  let stats = $state({ filesToday: 0, editsToday: 0, createsToday: 0, deletesToday: 0 });
  // CPU/MEM display moved to VitalsStrip; state removed.
  let projects = $state([]);
  let currentFilter = $state(get(projectFilter));

  // Sync store to local state
  const unsubFilter = projectFilter.subscribe(v => {
    currentFilter = v;
  });

  function setProjectFilter(value) {
    projectFilter.set(value);
  }

  // Five top-level tabs after the May 2026 IA refactor.
  // Today = narrative landing; Activity = "what happened" (live + history of
  // file/code events); Agents = "what are my agents doing"; Insights = the
  // narrated reflection layer (costs, trends, Wrapped); System = ops + config.
  const tabs = [
    { id: 'today', label: 'Today', path: '/today' },
    { id: 'activity', label: 'Activity', path: '/activity' },
    { id: 'agents', label: 'Agents', path: '/agents' },
    { id: 'insights', label: 'Insights', path: '/insights' },
    { id: 'system', label: 'System', path: '/system' }
  ];

  const subTabs = {
    today: [
      { id: '', label: 'Narrative' },
      { id: 'power', label: 'Power' }
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
      { id: 'wrapped', label: 'Wrapped' }
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
        editsToday: data.edits_today || 0,
        createsToday: data.creates_today || 0,
        deletesToday: data.deletes_today || 0
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
        editsToday: d.edits_today || 0,
        createsToday: d.creates_today || 0,
        deletesToday: d.deletes_today || 0
      };
    });
    return () => {
      unsubStats();
      unsubFilter();
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

    <!-- Activity Stats — TODAY-scoped so the +/- actually means "net
         activity today" instead of "lifetime odometer". Hidden until xl
         so the nav has room at typical laptop widths. -->
    <div
      class="hidden xl:flex items-baseline gap-2 lg:gap-3 text-xs font-mono text-[var(--muted)] pl-2 lg:pl-4 border-l border-[var(--border)] shrink-0"
      title="Today's file activity since local midnight"
    >
      <span class="text-[10px] uppercase tracking-wide text-[var(--muted)]/70">Today</span>
      <span>{stats.filesToday} files</span>
      <span>~{stats.editsToday}</span>
      <span class="text-[var(--success)]">+{stats.createsToday}</span>
      <span class="text-[var(--error)]">-{stats.deletesToday}</span>
    </div>

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
