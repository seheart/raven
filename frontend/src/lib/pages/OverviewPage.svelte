<script>
  import { logger } from '../logger.js';
  import { onMount } from 'svelte';
  import { formatRelativeTime, formatDateOnly } from '../timeFormat.js';
  import { formatUsd } from '../utils/formatUsd.js';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader } from '../components/layout/index.js';
  const { api, abort: abortRequests } = createPageApi();
  import { navigate } from '../utils/router.svelte.js';
  import { websocketService } from '../services/websocket.js';
  import { projectFilter } from '../projectFilterStore.js';
  import { get } from 'svelte/store';
  import {
    getAgentColor,
    getSubagentTypeColor,
    FALLBACK_AGENT_PALETTE
  } from '../utils/agentBrand.js';
  import {
    createChart,
    destroyChart,
    createThemeObserver,
    getChartColors
  } from '../utils/chartUtils.js';
  import NebulaActivity from '../components/NebulaActivity.svelte';
  import ActiveModelCard from '../components/llm-lab/ActiveModelCard.svelte';

  // State
  let stats = $state({
    total_events: 0,
    lifetime_events: 0,
    lifetime_agent_events: 0,
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
  let recentFiles = $state([]);
  let recentAgentEvents = $state([]);
  let liveEvents = $state([]);
  let agents = $state([]);

  // Costs & sub-agent state
  import { settings } from '../stores/settingsStore.js';
  let sessionCosts = $state({
    total_requests: 0,
    total_cost_usd: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0
  });
  let billingMode = $state(get(settings)?.billing?.mode || 'subscription');
  const unsubBilling = settings.subscribe(s => {
    billingMode = s?.billing?.mode || 'subscription';
  });
  let recentSubagents = $state([]);

  // Live activity feed — unified stream of all events
  let activityFeed = $state([]);
  let latestDiff = $state(null);
  let latestDiffHidden = $state(false);
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
    lifetime_events: 0,
    total_files: 0,
    creates: 0,
    edits: 0,
    deletes: 0,
    app_errors: 0
  });
  let statsFlash = $state({});
  let cpuHistory = $state(new Array(30).fill(0));
  let memHistory = $state(new Array(30).fill(0));
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

  // Cache hit % — punchy "is prompt caching working?" signal. Derived
  // from the same token counters shown to the right of the bar; no
  // backend round-trip needed. Healthy is >80%; <50% means context
  // is being rebuilt every turn (system prompt drift, cache eviction).
  const cacheHitPct = $derived.by(() => {
    const cIn = sessionCosts.total_input_tokens || 0;
    const cCreate = sessionCosts.total_cache_creation_tokens || 0;
    const cRead = sessionCosts.total_cache_read_tokens || 0;
    const totalIn = cIn + cCreate + cRead;
    if (totalIn === 0) return null;
    return Math.round((cRead / totalIn) * 100);
  });

  // Cost burn rate — $/hr since today's first agent event. The honest
  // active-time window: comparing cost to hours-since-midnight is
  // misleading for anyone who didn't start working at midnight. Null
  // until at least 5 minutes of activity so the rate isn't dominated
  // by a single startup cache_creation spike.
  const burnRatePerHour = $derived.by(() => {
    const cost = sessionCosts.total_cost_usd || 0;
    const firstAt = stats.first_agent_event_today_at;
    if (!firstAt || cost <= 0) return null;
    const hours = (Date.now() - new Date(firstAt).getTime()) / 3_600_000;
    if (hours < 5 / 60) return null;
    return cost / hours;
  });

  // Active agents — count of agents that have reported via WS process-
  // activity within the last 30s. Distinct from `agents.length` which
  // includes the lifetime registry.
  const activeAgentCount = $derived.by(() => {
    const now = Date.now();
    let count = 0;
    for (const p of Object.values(processActivity)) {
      const ts = p?.timestamp ? new Date(p.timestamp).getTime() : 0;
      if (now - ts < 30_000) count++;
    }
    return count;
  });

  // Describe a single agent event in one short line.
  //   Edit  + /path/style.css     → "Edit · style.css"
  //   Read  + /path/server.ts     → "Read · server.ts"
  //   Bash  + "cd … && npm build" → "Bash · npm build"
  //   POST  + "/api/generate"     → "POST · /api/generate"
  // The Bash branch strips leading "cd … && " navigation prefixes so we
  // see the actual command, then keeps the first ~36 chars.
  function describeAgentAction(event) {
    if (!event) return '';
    const tool = (event.message || '').split(' ')[0] || event.event_type || '';
    const raw = event.file || '';
    if (!raw) return tool;

    // API route — keep as-is (Ollama POST /api/generate, etc.)
    if (raw.startsWith('/api/')) return tool ? `${tool} · ${raw}` : raw;

    // Looks like a real file path — show just the basename
    const looksLikePath =
      raw.startsWith('/') && raw.includes('.') && !raw.includes(' ') && !raw.includes('&&');
    if (looksLikePath) {
      const base = raw.split('/').pop();
      return tool ? `${tool} · ${base}` : base;
    }

    // Otherwise treat as a shell command (Bash). Strip "cd <path> && "
    // navigation, take the first meaningful command, cap length.
    let cmd = raw.replace(/^cd\s+\S+\s*&&\s*/i, '').trim();
    cmd = cmd.split(/\s*&&\s*|\s*\|\s*|\s*;\s*/)[0]; // first command in chain
    cmd = cmd.replace(/\s+/g, ' ').slice(0, 36);
    if (cmd.length === 36 && raw.length > 36) cmd += '…';
    return tool ? `${tool} · ${cmd}` : cmd;
  }

  // Unified Agents list — top-level agents (Claude Code, Ollama, …) merged
  // with sub-agent Task spawns (Explore, general-purpose, …), sorted by
  // most-recent activity. Each row carries a `kind` so the chip and label
  // can render consistently regardless of source. Top-level agents show
  // their most recent tool action (Edit · style.css, Bash, POST /api/…)
  // instead of the redundant agent name — the chip already says who.
  const allAgents = $derived.by(() => {
    const top = (agents || []).map(a => {
      const lastEvent = (recentAgentEvents || []).find(
        e => e.agent === a.agent_name && (e.event_type === 'tool_call' || e.file)
      );
      const action = describeAgentAction(lastEvent);
      const fullCommand = lastEvent?.file && lastEvent.file !== action ? lastEvent.file : null;
      return {
        kind: 'top',
        key: `top:${a.agent_name}`,
        label: action || (a.is_running ? 'active' : 'idle'),
        labelTitle: fullCommand,
        chip: a.agent_name,
        detail: `${(a.requests_handled || 0).toLocaleString()} reqs`,
        time: a.last_seen,
        color: getAgentColor(a.agent_name, 'var(--muted)')
      };
    });
    const subs = (recentSubagents || []).map(a => ({
      kind: 'sub',
      key: `sub:${a.id}`,
      label: a.description || a.agent_id?.slice(0, 12) || 'sub-agent',
      chip: a.agent_type || 'agent',
      detail: a.project_name || a.model || '',
      time: a.started_at,
      color: getTypeColor(a.agent_type)
    }));
    return [...top, ...subs].sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return tb - ta;
    });
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
    return formatUsd(usd);
  }

  function formatTokens(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  const getTypeColor = getSubagentTypeColor;

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
    // Clear working state after 8s of inactivity
    clearTimeout(workingAgentTimers[agentName]);
    workingAgentTimers[agentName] = setTimeout(() => {
      workingAgents = new Set([...workingAgents].filter(a => a !== agentName));
      const { [agentName]: _removed, ...rest } = workingStates;
      workingStates = rest;
    }, 8000);
  }

  function getAgentColorByName(name) {
    // Brand colors for agent identification — intentionally static, sourced
    // from utils/agentBrand.js so updates there propagate everywhere.
    // The previous theme-token approach broke when --accent flipped from
    // violet to phosphor green and started colliding with --success.
    return getAgentColor(name, 'var(--muted)');
  }

  // Flash stat on change — single timeout clears all, no race condition
  function checkStatChanges(newStats) {
    const flashes = {};
    for (const key of [
      'total_events',
      'lifetime_events',
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

  const defaultAgentColors = FALLBACK_AGENT_PALETTE;

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
    // Filter status-only Ollama proxy traffic (`/api/ps`, `/api/version`,
    // etc. — logged with agent='Ollama' as a catchall when no model is in
    // the request body). Keeps real LLM usage visible (model-named agents
    // like `nomic-embed-text` and `gemma3:12b` still bucket normally).
    const isStatusOnly = e =>
      e.event_type === 'api_call' && (e.agent === 'Ollama' || e.agent_name === 'Ollama');
    recentAgentEvents.forEach(e => {
      if (isStatusOnly(e)) return;
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
      const color = getAgentColor(
        agent,
        defaultAgentColors[colorIdx++ % defaultAgentColors.length]
      );
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
    // Chart.destroy() nulls canvas; use that as the liveness check.
    // `trendChart.update` is a prototype method and stays truthy after destroy.
    if (!trendChart || !trendChart.canvas) return createCharts();
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
    try {
      trendChart.update();
    } catch {
      // Chart's internal plugin cache can end up invalidated after a race with
      // destroy/theme-swap; rebuild rather than crashing the ticker every 500ms.
      createCharts();
    }
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

      // Seed the Latest Change panel from the most recent file event so
      // it survives page reloads and persists between websocket events.
      // Only seed if we don't already have a (newer) live diff.
      // Walk the list — binary/unchanged files return empty diffs, so fall
      // through to the next candidate instead of leaving the panel blank.
      if (!latestDiff && recentFiles.length > 0) {
        const candidates = recentFiles
          .filter(f => f.filepath && f.change_type !== 'unlink')
          .slice(0, 10);
        (async () => {
          for (const recent of candidates) {
            if (latestDiff) return;
            try {
              const diffData = await api.get(`/file-diff/${encodeURIComponent(recent.filepath)}`);
              if (diffData?.diff && !latestDiff) {
                latestDiff = {
                  filepath: diffData.filepath || recent.filepath,
                  diff: diffData.diff,
                  change_type: diffData.type || recent.change_type,
                  agent_source: recent.agent_source,
                  timestamp: recent.timestamp
                };
                return;
              }
            } catch {
              /* diff is supplementary — try the next candidate */
            }
          }
        })();
      }
      agents = Array.isArray(data.agentsStatus) ? data.agentsStatus : [];

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

      setTimeout(createCharts, 100);
    } catch (err) {
      logger.error('Dashboard load failed:', err);
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
      const capturedEvent = {
        change_type: event.change_type,
        agent_source: event.agent_source,
        timestamp: event.timestamp
      };
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

  const handleErrorsCleared = () => {
    stats.app_errors = 0;
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
    websocketService.on('errors-cleared', handleErrorsCleared);
    websocketService.on('diff-risk-score', handleDiffRiskScore);
    websocketService.on('anomaly-insight', handleAnomalyInsight);
    // The token-usage WS payload already contains everything we need to
    // increment the running today-total — no need for a fresh /costs/summary
    // round-trip on every event (was doing one HTTP call per inference).
    const handleTokenUsage = data => {
      if (!data) return;
      // Filter to today only — the dashboard shows "today's session" cost.
      const ts = data.timestamp ? new Date(data.timestamp) : new Date();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (ts < todayStart) return;
      sessionCosts = {
        total_requests: (sessionCosts.total_requests || 0) + 1,
        total_input_tokens: (sessionCosts.total_input_tokens || 0) + (data.input_tokens || 0),
        total_output_tokens: (sessionCosts.total_output_tokens || 0) + (data.output_tokens || 0),
        total_cache_creation_tokens:
          (sessionCosts.total_cache_creation_tokens || 0) + (data.cache_creation_tokens || 0),
        total_cache_read_tokens:
          (sessionCosts.total_cache_read_tokens || 0) + (data.cache_read_tokens || 0),
        total_cost_usd: (sessionCosts.total_cost_usd || 0) + (data.estimated_cost_usd || 0)
      };
    };
    const handleSubagentSpawn = () => {
      api
        .get('/subagents/recent?limit=8')
        .then(d => {
          if (Array.isArray(d)) recentSubagents = d;
        })
        .catch(err => logger.debug('Subagents refresh failed:', err));
    };
    websocketService.on('token-usage', handleTokenUsage);
    websocketService.on('subagent-spawn', handleSubagentSpawn);

    const handleProcessActivity = data => {
      processActivity = { ...processActivity, [data.agent_name]: data };
      // Auto-mark agent as working when it has activity
      if (data.activity_state === 'thinking' || data.activity_state === 'executing') {
        markAgentWorking(data.agent_name);
      }
    };
    const handleApiLatencyEvent = data => {
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
      websocketService.off('errors-cleared', handleErrorsCleared);
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

<PageLayout variant="dashboard">
  <!-- Narrow widths (<1280px) stack everything vertically with bounded
       per-module heights — Bloomberg-terminal pattern. xl+ reclaims the
       fixed-viewport flex layout so each row fills available height. -->
  <div class="p-4 pb-2 xl:h-[calc(100vh-6rem)] xl:flex xl:flex-col">
    <div class="mx-auto px-2 w-full xl:flex xl:flex-col xl:flex-1 xl:min-h-0">
      <div class="mb-3">
        <PageHeader size="medium" title="Dashboard" description="Real-time monitoring" />
      </div>

      <!-- Event Feed + AI Pulse + Active Models -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3 xl:flex-1 xl:min-h-0">
        <div class="bg-surface border border-border rounded-lg p-4 flex flex-col min-h-0">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Event Feed</h3>
            <span class="flex items-center gap-1.5 text-[10px] text-success font-mono">
              <span class="w-1.5 h-1.5 bg-success rounded-full animate-pulse"></span>
              Live
            </span>
          </div>
          <!-- Tight cap at narrow widths (~3 rows visible, internal scroll
               for the rest) so the AI Pulse graph below stays visible
               without scrolling. xl: drops the cap so the feed fills its
               column when shown side-by-side. -->
          <div class="space-y-0.5 overflow-y-auto max-h-[96px] xl:max-h-none xl:flex-1">
            {#if activityFeed.length === 0 && recentFiles.length === 0}
              <div class="text-center py-6 text-xs text-muted leading-relaxed">
                <span class="inline-block idle-breathing">Waiting for activity</span>
                <div class="mt-1.5 text-[10px]">
                  Edit a file or kick off a Claude session — events stream in here.
                </div>
              </div>
            {:else}
              {#each activityFeed.length > 0 ? activityFeed : recentFiles
                    .slice(0, 15)
                    .map( (e, i) => ({ _id: e.id ?? i, _new: false, type: 'file', icon: e.change_type === 'add' ? '+' : e.change_type === 'unlink' ? '-' : '~', color: getChangeColor(e.change_type), text: e.filepath, agent: e.agent_source, timestamp: e.timestamp }) ) as item (item._id)}
                <div
                  class="flex items-center gap-1.5 px-1.5 py-1 rounded transition-all duration-500 {item._new
                    ? 'feed-slide-in'
                    : 'hover:bg-canvas'}"
                  style="border-left: 2px solid {item.color}; background: {item.icon === '+'
                    ? 'var(--success-subtle)'
                    : item.icon === '-'
                      ? 'var(--error-subtle)'
                      : 'transparent'}; {item._new
                    ? `box-shadow: inset 3px 0 8px -4px ${item.color}`
                    : ''}"
                >
                  <span
                    class="w-4 text-center text-[9px] font-bold font-mono flex-shrink-0"
                    style="color: {item.color}">{item.icon}</span
                  >
                  <div class="flex-1 min-w-0">
                    <div
                      class="text-[10px] font-mono truncate"
                      style="color: {item.icon === '+'
                        ? 'var(--success)'
                        : item.icon === '-'
                          ? 'var(--error)'
                          : 'var(--text)'}"
                    >
                      {item.text}
                    </div>
                  </div>
                  {#if item.eventId && riskScores[item.eventId]}
                    {@const rs = riskScores[item.eventId]}
                    <span
                      class="px-1 py-0.5 text-[8px] font-bold rounded text-white flex-shrink-0"
                      style="background: {rs.score >= 7
                        ? 'var(--error)'
                        : rs.score >= 4
                          ? 'var(--warning)'
                          : 'var(--success)'}"
                      title={rs.reason}
                    >
                      {rs.score}
                    </span>
                  {/if}
                  <span class="text-[9px] text-muted font-mono flex-shrink-0"
                    >{formatTime(item.timestamp)}</span
                  >
                </div>
              {/each}
            {/if}
          </div>
        </div>
        <!-- AI Pulse — particle viz. Compact height at narrow widths so
             the Event Feed, AI Pulse, Active Models, and Agent Activity
             chart all fit on a half-screen view without aggressive scroll.
             xl: drops the cap and the viz fills its column. -->
        <div class="min-h-[160px] xl:min-h-0">
          <NebulaActivity />
        </div>
        <!-- Active Models column. GPU health lives in the global VitalsStrip
           below the header now, so this column is dedicated to active
           models — scales cleanly as more models load. Bounded scroll at
           narrow widths so a long model list doesn't push the page. -->
        <div class="flex flex-col min-h-0 overflow-auto max-h-[400px] xl:max-h-none">
          <ActiveModelCard />
        </div>
      </div>

      <!-- Compact Stats + Agents + System bar -->
      <div
        class="flex flex-wrap items-center gap-2 mb-3 bg-surface border border-border rounded px-3 py-2"
      >
        <!-- Stats inline -->
        {#each [{ key: 'lifetime_events', label: 'Events', value: stats.lifetime_events || stats.total_events, tip: stats.lifetime_events && stats.lifetime_events > stats.total_events ? `Lifetime file-change events across watched projects. ${formatNumber(stats.total_events)} are still in the rolling 7-day window; older events were retention-purged but stay counted here.` : 'Lifetime file-change events across watched projects (kept in project_stats so retention purges don’t lose history).' }] as stat (stat.key)}
          <span
            class="text-[11px] font-mono {statsFlash[stat.key] ? 'stat-flash' : ''}"
            title={stat.tip}
          >
            <span class="text-muted">{stat.label}</span>
            <span class="font-semibold" style="color: {stat.color || 'var(--text)'}"
              >{formatNumber(stat.value)}</span
            >
          </span>
          <span class="text-border">|</span>
        {/each}
        <span
          class="text-[11px] font-mono"
          title="File events per minute, averaged across the 100 most recent file changes. Throughput, not an instant rate."
        >
          <span class="text-muted">Rate</span>
          <span class="font-semibold text-body">{eventsPerMin}/m</span>
        </span>

        {#if activeAgentCount > 0}
          <span class="text-border">|</span>
          <button
            onclick={() => navigate('/agents')}
            class="text-[11px] font-mono bg-transparent border-0 cursor-pointer p-0 hover:opacity-80"
            title="Agents that have reported a heartbeat in the last 30s. Click for the full agent monitor."
          >
            <span class="text-muted">Agents</span>
            <span class="font-semibold text-body">{activeAgentCount}</span>
          </button>
        {/if}

        {#if billingMode === 'api' && burnRatePerHour !== null}
          <span class="text-border">|</span>
          <button
            onclick={() => navigate('/insights/costs')}
            class="text-[11px] font-mono bg-transparent border-0 cursor-pointer p-0 hover:opacity-80"
            title="Spend rate since today's first agent event. Cost per hour of active time, not wall-clock since midnight."
          >
            <span class="text-muted">Burn</span>
            <span class="font-semibold text-body">{formatCost(burnRatePerHour)}/hr</span>
          </button>
        {/if}

        {#if stats.app_errors > 0}
          <span class="text-border">|</span>
          <button
            onclick={() => navigate('/system/errors')}
            class="text-[11px] font-mono bg-transparent border-0 cursor-pointer p-0"
            title="Unresolved app errors caught by the global error handler. Click to view & clear."
          >
            <span class="text-error font-semibold">{stats.app_errors} errors</span>
          </button>
        {/if}

        {#if latestApiLatency}
          <span class="text-border">|</span>
          <button
            onclick={() => navigate('/agents/network')}
            class="text-[11px] font-mono bg-transparent border-0 cursor-pointer p-0 hover:opacity-80"
            title="Latency of Claude's most recent API request. Yellow >10s, red >30s. Click for the full network view."
          >
            <span class="text-muted">API</span>
            <span
              class="font-semibold"
              style="color: {latestApiLatency.latency_ms > 30000
                ? 'var(--error)'
                : latestApiLatency.latency_ms > 10000
                  ? 'var(--warning)'
                  : 'var(--text)'}"
            >
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
          <span
            class="flex items-center gap-1"
            title={billingMode === 'api'
              ? 'Estimated total API cost today (USD), all input + cache + output.'
              : 'Total tokens today across input, cache_creation, cache_read, and output. Click for the full cost breakdown.'}
          >
            <span class="text-muted">Tokens</span>
            <span class="font-semibold text-accent">
              {#if billingMode === 'api'}
                {formatCost(sessionCosts.total_cost_usd)}
              {:else}
                {formatTokens(totalIn + cOut)}
              {/if}
            </span>
          </span>
          <span
            class="flex items-center gap-1"
            title="All input tokens today: new (uncached) + cache_creation + cache_read. Includes the prompt context Claude reads each turn."
          >
            <span class="text-muted">In</span>
            <span class="text-body">{formatTokens(totalIn)}</span>
          </span>
          {#if cRead > 0}
            <span
              class="flex items-center gap-1"
              title="Tokens served from prompt cache (~10% of normal input cost). High = good — Claude reused context instead of paying full price."
            >
              <span class="text-muted">Cached</span>
              <span class="text-body">{formatTokens(cRead)}</span>
              {#if cacheHitPct !== null}
                <span
                  class="text-[10px]"
                  style="color: {cacheHitPct >= 80
                    ? 'var(--success)'
                    : cacheHitPct >= 50
                      ? 'var(--warning)'
                      : 'var(--error)'}"
                  title="Cache hit %: cache_read / total input. >80% healthy, 50-80% degrading, <50% means context is being rebuilt every turn."
                  >({cacheHitPct}%)</span
                >
              {/if}
            </span>
          {/if}
          <span
            class="flex items-center gap-1"
            title="Output tokens generated by Claude today. The work product, billed at the highest rate."
          >
            <span class="text-muted">Out</span>
            <span class="text-body">{formatTokens(cOut)}</span>
          </span>
        {/snippet}
        <button
          onclick={() => navigate('/insights/costs')}
          class="flex items-center gap-2 text-[11px] font-mono bg-transparent border-0 cursor-pointer p-0 hover:opacity-80"
        >
          {@render tokenStats()}
        </button>
      </div>

      <!-- Agent Activity chart (full-width at narrow) + Latest Diff (full-width
           at narrow) + Agents list. At xl+, these spread into 3 columns. -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3 xl:flex-1 xl:min-h-0">
        <!-- Agents — top-level + sub-agents in one list, most recent first.
             At narrow widths this slots last so the diff/chart get visual priority. -->
        <div
          class="bg-surface border border-border rounded-lg p-3 cursor-pointer hover:border-accent transition-colors flex flex-col order-3 xl:order-1"
          onclick={() => navigate('/agents')}
          onkeydown={e => (e.key === 'Enter' || e.key === ' ') && navigate('/agents')}
          role="link"
          tabindex="0"
        >
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">Agents</h3>
            <span class="text-[10px] text-muted">{allAgents.length} · →</span>
          </div>
          {#if allAgents.length > 0}
            <!-- Bounded scroll at narrow widths; full-height at xl. -->
            <div class="space-y-1 overflow-y-auto max-h-[400px] xl:max-h-none xl:flex-1">
              {#each allAgents.slice(0, 10) as agent (agent.key)}
                <div class="flex items-center gap-2 py-0.5">
                  <span
                    class="px-1.5 py-0.5 rounded text-[8px] font-bold text-white flex-shrink-0"
                    style="background: {agent.color}"
                    title={agent.kind === 'top' ? 'Top-level agent' : 'Sub-agent (Task spawn)'}
                    >{agent.chip}</span
                  >
                  <span
                    class="text-[10px] text-body truncate flex-1"
                    title={agent.labelTitle || agent.label}>{agent.label}</span
                  >
                  {#if agent.detail}
                    <span class="text-[9px] text-muted font-mono flex-shrink-0 hidden sm:inline"
                      >{agent.detail}</span
                    >
                  {/if}
                  <span class="text-[9px] text-muted font-mono flex-shrink-0"
                    >{formatTime(agent.time)}</span
                  >
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-xs text-muted py-2 leading-relaxed">
              No agents yet.
              <div class="text-[10px] mt-1">
                Run <code class="font-mono text-body">claude</code> in any tracked project and it'll
                appear here.
              </div>
            </div>
          {/if}
        </div>

        <!-- Latest Diff — full-width at narrow widths so the code is
             actually readable (was unreadably narrow squeezed into a thin
             middle column at half-screen). order-2 keeps it in the middle
             of the narrow stack: chart, diff, agents. -->
        {#if !latestDiffHidden}
          <div
            class="bg-surface border border-border rounded-lg overflow-hidden flex flex-col min-h-[260px] xl:min-h-0 order-2"
          >
            <div
              class="flex justify-between items-center gap-2 px-3 py-1.5 bg-canvas border-b border-border flex-shrink-0"
            >
              {#if latestDiff}
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0"
                  ></span>
                  <span class="text-[10px] font-mono text-body truncate"
                    >{latestDiff.filepath}<span class="cursor-blink">|</span></span
                  >
                </div>
                {#if latestDiff.agent_source}
                  <span
                    class="px-1 py-0.5 text-[8px] font-bold rounded text-white flex-shrink-0"
                    style="background: {getAgentColorByName(latestDiff.agent_source)}"
                    >{latestDiff.agent_source}</span
                  >
                {/if}
              {:else}
                <span class="text-[10px] font-semibold text-muted uppercase tracking-wide flex-1"
                  >Latest Change</span
                >
              {/if}
              <button
                type="button"
                onclick={() => (latestDiffHidden = true)}
                class="text-muted hover:text-body text-[12px] leading-none px-1 -mr-1 bg-transparent border-0 cursor-pointer flex-shrink-0"
                aria-label="Hide latest change panel"
                title="Hide">×</button
              >
            </div>
            <div class="flex-1 overflow-auto">
              {#if latestDiff}
                <pre
                  class="text-[10px] font-mono m-0 bg-surface leading-[1.6]">{#each latestDiff.diff
                    .split('\n')
                    .slice(0, 20) as line, li (li)}{@const c = line.charAt(0)}{#if c === '+'}<span
                        class="text-success block px-2"
                        style="background: var(--success-subtle)">{line.slice(1)}</span
                      >{:else if c === '-'}<span
                        class="text-error block px-2"
                        style="background: var(--error-subtle)">{line.slice(1)}</span
                      >{:else}<span class="text-muted block px-2"
                        >{c === ' ' ? line.slice(1) : line}</span
                      >{/if}{/each}</pre>
              {:else}
                <div
                  class="flex flex-col items-center justify-center h-full text-xs text-muted text-center px-3 leading-relaxed"
                >
                  <span>Waiting for changes</span>
                  <span class="text-[10px] mt-1"
                    >The next file Claude (or you) edits will land here as a live diff.</span
                  >
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Activity Trend — chart needs a min-h or Chart.js collapses
             when stacked at narrow widths. order-1 puts it first in the
             narrow stack (above the diff and the agents list). -->
        <div
          class="bg-surface border border-border rounded-lg p-3 flex flex-col min-h-[160px] xl:min-h-0 order-1 xl:order-3"
        >
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-1 flex-shrink-0">
            Agent Activity (5m)
          </h3>
          <div class="flex-1 min-h-[130px] xl:min-h-0 relative">
            <canvas id="chart-trend"></canvas>
            {#if recentFiles.length === 0 && recentAgentEvents.length === 0}
              <div
                class="absolute inset-0 flex flex-col items-center justify-center text-center px-3 leading-relaxed pointer-events-none"
              >
                <span class="text-xs text-muted">No activity in the last 5 minutes</span>
                <span class="text-[10px] text-muted/70 mt-1"
                  >The line will start drawing as soon as files change or a Claude tool call fires.</span
                >
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Syntax Alerts Banner -->
      {#if syntaxAlerts.length > 0}
        <div class="mb-6 space-y-2">
          {#each syntaxAlerts.slice(0, 3) as alert (alert._ts)}
            <div
              class="flex items-center gap-3 px-4 py-2 bg-error-subtle border border-error rounded-lg animate-pulse"
            >
              <span class="text-sm font-bold text-error">!!</span>
              <span class="text-sm text-error font-mono flex-1"
                >Syntax error in {alert.filepath} ({alert.count} issue{alert.count > 1
                  ? 's'
                  : ''})</span
              >
              <button
                onclick={() => {
                  syntaxAlerts = syntaxAlerts.filter(a => a._ts !== alert._ts);
                }}
                class="text-error hover:opacity-70 text-xs">dismiss</button
              >
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</PageLayout>
