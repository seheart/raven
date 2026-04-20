<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { formatRelativeTime, formatDateOnly } from '../timeFormat.js';
  import { createPageApi } from '../apiClient.js';
  const { api, abort: abortRequests } = createPageApi();
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
  let recentAgentEvents = $state([]);
  let liveEvents = $state([]);
  let agents = $state([]);
  let loading = $state(false);
  let lastUpdated = $state(new Date());

  // Costs & sub-agent state
  import { settings } from '../stores/settingsStore.js';
  let sessionCosts = $state({ total_requests: 0, total_cost_usd: 0, total_input_tokens: 0, total_output_tokens: 0, total_cache_read_tokens: 0 });
  let billingMode = $state(get(settings)?.billing?.mode || 'subscription');
  const unsubBilling = settings.subscribe(s => {
    billingMode = s?.billing?.mode || 'subscription';
  });
  let recentSubagents = $state([]);

  // Live activity feed — unified stream of all events
  let activityFeed = $state([]);
  let latestDiff = $state(null);
  let syntaxAlerts = $state([]);
  let workingAgents = $state(new Set());
  let workingAgentTimers = {};
  let diffDebounceTimer = null;
  let lastDiffFilepath = '';
  let ephemeralTimers = []; // Track all short-lived timeouts for cleanup
  let riskScores = $state({}); // { [eventId]: { score, reason } }


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
  let processActivity = $state({}); // agentName -> { activity_state, api_connections, ... }
  let latestApiLatency = $state(null);

  // Derived
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
    if (diff < 86400000) return formatRelativeTime(timestamp);
    return formatDateOnly(timestamp);
  }

  function formatNumber(n) {
    return n?.toLocaleString() || '0';
  }

  function formatCost(usd) {
    if (!usd || usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    if (usd < 1) return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(2)}`;
  }

  function formatTokens(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  function getTypeColor(type) {
    const colors = { 'general-purpose': '#FF6B35', 'Explore': '#10A37F', 'Plan': '#4285F4', 'code-reviewer': '#F39C12' };
    return colors[type] || '#6b7280';
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
    // Use real activity state if available, otherwise cycle fake text
    const pa = processActivity[agentName];
    let text;
    if (pa && pa.activity_state === 'thinking') {
      text = `API call in flight${pa.api_connections > 1 ? ` (${pa.api_connections})` : ''}...`;
    } else if (pa && pa.activity_state === 'executing') {
      text = 'Executing tools...';
    } else {
      const cycle = (workingStates[agentName]?.cycle || 0) + 1;
      text = workingTexts[cycle % workingTexts.length];
    }
    const cycle = (workingStates[agentName]?.cycle || 0) + 1;
    workingStates = {
      ...workingStates,
      [agentName]: { text, cycle }
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
      const { [agentName]: _removed, ...rest } = workingStates;
      workingStates = rest;
    }, 8000);
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

  // Chart color palette (shared across create + update paths)
  const agentChartColors = { 'Claude Code': '#FF6B35', 'Ollama': '#F5A623' };
  const defaultAgentColors = ['#10A37F', '#4285F4', '#A855F7', '#EC4899'];

  // Bucket recentFiles + recentAgentEvents into buckets grouped by agent.
  // Fine buckets + frequent ticks + linear animation = oscilloscope-style slide.
  const TREND_BUCKET_COUNT = 60;
  const TREND_BUCKET_MS = 5000;
  const TREND_TICK_MS = 500;
  const TREND_Y_MAX = 12; // pinned so the axis never rescales — keeps the line from jumping
  function buildTrendDatasets() {
    const bucketCount = TREND_BUCKET_COUNT;
    const bucketMs = TREND_BUCKET_MS;
    const now = new Date();

    const sortedAgentEvents = [...recentAgentEvents].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    const findAgentAt = timestamp => {
      const ts = new Date(timestamp).getTime();
      for (let i = sortedAgentEvents.length - 1; i >= 0; i--) {
        const aTs = new Date(sortedAgentEvents[i].timestamp).getTime();
        if (aTs <= ts && ts - aTs < 60000) return sortedAgentEvents[i].agent;
      }
      return null;
    };

    const agentBuckets = {};
    const bump = (agent, bucket) => {
      if (!agentBuckets[agent]) agentBuckets[agent] = new Array(bucketCount).fill(0);
      agentBuckets[agent][bucketCount - 1 - bucket]++;
    };
    recentFiles.forEach(e => {
      const bucket = Math.floor((now - new Date(e.timestamp)) / bucketMs);
      if (bucket >= 0 && bucket < bucketCount) {
        bump(e.agent_source || findAgentAt(e.timestamp) || 'Other', bucket);
      }
    });
    recentAgentEvents.forEach(e => {
      const bucket = Math.floor((now - new Date(e.timestamp)) / bucketMs);
      if (bucket >= 0 && bucket < bucketCount) bump(e.agent || 'Other', bucket);
    });

    const labels = Array.from({ length: bucketCount }, (_, i) => {
      const t = new Date(now.getTime() - (bucketCount - 1 - i) * bucketMs);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    });

    let colorIdx = 0;
    const datasets = Object.entries(agentBuckets).map(([agent, data]) => {
      const color = agentChartColors[agent] || defaultAgentColors[colorIdx++ % defaultAgentColors.length];
      return {
        label: agent,
        data,
        borderColor: color,
        backgroundColor: `${color}20`,
        fill: true,
        cubicInterpolationMode: 'monotone',
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 1.5
      };
    });

    return { labels, datasets };
  }

  // Smooth oscilloscope-style refresh: in-place update, linear animation matching
  // the tick interval so the line appears to slide continuously left.
  // When the dataset SHAPE changes (new/removed agent), Chart.js can't safely
  // hot-swap the controller list — fall back to full recreate in that case.
  function refreshTrendChart() {
    if (!trendChart || typeof trendChart.update !== 'function') return createCharts();
    const { labels, datasets } = buildTrendDatasets();

    const existing = trendChart.data.datasets;
    const sameShape =
      existing.length === datasets.length &&
      existing.every((d, i) => d.label === datasets[i].label);
    if (!sameShape) return createCharts();

    trendChart.data.labels = labels;
    for (let i = 0; i < datasets.length; i++) {
      existing[i].data = datasets[i].data;
    }
    trendChart.update();
  }

  function createCharts() {
    const colors = getChartColors();
    if (trendChart) destroyChart(trendChart);

    const { labels, datasets } = buildTrendDatasets();

    trendChart = createChart('chart-trend', {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: TREND_TICK_MS, easing: 'linear' },
        animations: { y: { duration: 0 } }, // don't animate Y; only the horizontal slide
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: colors.muted,
              font: { size: 9, family: 'monospace' },
              boxWidth: 12,
              boxHeight: 2,
              padding: 8
            }
          },
          tooltip: { enabled: false }
        },
        scales: {
          x: {
            ticks: {
              color: colors.muted,
              font: { size: 9, family: 'monospace' },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 6
            },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            min: 0,
            max: TREND_Y_MAX,
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
      const pq = pf && pf !== 'all' ? `?project=${encodeURIComponent(pf)}` : '';
      const data = await api.get(`/dashboard${pq}`);

      checkStatChanges(data.stats);
      stats = data.stats;
      sessionCosts = data.costs || sessionCosts;
      recentSubagents = Array.isArray(data.subagents) ? data.subagents : [];
      systemMetrics =
        Array.isArray(data.systemMetrics) && data.systemMetrics[0]
          ? data.systemMetrics[0]
          : systemMetrics;
      recentFiles = Array.isArray(data.fileEvents) ? data.fileEvents : [];
      recentAgentEvents = Array.isArray(data.agentEvents) ? data.agentEvents : [];
      agents = Array.isArray(data.agentsStatus) ? data.agentsStatus : [];
      agentStatus = agents[0] || null;

      if (Array.isArray(data.processActivity)) {
        const pa = {};
        for (const p of data.processActivity) {
          pa[p.agent_name] = p;
        }
        processActivity = pa;
      }
      if (data.apiLatency?.recent?.length > 0) {
        latestApiLatency = data.apiLatency.recent[0];
      }

      lastUpdated = new Date();
      loading = false;
      setTimeout(createCharts, 100);
    } catch (err) {
      logger.error('Dashboard load failed:', err);
      loading = false;
    }
  }

  // Throttle stats refresh to at most once per 3s (WS events can fire 6+/10s)
  let lastStatsRefresh = 0;
  let pendingStatsRefresh = null;
  function throttledStatsRefresh() {
    const now = Date.now();
    const since = now - lastStatsRefresh;
    if (since >= 3000) {
      lastStatsRefresh = now;
      loadData();
    } else if (!pendingStatsRefresh) {
      pendingStatsRefresh = setTimeout(() => {
        pendingStatsRefresh = null;
        lastStatsRefresh = Date.now();
        loadData();
      }, 3000 - since);
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
    // Push into the reactive array — the 1s trendTicker renders it.
    // Respect project filter so the chart matches what loadData() would fetch.
    const pf = get(projectFilter);
    if (pf === 'all' || event.project_name === pf) {
      recentFiles = [event, ...recentFiles].slice(0, 200);
    }

    // Push to activity feed with animation
    pushActivity({
      type: 'file',
      eventId: event.id,
      icon: event.change_type === 'add' ? '+' : event.change_type === 'unlink' ? '-' : '~',
      color: getChangeColor(event.change_type),
      text: event.filepath,
      agent: event.agent_source,
      timestamp: event.timestamp || new Date().toISOString()
    });

    // Debounced diff fetch — only fetch for the latest file, silently
    if (event.filepath && event.change_type !== 'unlink') {
      lastDiffFilepath = event.filepath;
      const capturedEvent = { change_type: event.change_type, agent_source: event.agent_source, timestamp: event.timestamp };
      clearTimeout(diffDebounceTimer);
      diffDebounceTimer = setTimeout(() => {
        const fp = lastDiffFilepath;
        api
          .get(`/file-diff/${encodeURIComponent(fp)}`)
          .then(data => {
            if (data?.diff) {
              latestDiff = {
                filepath: data.filepath || fp,
                diff: data.diff,
                change_type: data.type || capturedEvent.change_type,
                agent_source: capturedEvent.agent_source,
                timestamp: capturedEvent.timestamp
              };
            }
          })
          .catch(() => {
            /* diff is supplementary */
          });
      }, 1000);
    }

    // Throttled stats refresh. Chart is now WS-driven, so this is for
    // dashboard-stats counters only — no need to hammer on every event.
    throttledStatsRefresh();
  };

  const handleAgentEvent = event => {
    liveEvents = [{ ...event, _ts: Date.now() }, ...liveEvents].slice(0, 20);

    // Mark agent as actively working
    const agentName = event.agent_name || event.agent;
    if (agentName) {
      markAgentWorking(agentName);
    }

    // Push to the reactive array — the 1s trendTicker renders it.
    // WS shape uses `agent_name`; chart reads `agent` — normalize here.
    recentAgentEvents = [
      { ...event, agent: agentName, timestamp: event.timestamp || new Date().toISOString() },
      ...recentAgentEvents
    ].slice(0, 500);

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
    // Only show critical alerts in the feed — warnings are noisy and usually benign
    if (data.status === 'critical') {
      const issues = (data.criticalIssues || []).map(i => i.message || i.name).join(', ');
      pushActivity({
        type: 'health',
        icon: '!!',
        color: 'var(--error)',
        text: `Critical: ${issues || 'system issue'}`,
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleDiffRiskScore = data => {
    riskScores = { ...riskScores, [data.eventId]: { score: data.score, reason: data.reason } };
  };

  const handleAnomalyInsight = data => {
    pushActivity({
      type: 'insight',
      icon: 'AI',
      color: 'var(--accent)',
      text: data.explanation,
      timestamp: data.alertTimestamp || new Date().toISOString()
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
    websocketService.on('diff-risk-score', handleDiffRiskScore);
    websocketService.on('anomaly-insight', handleAnomalyInsight);
    const handleTokenUsage = () => {
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      api.get(`/costs/summary?start=${encodeURIComponent(todayStart)}`).then(d => { if (d) sessionCosts = d; }).catch(err => logger.debug('Costs refresh failed:', err));
    };
    const handleSubagentSpawn = () => {
      api.get('/subagents/recent?limit=8').then(d => { if (Array.isArray(d)) recentSubagents = d; }).catch(err => logger.debug('Subagents refresh failed:', err));
    };
    websocketService.on('token-usage', handleTokenUsage);
    websocketService.on('subagent-spawn', handleSubagentSpawn);

    const handleProcessActivity = (data) => {
      processActivity = { ...processActivity, [data.agent_name]: data };
      // Auto-mark agent as working when it has activity
      if (data.activity_state === 'thinking' || data.activity_state === 'executing') {
        markAgentWorking(data.agent_name);
      }
    };
    const handleApiLatencyEvent = (data) => {
      latestApiLatency = data;
    };
    websocketService.on('process-activity', handleProcessActivity);
    websocketService.on('api-latency', handleApiLatencyEvent);

    themeObserver = createThemeObserver(() => createCharts());

    // Auto-refresh every 30s
    const interval = setInterval(loadData, 30000);

    // Slide trend buckets continuously — tick interval must match the chart's
    // animation duration (TREND_TICK_MS) so the line flows without hitches.
    const trendTicker = setInterval(refreshTrendChart, TREND_TICK_MS);

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
      websocketService.off('diff-risk-score', handleDiffRiskScore);
      websocketService.off('anomaly-insight', handleAnomalyInsight);
      websocketService.off('token-usage', handleTokenUsage);
      websocketService.off('subagent-spawn', handleSubagentSpawn);
      websocketService.off('process-activity', handleProcessActivity);
      websocketService.off('api-latency', handleApiLatencyEvent);
      if (themeObserver) themeObserver.disconnect();
      if (trendChart) destroyChart(trendChart);
      clearInterval(interval);
      clearInterval(trendTicker);
      if (pendingStatsRefresh) clearTimeout(pendingStatsRefresh);
      abortRequests();
      unsubFilter();
      Object.values(workingAgentTimers).forEach(t => clearTimeout(t));
      clearTimeout(diffDebounceTimer);
      ephemeralTimers.forEach(t => clearTimeout(t));
      unsubBilling();
    };
  });
</script>

<div
  class="h-[calc(100vh-6rem)] p-4 pb-2 flex flex-col transition-all duration-[3000ms]"
  style="background: color-mix(in srgb, var(--bg) {100 -
    activityLevel * 8}%, var(--accent) {activityLevel * 8}%)"
>
  <div class="mx-auto px-2 flex flex-col flex-1 min-h-0 w-full">
    <!-- Header -->
    <div class="flex justify-between items-center mb-3 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <h1 class="text-xl font-bold text-[var(--text-heading)]">Dashboard</h1>
        <span class="text-xs text-[var(--muted)] font-sans">Real-time monitoring</span>
      </div>
      <div class="flex items-center gap-3">
        {#if agentStatus}
          {@const pa = Object.values(processActivity)[0]}
          <span class="flex items-center gap-2 text-sm font-mono">
            <span
              class="w-2 h-2 rounded-full"
              class:bg-[var(--warning)]={pa?.activity_state === 'thinking'}
              class:activity-pulse={pa?.activity_state === 'thinking'}
              class:bg-[var(--success)]={pa?.activity_state === 'executing' || (!pa && agentStatus.is_running)}
              class:animate-pulse={pa?.activity_state === 'executing' || (!pa && agentStatus.is_running)}
              class:bg-[var(--muted)]={pa?.activity_state === 'idle' || (!pa && !agentStatus.is_running)}
            ></span>
            <span class="text-[var(--text)]">{agentStatus.agent_name}</span>
            {#if pa?.activity_state === 'thinking'}
              <span class="text-[10px] text-[var(--warning)]">API call{pa.api_connections > 1 ? ` (${pa.api_connections})` : ''}</span>
            {:else if pa?.activity_state === 'executing'}
              <span class="text-[10px] text-[var(--success)]">Executing</span>
            {:else if pa}
              <span class="text-[10px] text-[var(--muted)]">Idle</span>
            {/if}
            {#if pa?.network_connections}
              <span class="text-[9px] text-[var(--muted)]">{pa.network_connections} conn</span>
            {/if}
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

    <!-- Event Feed + AI Pulse -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 flex-1 min-h-0">
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex flex-col min-h-0"
      >
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
            Event Feed
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
                style="border-left: 2px solid {item.color}; background: {item.icon === '+' ? 'var(--success-subtle)' : item.icon === '-' ? 'var(--error-subtle)' : 'transparent'}; {item._new
                  ? `box-shadow: inset 3px 0 8px -4px ${item.color}`
                  : ''}"
              >
                <span
                  class="w-4 text-center text-[9px] font-bold font-mono flex-shrink-0"
                  style="color: {item.color}">{item.icon}</span
                >
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] font-mono truncate" style="color: {item.icon === '+' ? 'var(--success)' : item.icon === '-' ? 'var(--error)' : 'var(--text)'}">{item.text}</div>
                </div>
                {#if item.eventId && riskScores[item.eventId]}
                  {@const rs = riskScores[item.eventId]}
                  <span
                    class="px-1 py-0.5 text-[8px] font-bold rounded text-white flex-shrink-0"
                    style="background: {rs.score >= 7 ? 'var(--error)' : rs.score >= 4 ? 'var(--warning)' : 'var(--success)'}"
                    title={rs.reason}
                  >
                    {rs.score}
                  </span>
                {/if}
                <span class="text-[9px] text-[var(--muted)] font-mono flex-shrink-0"
                  >{formatTime(item.timestamp)}</span
                >
              </div>
            {/each}
          {/if}
        </div>
      </div>
      <div class="md:col-span-2">
        <NebulaActivity />
      </div>
    </div>

    <!-- Compact Stats + Agents + System bar -->
    <div class="flex flex-wrap items-center gap-2 mb-3 bg-[var(--surface)] border border-[var(--border)] rounded px-3 py-2">
      <!-- Stats inline -->
      {#each [{ key: 'total_events', label: 'Events', value: stats.total_events }, { key: 'edits', label: 'Edits', value: stats.edits }, { key: 'creates', label: 'Creates', value: stats.creates, color: 'var(--success)' }, { key: 'deletes', label: 'Deletes', value: stats.deletes, color: 'var(--error)' }] as stat (stat.key)}
        <span class="text-[11px] font-mono {statsFlash[stat.key] ? 'stat-flash' : ''}">
          <span class="text-[var(--muted)]">{stat.label}</span>
          <span class="font-semibold" style="color: {stat.color || 'var(--text)'}">{formatNumber(stat.value)}</span>
        </span>
        <span class="text-[var(--border)]">|</span>
      {/each}
      <span class="text-[11px] font-mono">
        <span class="text-[var(--muted)]">Rate</span>
        <span class="font-semibold text-[var(--text)]">{eventsPerMin}/m</span>
      </span>

      {#if stats.app_errors > 0}
        <span class="text-[var(--border)]">|</span>
        <button onclick={() => navigate('/system/errors')} class="text-[11px] font-mono bg-transparent border-0 cursor-pointer p-0">
          <span class="text-[var(--error)] font-semibold">{stats.app_errors} errors</span>
        </button>
      {/if}

      {#if latestApiLatency}
        <span class="text-[var(--border)]">|</span>
        <button onclick={() => navigate('/analysis/network')} class="text-[11px] font-mono bg-transparent border-0 cursor-pointer p-0 hover:opacity-80">
          <span class="text-[var(--muted)]">API</span>
          <span class="font-semibold" style="color: {latestApiLatency.latency_ms > 30000 ? 'var(--error)' : latestApiLatency.latency_ms > 10000 ? 'var(--warning)' : 'var(--text)'}">
            {(latestApiLatency.latency_ms / 1000).toFixed(1)}s
          </span>
        </button>
      {/if}

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Token usage inline (right-aligned).
           Claude prompt caching: most "input" actually flows through
           cache_read (~10% cost) or cache_creation (~125% cost). Counting
           only total_input_tokens missed ~99% of usage. -->
      {#snippet tokenStats()}
        {@const cIn = sessionCosts.total_input_tokens || 0}
        {@const cOut = sessionCosts.total_output_tokens || 0}
        {@const cCreate = sessionCosts.total_cache_creation_tokens || 0}
        {@const cRead = sessionCosts.total_cache_read_tokens || 0}
        {@const totalIn = cIn + cCreate + cRead}
        <span class="text-[var(--muted)]">Tokens</span>
        <span class="font-semibold text-[var(--accent)]">
          {#if billingMode === 'api'}
            {formatCost(sessionCosts.total_cost_usd)}
          {:else}
            {formatTokens(totalIn + cOut)}
          {/if}
        </span>
        <span class="text-[var(--muted)]">In</span>
        <span class="text-[var(--text)]">{formatTokens(totalIn)}</span>
        {#if cRead > 0}
          <span class="text-[var(--muted)]">Cached</span>
          <span class="text-[var(--text)]">{formatTokens(cRead)}</span>
        {/if}
        <span class="text-[var(--muted)]">Out</span>
        <span class="text-[var(--text)]">{formatTokens(cOut)}</span>
      {/snippet}
      <button onclick={() => navigate('/analysis/costs')} class="flex items-center gap-2 text-[11px] font-mono bg-transparent border-0 cursor-pointer p-0 hover:opacity-80">
        {@render tokenStats()}
      </button>

    </div>

    <!-- Sub-Agents + Latest Diff + Activity Trend -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 flex-1 min-h-0">
      <!-- Sub-Agents -->
      <div
        class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 cursor-pointer hover:border-[var(--accent)] transition-colors flex flex-col"
        onclick={() => navigate('/analysis/subagents')}
        onkeydown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/analysis/subagents')}
        role="link"
        tabindex="0"
      >
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Sub-Agents</h3>
          <span class="text-[10px] text-[var(--muted)]">→</span>
        </div>
        {#if recentSubagents.length > 0}
          <div class="space-y-1 overflow-y-auto flex-1">
            {#each recentSubagents.slice(0, 8) as agent (agent.id)}
              <div class="flex items-center gap-2 py-0.5">
                <span class="px-1.5 py-0.5 rounded text-[8px] font-bold text-white flex-shrink-0" style="background: {getTypeColor(agent.agent_type)}">{agent.agent_type || 'agent'}</span>
                <span class="text-[10px] text-[var(--text)] truncate flex-1">{agent.description || agent.agent_id?.slice(0, 12)}</span>
                <span class="text-[9px] text-[var(--muted)] font-mono flex-shrink-0">{formatTime(agent.started_at)}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-xs text-[var(--muted)] py-2">No sub-agents yet</div>
        {/if}
      </div>

      <!-- Latest Diff -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col min-h-0">
        <div class="flex justify-between items-center px-3 py-1.5 bg-[var(--bg)] border-b border-[var(--border)] flex-shrink-0">
          {#if latestDiff}
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse flex-shrink-0"></span>
              <span class="text-[10px] font-mono text-[var(--text)] truncate">{latestDiff.filepath}<span class="cursor-blink">|</span></span>
            </div>
            {#if latestDiff.agent_source}
              <span class="px-1 py-0.5 text-[8px] font-bold rounded text-white flex-shrink-0" style="background: {getAgentColorByName(latestDiff.agent_source)}">{latestDiff.agent_source}</span>
            {/if}
          {:else}
            <span class="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">Latest Change</span>
          {/if}
        </div>
        <div class="flex-1 overflow-auto">
          {#if latestDiff}
            <pre class="text-[10px] font-mono m-0 bg-[var(--surface)] leading-[1.6]">{#each latestDiff.diff.split('\n').slice(0, 20) as line, li (li)}{@const c = line.charAt(0)}{#if c === '+'}<span class="text-[var(--success)] block px-2" style="background: var(--success-subtle)">{line.slice(1)}</span>{:else if c === '-'}<span class="text-[var(--error)] block px-2" style="background: var(--error-subtle)">{line.slice(1)}</span>{:else}<span class="text-[var(--muted)] block px-2">{c === ' ' ? line.slice(1) : line}</span>{/if}{/each}</pre>
          {:else}
            <div class="flex items-center justify-center h-full text-xs text-[var(--muted)]">Waiting for changes</div>
          {/if}
        </div>
      </div>

      <!-- Activity Trend -->
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 flex flex-col min-h-0">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1 flex-shrink-0">Event Rate (5m)</h3>
        <div class="flex-1 min-h-0">
          <canvas id="chart-trend"></canvas>
        </div>
      </div>
    </div>


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
  /* Activity state pulse for "thinking" */
  @keyframes activity-pulse-kf {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.4); }
  }
  .activity-pulse {
    animation: activity-pulse-kf 1.5s ease-in-out infinite;
  }

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
