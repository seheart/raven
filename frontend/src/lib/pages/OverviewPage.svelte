<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { api } from '../apiClient.js';
  import { navigate } from '../utils/router.svelte.js';
  import { websocketService } from '../services/websocket.js';
  import { projectFilter } from '../projectFilterStore.js';
  import { get } from 'svelte/store';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';
  import NebulaActivity from '../components/NebulaActivity.svelte';

  // State
  let stats = $state({
    total_events: 0,
    total_files: 0,
    creates: 0,
    edits: 0,
    deletes: 0,
    total_agents: 0,
    app_errors: 0
  });
  let systemMetrics = $state({
    cpu_percent: 0,
    memory_percent: 0,
    memory_used_mb: 0,
    memory_total_mb: 0
  });
  let agentStatus = $state(null);
  let recentFiles = $state([]);
  let liveEvents = $state([]);
  let agents = $state([]);
  let loading = $state(false);
  let lastUpdated = $state(new Date());

  // Live activity feed — unified stream of all events
  let activityFeed = $state([]);
  let latestDiff = $state(null);
  let syntaxAlerts = $state([]);
  let workingAgents = $state(new Set());
  let workingAgentTimers = {};
  let diffDebounceTimer = null;
  let lastDiffFilepath = '';
  let ephemeralTimers = []; // Track all short-lived timeouts for cleanup

  // AI Insights
  let latestSummary = $state(null);

  // Charts
  let trendChart = null;
  let themeObserver = null;

  // Visual enhancements
  let prevStats = $state({
    total_events: 0,
    total_files: 0,
    creates: 0,
    edits: 0,
    deletes: 0,
    app_errors: 0
  });
  let statsFlash = $state({});
  let cpuHistory = $state(new Array(30).fill(0));
  let memHistory = $state(new Array(30).fill(0));
  let activityLevel = $state(0); // 0-1, drives ambient warmth
  let workingStates = $state({}); // agentName -> { text, cycle }
  const workingTexts = [
    'Reading files...',
    'Analyzing...',
    'Generating...',
    'Writing code...',
    'Thinking...'
  ];

  // Derived
  const cpuColor = $derived(
    systemMetrics.cpu_percent > 80
      ? 'var(--error)'
      : systemMetrics.cpu_percent > 50
        ? 'var(--warning)'
        : 'var(--success)'
  );
  const memColor = $derived(
    systemMetrics.memory_percent > 85
      ? 'var(--error)'
      : systemMetrics.memory_percent > 60
        ? 'var(--warning)'
        : 'var(--success)'
  );
  const eventsPerMin = $derived.by(() => {
    if (recentFiles.length < 2) return '0';
    const newest = new Date(recentFiles[0]?.timestamp || 0);
    const oldest = new Date(recentFiles[recentFiles.length - 1]?.timestamp || 0);
    if (isNaN(newest.getTime()) || isNaN(oldest.getTime())) return '0';
    const minutes = Math.max(1, (newest - oldest) / 60000);
    return (recentFiles.length / minutes).toFixed(1);
  });

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  function formatNumber(n) {
    return n?.toLocaleString() || '0';
  }

  function pushActivity(item) {
    const id = Date.now() + Math.random();
    activityFeed = [{ ...item, _id: id, _new: true }, ...activityFeed].slice(0, 30);
    // Clear "new" flag after animation
    const timer = setTimeout(() => {
      activityFeed = activityFeed.map(a => (a._id === id ? { ...a, _new: false } : a));
      ephemeralTimers = ephemeralTimers.filter(t => t !== timer);
    }, 1500);
    ephemeralTimers.push(timer);
  }

  function markAgentWorking(agentName) {
    workingAgents = new Set([...workingAgents, agentName]);
    // Cycle working text
    const cycle = (workingStates[agentName]?.cycle || 0) + 1;
    workingStates = {
      ...workingStates,
      [agentName]: { text: workingTexts[cycle % workingTexts.length], cycle }
    };
    // Update activity level
    activityLevel = Math.min(1, activityLevel + 0.15);
    ephemeralTimers.push(
      setTimeout(() => {
        activityLevel = Math.max(0, activityLevel - 0.05);
      }, 3000)
    );
    // Clear working state after 8s of inactivity
    clearTimeout(workingAgentTimers[agentName]);
    workingAgentTimers[agentName] = setTimeout(() => {
      workingAgents = new Set([...workingAgents].filter(a => a !== agentName));
      const { [agentName]: _, ...rest } = workingStates;
      workingStates = rest;
    }, 8000);
  }

  function renderMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<strong class="text-[var(--text-heading)]">$1</strong>')
      .replace(/^## (.+)$/gm, '<strong class="text-[var(--text-heading)]">$1</strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--text-heading)]">$1</strong>')
      .replace(
        /`([^`]+)`/g,
        '<code class="px-1 py-0.5 bg-[var(--bg)] rounded text-[var(--accent)] text-[10px] font-mono">$1</code>'
      )
      .replace(/^- (.+)$/gm, '<span class="ml-2">- $1</span>')
      .replace(/\n/g, '<br>');
  }

  function getAgentColorByName(name) {
    // These are brand colors for agent identification — intentionally static
    // They work on both light and dark backgrounds at these saturation levels
    const agentColors = {
      'Claude Code': 'var(--accent)',
      claude: 'var(--accent)',
      Ollama: 'var(--warning)',
      ollama: 'var(--warning)',
      'lm-studio': 'var(--success)',
      cursor: 'var(--success)',
      aider: 'var(--accent)',
      copilot: 'var(--info)'
    };
    return agentColors[name] || 'var(--muted)';
  }

  // Heartbeat SVG path for agents
  function heartbeatPath(state) {
    if (state === 'working')
      return 'M0,15 L8,15 L10,5 L12,25 L14,10 L16,20 L18,15 L26,15 L28,5 L30,25 L32,10 L34,20 L36,15 L44,15';
    if (state === 'running') return 'M0,15 L15,15 L17,8 L19,22 L21,15 L44,15';
    return 'M0,15 L44,15'; // flatline
  }

  // Flash stat on change — single timeout clears all, no race condition
  function checkStatChanges(newStats) {
    const flashes = {};
    for (const key of [
      'total_events',
      'total_files',
      'creates',
      'edits',
      'deletes',
      'app_errors'
    ]) {
      if (newStats[key] !== prevStats[key] && prevStats[key] > 0) {
        flashes[key] = true;
      }
    }
    statsFlash = flashes;
    prevStats = { ...newStats };
    if (Object.keys(flashes).length > 0) {
      ephemeralTimers.push(
        setTimeout(() => {
          statsFlash = {};
        }, 1000)
      );
    }
  }

  function getChangeColor(type) {
    if (type === 'add' || type === 'create') return 'var(--success)';
    if (type === 'unlink' || type === 'delete') return 'var(--error)';
    return 'var(--accent)';
  }

  function createCharts() {
    const colors = getChartColors();

    // Activity trend (5m) — 30 buckets of 10 seconds each
    if (trendChart) destroyChart(trendChart);
    const bucketCount = 30;
    const bucketMs = 10000; // 10 seconds per bucket
    const bucketData = new Array(bucketCount).fill(0);
    const now = new Date();
    recentFiles.forEach(e => {
      const diffMs = now - new Date(e.timestamp);
      const bucket = Math.floor(diffMs / bucketMs);
      if (bucket >= 0 && bucket < bucketCount) bucketData[bucketCount - 1 - bucket]++;
    });
    const labels = Array.from({ length: bucketCount }, (_, i) => {
      const secsAgo = (bucketCount - 1 - i) * 10;
      const t = new Date(now.getTime() - secsAgo * 1000);
      const h = String(t.getHours()).padStart(2, '0');
      const m = String(t.getMinutes()).padStart(2, '0');
      const s = String(t.getSeconds()).padStart(2, '0');
      return `${h}:${m}:${s}`;
    });

    trendChart = createChart('chart-trend', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: bucketData,
            borderColor: colors.primary,
            backgroundColor: `${colors.primary}20`,
            fill: true,
            tension: 0.4,
            pointRadius: 1,
            pointHoverRadius: 4,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: {
              color: colors.muted,
              font: { size: 9, family: 'monospace' },
              maxRotation: 0,
              autoSkipPadding: 20
            },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: colors.muted, font: { size: 10, family: 'monospace' }, precision: 0 },
            grid: { color: `${colors.border}` }
          }
        }
      }
    });
  }

  async function loadData() {
    try {
      const pf = get(projectFilter);
      const pq = pf && pf !== 'all' ? `&project=${encodeURIComponent(pf)}` : '';
      const [statsData, metricsData, fileEvents, agentData] = await Promise.all([
        api.get(`/dashboard-stats?_=1${pq}`).catch(() => stats),
        api.get('/system-metrics?limit=1').catch(() => []),
        api.get(`/file-events?limit=100${pq}`).catch(() => []),
        api.get('/agents-status').catch(() => [])
      ]);

      checkStatChanges(statsData);
      stats = statsData;
      systemMetrics = Array.isArray(metricsData) && metricsData[0] ? metricsData[0] : systemMetrics;
      recentFiles = Array.isArray(fileEvents) ? fileEvents : [];
      agents = Array.isArray(agentData) ? agentData : [];
      agentStatus = agents[0] || null;

      lastUpdated = new Date();
      loading = false;
      setTimeout(createCharts, 100);

      // Load latest AI insight (non-blocking)
      api
        .get('/insights/latest')
        .then(data => {
          if (data?.id) latestSummary = data;
        })
        .catch(() => {});
    } catch (err) {
      logger.error('Dashboard load failed:', err);
      loading = false;
    }
  }

  // WebSocket: live updates
  const handleMetrics = data => {
    systemMetrics = data;
    // Track history for sparklines
    cpuHistory = [...cpuHistory.slice(1), data.cpu_percent || 0];
    memHistory = [...memHistory.slice(1), data.memory_percent || 0];
  };

  const handleFileChanged = event => {
    // Push to activity feed with animation
    pushActivity({
      type: 'file',
      icon: event.change_type === 'add' ? '+' : event.change_type === 'unlink' ? '-' : '~',
      color: getChangeColor(event.change_type),
      text: event.filepath,
      agent: event.agent_source,
      timestamp: event.timestamp || new Date().toISOString()
    });

    // Debounced diff fetch — only fetch for the latest file, silently
    if (event.filepath && event.change_type !== 'unlink') {
      lastDiffFilepath = event.filepath;
      clearTimeout(diffDebounceTimer);
      diffDebounceTimer = setTimeout(() => {
        const fp = lastDiffFilepath;
        api
          .get(`/file-events?limit=1&diff=true&filepath=${encodeURIComponent(fp)}`)
          .then(data => {
            const ev = Array.isArray(data) ? data[0] : null;
            if (ev?.diff) {
              latestDiff = {
                filepath: ev.filepath,
                diff: ev.diff,
                change_type: ev.change_type,
                agent_source: ev.agent_source,
                timestamp: ev.timestamp
              };
            }
          })
          .catch(() => {
            /* diff is supplementary */
          });
      }, 1000);
    }

    // Reload stats (debounced by cache)
    loadData();
  };

  const handleAgentEvent = event => {
    liveEvents = [{ ...event, _ts: Date.now() }, ...liveEvents].slice(0, 20);

    // Mark agent as actively working
    const agentName = event.agent_name || event.agent;
    if (agentName) {
      markAgentWorking(agentName);
    }

    // Push to activity feed
    pushActivity({
      type: 'agent',
      icon: '>>',
      color: 'var(--accent)',
      text: `${agentName}: ${event.event_type || event.type || 'activity'}`,
      agent: agentName,
      timestamp: event.timestamp || new Date().toISOString()
    });
  };

  const handleSyntaxError = data => {
    syntaxAlerts = [{ ...data, _ts: Date.now() }, ...syntaxAlerts].slice(0, 5);
    pushActivity({
      type: 'error',
      icon: '!!',
      color: 'var(--error)',
      text: `Syntax error in ${data.filepath} (${data.count} issue${data.count > 1 ? 's' : ''})`,
      timestamp: new Date().toISOString()
    });
  };

  const handlePatternWarning = data => {
    pushActivity({
      type: 'warning',
      icon: '??',
      color: 'var(--warning)',
      text: `Pattern warning in ${data.filepath} (${data.count} issue${data.count > 1 ? 's' : ''})`,
      timestamp: new Date().toISOString()
    });
  };

  const handleGitStatus = () => {
    // Git status is displayed in the Footer via its own WebSocket listener
  };

  const handleModelStatus = data => {
    pushActivity({
      type: 'model',
      icon: data.status === 'running' ? '<<' : '>>',
      color: data.status === 'running' ? 'var(--success)' : 'var(--warning)',
      text: `${data.name} ${data.status === 'running' ? 'started' : 'stopped'}${data.models?.length ? ` (${data.models.join(', ')})` : ''}`,
      timestamp: data.timestamp || new Date().toISOString()
    });
    loadData(); // Refresh agent list
  };

  const handleAppError = () => {
    stats.app_errors++;
  };

  const handleHealthAlert = data => {
    pushActivity({
      type: 'health',
      icon: '!!',
      color: 'var(--error)',
      text: `Health alert: ${data.message || data.overallStatus || 'system issue'}`,
      timestamp: new Date().toISOString()
    });
  };

  // Reload when project filter changes
  const unsubFilter = projectFilter.subscribe(() => {
    loadData();
  });

  onMount(async () => {
    await loadData();

    websocketService.connect();
    websocketService.on('system-metrics', handleMetrics);
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('syntax-error', handleSyntaxError);
    websocketService.on('pattern-warning', handlePatternWarning);
    websocketService.on('git-status', handleGitStatus);
    websocketService.on('model-status-changed', handleModelStatus);
    websocketService.on('health-alert', handleHealthAlert);
    websocketService.on('app-error', handleAppError);

    themeObserver = createThemeObserver(() => createCharts());

    // Auto-refresh every 30s
    const interval = setInterval(loadData, 30000);

    return () => {
      websocketService.off('system-metrics', handleMetrics);
      websocketService.off('file-changed', handleFileChanged);
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('syntax-error', handleSyntaxError);
      websocketService.off('pattern-warning', handlePatternWarning);
      websocketService.off('git-status', handleGitStatus);
      websocketService.off('model-status-changed', handleModelStatus);
      websocketService.off('health-alert', handleHealthAlert);
      websocketService.off('app-error', handleAppError);
      if (themeObserver) themeObserver.disconnect();
      if (trendChart) destroyChart(trendChart);
      clearInterval(interval);
      unsubFilter();
      Object.values(workingAgentTimers).forEach(t => clearTimeout(t));
      clearTimeout(diffDebounceTimer);
      ephemeralTimers.forEach(t => clearTimeout(t));
    };
  });
</script>

<div
  class="min-h-screen p-4 pb-16 transition-all duration-[3000ms]"
  style="background: color-mix(in srgb, var(--bg) {100 -
    activityLevel * 8}%, var(--accent) {activityLevel * 8}%)"
>
  <div class="mx-auto px-2">
    <!-- Header -->
    <div class="flex justify-between items-center mb-3 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <h1 class="text-xl font-bold text-[var(--text-heading)]">Dashboard</h1>
        <span class="text-xs text-[var(--muted)] font-sans">Real-time monitoring</span>
      </div>
      <div class="flex items-center gap-3">
        {#if agentStatus}
          <span class="flex items-center gap-2 text-sm font-mono">
            <span
              class="w-2 h-2 rounded-full {agentStatus.is_running
                ? 'bg-[var(--success)] animate-pulse'
                : 'bg-[var(--muted)]'}"
            ></span>
            <span class="text-[var(--text)]">{agentStatus.agent_name}</span>
          </span>
        {/if}
        <span class="text-xs text-[var(--muted)] font-mono">{formatTime(lastUpdated)}</span>
        <button
          onclick={loadData}
          disabled={loading}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '...' : '↻'} Refresh
        </button>
      </div>
    </div>

    <!-- AI Activity + Live Feed -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
      <div class="lg:col-span-2">
        <NebulaActivity />
      </div>
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex flex-col"
        style="height: 260px;"
      >
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Live Activity
          </h3>
          <span class="flex items-center gap-1.5 text-[10px] text-[var(--success)] font-mono">
            <span class="w-1.5 h-1.5 bg-[var(--success)] rounded-full animate-pulse"></span>
            Live
          </span>
        </div>
        <div class="space-y-0.5 overflow-y-auto flex-1">
          {#if activityFeed.length === 0 && recentFiles.length === 0}
            <div class="text-center py-6 text-xs text-[var(--muted)]">
              <span class="inline-block idle-breathing">Waiting for activity</span>
            </div>
          {:else}
            {#each activityFeed.length > 0 ? activityFeed : recentFiles
                  .slice(0, 15)
                  .map( (e, i) => ({ _id: e.id ?? i, _new: false, type: 'file', icon: e.change_type === 'add' ? '+' : e.change_type === 'unlink' ? '-' : '~', color: getChangeColor(e.change_type), text: e.filepath, agent: e.agent_source, timestamp: e.timestamp }) ) as item (item._id)}
              <div
                class="flex items-center gap-1.5 px-1.5 py-1 rounded transition-all duration-500 {item._new
                  ? 'feed-slide-in'
                  : 'hover:bg-[var(--bg)]'}"
                style="border-left: 2px solid {item.color}; {item._new
                  ? `box-shadow: inset 3px 0 8px -4px ${item.color}`
                  : ''}"
              >
                <span
                  class="w-4 text-center text-[9px] font-bold font-mono flex-shrink-0"
                  style="color: {item.color}">{item.icon}</span
                >
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] font-mono text-[var(--text)] truncate">{item.text}</div>
                </div>
                <span class="text-[9px] text-[var(--muted)] font-mono flex-shrink-0"
                  >{formatTime(item.timestamp)}</span
                >
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>

    <!-- Top Stats Row -->
    <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
      {#each [{ key: 'total_events', label: 'Events', value: stats.total_events }, { key: 'total_files', label: 'Files', value: stats.total_files }, { key: 'edits', label: 'Modified', value: stats.edits }, { key: 'creates', label: 'Created', value: stats.creates }, { key: 'deletes', label: 'Deleted', value: stats.deletes }, { key: 'rate', label: 'Rate', value: null }] as stat (stat.key)}
        <div
          class="stat-card bg-[var(--surface)] border border-[var(--border)] rounded p-4 transition-all duration-300 {statsFlash[
            stat.key
          ]
            ? 'stat-flash'
            : ''}"
        >
          <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
            {stat.label}
          </div>
          <div class="text-sm font-mono text-[var(--text)]">
            {stat.value !== null ? formatNumber(stat.value) : `${eventsPerMin}/min`}
          </div>
        </div>
      {/each}
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded p-4 cursor-pointer hover:border-[var(--accent)] transition-colors"
        class:border-[var(--error)]={stats.app_errors > 0}
        onclick={() => navigate('/system/errors')}
        onkeydown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/system/errors')}
        role="link"
        tabindex="0"
      >
        <div class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
          Errors
        </div>
        <div class="flex items-center gap-2">
          {#if stats.app_errors > 0}
            <span class="w-2 h-2 rounded-full bg-[var(--error)]"></span>
          {/if}
          <span class="text-sm font-mono text-[var(--text)]">{stats.app_errors}</span>
        </div>
      </div>
    </div>

    <!-- Agents + System Resources (compact row) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
      {#if agents.length > 0}
        <div class="lg:col-span-2 flex flex-wrap gap-3">
          {#each agents as agent (agent.agent_name)}
            {@const isWorking = workingAgents.has(agent.agent_name)}
            {@const agentState = isWorking ? 'working' : agent.is_running ? 'running' : 'idle'}
            <div
              class="flex items-center gap-2.5 px-3 py-2 bg-[var(--surface)] rounded border transition-all duration-300 {isWorking
                ? 'border-[var(--accent)] agent-breathing'
                : 'border-[var(--border)]'}"
            >
              <svg viewBox="0 0 44 30" class="w-8 h-4 flex-shrink-0 overflow-visible">
                <path
                  d={heartbeatPath(agentState)}
                  fill="none"
                  stroke={agent.color || 'var(--muted)'}
                  stroke-width="1.5"
                  class={agentState === 'working'
                    ? 'heartbeat-working'
                    : agentState === 'running'
                      ? 'heartbeat-running'
                      : ''}
                />
              </svg>
              <span class="text-xs font-semibold text-[var(--text)] font-sans"
                >{agent.agent_name}</span
              >
              <span
                class="text-[10px] font-mono {isWorking
                  ? 'text-[var(--accent)]'
                  : agent.is_running
                    ? 'text-[var(--success)]'
                    : 'text-[var(--muted)]'}"
              >
                {isWorking ? 'Working' : agent.is_running ? 'Running' : 'Stopped'}
              </span>
            </div>
          {/each}
        </div>
      {/if}
      <div
        class="flex items-center gap-6 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded"
      >
        <div class="flex items-center gap-2 flex-1">
          <span class="text-xs text-[var(--muted)]">CPU</span>
          <div class="flex-1 h-1.5 bg-[var(--bg)] rounded overflow-hidden">
            <div
              class="h-full transition-all duration-500"
              style="width: {systemMetrics.cpu_percent || 0}%; background: {cpuColor}"
            ></div>
          </div>
          <span class="text-xs font-mono text-[var(--text)] w-10 text-right"
            >{systemMetrics.cpu_percent?.toFixed(0) || 0}%</span
          >
        </div>
        <div class="flex items-center gap-2 flex-1">
          <span class="text-xs text-[var(--muted)]">MEM</span>
          <div class="flex-1 h-1.5 bg-[var(--bg)] rounded overflow-hidden">
            <div
              class="h-full transition-all duration-500"
              style="width: {systemMetrics.memory_percent || 0}%; background: {memColor}"
            ></div>
          </div>
          <span class="text-xs font-mono text-[var(--text)] w-10 text-right"
            >{systemMetrics.memory_percent?.toFixed(0) || 0}%</span
          >
        </div>
      </div>
    </div>

    <!-- Latest Code Change + Activity Trend -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
      <!-- Latest Diff -->
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col"
        style="height: 250px;"
      >
        <div
          class="flex justify-between items-center px-4 py-2 bg-[var(--bg)] border-b border-[var(--border)] flex-shrink-0"
        >
          {#if latestDiff}
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse"></span>
              <span class="text-xs font-mono text-[var(--text)] truncate"
                >{latestDiff.filepath}<span class="cursor-blink">|</span></span
              >
            </div>
            <div class="flex items-center gap-2">
              {#if latestDiff.agent_source}
                <span
                  class="px-1 py-0.5 text-[9px] font-bold rounded text-white"
                  style="background: {getAgentColorByName(latestDiff.agent_source)}"
                  >{latestDiff.agent_source}</span
                >
              {/if}
              <span class="text-[10px] text-[var(--muted)] font-mono"
                >{formatTime(latestDiff.timestamp)}</span
              >
            </div>
          {:else}
            <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
              >Latest Change</span
            >
          {/if}
        </div>
        <div class="flex-1 overflow-auto">
          {#if latestDiff}
            <pre
              class="text-[11px] font-mono m-0 bg-[var(--surface)] leading-[1.7]">{#each latestDiff.diff
                .split('\n')
                .slice(0, 50) as line, li (li)}{@const c = line.charAt(0)}{#if c === '+'}<span
                    class="text-[var(--success)] block px-3"
                    style="background: var(--success-subtle)">{line.slice(1)}</span
                  >{:else if c === '-'}<span
                    class="text-[var(--error)] block px-3"
                    style="background: var(--error-subtle)">{line.slice(1)}</span
                  >{:else}<span class="text-[var(--muted)] block px-3"
                    >{c === ' ' ? line.slice(1) : line}</span
                  >{/if}{/each}</pre>
          {:else}
            <div class="flex items-center justify-center h-full text-sm text-[var(--muted)]">
              Waiting for changes
            </div>
          {/if}
        </div>
      </div>

      <!-- Activity Trend -->
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 flex flex-col"
        style="height: 250px;"
      >
        <h3
          class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4 flex-shrink-0"
        >
          Activity (5m)
        </h3>
        <div class="flex-1">
          <canvas id="chart-trend"></canvas>
        </div>
      </div>
    </div>

    <!-- AI Insight Summary -->
    {#if latestSummary}
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden mb-3"
      >
        <div
          class="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)]"
        >
          <div class="flex items-center gap-2">
            <span
              class="px-1.5 py-0.5 text-[9px] font-bold rounded text-white"
              style="background: var(--accent)">AI Summary</span
            >
            <span class="text-xs font-semibold text-[var(--text)] font-sans"
              >{latestSummary.title}</span
            >
          </div>
          <div class="flex items-center gap-3 text-[10px] text-[var(--muted)] font-mono">
            <span>{latestSummary.model}</span>
            <span>{(latestSummary.duration_ms / 1000).toFixed(1)}s</span>
            <button
              onclick={() => { window.location.hash = ''; import('../utils/router.svelte.js').then(r => r.navigate('/insights')); }}
              class="text-[var(--accent)] hover:underline bg-transparent border-0 cursor-pointer p-0 font-mono text-[10px]"
              >View all</button
            >
          </div>
        </div>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- Content is HTML-escaped in renderMarkdown -->
        <div
          class="px-4 py-3 text-xs text-[var(--text)] font-sans leading-relaxed max-h-[120px] overflow-auto"
        >
          {@html renderMarkdown(latestSummary.content)}
        </div>
      </div>
    {/if}

    <!-- Syntax Alerts Banner -->
    {#if syntaxAlerts.length > 0}
      <div class="mb-6 space-y-2">
        {#each syntaxAlerts.slice(0, 3) as alert (alert._ts)}
          <div
            class="flex items-center gap-3 px-4 py-2 bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg animate-pulse"
          >
            <span class="text-sm font-bold text-[var(--error)]">!!</span>
            <span class="text-sm text-[var(--error)] font-mono flex-1"
              >Syntax error in {alert.filepath} ({alert.count} issue{alert.count > 1
                ? 's'
                : ''})</span
            >
            <button
              onclick={() => {
                syntaxAlerts = syntaxAlerts.filter(a => a._ts !== alert._ts);
              }}
              class="text-[var(--error)] hover:opacity-70 text-xs">dismiss</button
            >
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Agent breathing animation */
  :global(.agent-breathing) {
    animation: breathe 3s ease-in-out infinite;
  }

  @keyframes breathe {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.008);
    }
  }

  /* Heartbeat waveform animations */
  :global(.heartbeat-working) {
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    animation: heartbeat-draw 1.2s linear infinite;
  }
  :global(.heartbeat-running) {
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    animation: heartbeat-draw 3s linear infinite;
  }

  @keyframes heartbeat-draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  /* Stat card flash on change */
  :global(.stat-flash) {
    animation: stat-glow 1s ease-out;
  }

  @keyframes stat-glow {
    0% {
      box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 40%, transparent);
      border-color: var(--accent);
    }
    100% {
      box-shadow: none;
    }
  }

  /* Activity feed slide-in */
  :global(.feed-slide-in) {
    animation: slide-in 0.4s ease-out;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }

  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Idle breathing dot */
  :global(.idle-breathing) {
    animation: idle-pulse 4s ease-in-out infinite;
  }

  @keyframes idle-pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }

  /* Cursor blink for diff filepath */
  :global(.cursor-blink) {
    animation: blink 1s step-end infinite;
    color: var(--accent);
    font-weight: bold;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
