<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './services/websocket.js';
  import { formatTime as formatTimeString } from './timeFormat.js';
  import TimelineSlider from './TimelineSlider.svelte';
  import VirtualScroll from './VirtualScroll.svelte';
  import { debounceInput } from './utils/debounce.js';
  import ProjectBadge from './ProjectBadge.svelte';
  import { api } from './apiClient.js';
  import SimilarChangesPanel from './SimilarChangesPanel.svelte';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  // Configuration constants
  const MAX_EVENTS_HISTORY = 1000; // Maximum number of events to keep in memory
  const MAX_CONVERSATIONS = 500; // Maximum number of conversations to fetch

  let events = [];
  let error = null;
  let searchQuery = '';
  let selectedTypes = {
    created: true,
    modified: true,
    deleted: true,
    user_message: true,
    assistant_text: true,
    tool_call: true,
    tool_result: true
  };
  let timeRangeStart = 0;
  let timeRangeEnd = Date.now();
  let virtualScroll; // Reference to virtual scroll component
  let expandedEvents = new Set(); // Track expanded conversation events

  // Forensics features
  let showDiffModal = false;
  let selectedEventForDiff = null;
  let forensicsStats = {
    topFiles: [],
    busiestHours: [],
    changeTypeBreakdown: { created: 0, modified: 0, deleted: 0 },
    totalChanges: 0,
    uniqueFiles: 0
  };
  let showForensics = true; // Toggle forensics dashboard

  // Chart.js visualizations
  let showCharts = true;
  let charts = {};
  let themeObserver;

  function handleTimeRangeChange(start, end) {
    timeRangeStart = start;
    timeRangeEnd = end;
  }

  // Debounced search handler
  function handleDebouncedSearch(event) {
    searchQuery = event.detail;
    // Reset scroll position when searching
    if (virtualScroll) {
      virtualScroll.scrollToItem(0);
    }
  }

  function clearEvents() {
    events = [];
  }

  function exportToJSON() {
    const exportData = {
      timestamp: new Date().toISOString(),
      total_events: events.length,
      filtered_events: filteredEvents.length,
      events: filteredEvents.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        filepath: e.filepath,
        change_type: e.changeType,
        cpu: e.cpu,
        mem: e.mem
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-events-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportToCSV() {
    const headers = ['ID', 'Timestamp', 'Filepath', 'Change Type', 'CPU %', 'Memory %'];
    const rows = filteredEvents.map(e => [
      e.id,
      e.timestamp,
      e.filepath,
      e.changeType,
      (e.cpu ?? 0).toFixed(2),
      (e.mem ?? 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row
          .map(cell => {
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(cell).replace(/"/g, '""');
            return escaped.includes(',') ? `"${escaped}"` : escaped;
          })
          .join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raven-events-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Memoization cache for filtered events (avoids re-filtering on unrelated reactive changes)
  let cachedFilterEvents = null;
  let cachedFilterQuery = '';
  let cachedFilterTypes = null;
  let cachedFilterStartTime = 0;
  let cachedFilterEndTime = 0;
  let cachedFilteredResult = [];

  // Optimized: Only filter when dependencies actually change
  $: {
    const typesKey = JSON.stringify(selectedTypes);

    if (
      events !== cachedFilterEvents ||
      searchQuery !== cachedFilterQuery ||
      typesKey !== cachedFilterTypes ||
      timeRangeStart !== cachedFilterStartTime ||
      timeRangeEnd !== cachedFilterEndTime
    ) {
      cachedFilterEvents = events;
      cachedFilterQuery = searchQuery;
      cachedFilterTypes = typesKey;
      cachedFilterStartTime = timeRangeStart;
      cachedFilterEndTime = timeRangeEnd;

      const lowerQuery = searchQuery.toLowerCase();

      cachedFilteredResult = events.filter(event => {
        // Filter by search query (check filepath for files, content for conversations)
        if (searchQuery) {
          const matchesFile = event.filepath?.toLowerCase().includes(lowerQuery);
          const matchesContent = event.content?.toLowerCase().includes(lowerQuery);
          const matchesTool = event.toolName?.toLowerCase().includes(lowerQuery);

          if (!matchesFile && !matchesContent && !matchesTool) {
            return false;
          }
        }

        // Filter by event type
        if (!selectedTypes[event.changeType]) {
          return false;
        }

        // Filter by time range
        const eventTime = new Date(event.timestamp).getTime();
        if (eventTime < timeRangeStart || eventTime > timeRangeEnd) {
          return false;
        }

        return true;
      });
    }
  }

  $: filteredEvents = cachedFilteredResult;

  async function loadRecentEvents() {
    try {
      // Fetch file events and conversation events in parallel
      const [fileEvents, conversationsData] = await Promise.all([
        api.get(`/all-file-events?limit=${MAX_EVENTS_HISTORY}`),
        api.get(`/conversations?limit=${MAX_CONVERSATIONS}`)
      ]);

      // Map file events
      const mappedFileEvents = fileEvents.map(e => ({
        id: `file-${e.id}`,
        timestamp: e.timestamp,
        filepath: e.filepath || 'unknown',
        changeType: mapChangeType(e.change_type),
        project: e.project || null,
        cpu: e.cpu || 0,
        mem: e.mem || 0,
        agent: e.agent || null,
        agentConfidence: e.agent_confidence || 0,
        riskScore: e.risk_score || 0,
        riskLevel: e.risk_level || null,
        eventCategory: 'file'
      }));

      // Map conversation events
      const mappedConversations = (conversationsData.conversations || []).map(c => ({
        id: `conv-${c.id}`,
        timestamp: c.timestamp,
        changeType: c.event_type, // user_message, assistant_text, tool_call, tool_result
        content: c.content,
        toolName: c.tool_name,
        toolInput: c.tool_input,
        toolOutput: c.tool_output,
        isError: c.is_error,
        project: c.project || 'unknown',
        eventCategory: 'conversation'
      }));

      // Merge and sort by timestamp (newest first)
      events = [...mappedFileEvents, ...mappedConversations].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      error = null;
    } catch (error) {
      logger.error('Failed to load events:', error);
      errorMessage = error.message || 'Failed to load events';
    }
  }

  // Map backend change_type to frontend changeType
  function mapChangeType(backendType) {
    switch (backendType) {
      // From events table (file watcher)
      case 'add':
        return 'created';
      case 'change':
        return 'modified';
      case 'unlink':
        return 'deleted';
      // From agent_events table (AI agents)
      case 'create':
        return 'created';
      case 'edit':
        return 'modified';
      case 'delete':
        return 'deleted';
      default:
        return 'modified';
    }
  }

  // WebSocket event handlers
  const handleFileChanged = event => {
    const newEvent = {
      id: event.id || Date.now(),
      timestamp: event.timestamp || new Date().toISOString(),
      filepath: event.filepath || 'unknown',
      changeType: mapChangeType(event.change_type || event.changeType),
      project: event.project || null,
      cpu: event.cpu || 0,
      mem: event.mem || 0
    };

    // Check for duplicate event ID to prevent duplicates on reconnection
    if (events.some(e => e.id === newEvent.id)) {
      return; // Skip duplicate
    }

    // Add new event to the top of the list
    events = [newEvent, ...events].slice(0, MAX_EVENTS_HISTORY); // Keep last MAX_EVENTS_HISTORY events
  };

  const handleProjectSwitched = async data => {
    logger.info(' Project switched, reloading events:', data.project);
    await loadRecentEvents();
  };

  onMount(async () => {
    // Load initial events from database
    await loadRecentEvents();

    // Create charts after data loads and DOM is ready
    if (showCharts && events.length > 0) {
      setTimeout(createCharts, 200);
    }

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for real-time file change events
    websocketService.on('file-changed', handleFileChanged);

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Watch for theme changes on body element
    themeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class' && showCharts) {
          logger.info('[EventFeed] Theme changed, recreating charts');
          setTimeout(createCharts, 100);
        }
      });
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);

    // Disconnect theme observer
    if (themeObserver) {
      themeObserver.disconnect();
    }

    // Destroy all charts
    Object.values(charts).forEach(chart => chart?.destroy());
  });

  function formatTime(timestamp) {
    return formatTimeString(timestamp);
  }

  function getChangeClass(type) {
    return (
      {
        modified: 'change-modified',
        created: 'change-created',
        deleted: 'change-deleted'
      }[type] || ''
    );
  }

  // Safe helper to get max count for progress bar calculations (prevents division by zero)
  function getMaxFileCount() {
    return forensicsStats.topFiles[0]?.count || 1;
  }

  function getMaxHourCount() {
    return forensicsStats.busiestHours[0]?.count || 1;
  }

  // Calculate forensics statistics
  function calculateForensicsStats() {
    if (filteredEvents.length === 0) return;

    // Only count file events (exclude conversation events)
    const fileEvents = filteredEvents.filter(e => e.eventCategory === 'file' && e.filepath);

    // Count changes by file
    const fileChanges = new Map();
    fileEvents.forEach(event => {
      const count = fileChanges.get(event.filepath) || 0;
      fileChanges.set(event.filepath, count + 1);
    });

    // Top 5 most changed files
    forensicsStats.topFiles = Array.from(fileChanges.entries())
      .map(([filepath, count]) => ({ filepath, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Activity by hour (all events)
    const hourCounts = new Array(24).fill(0);
    filteredEvents.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      hourCounts[hour]++;
    });

    forensicsStats.busiestHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Change type breakdown (file events only)
    forensicsStats.changeTypeBreakdown = {
      created: fileEvents.filter(e => e.changeType === 'created').length,
      modified: fileEvents.filter(e => e.changeType === 'modified').length,
      deleted: fileEvents.filter(e => e.changeType === 'deleted').length
    };

    forensicsStats.totalChanges = filteredEvents.length;
    forensicsStats.uniqueFiles = fileChanges.size;
  }

  // Watch for changes and recalculate stats
  $: if (filteredEvents) {
    calculateForensicsStats();
  }

  async function openDiffModal(event) {
    selectedEventForDiff = event;

    // Fetch full event details including diff
    try {
      const data = await api.get(`/file-events?limit=${MAX_EVENTS_HISTORY}&diff=true`);
      const eventsArray = Array.isArray(data) ? data : data.events || [];
      // Extract numeric ID from prefixed ID (e.g., "file-123" -> 123)
      const numericId = parseInt(event.id.toString().replace(/^file-/, ''), 10);
      const eventWithDiff = eventsArray.find(e => e.id === numericId);

      if (eventWithDiff) {
        selectedEventForDiff = {
          ...event,
          diff: eventWithDiff.diff
        };
      }

      showDiffModal = true;
    } catch (error) {
      logger.error('Failed to load diff:', error);
    }
  }

  function closeDiffModal() {
    showDiffModal = false;
    selectedEventForDiff = null;
  }

  // Get icon for conversation event type
  function getConversationIcon(eventType) {
    switch (eventType) {
      case 'user_message':
        return '';
      case 'assistant_text':
        return '';
      case 'tool_call':
        return '';
      case 'tool_result':
        return '';
      default:
        return '';
    }
  }

  // Toggle event expansion
  function toggleExpanded(eventId) {
    if (expandedEvents.has(eventId)) {
      expandedEvents.delete(eventId);
    } else {
      expandedEvents.add(eventId);
    }
    expandedEvents = expandedEvents; // Trigger reactivity
  }

  // Truncate long text
  function truncate(text, maxLength = 150) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // Get agent badge info
  function getAgentBadge(agent) {
    // Helper function to safely extract color with fallback
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      return value && (value.startsWith('#') || value.startsWith('rgb')) ? value : fallback;
    };

    const badges = {
      ant: { icon: '', color: getColor('--accent', '#7aa2f7'), name: 'ANT' },
      'claude-code': { icon: '', color: getColor('--accent', '#bb9af7'), name: 'Claude Code' },
      cursor: { icon: '', color: getColor('--success', '#9ece6a'), name: 'Cursor' },
      'github-copilot': { icon: '', color: getColor('--error', '#f7768e'), name: 'Copilot' },
      aider: { icon: '', color: getColor('--warning', '#e0af68'), name: 'Aider' },
      manual: { icon: '', color: getColor('--muted', '#565f89'), name: 'Manual' },
      unknown: { icon: '', color: getColor('--muted', '#565f89'), name: 'Unknown' }
    };
    return badges[agent] || badges.unknown;
  }

  // Get risk badge info
  function getRiskBadge(riskLevel) {
    // Helper function to safely extract color with fallback
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      return value && (value.startsWith('#') || value.startsWith('rgb')) ? value : fallback;
    };

    const badges = {
      high: { icon: '', color: getColor('--error', '#f7768e'), text: 'High Risk' },
      medium: { icon: '', color: getColor('--warning', '#e0af68'), text: 'Medium Risk' },
      low: { icon: '', color: getColor('--success', '#9ece6a'), text: 'Low Risk' }
    };
    return badges[riskLevel] || null;
  }

  // Merge file events and conversation events for chart calculations
  $: mergedEvents = filteredEvents;

  // Reactive aria-labels for chart accessibility
  $: eventTypesAriaLabel = (() => {
    const typeCounts = {
      created: mergedEvents.filter(e => e.changeType === 'created').length,
      modified: mergedEvents.filter(e => e.changeType === 'modified').length,
      deleted: mergedEvents.filter(e => e.changeType === 'deleted').length,
      user_message: mergedEvents.filter(e => e.changeType === 'user_message').length,
      assistant_text: mergedEvents.filter(e => e.changeType === 'assistant_text').length,
      tool_call: mergedEvents.filter(e => e.changeType === 'tool_call').length,
      tool_result: mergedEvents.filter(e => e.changeType === 'tool_result').length
    };
    const topTypes = Object.entries(typeCounts)
      .filter(([_, count]) => count > 0)
      .slice(0, 3);
    if (topTypes.length === 0) return 'Event type distribution chart: No events available';
    const summary = topTypes.map(([type, count]) => `${type}: ${count}`).join(', ');
    return `Event type distribution chart showing ${mergedEvents.length} total events. Top types: ${summary}`;
  })();

  $: eventsPerHourAriaLabel = (() => {
    const now = new Date();
    const recentEvents = mergedEvents.filter(e => {
      const eventDate = new Date(e.timestamp);
      const hoursDiff = (now - eventDate) / (1000 * 60 * 60);
      return hoursDiff < 24;
    });
    return `Events per hour chart showing ${recentEvents.length} events in the last 24 hours`;
  })();

  $: topAgentsAriaLabel = (() => {
    const agentCounts = {};
    mergedEvents
      .filter(e => e.agent)
      .forEach(event => {
        agentCounts[event.agent] = (agentCounts[event.agent] || 0) + 1;
      });
    const topAgents = Object.entries(agentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (topAgents.length === 0) return 'Top agents chart: No agent data available';
    const summary = topAgents.map(([agent, count]) => `${agent}: ${count} events`).join(', ');
    return `Top agents by event count: ${summary}`;
  })();

  $: riskScoresAriaLabel = (() => {
    const eventsWithRisk = mergedEvents.filter(
      e => e.riskScore !== undefined && e.riskScore !== null
    );
    if (eventsWithRisk.length === 0) return 'Risk scores chart: No risk data available';
    const avgRisk = (
      eventsWithRisk.reduce((sum, e) => sum + e.riskScore, 0) / eventsWithRisk.length
    ).toFixed(1);
    return `Risk scores over time chart showing ${eventsWithRisk.length} events with an average risk score of ${avgRisk}`;
  })();

  // Chart creation function
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || mergedEvents.length === 0) return;

    // Helper function to safely extract color with fallback
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      return value && (value.startsWith('#') || value.startsWith('rgb')) ? value : fallback;
    };

    // Get theme-aware colors from body element
    const textColor = getColor('--text', '#c0caf5');
    const mutedColor = getColor('--muted', '#565f89');
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    // 1. Pie Chart: Change Type Distribution
    const pieCanvas = document.getElementById('chart-event-types');
    if (pieCanvas) {
      const typeCounts = {
        created: mergedEvents.filter(e => e.changeType === 'created').length,
        modified: mergedEvents.filter(e => e.changeType === 'modified').length,
        deleted: mergedEvents.filter(e => e.changeType === 'deleted').length,
        user_message: mergedEvents.filter(e => e.changeType === 'user_message').length,
        assistant_text: mergedEvents.filter(e => e.changeType === 'assistant_text').length,
        tool_call: mergedEvents.filter(e => e.changeType === 'tool_call').length,
        tool_result: mergedEvents.filter(e => e.changeType === 'tool_result').length
      };

      const labels = [];
      const data = [];
      const colors = [];

      if (typeCounts.created > 0) {
        labels.push('Created');
        data.push(typeCounts.created);
        colors.push(getColor('--success', '#22c55e'));
      }
      if (typeCounts.modified > 0) {
        labels.push('Modified');
        data.push(typeCounts.modified);
        colors.push(getColor('--info', '#3b82f6'));
      }
      if (typeCounts.deleted > 0) {
        labels.push('Deleted');
        data.push(typeCounts.deleted);
        colors.push(getColor('--error', '#ef4444'));
      }
      if (typeCounts.user_message > 0) {
        labels.push('User Messages');
        data.push(typeCounts.user_message);
        colors.push(getColor('--accent', '#8b5cf6'));
      }
      if (typeCounts.assistant_text > 0) {
        labels.push('Claude Responses');
        data.push(typeCounts.assistant_text);
        colors.push(getColor('--accent-2', '#ec4899'));
      }
      if (typeCounts.tool_call > 0) {
        labels.push('Tool Calls');
        data.push(typeCounts.tool_call);
        colors.push(getColor('--warning', '#f59e0b'));
      }
      if (typeCounts.tool_result > 0) {
        labels.push('Tool Results');
        data.push(typeCounts.tool_result);
        colors.push(getColor('--info', '#06b6d4'));
      }

      charts.eventTypes = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              backgroundColor: colors
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: textColor,
                font: { size: 11, family: 'var(--mono)' },
                padding: 8
              }
            },
            title: {
              display: true,
              text: 'Event Type Distribution',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            }
          }
        }
      });
    }

    // 2. Bar Chart: Events Per Hour (Last 24 hours)
    const barCanvas = document.getElementById('chart-events-per-hour');
    if (barCanvas) {
      const now = new Date();
      const last24Hours = new Array(24).fill(0);

      mergedEvents.forEach(event => {
        const eventDate = new Date(event.timestamp);
        const hoursDiff = Math.floor((now - eventDate) / (1000 * 60 * 60));
        if (hoursDiff >= 0 && hoursDiff < 24) {
          last24Hours[23 - hoursDiff]++;
        }
      });

      const hourLabels = [];
      for (let i = 23; i >= 0; i--) {
        const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
        hourLabels.push(hour.getHours() + ':00');
      }

      charts.eventsPerHour = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: hourLabels,
          datasets: [
            {
              label: 'Events',
              data: last24Hours,
              backgroundColor: getColor('--info', '#3b82f6')
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            title: {
              display: true,
              text: 'Events Per Hour (Last 24h)',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: mutedColor,
                font: { size: 10, family: 'var(--mono)' }
              },
              grid: {
                color: gridColor
              }
            },
            x: {
              ticks: {
                color: mutedColor,
                font: { size: 9, family: 'var(--mono)' },
                maxRotation: 90,
                minRotation: 45
              },
              grid: {
                color: gridColor
              }
            }
          }
        }
      });
    }

    // 3. Horizontal Bar Chart: Top 5 Agents by Event Count
    const agentBarCanvas = document.getElementById('chart-top-agents');
    if (agentBarCanvas) {
      const agentCounts = {};
      mergedEvents
        .filter(e => e.agent)
        .forEach(event => {
          agentCounts[event.agent] = (agentCounts[event.agent] || 0) + 1;
        });

      const sortedAgents = Object.entries(agentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (sortedAgents.length > 0) {
        const agentLabels = sortedAgents.map(([agent]) => {
          const badge = getAgentBadge(agent);
          return badge.name;
        });
        const agentData = sortedAgents.map(([_, count]) => count);
        const agentColors = sortedAgents.map(([agent]) => getAgentBadge(agent).color);

        charts.topAgents = new Chart(agentBarCanvas, {
          type: 'bar',
          data: {
            labels: agentLabels,
            datasets: [
              {
                label: 'Events',
                data: agentData,
                backgroundColor: agentColors
              }
            ]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              title: {
                display: true,
                text: 'Top 5 Agents by Event Count',
                color: textColor,
                font: { size: 12, weight: 'bold', family: 'var(--mono)' }
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: {
                  color: mutedColor,
                  font: { size: 10, family: 'var(--mono)' }
                },
                grid: {
                  color: gridColor
                }
              },
              y: {
                ticks: {
                  color: mutedColor,
                  font: { size: 10, family: 'var(--mono)' }
                },
                grid: {
                  color: gridColor
                }
              }
            }
          }
        });
      }
    }

    // 4. Line Chart: Risk Scores Over Time
    const lineCanvas = document.getElementById('chart-risk-scores');
    if (lineCanvas) {
      const eventsWithRisk = mergedEvents
        .filter(e => e.riskScore !== undefined && e.riskScore !== null)
        .slice(0, 50)
        .reverse();

      if (eventsWithRisk.length > 0) {
        const riskLabels = eventsWithRisk.map((_, i) => i + 1);
        const riskData = eventsWithRisk.map(e => e.riskScore);

        charts.riskScores = new Chart(lineCanvas, {
          type: 'line',
          data: {
            labels: riskLabels,
            datasets: [
              {
                label: 'Risk Score',
                data: riskData,
                borderColor: getColor('--error', '#ef4444'),
                backgroundColor:
                  'color-mix(in srgb, ' + getColor('--error', '#ef4444') + ' 10%, transparent)',
                fill: true,
                tension: 0.4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              title: {
                display: true,
                text: 'Risk Scores Over Time (Last 50 Events)',
                color: textColor,
                font: { size: 12, weight: 'bold', family: 'var(--mono)' }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: {
                  color: mutedColor,
                  font: { size: 10, family: 'var(--mono)' }
                },
                grid: {
                  color: gridColor
                }
              },
              x: {
                ticks: {
                  color: mutedColor,
                  font: { size: 10, family: 'var(--mono)' }
                },
                grid: {
                  color: gridColor
                }
              }
            }
          }
        });
      }
    }
  }

  // Recreate charts when merged events change
  $: if (showCharts && mergedEvents.length > 0) {
    setTimeout(createCharts, 100);
  }
