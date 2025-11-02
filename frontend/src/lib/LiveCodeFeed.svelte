<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatTime as formatTimeString } from './timeFormat.js';
  import ProjectBadge from './ProjectBadge.svelte';
  import { api } from './apiClient.js';
  import { logger } from './logger.js';
  import { notifications } from './notificationService.js';
  import { Chart, registerables } from 'chart.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';

  Chart.register(...registerables);

  let codeChanges = [];
  let loading = true;
  let error = null;

  // New: Filtering & Sorting
  let searchQuery = '';
  let selectedChangeTypes = []; // 'created', 'modified', 'deleted'
  let selectedFileTypes = []; // '.js', '.svelte', '.py', etc.
  let selectedProject = 'all';
  let sortBy = 'timestamp'; // 'timestamp', 'filename', 'changes'
  let sortOrder = 'desc'; // 'asc', 'desc'
  let showCharts = true;

  // Charts
  let charts = {};
  let themeObserver;

  // Live session stats
  let sessionStats = {
    duration: 0,
    files_touched: 0,
    active_agents: 0,
    session_id: '',
    total_events: 0
  };
  let isPaused = false;

  // Metrics history for sparklines (last 20 data points)
  let metricsHistory = {
    cpu: [],
    memory: []
  };


  // Filter out build artifacts - only show real source code changes
  function isSourceCodeFile(filepath) {
    if (!filepath) return false;

    // Exclude build/dist directories
    if (filepath.match(/\/(dist|build|\.vite|\.next|\.nuxt|out|public\/build)\//)) return false;

    // Exclude build artifacts
    if (filepath.match(/\.(map|min\.js|min\.css|chunk\.js)$/)) return false;

    // Exclude dependencies
    if (filepath.match(/\/(node_modules|\.git|\.svelte-kit)\//)) return false;

    // Include everything else (source code)
    return true;
  }

  // Debounce utility function (moved outside reactive scope)
  let debouncedTimeoutId;
  const debounce = (fn, delay) => {
    return function (...args) {
      clearTimeout(debouncedTimeoutId);
      debouncedTimeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  // Debounced reload functions
  const debouncedLoadChanges = debounce(async () => {
    await loadCodeChanges();
    await loadRecentActivity();
  }, 300);

  // WebSocket event handlers
  const handleFileChanged = (data) => {
    logger.info('File change detected:', data);
    debouncedLoadChanges();
  };

  const handleAgentEvent = () => {
    debouncedLoadChanges();
  };

  const handleProjectSwitched = (data) => {
    logger.info('📡 Project switched, reloading data:', data.project);
    loadAllData();
  };

  onMount(async () => {
    await loadAllData();

    // Create charts after data loads and DOM is ready
    if (showCharts && codeChanges.length > 0) {
      setTimeout(createCharts, 200);
    }

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for file change events (debounced)
    websocketService.on('file-changed', handleFileChanged);

    // Listen for agent events (debounced)
    websocketService.on('agent-event', handleAgentEvent);

    // Listen for project switch events
    websocketService.on('project-switched', handleProjectSwitched);

    // Event-driven updates via WebSocket (no polling!)

    // Watch for theme changes on body element
    themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' && showCharts) {
          logger.info('[LiveCodeFeed] Theme changed, recreating charts');
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
    websocketService.off('agent-event', handleAgentEvent);
    websocketService.off('project-switched', handleProjectSwitched);

    // Clean up pending debounced timeout
    if (debouncedTimeoutId) {
      clearTimeout(debouncedTimeoutId);
    }

    // Disconnect theme observer
    if (themeObserver) {
      themeObserver.disconnect();
    }

    // Destroy all charts
    Object.values(charts).forEach(chart => chart?.destroy());
  });

  async function loadAllData() {
    try {
      await Promise.all([
        loadCodeChanges(),
        loadRecentActivity(),
        loadSessionStats()
      ]);
      loading = false;
      error = null;
    } catch (err) {
      logger.error('Failed to load data:', err);
      error = err.message || 'Failed to load data';
      loading = false;
    }
  }

  async function loadSessionStats() {
    try {
      const data = await api.get('/dashboard-stats');

      sessionStats = {
        duration: data.session_duration_seconds || 0,
        files_touched: data.unique_files_modified || 0,
        active_agents: data.total_agents || 0,
        session_id: data.session_id || 'unknown',
        total_events: data.total_events || 0
      };

      // Update metrics history for sparklines
      await loadMetrics();
    } catch (error) {
      logger.error('Failed to load session stats:', error);
    }
  }

  async function loadMetrics() {
    try {
      const data = await api.get('/process-metrics?limit=1');

      if (data && data.length > 0) {
        const latest = data[0];

        // Map database column names to display names
        // process_metrics table has: cpu_usage, memory_mb
        const cpu = latest.cpu_usage || latest.cpu || 0;
        const mem = latest.memory_mb || latest.mem || 0;

        // Add to history (keep last 20 points)
        metricsHistory.cpu = [...metricsHistory.cpu, cpu].slice(-20);
        metricsHistory.memory = [...metricsHistory.memory, mem].slice(-20);
      }
    } catch (error) {
      logger.error('Failed to load metrics:', error);
    }
  }

  function generateSparkline(data, width = 60, height = 24) {
    if (data.length < 2) return '';

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    return `M ${points.split(' ').join(' L ')}`;
  }

  function togglePause() {
    isPaused = !isPaused;
    // Pause just stops WebSocket handlers from updating UI
    // Event-driven updates will resume when unpause
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  async function loadCodeChanges() {
    try {
      // Use all-file-events to get events from ALL projects
      const data = await api.get('/all-file-events?limit=50&diff=true');
      // all-file-events returns an array directly with project tags
      const allChanges = Array.isArray(data) ? data : [];

      // Filter to only show real source code (exclude build artifacts)
      codeChanges = allChanges.filter(change => isSourceCodeFile(change.filepath));
    } catch (err) {
      logger.error('Failed to load code changes:', err);
      throw err;
    }
  }

  async function loadRecentActivity() {
    try {
      // Load recent activity for preloading/caching
      await Promise.all([
        api.get('/all-file-events?limit=20'),
        api.get('/all-agent-events?limit=20')
      ]);
    } catch (err) {
      logger.error('Failed to load recent activity:', err);
      throw err;
    }
  }

  function parseDiffLines(diff) {
    if (!diff) return [];

    const lines = diff.split('\n');
    let currentLineNum = 0;

    return lines.map((line, index) => {
      let type = 'context';
      let displayNum = '';

      // Check if it's a header line (@@)
      if (line.startsWith('@@')) {
        type = 'header';
        // Extract starting line number from @@ -x,y +a,b @@
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentLineNum = parseInt(match[1], 10) - 1;
        }
        displayNum = '•';
      }
      // Addition line
      else if (line.startsWith('+') && !line.startsWith('+++')) {
        type = 'add';
        currentLineNum++;
        displayNum = currentLineNum.toString();
      }
      // Deletion line
      else if (line.startsWith('-') && !line.startsWith('---')) {
        type = 'remove';
        displayNum = '-';
      }
      // File header lines
      else if (line.startsWith('+++') || line.startsWith('---')) {
        type = 'header';
        displayNum = '•';
      }
      // Context line
      else if (line.trim() !== '') {
        type = 'context';
        currentLineNum++;
        displayNum = currentLineNum.toString();
      }

      return {
        text: line,
        type,
        lineNum: displayNum,
        index
      };
    }).filter(line => line.text.trim() !== '' || line.type !== 'context');
  }

  function getChangeTypeIcon(changeType) {
    if (changeType === 'add' || changeType === 'create') return '➕';
    if (changeType === 'change' || changeType === 'modify') return '✏️';
    if (changeType === 'unlink' || changeType === 'delete') return '🗑️';
    return '📝';
  }

  function getChangeTypeColor(changeType) {
    if (changeType === 'add' || changeType === 'create') return 'var(--success)';
    if (changeType === 'change' || changeType === 'modify') return 'var(--info)';
    if (changeType === 'unlink' || changeType === 'delete') return 'var(--error)';
    return 'var(--muted)';
  }

  function formatTime(timestamp) {
    return formatTimeString(timestamp);
  }

  function truncatePath(path, maxLength = 40) {
    if (!path || path.length <= maxLength) return path;
    const parts = path.split('/');
    if (parts.length <= 2) return path;
    return '.../' + parts.slice(-2).join('/');
  }

  // Get file extension from path
  function getFileExtension(filepath) {
    if (!filepath) return 'unknown';
    const match = filepath.match(/\.([^.]+)$/);
    return match ? `.${match[1]}` : 'no-ext';
  }

  // Normalize change type
  function normalizeChangeType(changeType) {
    if (!changeType) return 'unknown';
    const type = changeType.toLowerCase();
    if (type === 'add' || type === 'create') return 'created';
    if (type === 'change' || type === 'modify') return 'modified';
    if (type === 'unlink' || type === 'delete') return 'deleted';
    return type;
  }

  // Get all unique projects from changes
  $: allProjects = [...new Set(codeChanges.map(c => c.project).filter(Boolean))];

  // Get all unique file types from changes
  $: allFileTypes = [...new Set(codeChanges.map(c => getFileExtension(c.filepath)))].sort();

  // Reactive filtering
  $: filteredChanges = codeChanges.filter(change => {
    // Search filter
    if (searchQuery && !change.filepath?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Change type filter
    if (selectedChangeTypes.length > 0) {
      const normalized = normalizeChangeType(change.change_type);
      if (!selectedChangeTypes.includes(normalized)) {
        return false;
      }
    }

    // File type filter
    if (selectedFileTypes.length > 0) {
      const ext = getFileExtension(change.filepath);
      if (!selectedFileTypes.includes(ext)) {
        return false;
      }
    }

    // Project filter
    if (selectedProject !== 'all' && change.project !== selectedProject) {
      return false;
    }

    return true;
  });

  // Reactive sorting
  $: sortedChanges = [...filteredChanges].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'timestamp') {
      comparison = new Date(b.timestamp) - new Date(a.timestamp);
    } else if (sortBy === 'filename') {
      comparison = (a.filepath || '').localeCompare(b.filepath || '');
    } else if (sortBy === 'changes') {
      const aSize = a.event_size || 0;
      const bSize = b.event_size || 0;
      comparison = bSize - aSize;
    }

    return sortOrder === 'desc' ? comparison : -comparison;
  });

  // Statistics
  $: statistics = {
    totalChanges: filteredChanges.length,
    created: filteredChanges.filter(c => normalizeChangeType(c.change_type) === 'created').length,
    modified: filteredChanges.filter(c => normalizeChangeType(c.change_type) === 'modified').length,
    deleted: filteredChanges.filter(c => normalizeChangeType(c.change_type) === 'deleted').length,
    byFileType: allFileTypes.reduce((acc, ext) => {
      acc[ext] = filteredChanges.filter(c => getFileExtension(c.filepath) === ext).length;
      return acc;
    }, {}),
    mostActiveFile: (() => {
      const fileCounts = {};
      filteredChanges.forEach(c => {
        if (c.filepath) {
          fileCounts[c.filepath] = (fileCounts[c.filepath] || 0) + 1;
        }
      });
      const entries = Object.entries(fileCounts);
      if (entries.length === 0) return null;
      return entries.sort((a, b) => b[1] - a[1])[0];
    })()
  };

  // Reactive aria-labels for chart accessibility
  $: fileTypesAriaLabel = (() => {
    const topTypes = Object.entries(statistics.byFileType)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (topTypes.length === 0) return 'File type distribution chart: No data available';
    const summary = topTypes.map(([ext, count]) => `${ext}: ${count}`).join(', ');
    return `File type distribution chart showing ${statistics.totalChanges} total changes. Top types: ${summary}`;
  })();

  $: changeTypesAriaLabel = `Change type breakdown chart showing ${statistics.created} files created, ${statistics.modified} files modified, and ${statistics.deleted} files deleted`;

  $: timelineAriaLabel = (() => {
    const last20 = [...filteredChanges].slice(0, 20);
    if (last20.length === 0) return 'Timeline chart: No changes to display';
    return `Timeline chart showing the last ${last20.length} changes over time`;
  })();

  // Export functions
  function exportToJSON() {
    const data = JSON.stringify(sortedChanges, null, 2);
    downloadFile(data, 'code-changes.json', 'application/json');
    notifications.success('Exported to JSON!');
  }

  function exportToCSV() {
    const headers = ['Timestamp', 'Change Type', 'File Path', 'Project', 'Size (bytes)', 'Hash'];
    const rows = sortedChanges.map(c => [
      c.timestamp,
      c.change_type,
      c.filepath || '',
      c.project || '',
      c.event_size || 0,
      c.file_hash || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    downloadFile(csv, 'code-changes.csv', 'text/csv');
    notifications.success('Exported to CSV!');
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Toggle change type filter
  function toggleChangeType(type) {
    if (selectedChangeTypes.includes(type)) {
      selectedChangeTypes = selectedChangeTypes.filter(t => t !== type);
    } else {
      selectedChangeTypes = [...selectedChangeTypes, type];
    }
  }

  // Toggle file type filter
  function toggleFileType(type) {
    if (selectedFileTypes.includes(type)) {
      selectedFileTypes = selectedFileTypes.filter(t => t !== type);
    } else {
      selectedFileTypes = [...selectedFileTypes, type];
    }
  }

  // Chart creation
  function createCharts() {
    logger.info('[LiveCodeFeed] createCharts called', {
      showCharts,
      filteredChangesCount: filteredChanges.length
    });

    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || filteredChanges.length === 0) {
      logger.warn('[LiveCodeFeed] Skipping chart creation', { showCharts, filteredChanges: filteredChanges.length });
      return;
    }

    // Helper function to safely extract color with fallback
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      // Only use if it's a valid color (hex or rgb)
      return (value && (value.startsWith('#') || value.startsWith('rgb'))) ? value : fallback;
    };

    // Get theme-aware colors from body element
    const textColor = getColor('--text', '#c0caf5');
    const mutedColor = getColor('--muted', '#565f89');
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    // Extract theme colors for charts with fallbacks
    const themeColors = {
      accent: getColor('--accent', '#7aa2f7'),
      success: getColor('--success', '#9ece6a'),
      error: getColor('--error', '#f7768e'),
      warning: getColor('--warning', '#e0af68'),
      info: getColor('--info', '#7aa2f7')
    };

    logger.info('[LiveCodeFeed] Extracted chart colors:', themeColors);

    // File type distribution pie chart
    const pieCanvas = document.getElementById('chart-file-types');
    logger.info('[LiveCodeFeed] pieCanvas found:', !!pieCanvas);
    if (pieCanvas) {
      const fileTypeData = Object.entries(statistics.byFileType)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Top 10 file types

      charts.fileTypes = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels: fileTypeData.map(([ext]) => ext),
          datasets: [{
            data: fileTypeData.map(([_, count]) => count),
            backgroundColor: [
              themeColors.accent, themeColors.success, themeColors.warning, themeColors.error, '#8b5cf6',
              '#ec4899', themeColors.info, '#84cc16', '#f97316', '#6366f1'
            ]
          }]
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
              text: 'File Type Distribution',
              color: textColor,
              font: { size: 12, weight: 'bold', family: 'var(--mono)' }
            }
          }
        }
      });
    }

    // Change type breakdown bar chart
    const barCanvas = document.getElementById('chart-change-types');
    if (barCanvas) {
      charts.changeTypes = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: ['Created', 'Modified', 'Deleted'],
          datasets: [{
            label: 'Changes',
            data: [statistics.created, statistics.modified, statistics.deleted],
            backgroundColor: [themeColors.success, themeColors.accent, themeColors.error]
          }]
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
              text: 'Change Type Breakdown',
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

    // Changes over time line chart (last 20 events)
    const lineCanvas = document.getElementById('chart-timeline');
    if (lineCanvas) {
      const last20 = [...filteredChanges].slice(0, 20).reverse();
      const timestamps = last20.map((c, i) => i + 1);
      const sizes = last20.map(c => c.event_size || 0);

      charts.timeline = new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels: timestamps,
          datasets: [{
            label: 'Change Size (bytes)',
            data: sizes,
            borderColor: themeColors.accent,
            backgroundColor: `${themeColors.accent}1a`,
            fill: true,
            tension: 0.4
          }]
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
              text: 'Changes Over Time (Last 20)',
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

  // Recreate charts when filtered data changes
  $: if (showCharts && filteredChanges.length > 0) {
    setTimeout(createCharts, 100);
  }
</script>

<div class="live-code-feed" role="region" aria-label="Live code feed">
  <!-- Live Session Stats Widget -->
  <div class="stats-widget" role="region" aria-label="Live session statistics">
    <div class="stats-header">
      <div class="stats-title">
        <h2>💻 Code Changes</h2>
        <p class="stats-subtitle">Source code only • Excludes build artifacts and dependencies</p>
      </div>
    </div>
    <div class="stats-bar" role="list" aria-label="Session metrics">
      <div class="stat-item">
        <span class="stat-icon">⏱️</span>
        <div class="stat-content">
          <span class="stat-label">Duration</span>
          <span class="stat-value">{formatDuration(sessionStats.duration)}</span>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">📁</span>
        <div class="stat-content">
          <span class="stat-label">Files Touched</span>
          <span class="stat-value">{sessionStats.files_touched}</span>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">🤖</span>
        <div class="stat-content">
          <span class="stat-label">Active Agents</span>
          <span class="stat-value">{sessionStats.active_agents}</span>
        </div>
      </div>

      <div class="stat-item">
        <span class="stat-icon">📊</span>
        <div class="stat-content">
          <span class="stat-label">Total Events</span>
          <span class="stat-value">{sessionStats.total_events}</span>
        </div>
      </div>

      <!-- Sparklines for CPU and Memory -->
      {#if metricsHistory.cpu.length > 1}
        <div class="sparkline-item">
          <div class="sparkline-header">
            <span class="sparkline-label">CPU</span>
            <span class="sparkline-current">{metricsHistory.cpu[metricsHistory.cpu.length - 1]?.toFixed(1)}%</span>
          </div>
          <svg class="sparkline" width="60" height="24" viewBox="0 0 60 24">
            <path
              d={generateSparkline(metricsHistory.cpu, 60, 24)}
              fill="none"
              stroke="var(--info)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>
      {/if}

      {#if metricsHistory.memory.length > 1}
        <div class="sparkline-item">
          <div class="sparkline-header">
            <span class="sparkline-label">MEM</span>
            <span class="sparkline-current">{metricsHistory.memory[metricsHistory.memory.length - 1]?.toFixed(1)}%</span>
          </div>
          <svg class="sparkline" width="60" height="24" viewBox="0 0 60 24">
            <path
              d={generateSparkline(metricsHistory.memory, 60, 24)}
              fill="none"
              stroke="var(--success)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>
      {/if}

      <div class="stat-controls">
        <button class="btn-pause" on:click={togglePause} aria-label={isPaused ? 'Resume live feed updates' : 'Pause live feed updates'} aria-pressed={isPaused}>
          <span aria-hidden="true">{isPaused ? '▶️' : '⏸️'}</span>
          <span class="pause-text">{isPaused ? 'Resume' : 'Pause'}</span>
        </button>
      </div>
    </div>

    {#if isPaused}
      <div class="paused-banner" role="status" aria-live="polite">
        <span aria-hidden="true">⏸️</span> Feed paused - Click Resume to continue live updates
      </div>
    {/if}
  </div>

  <!-- Statistics Dashboard -->
  {#if !loading && codeChanges.length > 0}
    <div class="statistics-dashboard">
      <div class="stats-cards">
        <div class="stats-card">
          <div class="stats-card-icon">📊</div>
          <div class="stats-card-content">
            <div class="stats-card-label">Total Changes</div>
            <div class="stats-card-value">{statistics.totalChanges}</div>
          </div>
        </div>

        <div class="stats-card created">
          <div class="stats-card-icon">➕</div>
          <div class="stats-card-content">
            <div class="stats-card-label">Created</div>
            <div class="stats-card-value">{statistics.created}</div>
          </div>
        </div>

        <div class="stats-card modified">
          <div class="stats-card-icon">✏️</div>
          <div class="stats-card-content">
            <div class="stats-card-label">Modified</div>
            <div class="stats-card-value">{statistics.modified}</div>
          </div>
        </div>

        <div class="stats-card deleted">
          <div class="stats-card-icon">🗑️</div>
          <div class="stats-card-content">
            <div class="stats-card-label">Deleted</div>
            <div class="stats-card-value">{statistics.deleted}</div>
          </div>
        </div>

        {#if statistics.mostActiveFile}
          <div class="stats-card active">
            <div class="stats-card-icon">🔥</div>
            <div class="stats-card-content">
              <div class="stats-card-label">Most Active File</div>
              <div class="stats-card-value" title={statistics.mostActiveFile[0]}>
                {truncatePath(statistics.mostActiveFile[0], 30)} ({statistics.mostActiveFile[1]})
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Charts Section -->
    {#if showCharts}
      <div class="charts-section">
        <div class="charts-header">
          <h3>📈 Analytics</h3>
          <button class="btn-toggle-charts" on:click={() => showCharts = false}>Hide Charts</button>
        </div>
        <div class="charts-grid">
          <div class="chart-container">
            <div role="img" aria-label={fileTypesAriaLabel} style="height: 250px;">
              <canvas id="chart-file-types"></canvas>
            </div>
          </div>
          <div class="chart-container">
            <div role="img" aria-label={changeTypesAriaLabel} style="height: 250px;">
              <canvas id="chart-change-types"></canvas>
            </div>
          </div>
          <div class="chart-container chart-wide">
            <div role="img" aria-label={timelineAriaLabel} style="height: 250px;">
              <canvas id="chart-timeline"></canvas>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="charts-toggle">
        <button class="btn-toggle-charts" on:click={() => showCharts = true}>Show Charts</button>
      </div>
    {/if}

    <!-- Filters & Controls -->
    <div class="filters-section">
      <div class="filters-row">
        <!-- Search -->
        <div class="filter-group">
          <input
            type="text"
            class="search-input"
            placeholder="Search files..."
            bind:value={searchQuery}
          />
        </div>

        <!-- Change Type Filters -->
        <div class="filter-group">
          <span class="filter-label">Change Type:</span>
          <button
            class="filter-btn {selectedChangeTypes.includes('created') ? 'active' : ''}"
            on:click={() => toggleChangeType('created')}
          >
            ➕ Created
          </button>
          <button
            class="filter-btn {selectedChangeTypes.includes('modified') ? 'active' : ''}"
            on:click={() => toggleChangeType('modified')}
          >
            ✏️ Modified
          </button>
          <button
            class="filter-btn {selectedChangeTypes.includes('deleted') ? 'active' : ''}"
            on:click={() => toggleChangeType('deleted')}
          >
            🗑️ Deleted
          </button>
        </div>

        <!-- Sort Options -->
        <div class="filter-group">
          <span class="filter-label">Sort:</span>
          <select class="sort-select" bind:value={sortBy}>
            <option value="timestamp">Timestamp</option>
            <option value="filename">Filename</option>
            <option value="changes">Size</option>
          </select>
          <button
            class="sort-order-btn"
            on:click={() => sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'}
            title="Toggle sort order"
          >
            {sortOrder === 'desc' ? '↓' : '↑'}
          </button>
        </div>

        <!-- Export Buttons -->
        <div class="filter-group">
          <button class="export-btn" on:click={exportToJSON}>Export JSON</button>
          <button class="export-btn" on:click={exportToCSV}>Export CSV</button>
        </div>
      </div>

      <!-- File Type Filters (if there are multiple types) -->
      {#if allFileTypes.length > 1}
        <div class="filters-row">
          <div class="filter-group">
            <span class="filter-label">File Types:</span>
            {#each allFileTypes.slice(0, 15) as fileType (fileType)}
              <button
                class="filter-btn small {selectedFileTypes.includes(fileType) ? 'active' : ''}"
                on:click={() => toggleFileType(fileType)}
              >
                {fileType} ({statistics.byFileType[fileType] || 0})
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Project Filter (if multiple projects) -->
      {#if allProjects.length > 1}
        <div class="filters-row">
          <div class="filter-group">
            <span class="filter-label">Project:</span>
            <select class="project-select" bind:value={selectedProject}>
              <option value="all">All Projects</option>
              {#each allProjects as project (project)}
                <option value={project}>{project}</option>
              {/each}
            </select>
          </div>
        </div>
      {/if}

      <!-- Clear Filters -->
      {#if searchQuery || selectedChangeTypes.length > 0 || selectedFileTypes.length > 0 || selectedProject !== 'all'}
        <div class="filters-row">
          <button
            class="clear-filters-btn"
            on:click={() => {
              searchQuery = '';
              selectedChangeTypes = [];
              selectedFileTypes = [];
              selectedProject = 'all';
            }}
          >
            Clear All Filters
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="feed-layout">
    <!-- Code Changes List -->
    <section class="code-changes-content" aria-labelledby="code-changes-heading">
        {#if error}
          <div class="error-state" role="alert">
            <p>Error: {error}</p>
            <button class="btn-retry" on:click={loadAllData} aria-label="Retry loading code changes">
              Retry
            </button>
          </div>
        {:else if loading}
          <LoadingSkeleton type="list" count={5} height="80px" />
        {:else if codeChanges.length === 0}
          <div class="empty-state" role="status">
            <p>No recent code changes</p>
            <p class="empty-hint">Waiting for file modifications to be detected</p>
          </div>
        {:else if sortedChanges.length === 0}
          <div class="empty-state" role="status">
            <p>No changes match your filters</p>
            <p class="empty-hint">Try adjusting your search or filter criteria</p>
          </div>
        {:else}
          <div class="changes-list" role="feed" aria-label="Code changes feed" aria-busy={loading}>
            {#each sortedChanges || [] as change, index (`${change.id || change.filepath}-${index}`)}
              <div class="change-item">
                <div class="change-header">
                  <div class="change-meta">
                    <span class="change-icon" style="color: {getChangeTypeColor(change.change_type)}">
                      {getChangeTypeIcon(change.change_type)}
                    </span>
                    <span class="change-type" style="color: {getChangeTypeColor(change.change_type)}">
                      {change.change_type.toUpperCase()}
                    </span>
                    {#if change.project}
                      <ProjectBadge project={change.project} size="small" />
                    {/if}
                    <span class="change-time">{formatTime(change.timestamp)}</span>
                  </div>
                  <button class="btn-copy" title="Copy file path" on:click={() => {
                    navigator.clipboard.writeText(change.filepath || 'Unknown file');
                    notifications.success('File path copied!');
                  }}>📋</button>
                </div>

                <div class="change-file">
                  <code>{change.filepath || 'Unknown file'}</code>
                </div>

                {#if change.diff}
                  <div class="change-diff">
                    {#each parseDiffLines(change.diff) as line (line.index)}
                      <div class="diff-line {line.type}">
                        <span class="line-number">{line.lineNum}</span>
                        <code class="line-content">{line.text}</code>
                      </div>
                    {/each}
                  </div>
                {/if}

                <div class="change-footer">
                  <span class="change-size">{change.event_size || 0} bytes</span>
                  {#if change.file_hash}
                    <span class="change-hash">{change.file_hash.substring(0, 8)}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
    </section>
  </div>
</div>

<style>
  .live-code-feed {
    width: 100%;
    height: calc(100vh - 180px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    position: relative;
    color: var(--text);
    font-family: var(--mono);
  }

  /* Stats Widget */
  .stats-widget {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0;
    flex-shrink: 0;
  }

  .stats-header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }

  .stats-title h2 {
    margin: 0 0 4px 0;
    font-size: 12px;
    color: var(--text);
    font-weight: 600;
  }

  .stats-subtitle {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }

  .stats-bar {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
  }

  .stat-item {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 3px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    transition: all 0.15s ease;
  }

  .stat-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .stat-icon {
    font-size: 12px;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .stat-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
  }

  .stat-value {
    font-size: 11px;
    color: var(--text);
    font-weight: 700;
    font-family: var(--mono);
  }

  .stat-controls {
    margin-left: auto;
  }

  .btn-pause {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 3px;
    color: white;
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-pause:hover {
    background: var(--accent-2, var(--accent));
    border-color: var(--accent-2, var(--accent));
  }

  .btn-pause:focus {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .pause-text {
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .paused-banner {
    margin-top: 12px;
    padding: 6px 10px;
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    border: 1px solid var(--warning);
    border-radius: 3px;
    color: var(--warning);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Sparklines */
  .sparkline-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 3px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    transition: all 0.15s ease;
  }

  .sparkline-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .sparkline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4px;
  }

  .sparkline-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
  }

  .sparkline-current {
    font-size: 11px;
    color: var(--text);
    font-weight: 700;
    font-family: var(--mono);
  }

  .sparkline {
    display: block;
    border-radius: 2px;
  }

  .sparkline path {
    transition: stroke 0.3s ease;
  }

  .feed-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .code-changes-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px;
  }

  /* Code Changes Styles */
  .changes-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 20px;
  }

  .change-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 8px;
    transition: all 0.15s;
  }

  .change-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .change-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .change-meta {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .change-icon {
    font-size: 11px;
  }

  .change-type {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  .project-badge {
    padding: 2px 6px;
    background: var(--accent);
    color: white;
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .change-time {
    font-size: 11px;
    color: var(--muted);
  }

  .btn-copy {
    padding: 2px 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
  }

  .btn-copy:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-copy:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .change-file {
    margin-bottom: 4px;
  }

  .change-file code {
    font-size: 11px;
    color: var(--accent);
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 3px;
    display: inline-block;
  }

  .change-diff {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    margin-bottom: 4px;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
    font-family: 'Courier New', 'Consolas', monospace;
  }

  .diff-line {
    display: flex;
    align-items: stretch;
    font-size: 11px;
    line-height: 1.5;
    min-height: 18px;
    transition: background 0.1s ease;
  }

  .diff-line:hover {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .diff-line.add {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    border-left: 3px solid var(--success);
  }

  .diff-line.remove {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    border-left: 3px solid var(--error);
  }

  .diff-line.context {
    background: transparent;
    border-left: 3px solid transparent;
  }

  .diff-line.header {
    background: color-mix(in srgb, var(--info) 10%, transparent);
    border-left: 3px solid var(--info);
    color: var(--info);
    font-weight: 600;
  }

  .line-number {
    display: inline-block;
    width: 32px;
    padding: 1px 6px;
    color: var(--muted);
    text-align: right;
    user-select: none;
    font-size: 11px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--bg) 50%, var(--surface));
  }

  .diff-line.add .line-number {
    color: var(--success);
  }

  .diff-line.remove .line-number {
    color: var(--error);
  }

  .line-content {
    flex: 1;
    padding: 1px 8px;
    white-space: pre;
    overflow-x: auto;
    color: var(--text);
    font-family: inherit;
  }

  .diff-line.add .line-content {
    color: var(--success);
  }

  .diff-line.remove .line-content {
    color: var(--error);
  }

  .change-diff::-webkit-scrollbar {
    height: 6px;
    width: 6px;
  }

  .change-diff::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  .change-footer {
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }

  .change-size,
  .change-hash {
    padding: 2px 4px;
    background: var(--bg);
    border-radius: 3px;
  }

  /* Activity Styles */
  .activity-list {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .activity-item {
    display: flex;
    gap: 6px;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    transition: all 0.15s;
    cursor: pointer;
  }

  .activity-item:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .activity-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .activity-details {
    flex: 1;
    overflow: hidden;
  }

  .activity-file {
    font-size: 11px;
    color: var(--text);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 2px;
  }

  .activity-meta {
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }

  .activity-type {
    text-transform: uppercase;
    font-weight: 600;
  }

  .loading {
    text-align: center;
    padding: 8px;
    color: var(--muted);
    font-size: 11px;
  }

  .empty-state {
    text-align: center;
    padding: 12px 8px;
    color: var(--muted);
  }

  .empty-state p {
    margin: 0 0 8px 0;
    font-size: 12px;
  }

  .empty-hint {
    font-size: 11px;
  }

  /* Scrollbar */
  .code-changes-content::-webkit-scrollbar,
  .activity-content::-webkit-scrollbar {
    width: 6px;
  }

  .code-changes-content::-webkit-scrollbar-thumb,
  .activity-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  /* Statistics Dashboard */
  .statistics-dashboard {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px;
  }

  .stats-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
  }

  .stats-card {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .stats-card:hover {
    border-color: var(--accent);
    background: var(--surface-2);
    transform: translateY(-1px);
  }

  .stats-card.created {
    border-left: 3px solid var(--success);
  }

  .stats-card.modified {
    border-left: 3px solid var(--accent);
  }

  .stats-card.deleted {
    border-left: 3px solid var(--error);
  }

  .stats-card.active {
    border-left: 3px solid var(--warning);
  }

  .stats-card-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .stats-card-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .stats-card-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
  }

  .stats-card-value {
    font-size: 14px;
    color: var(--text);
    font-weight: 700;
    font-family: var(--mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Charts Section */
  .charts-section {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px;
  }

  .charts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .charts-header h3 {
    margin: 0;
    font-size: 12px;
    color: var(--text);
    font-weight: 600;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .chart-container {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px;
  }

  .chart-container.chart-wide {
    grid-column: 1 / -1;
  }

  .charts-toggle {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 8px 12px;
    text-align: center;
  }

  .btn-toggle-charts {
    padding: 4px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-toggle-charts:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  /* Filters Section */
  .filters-section {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filters-row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .search-input {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    min-width: 200px;
    transition: all 0.15s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .filter-btn {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .filter-btn:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .filter-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .filter-btn.small {
    padding: 3px 6px;
    font-size: 10px;
  }

  .sort-select,
  .project-select {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sort-select:focus,
  .project-select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .sort-order-btn {
    padding: 4px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sort-order-btn:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .export-btn {
    padding: 4px 10px;
    background: var(--success);
    border: 1px solid var(--success);
    border-radius: 3px;
    color: white;
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .export-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .clear-filters-btn {
    padding: 4px 10px;
    background: var(--error);
    border: 1px solid var(--error);
    border-radius: 3px;
    color: white;
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-filters-btn:hover {
    opacity: 0.9;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .code-changes-content {
      padding: 8px;
    }

    .stats-cards {
      grid-template-columns: 1fr;
    }

    .charts-grid {
      grid-template-columns: 1fr;
    }

    .chart-container.chart-wide {
      grid-column: 1;
    }

    .filters-row {
      flex-direction: column;
      align-items: stretch;
    }

    .filter-group {
      width: 100%;
    }

    .search-input {
      width: 100%;
      min-width: auto;
    }
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
    text-align: center;
  }

  .error-state p {
    margin: 0;
    color: #991b1b;
    font-size: 13px;
    font-weight: 500;
  }

  .btn-retry {
    padding: 8px 16px;
    background: var(--error);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-retry:hover {
    background: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .btn-retry:focus {
    outline: 2px solid var(--error);
    outline-offset: 2px;
  }
</style>
