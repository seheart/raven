<script>
  import RavenLogo from '../ui/RavenLogo.svelte';
  import { navigate } from '../../utils/router.svelte.js';
  import { onMount } from 'svelte';
  import { api } from '../../apiClient.js';
  import { projectFilter, availableProjects } from '../../projectFilterStore.js';
  import { get } from 'svelte/store';

  let {
    activeTab = 'overview',
    activeSubTab = '',
    onSettingsClick = () => {},
    _onLogoutClick = () => {}
  } = $props();

  import { websocketService } from '../../services/websocket.js';

  let stats = $state({ files: 0, edits: 0, creates: 0, deletes: 0 });
  let cpu = $state(0);
  let mem = $state(0);
  let projects = $state([]);
  let currentFilter = $state(get(projectFilter));

  // Sync store to local state
  const unsubFilter = projectFilter.subscribe(v => {
    currentFilter = v;
  });

  function setProjectFilter(value) {
    projectFilter.set(value);
  }

  const tabs = [
    { id: 'overview', label: 'Dashboard', path: '/overview' },
    { id: 'insights', label: 'Insights', path: '/insights' },
    { id: 'analysis', label: 'Analysis', path: '/analysis' },
    { id: 'live', label: 'Code Changes', path: '/live' },
    { id: 'history', label: 'History', path: '/history' },
    { id: 'system', label: 'System', path: '/system' }
  ];

  const subTabs = {
    overview: [],
    insights: [],
    live: [],
    history: [
      { id: '', label: 'Activity Log' },
      { id: 'timeline', label: 'Timeline' },
      { id: 'code', label: 'Code Changes' },
      { id: 'files', label: 'File Browser' },
      { id: 'projects', label: 'Projects Comparison' },
      { id: 'health', label: 'Project Health' },
      { id: 'search', label: 'Global Search' }
    ],
    analysis: [
      { id: '', label: 'Overview' },
      { id: 'models', label: 'Models' },
      { id: 'performance', label: 'Performance' },
      { id: 'trends', label: 'Historical Trends' },
      { id: 'stats', label: 'Agent Stats' },
      { id: 'monitoring', label: 'Agent Monitoring' },
      { id: 'conversations', label: 'Agent Conversations' },
      { id: 'triggers', label: 'Triggers' }
    ],
    system: [
      { id: '', label: 'Overview' },
      { id: 'health-monitor', label: 'Health Monitor' },
      { id: 'safety', label: 'Safety' },
      { id: 'errors', label: 'Errors' },
      { id: 'projects', label: 'Projects' },
      { id: 'storage', label: 'Storage' }
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
      const data = await api.get('/dashboard-stats');
      stats = {
        files: data.total_files || 0,
        edits: data.edits || 0,
        creates: data.creates || 0,
        deletes: data.deletes || 0
      };
    } catch {
      // Silent fail — stats are supplementary
    }
  }

  async function loadProjects() {
    try {
      const data = await api.get('/projects');
      const names = (data.projects || []).filter(p => p.enabled).map(p => p.name);
      projects = names;
      availableProjects.set(names);
    } catch {
      // Silent fail
    }
  }

  onMount(() => {
    loadStats();
    loadProjects();

    // Fetch initial metrics
    api
      .get('/system-metrics?limit=1')
      .then(data => {
        if (Array.isArray(data) && data[0]) {
          cpu = data[0].cpu_percent || 0;
          mem = data[0].memory_percent || 0;
        }
      })
      .catch(() => {});

    // Live metrics via WebSocket
    const handleMetrics = data => {
      cpu = data.cpu_percent || 0;
      mem = data.memory_percent || 0;
    };
    websocketService.on('system-metrics', handleMetrics);

    const interval = setInterval(loadStats, 30000);
    return () => {
      clearInterval(interval);
      unsubFilter();
      websocketService.off('system-metrics', handleMetrics);
    };
  });
</script>

<header class="sticky top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)] font-sans">
  <div class="flex items-center gap-4 px-3 py-2 h-12">
    <!-- Logo -->
    <button
      onclick={e => handleNavClick(e, '/overview')}
      class="flex items-center gap-2 font-semibold text-[var(--text-heading)] text-base hover:text-[var(--accent)] transition-colors font-sans bg-transparent border-0 cursor-pointer p-0"
      aria-label="Go to Dashboard"
    >
      <RavenLogo size={18} />
      <span>Raven</span>
    </button>

    <!-- Main Navigation -->
    <nav class="flex gap-1 flex-1 font-sans" aria-label="Main navigation">
      {#each tabs as tab (tab.id)}
        <button
          onclick={e => handleNavClick(e, tab.path)}
          class={`px-3 py-1.5 rounded text-sm transition-colors font-sans border-0 cursor-pointer ${
            activeTab === tab.id
              ? 'bg-[var(--accent)] text-[#ffffff] font-semibold'
              : 'bg-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] font-medium'
          }`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <!-- Activity Stats (real data) -->
    <div
      class="flex gap-3 text-xs font-mono text-[var(--muted)] pl-4 border-l border-[var(--border)]"
    >
      <span>{stats.files} files</span>
      <span>{stats.edits} edits</span>
      <span class="text-[var(--success)]">+{stats.creates}</span>
      <span class="text-[var(--error)]">-{stats.deletes}</span>
    </div>

    <!-- CPU / Memory -->
    <div class="flex items-center gap-3 pl-3 border-l border-[var(--border)] text-xs font-mono">
      <div class="flex items-center gap-1.5" title="CPU: {cpu.toFixed(1)}%">
        <span class="text-[var(--muted)]">CPU</span>
        <div class="w-12 h-1.5 bg-[var(--bg)] rounded overflow-hidden">
          <div
            class="h-full transition-all duration-500 rounded"
            style="width: {cpu}%; background: {cpu > 80
              ? 'var(--error)'
              : cpu > 50
                ? 'var(--warning)'
                : 'var(--success)'}"
          ></div>
        </div>
        <span class="text-[var(--text)] w-8">{cpu.toFixed(0)}%</span>
      </div>
      <div class="flex items-center gap-1.5" title="Memory: {mem.toFixed(1)}%">
        <span class="text-[var(--muted)]">MEM</span>
        <div class="w-12 h-1.5 bg-[var(--bg)] rounded overflow-hidden">
          <div
            class="h-full transition-all duration-500 rounded"
            style="width: {mem}%; background: {mem > 85
              ? 'var(--error)'
              : mem > 60
                ? 'var(--warning)'
                : 'var(--success)'}"
          ></div>
        </div>
        <span class="text-[var(--text)] w-8">{mem.toFixed(0)}%</span>
      </div>
    </div>

    <!-- Project Filter -->
    {#if projects.length > 0}
      <div class="pl-3 border-l border-[var(--border)]">
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

    <!-- Settings -->
    <button
      onclick={onSettingsClick}
      class="px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 cursor-pointer"
      aria-label="Settings"
    >
      Settings
    </button>
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
                ? 'bg-[var(--accent)] text-[#ffffff] font-semibold'
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