</script>

<div class="event-feed" role="region" aria-label="Event Feed">
  <!-- Forensics Dashboard -->
  {#if showForensics && filteredEvents.length > 0}
    <section class="forensics-dashboard" aria-labelledby="forensics-heading">
      <div class="forensics-header">
        <h2 id="forensics-heading"><span aria-hidden="true"></span> Forensics Analysis</h2>
        <button
          class="toggle-forensics"
          on:click={() => (showForensics = !showForensics)}
          aria-label="{showForensics ? 'Hide' : 'Show'} forensics analysis"
          aria-expanded={showForensics}
        >
          <span aria-hidden="true">{showForensics ? '' : ''}</span>
          {showForensics ? 'Hide' : 'Show'}
        </button>
      </div>

      <!-- Key Metrics Cards -->
      <div class="stats-cards" role="group" aria-label="Forensics statistics">
        <div
          class="stat-card"
          role="status"
          aria-label="Total changes: {forensicsStats.totalChanges}"
        >
          <div class="stat-icon" aria-hidden="true"></div>
          <div class="stat-content">
            <div class="stat-label">Total Changes</div>
            <div class="stat-value">{forensicsStats.totalChanges}</div>
          </div>
        </div>

        <div
          class="stat-card"
          role="status"
          aria-label="Unique files: {forensicsStats.uniqueFiles}"
        >
          <div class="stat-icon" aria-hidden="true"></div>
          <div class="stat-content">
            <div class="stat-label">Unique Files</div>
            <div class="stat-value">{forensicsStats.uniqueFiles}</div>
          </div>
        </div>

        <div
          class="stat-card success"
          role="status"
          aria-label="Files created: {forensicsStats.changeTypeBreakdown.created}"
        >
          <div class="stat-icon" aria-hidden="true"></div>
          <div class="stat-content">
            <div class="stat-label">Created</div>
            <div class="stat-value">{forensicsStats.changeTypeBreakdown.created}</div>
          </div>
        </div>

        <div
          class="stat-card warning"
          role="status"
          aria-label="Files modified: {forensicsStats.changeTypeBreakdown.modified}"
        >
          <div class="stat-icon" aria-hidden="true"></div>
          <div class="stat-content">
            <div class="stat-label">Modified</div>
            <div class="stat-value">{forensicsStats.changeTypeBreakdown.modified}</div>
          </div>
        </div>

        <div
          class="stat-card error"
          role="status"
          aria-label="Files deleted: {forensicsStats.changeTypeBreakdown.deleted}"
        >
          <div class="stat-icon" aria-hidden="true"></div>
          <div class="stat-content">
            <div class="stat-label">Deleted</div>
            <div class="stat-value">{forensicsStats.changeTypeBreakdown.deleted}</div>
          </div>
        </div>
      </div>

      <!-- Top Files and Busiest Hours -->
      <div class="forensics-grid">
        <!-- Top 5 Most Changed Files -->
        <div class="forensics-panel">
          <h3 id="top-files-heading">
            <span aria-hidden="true"></span> Top 5 Most Changed Files
          </h3>
          <ul class="top-files-list" role="list" aria-labelledby="top-files-heading">
            {#each forensicsStats.topFiles as file (file.filepath)}
              <li class="top-file-item">
                <div class="file-path">{file.filepath}</div>
                <div class="file-count">{file.count} changes</div>
                <div
                  class="file-bar"
                  role="progressbar"
                  aria-valuenow={file.count}
                  aria-valuemin="0"
                  aria-valuemax={getMaxFileCount()}
                  aria-label="{file.count} changes"
                >
                  <div
                    class="file-bar-fill"
                    style="width: {(file.count / getMaxFileCount()) * 100}%"
                  ></div>
                </div>
              </li>
            {/each}
          </ul>
        </div>

        <!-- Busiest Hours Heat Map -->
        <div class="forensics-panel">
          <h3 id="busiest-hours-heading"><span aria-hidden="true"></span> Busiest Hours</h3>
          <ul class="hours-heatmap" role="list" aria-labelledby="busiest-hours-heading">
            {#each forensicsStats.busiestHours as hourData (hourData.hour)}
              <li class="hour-item">
                <div class="hour-label">
                  {hourData.hour.toString().padStart(2, '0')}:00
                </div>
                <div class="hour-count">{hourData.count} events</div>
                <div
                  class="hour-bar"
                  role="progressbar"
                  aria-valuenow={hourData.count}
                  aria-valuemin="0"
                  aria-valuemax={getMaxHourCount()}
                  aria-label="{hourData.count} events at {hourData.hour}:00"
                >
                  <div
                    class="hour-bar-fill"
                    style="width: {(hourData.count / getMaxHourCount()) * 100}%"
                  ></div>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </section>
  {/if}

  <!-- Charts Section -->
  {#if filteredEvents.length > 0}
    <section class="charts-section" aria-labelledby="charts-heading">
      <div class="charts-header">
        <h2 id="charts-heading">Analytics Visualizations</h2>
        <button
          class="toggle-charts"
          on:click={() => (showCharts = !showCharts)}
          aria-label="{showCharts ? 'Hide' : 'Show'} charts"
          aria-expanded={showCharts}
        >
          {showCharts ? 'Hide Charts' : 'Show Charts'}
        </button>
      </div>

      {#if showCharts}
        <div class="charts-grid">
          <div class="chart-container">
            <div role="img" aria-label={eventTypesAriaLabel} style="height: 250px;">
              <canvas id="chart-event-types"></canvas>
            </div>
          </div>
          <div class="chart-container">
            <div role="img" aria-label={eventsPerHourAriaLabel} style="height: 250px;">
              <canvas id="chart-events-per-hour"></canvas>
            </div>
          </div>
          <div class="chart-container">
            <div role="img" aria-label={topAgentsAriaLabel} style="height: 180px;">
              <canvas id="chart-top-agents"></canvas>
            </div>
          </div>
          <div class="chart-container">
            <div role="img" aria-label={riskScoresAriaLabel} style="height: 250px;">
              <canvas id="chart-risk-scores"></canvas>
            </div>
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <div class="header">
    <span
      class="count"
      role="status"
      aria-live="polite"
      aria-label="{filteredEvents.length} of {events.length} events displayed"
      >{filteredEvents.length} / {events.length} events</span
    >
    <div class="header-actions" role="toolbar" aria-label="Event actions">
      <button class="export-btn" on:click={exportToJSON} aria-label="Export events to JSON file">
        <span aria-hidden="true"></span> JSON
      </button>
      <button class="export-btn" on:click={exportToCSV} aria-label="Export events to CSV file">
        <span aria-hidden="true"></span> CSV
      </button>
      <button class="clear-btn" on:click={clearEvents} aria-label="Clear all events">
        <span aria-hidden="true"></span> Clear
      </button>
    </div>
  </div>

  <div class="filters" role="search" aria-label="Filter events">
    <label for="event-search" class="visually-hidden"
      >Search events by filename or conversation</label
    >
    <input
      id="event-search"
      type="text"
      class="search-input"
      placeholder="Search by filename or conversation..."
      use:debounceInput={{ delay: 300 }}
      on:debounced={handleDebouncedSearch}
      aria-label="Search events by filename or conversation"
    />
    <div class="type-filters" role="group" aria-label="Event type filters">
      <fieldset class="filter-group">
        <legend class="filter-group-label">Files:</legend>
        <label class="filter-checkbox">
          <input
            type="checkbox"
            bind:checked={selectedTypes.created}
            aria-label="Show created files"
          />
          <span class="filter-label created">Created</span>
        </label>
        <label class="filter-checkbox">
          <input
            type="checkbox"
            bind:checked={selectedTypes.modified}
            aria-label="Show modified files"
          />
          <span class="filter-label modified">Modified</span>
        </label>
        <label class="filter-checkbox">
          <input
            type="checkbox"
            bind:checked={selectedTypes.deleted}
            aria-label="Show deleted files"
          />
          <span class="filter-label deleted">Deleted</span>
        </label>
      </fieldset>
      <fieldset class="filter-group">
        <legend class="filter-group-label">Conversations:</legend>
        <label class="filter-checkbox">
          <input
            type="checkbox"
            bind:checked={selectedTypes.user_message}
            aria-label="Show user messages"
          />
          <span class="filter-label conversation"><span aria-hidden="true"></span> User</span>
        </label>
        <label class="filter-checkbox">
          <input
            type="checkbox"
            bind:checked={selectedTypes.assistant_text}
            aria-label="Show Claude responses"
          />
          <span class="filter-label conversation"><span aria-hidden="true"></span> Claude</span>
        </label>
        <label class="filter-checkbox">
          <input
            type="checkbox"
            bind:checked={selectedTypes.tool_call}
            aria-label="Show tool calls"
          />
          <span class="filter-label conversation"><span aria-hidden="true"></span> Tools</span>
        </label>
        <label class="filter-checkbox">
          <input
            type="checkbox"
            bind:checked={selectedTypes.tool_result}
            aria-label="Show tool results"
          />
          <span class="filter-label conversation"><span aria-hidden="true"></span> Results</span>
        </label>
      </fieldset>
    </div>
  </div>

  <div class="timeline-container">
    <TimelineSlider {events} onTimeRangeChange={handleTimeRangeChange} />
  </div>

  {#if error}
    <div class="error-state" role="alert">
      <p>Error: {error}</p>
      <button class="btn-retry" on:click={loadRecentEvents} aria-label="Retry loading events">
        Retry
      </button>
    </div>
  {:else if filteredEvents.length > 0}
    <div class="events">
      <VirtualScroll
        bind:this={virtualScroll}
        items={filteredEvents}
        itemHeight={90}
        containerHeight={500}
        overscan={3}
        getKey={event => event.id}
        let:item
      >
        {#if item.eventCategory === 'file'}
          <!-- File Event -->
          <div
            class="event-card {getChangeClass(item.changeType)}"
            role="button"
            tabindex="0"
            on:click={() => openDiffModal(item)}
            on:keydown={e => (e.key === 'Enter' || e.key === ' ') && openDiffModal(item)}
            aria-label="File {item.changeType}: {item.filepath} at {formatTime(
              item.timestamp
            )}. Click to view diff."
          >
            <div class="event-type-indicator">
              <span class="event-icon">
                {#if item.changeType === 'created'}{:else if item.changeType === 'modified'}{:else if item.changeType === 'deleted'}{/if}
              </span>
            </div>

            <div class="event-content">
              <div class="event-main">
                <div class="event-filepath">
                  <span class="filepath-text">{item.filepath}</span>
                  {#if item.project}
                    <ProjectBadge project={item.project} size="small" />
                  {/if}
                </div>
                <span class="event-time">{formatTime(item.timestamp)}</span>
              </div>

              <div class="event-metadata">
                <span class="event-badge {item.changeType}">
                  {item.changeType}
                </span>
                {#if item.agent}
                  <span
                    class="agent-badge"
                    style="background: {getAgentBadge(item.agent)
                      .color}33; border-color: {getAgentBadge(item.agent).color};"
                    title="{getAgentBadge(item.agent).name} ({item.agentConfidence}% confidence)"
                  >
                    <span class="agent-icon">{getAgentBadge(item.agent).icon}</span>
                    <span class="agent-name">{getAgentBadge(item.agent).name}</span>
                  </span>
                {/if}
                {#if item.riskLevel && item.riskLevel !== 'low'}
                  <span
                    class="risk-badge risk-{item.riskLevel}"
                    style="background: {getRiskBadge(item.riskLevel)
                      .color}33; border-color: {getRiskBadge(item.riskLevel).color};"
                    title="Risk Score: {item.riskScore}/100"
                  >
                    <span class="risk-icon">{getRiskBadge(item.riskLevel).icon}</span>
                    <span class="risk-text">{getRiskBadge(item.riskLevel).text}</span>
                  </span>
                {/if}
                <div class="event-metrics">
                  <span class="metric cpu">
                    <span class="metric-icon"></span>
                    <span class="metric-value">{(item.cpu ?? 0).toFixed(1)}%</span>
                    <span class="metric-label">CPU</span>
                  </span>
                  <span class="metric mem">
                    <span class="metric-icon"></span>
                    <span class="metric-value">{(item.mem ?? 0).toFixed(1)}%</span>
                    <span class="metric-label">RAM</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        {:else if item.eventCategory === 'conversation'}
          <!-- Conversation Event -->
          <div
            class="event-card conversation {item.changeType}"
            role="button"
            tabindex="0"
            on:click={() => toggleExpanded(item.id)}
            on:keydown={e => (e.key === 'Enter' || e.key === ' ') && toggleExpanded(item.id)}
            aria-label="{item.changeType.replace('_', ' ')}: {truncate(
              item.content || item.toolName || 'Event',
              50
            )}. Click to {expandedEvents.has(item.id) ? 'collapse' : 'expand'} details."
            aria-expanded={expandedEvents.has(item.id)}
          >
            <div class="event-type-indicator conversation">
              <span class="event-icon">{getConversationIcon(item.changeType)}</span>
            </div>

            <div class="event-content">
              <div class="event-main">
                <div class="conversation-header">
                  {#if item.changeType === 'user_message'}
                    <span class="conv-label">You:</span>
                    <span class="conv-text">{truncate(item.content)}</span>
                  {:else if item.changeType === 'assistant_text'}
                    <span class="conv-label">Claude:</span>
                    <span class="conv-text">{truncate(item.content)}</span>
                  {:else if item.changeType === 'tool_call'}
                    <span class="conv-label">Tool:</span>
                    <span class="conv-text tool-name">{item.toolName}</span>
                  {:else if item.changeType === 'tool_result'}
                    <span class="conv-label">
                      {item.isError ? '' : ''} Result:
                    </span>
                    <span class="conv-text">{truncate(item.toolOutput, 100)}</span>
                  {/if}
                  {#if item.project}
                    <ProjectBadge project={item.project} size="small" />
                  {/if}
                </div>
                <span class="event-time">{formatTime(item.timestamp)}</span>
              </div>

              <!-- Expandable Details -->
              {#if expandedEvents.has(item.id)}
                <div class="expanded-details">
                  {#if item.changeType === 'tool_call' && item.toolInput}
                    <div class="detail-section">
                      <div class="detail-label">Input:</div>
                      <pre class="detail-code">{JSON.stringify(item.toolInput, null, 2)}</pre>
                    </div>
                  {:else if item.changeType === 'tool_result'}
                    <div class="detail-section">
                      <div class="detail-label">Output:</div>
                      <pre class="detail-code">{item.toolOutput}</pre>
                    </div>
                  {:else if (item.changeType === 'user_message' || item.changeType === 'assistant_text') && item.content}
                    <div class="detail-section">
                      <pre class="detail-text">{item.content}</pre>
                    </div>
                  {/if}
                </div>
              {/if}

              <div class="event-metadata conversation">
                <span class="event-badge conversation {item.changeType}">
                  {item.changeType.replace('_', ' ')}
                </span>
                {#if item.changeType === 'tool_call' || item.changeType === 'tool_result'}
                  <button
                    class="expand-btn"
                    on:click|stopPropagation={() => toggleExpanded(item.id)}
                  >
                    {expandedEvents.has(item.id) ? ' Collapse' : ' Expand'}
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </VirtualScroll>
    </div>
  {:else if events.length === 0}
    <div class="empty">
      <p>No events yet...</p>
      <p class="hint">Waiting for file changes to be detected</p>
    </div>
  {:else}
    <div class="empty">
      <p>No events match your filters</p>
      <p class="hint">Try adjusting your search or filter criteria</p>
    </div>
  {/if}
</div>

<!-- Diff Viewer Modal -->
{#if showDiffModal && selectedEventForDiff}
  <div class="modal-overlay" on:click={closeDiffModal} role="presentation">
    <div
      class="modal-content"
      on:click|stopPropagation
      on:keydown={e => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      aria-labelledby="diff-modal-title"
      aria-modal="true"
    >
      <div class="modal-header">
        <h3 id="diff-modal-title"><span aria-hidden="true"></span> File Diff</h3>
        <button class="close-btn" on:click={closeDiffModal} aria-label="Close diff viewer"></button>
      </div>

      <div class="modal-body">
        <div class="diff-meta">
          <div class="meta-row">
            <span class="meta-label">File:</span>
            <span class="meta-value">{selectedEventForDiff.filepath}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Change Type:</span>
            <span class="meta-value badge {selectedEventForDiff.changeType}">
              {selectedEventForDiff.changeType}
            </span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Timestamp:</span>
            <span class="meta-value">{formatTime(selectedEventForDiff.timestamp)}</span>
          </div>
        </div>

        {#if selectedEventForDiff.diff}
          <div class="diff-viewer">
            <pre class="diff-content">{selectedEventForDiff.diff}</pre>
          </div>
        {:else}
          <div class="no-diff">
            <p>No diff available for this change</p>
            <p class="hint">Diff may not be available for deletions or binary files</p>
          </div>
        {/if}

        <!-- Similar Changes Analysis -->
        {#if selectedEventForDiff.id}
          <div class="similar-changes-section">
            <SimilarChangesPanel
              eventId={selectedEventForDiff.id.toString().replace('file-', '')}
              project={selectedEventForDiff.project || 'raven'}
              limit={5}
            />
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .event-feed {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-lg);
    position: relative;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .count {
    color: var(--muted);
    font-size: 11px;
    font-family: var(--mono);
  }

  .header-actions {
    display: flex;
    gap: var(--space-lg);
  }

  .export-btn {
    padding: var(--space-md) var(--space-xl);
    font-size: 11px;
    background: var(--surface-2);
    color: var(--info);
    border: 1px solid var(--info);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .export-btn:hover {
    background: var(--info);
    color: var(--text);
  }

  .clear-btn {
    padding: var(--space-md) var(--space-xl);
    font-size: 11px;
    background: var(--surface-2);
    color: var(--error);
    border: 1px solid var(--error);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .clear-btn:hover {
    background: var(--error);
    color: var(--text);
  }

  .events {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    background: var(--bg);
    padding: var(--space-lg);
  }

  /* Card Layout */
  .event-card {
    display: flex;
    gap: var(--space-lg);
    background: var(--bg);
    padding: var(--space-md);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    border-left: 4px solid var(--info);
  }

  .event-card.change-created {
    border-left-color: var(--success);
  }

  .event-card.change-modified {
    border-left-color: var(--warning);
  }

  .event-card.change-deleted {
    border-left-color: var(--error);
  }

  /* Icon Indicator */
  .event-type-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    height: 40px;
  }

  .event-icon {
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Content Area */
  .event-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    min-width: 0;
  }

  .event-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-lg);
  }

  .event-filepath {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    flex: 1;
    min-width: 0;
  }

  .filepath-text {
    font-family: var(--mono);
    color: var(--text);
    font-weight: 500;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-time {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
    font-family: var(--mono);
  }

  /* Metadata Row */
  .event-metadata {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .event-badge {
    padding: var(--space-sm) var(--space-lg);
    font-size: 11px;
    border-radius: var(--radius);
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .event-badge.modified {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    color: var(--warning);
    border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  }

  .event-badge.created {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
    border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
  }

  .event-badge.deleted {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
    border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
  }

  /* Metrics */
  .event-metrics {
    display: flex;
    gap: var(--space-lg);
    margin-left: auto;
  }

  .metric {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }

  .metric-icon {
    font-size: 11px;
  }

  .metric-value {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .metric-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: var(--muted);
  }

  .empty p {
    margin: 0.5rem 0;
  }

  .hint {
    font-size: 12px;
    color: var(--muted);
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-2xl);
    border-bottom: 1px solid var(--border);
  }

  .search-input {
    width: 100%;
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--info);
    background: var(--surface-2);
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  .type-filters {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    cursor: pointer;
    user-select: none;
  }

  .filter-checkbox input[type='checkbox'] {
    cursor: pointer;
    width: var(--icon-xs);
    height: var(--icon-xs);
  }

  .filter-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius);
  }

  .filter-label.created {
    background: var(--success) 33;
    color: var(--success);
  }

  .filter-label.modified {
    background: var(--warning) 33;
    color: var(--warning);
  }

  .filter-label.deleted {
    background: var(--error) 33;
    color: var(--error);
  }

  .timeline-container {
    margin-bottom: var(--space-lg);
  }

  /* Forensics Dashboard */
  .forensics-dashboard {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .forensics-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .forensics-header h2 {
    margin: 0;
    font-size: 11px;
    color: var(--text);
    font-weight: 700;
  }

  .toggle-forensics {
    padding: var(--space-md) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .toggle-forensics:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .stats-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .stat-card {
    display: flex;
    gap: var(--space-md);
    align-items: center;
    padding: var(--space-md);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .stat-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .stat-card.success {
    border-left: 4px solid var(--success);
  }

  .stat-card.warning {
    border-left: 4px solid var(--warning);
  }

  .stat-card.error {
    border-left: 4px solid var(--error);
  }

  .stat-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-sm);
  }

  .stat-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .forensics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: var(--space-lg);
  }

  .forensics-panel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-md);
  }

  .forensics-panel h3 {
    margin: 0 0 var(--space-lg) 0;
    font-size: 11px;
    color: var(--text);
    font-weight: 600;
  }

  .top-files-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .top-file-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .file-path {
    font-size: 12px;
    color: var(--text);
    font-family: var(--mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-count {
    font-size: 11px;
    color: var(--muted);
  }

  .file-bar {
    height: 8px;
    background: var(--surface-2);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .file-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2, var(--accent)));
    border-radius: var(--radius);
    transition: width var(--duration-slow) var(--ease-smooth);
  }

  .hours-heatmap {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .hour-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .hour-label {
    font-size: 11px;
    color: var(--text);
    font-family: var(--mono);
    font-weight: 600;
  }

  .hour-count {
    font-size: 11px;
    color: var(--muted);
  }

  .hour-bar {
    height: 8px;
    background: var(--surface-2);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .hour-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--warning), var(--error));
    border-radius: var(--radius);
    transition: width var(--duration-slow) var(--ease-smooth);
  }

  /* Diff Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in srgb, black 80%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
  }

  .modal-content {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    width: 90%;
    max-width: 1000px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px color-mix(in srgb, black 60%, transparent);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg);
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 11px;
    color: var(--text);
  }

  .close-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .close-btn:hover {
    background: var(--error);
    color: white;
    border-color: var(--error);
  }

  .modal-body {
    padding: var(--space-lg);
    overflow-y: auto;
  }

  .diff-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: var(--space-lg);
  }

  .meta-row {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .meta-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    min-width: 100px;
  }

  .meta-value {
    font-size: 11px;
    color: var(--text);
    font-family: var(--mono);
  }

  .meta-value.badge {
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius);
    text-transform: uppercase;
    font-size: 11px;
    font-weight: 700;
  }

  .meta-value.badge.created {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
    border: 1px solid var(--success);
  }

  .meta-value.badge.modified {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    color: var(--warning);
    border: 1px solid var(--warning);
  }

  .meta-value.badge.deleted {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
    border: 1px solid var(--error);
  }

  .diff-viewer {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: auto;
    max-height: 500px;
  }

  .diff-content {
    margin: 0;
    padding: var(--space-md);
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    line-height: 1.6;
    white-space: pre;
    overflow-x: auto;
  }

  .no-diff {
    text-align: center;
    padding: var(--space-4xl) var(--space-3xl);
    color: var(--muted);
  }

  .no-diff p {
    margin: var(--space-md) 0;
  }

  /* Make event cards clickable */
  .event-card {
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .event-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  /* Conversation Event Styles */
  .event-card.conversation {
    border-left: 3px solid var(--accent);
  }

  .event-type-indicator.conversation {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }

  .conversation-header {
    display: flex;
    gap: var(--space-lg);
    align-items: flex-start;
    flex-wrap: wrap;
    flex: 1;
  }

  .conv-label {
    font-weight: 600;
    font-size: 12px;
    color: var(--accent);
    min-width: 60px;
  }

  .conv-text {
    color: var(--text);
    font-size: 11px;
    flex: 1;
    line-height: 1.4;
  }

  .conv-text.tool-name {
    font-family: var(--mono);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    padding: var(--space-xs) var(--space-lg);
    border-radius: var(--radius);
    font-weight: 600;
  }

  .expanded-details {
    margin-top: var(--space-lg);
    padding: var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .detail-section {
    margin-bottom: var(--space-lg);
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .detail-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    margin-bottom: var(--space-sm);
  }

  .detail-code {
    font-family: var(--mono);
    font-size: 11px;
    background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
    padding: var(--space-lg);
    border-radius: var(--radius);
    overflow-x: auto;
    color: var(--text);
    margin: 0;
    line-height: 1.5;
  }

  .detail-text {
    font-size: 12px;
    color: var(--text);
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.6;
  }

  .expand-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 11px;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .expand-btn:hover {
    background: var(--bg-secondary);
    border-color: var(--accent);
  }

  .event-metadata.conversation {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    justify-content: space-between;
  }

  .event-badge.conversation {
    font-size: 11px;
    padding: var(--space-sm) var(--space-lg);
    text-transform: capitalize;
  }

  .filter-group {
    display: flex;
    gap: var(--space-md);
    align-items: center;
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg-secondary);
    border-radius: var(--radius);
  }

  .filter-group-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
  }

  .filter-label.conversation {
    font-size: 12px;
  }

  /* Agent Badge Styles */
  .agent-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    font-size: 11px;
    border-radius: var(--radius);
    font-weight: 600;
    border: 1px solid;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .agent-icon {
    font-size: 11px;
  }

  .agent-name {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Risk Badge Styles */
  .risk-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    font-size: 11px;
    border-radius: var(--radius);
    font-weight: 700;
    border: 1px solid;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .risk-icon {
    font-size: 12px;
  }

  .risk-text {
    font-size: 11px;
  }

  /* Similar Changes Section */
  .similar-changes-section {
    margin-top: var(--space-lg);
  }

  /* Accessibility */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* Override fieldset default styles for filter groups */
  fieldset.filter-group {
    border: none;
    padding: var(--space-sm) var(--space-lg);
    margin: 0;
  }

  legend.filter-group-label {
    padding: 0;
  }

  /* Charts Section */
  .charts-section {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: var(--space-xl);
  }

  .charts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xl);
  }

  .charts-header h2 {
    margin: 0;
    font-size: 11px;
    color: var(--text);
    font-weight: 700;
  }

  .toggle-charts {
    padding: var(--space-md) var(--space-xl);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .toggle-charts:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-xl);
  }

  .chart-container {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-xl);
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xl);
    padding: var(--space-4xl) var(--space-2xl);
    margin: var(--space-2xl) 0;
    background: color-mix(in srgb, var(--error) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
    border-radius: var(--radius);
    text-align: center;
  }

  .error-state p {
    margin: 0;
    color: var(--error);
    font-size: 13px;
    font-weight: 500;
  }

  .btn-retry {
    padding: var(--space-lg) var(--space-2xl);
    background: var(--error);
    color: white;
    border: none;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .btn-retry:hover {
    background: color-mix(in srgb, var(--error) 90%, black);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .btn-retry:focus {
    outline: 2px solid var(--error);
    outline-offset: 2px;
  }
</style>
