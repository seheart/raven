<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  import { websocketService } from '../services/websocket.js';
  import { formatBytes } from '../utils/helpers.js';
  import { formatDateTime, getTimeAgo } from '../timeFormat.js';
  import { onMount } from 'svelte';
  import { Chart, registerables } from 'chart.js';
  import { createChart, destroyChart, createThemeObserver, getChartColors } from '../utils/chartUtils.js';

  Chart.register(...registerables);

  // State using Svelte 5 runes
  let storageData = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let expandedDatabase = $state(null);
  let lastUpdated = $state(null);
  let isManualRefresh = $state(false);
  let showCharts = $state(false);
  let showRetentionModal = $state(false);

  // Retention policy state
  let retentionPolicy = $state({
    enabled: false,
    retentionDays: 30,
    autoCleanup: false,
    cleanupInterval: 'weekly'
  });

  // Charts tracking
  let charts = {};
  let themeObserver = null;

  // Derived values using $derived
  const totalDatabaseSize = $derived(
    storageData?.databases?.reduce((sum, db) => sum + (db?.size || 0), 0) || 0
  );

  const totalSnapshotsSize = $derived(
    storageData?.snapshots?.reduce((sum, snap) => sum + (snap?.size || 0), 0) || 0
  );

  // Time ago reactive state
  let timeAgo = $state('Just now');

  // Update time ago when lastUpdated changes
  $effect(() => {
    if (lastUpdated) {
      timeAgo = getTimeAgo(lastUpdated);

      // Update time ago every 10 seconds
      const interval = setInterval(() => {
        timeAgo = getTimeAgo(lastUpdated);
      }, 10000);

      return () => clearInterval(interval);
    }
  });

  // WebSocket event handlers
  const handleStorageChanged = async () => {
    await loadStorageData();
  };

  const handleProjectSwitched = async () => {
    await loadStorageData();
  };

  onMount(async () => {
    await loadStorageData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleStorageChanged);
    websocketService.on('project-switched', handleProjectSwitched);

    return () => {
      // Cleanup: destroy charts
      Object.values(charts).forEach(chart => destroyChart(chart));

      // Disconnect theme observer
      themeObserver?.disconnect();

      // Clean up WebSocket listeners
      websocketService.off('file-changed', handleStorageChanged);
      websocketService.off('project-switched', handleProjectSwitched);
    };
  });

  // Recreate charts when showCharts or storageData changes
  $effect(() => {
    if (showCharts && storageData?.databases) {
      setTimeout(() => {
        createCharts();

        // Setup theme observer if not already created
        if (!themeObserver) {
          themeObserver = createThemeObserver(() => {
            if (showCharts) {
              createCharts();
            }
          });
        }
      }, 100);
    }
  });

  async function loadStorageData(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
      const data = await api.get('/storage');
      storageData = data;
      lastUpdated = new Date();
      error = null;
    } catch (err) {
      logger.error('Failed to load storage data:', err);
      error = err.message;
    } finally {
      loading = false;
      isManualRefresh = false;
    }
  }

  function formatNumber(num) {
    return num?.toLocaleString() || '0';
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return formatDateTime(dateString);
  }

  function toggleDatabaseExpansion(dbName) {
    expandedDatabase = expandedDatabase === dbName ? null : dbName;
  }

  function getPercentage(size, total) {
    if (!size || !total || total === 0) return 0;
    return parseFloat(((size / total) * 100).toFixed(1));
  }

  // Export database file
  async function exportDatabase(dbName) {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3030'}/api/storage/export/${dbName}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dbName}_${Date.now()}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      alert(`Database ${dbName} exported successfully!`);
    } catch (err) {
      logger.error('Failed to export database:', err);
      alert(`Failed to export database: ${err.message}`);
    }
  }

  // Optimize database with VACUUM
  async function optimizeDatabase(dbName) {
    if (!confirm(`Optimize ${dbName}? This will reclaim unused space.`)) {
      return;
    }

    try {
      const result = await api.post(`/storage/vacuum/${dbName}`);

      if (result.success) {
        alert(`Database optimized!\n\nBefore: ${formatBytes(result.sizeBefore)}\nAfter: ${formatBytes(result.sizeAfter)}\nSpace saved: ${formatBytes(result.spaceSaved)} (${result.percentSaved}%)`);
        await loadStorageData(); // Refresh to show new size
      } else {
        alert(`Optimization failed: ${result.error}`);
      }
    } catch (err) {
      logger.error('Failed to optimize database:', err);
      alert(`Failed to optimize database: ${err.message}`);
    }
  }

  // Clean old data from database
  async function cleanDatabase(dbName) {
    const days = prompt('Delete records older than how many days?', '30');
    if (!days) return;

    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1) {
      alert('Please enter a valid number of days (1 or greater)');
      return;
    }

    if (!confirm(`Delete all records older than ${daysNum} days from ${dbName}?\n\nThis cannot be undone!`)) {
      return;
    }

    try {
      const result = await api.post(`/storage/clean/${dbName}`, { days: daysNum });

      if (result.success) {
        let message = `${result.message}\n\nDeleted by table:\n`;
        for (const [table, count] of Object.entries(result.deletedPerTable)) {
          message += `- ${table}: ${count} records\n`;
        }
        alert(message);
        await loadStorageData(); // Refresh to show new record counts
      } else {
        alert(`Cleanup failed: ${result.error}`);
      }
    } catch (err) {
      logger.error('Failed to clean database:', err);
      alert(`Failed to clean database: ${err.message}`);
    }
  }

  async function loadRetentionPolicy() {
    try {
      const data = await api.get('/storage/retention');
      retentionPolicy = data;
    } catch (err) {
      logger.error('Failed to load retention policy:', err);
    }
  }

  async function saveRetentionPolicy() {
    try {
      const result = await api.post('/storage/retention', retentionPolicy);

      if (result.success) {
        alert('Retention policy saved successfully!');
        showRetentionModal = false;
      } else {
        alert(`Failed to save policy: ${result.error}`);
      }
    } catch (err) {
      logger.error('Failed to save retention policy:', err);
      alert(`Failed to save policy: ${err.message}`);
    }
  }

  function openRetentionConfig() {
    loadRetentionPolicy();
    showRetentionModal = true;
  }

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => destroyChart(chart));
    charts = {};

    if (!showCharts || !storageData?.databases || storageData.databases.length === 0) return;

    const colors = getChartColors();

    // Chart 1: Pie Chart - Storage Distribution by Database
    const dbDistCanvas = document.getElementById('chart-db-distribution');
    if (dbDistCanvas) {
      const dbData = storageData.databases.map(db => ({
        name: db.filename,
        size: db.size
      }));

      const colorPalette = [
        colors.primary,
        colors.success,
        colors.warning,
        colors.error,
        '#3b82f6',
        '#10b981',
        '#f59e0b',
        '#ef4444'
      ];

      charts.dbDistChart = createChart('chart-db-distribution', {
        type: 'pie',
        data: {
          labels: dbData.map(db => db.name),
          datasets: [{
            data: dbData.map(db => db.size),
            backgroundColor: dbData.map((_, i) => colorPalette[i % colorPalette.length]),
            borderColor: colors.border,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: colors.text,
                font: { size: 11, family: 'monospace' },
                padding: 8
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  return `${label}: ${formatBytes(value)}`;
                }
              }
            }
          }
        }
      });
    }

    // Chart 2: Horizontal Bar Chart - Largest Tables by Row Count
    const largestTablesCanvas = document.getElementById('chart-largest-tables');
    if (largestTablesCanvas) {
      // Collect all tables from all databases
      const allTables = [];
      storageData.databases.forEach(db => {
        if (db.tableStats && db.tableStats.length > 0) {
          db.tableStats.forEach(table => {
            allTables.push({
              name: `${db.filename}.${table.name}`,
              records: table.records
            });
          });
        }
      });

      // Sort by record count and take top 10
      const topTables = allTables
        .sort((a, b) => b.records - a.records)
        .slice(0, 10);

      if (topTables.length > 0) {
        charts.largestTablesChart = createChart('chart-largest-tables', {
          type: 'bar',
          data: {
            labels: topTables.map(t => t.name),
            datasets: [{
              label: 'Row Count',
              data: topTables.map(t => t.records),
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              borderWidth: 2,
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return `Rows: ${formatNumber(context.parsed.x)}`;
                  }
                }
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                ticks: {
                  color: colors.muted,
                  font: { size: 10, family: 'monospace' },
                  callback: function(value) {
                    return formatNumber(value);
                  }
                },
                grid: {
                  color: colors.border
                }
              },
              y: {
                ticks: {
                  color: colors.muted,
                  font: { size: 10, family: 'monospace' }
                },
                grid: {
                  display: false
                }
              }
            }
          }
        });
      }
    }

    // Chart 3: Donut Chart - Database Size Breakdown
    const dbSizeCanvas = document.getElementById('chart-db-size-breakdown');
    if (dbSizeCanvas) {
      const dbSizes = storageData.databases.map(db => ({
        name: db.filename,
        size: db.size
      }));

      const colorPalette = [
        colors.success,
        colors.warning,
        colors.error,
        colors.primary,
        '#10b981',
        '#f59e0b',
        '#ef4444',
        '#3b82f6'
      ];

      charts.dbSizeChart = createChart('chart-db-size-breakdown', {
        type: 'doughnut',
        data: {
          labels: dbSizes.map(db => db.name),
          datasets: [{
            data: dbSizes.map(db => db.size),
            backgroundColor: dbSizes.map((_, i) => colorPalette[i % colorPalette.length]),
            borderColor: colors.border,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: colors.text,
                font: { size: 11, family: 'monospace' },
                padding: 8
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${label}: ${formatBytes(value)} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    {#if loading && !storageData}
      <!-- Loading skeleton -->
      <div class="space-y-6">
        {#each Array(8) as _, i (i)}
          <div class="h-32 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"></div>
        {/each}
      </div>
    {:else if error}
      <!-- Error state -->
      <div class="bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-8 text-center">
        <h3 class="text-xl font-bold text-[var(--error)] mb-4">⚠️ Error Loading Storage Data</h3>
        <p class="text-[var(--muted)] mb-6">{error}</p>
        <button
          onclick={() => loadStorageData()}
          class="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-2)] transition-colors font-sans"
        >
          Retry
        </button>
      </div>
    {:else if storageData}
      <!-- Header Section -->
      <div class="flex justify-between items-start mb-6">
        <div>
          <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">💾 Storage Overview</h1>
          <p class="text-base text-[var(--muted)] font-sans">Database and snapshot storage management</p>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-sm text-[var(--muted)] font-mono">Updated: {timeAgo}</span>
          <button
            onclick={() => loadStorageData(true)}
            disabled={loading}
            class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
          >
            <span class:animate-spin={isManualRefresh}>🔄</span>
            Refresh
          </button>
        </div>
      </div>

      <!-- Overview Section -->
      <section class="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div class="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-6 text-center">
            <div class="text-xl font-bold text-[var(--accent)] font-mono mb-2">
              {formatBytes(storageData.totalSize)}
            </div>
            <div class="text-sm text-[var(--muted)] uppercase tracking-wider font-sans">Total Size</div>
          </div>
          <div class="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-6 text-center">
            <div class="text-xl font-bold text-[var(--accent)] font-mono mb-2">
              {storageData.databases.length}
            </div>
            <div class="text-sm text-[var(--muted)] uppercase tracking-wider font-sans">Databases</div>
          </div>
          <div class="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-6 text-center">
            <div class="text-xl font-bold text-[var(--accent)] font-mono mb-2">
              {formatBytes(totalDatabaseSize)}
            </div>
            <div class="text-sm text-[var(--muted)] uppercase tracking-wider font-sans">Database Storage</div>
          </div>
          <div class="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-6 text-center">
            <div class="text-xl font-bold text-[var(--accent)] font-mono mb-2">
              {formatBytes(totalSnapshotsSize)}
            </div>
            <div class="text-sm text-[var(--muted)] uppercase tracking-wider font-sans">Snapshots Storage</div>
          </div>
        </div>
        <div class="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4">
          <strong class="text-[var(--text)] font-sans">Storage Location:</strong>
          <code class="ml-2 text-[var(--text)] font-mono bg-[var(--bg)] px-2 py-1 rounded">{storageData.ravenDir}</code>
        </div>
      </section>

      <!-- Charts Section -->
      {#if storageData?.databases?.length > 0}
        <section class="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-lg font-bold text-[var(--text)] font-sans">Storage Analytics</h2>
            <button
              onclick={() => showCharts = !showCharts}
              class="px-3 py-1.5 bg-transparent border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
            >
              {showCharts ? 'Hide Charts' : 'Show Charts'}
            </button>
          </div>

          {#if showCharts}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4">
                <h3 class="text-base font-bold text-[var(--text)] mb-4 font-sans">Storage Distribution by Database</h3>
                <div class="h-64">
                  <canvas id="chart-db-distribution"></canvas>
                </div>
              </div>

              <div class="bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4">
                <h3 class="text-base font-bold text-[var(--text)] mb-4 font-sans">Database Size Breakdown</h3>
                <div class="h-64">
                  <canvas id="chart-db-size-breakdown"></canvas>
                </div>
              </div>

              <div class="md:col-span-2 bg-[var(--surface)] border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] rounded-lg p-4">
                <h3 class="text-base font-bold text-[var(--text)] mb-4 font-sans">Largest Tables by Row Count</h3>
                <div class="h-80">
                  <canvas id="chart-largest-tables"></canvas>
                </div>
              </div>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Databases Section -->
      <section class="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h2 class="text-lg font-bold text-[var(--text)] mb-4 font-sans">🗄️ Databases</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-[var(--surface-2)]">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Database</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Size</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Records</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Tables</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Status</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Last Modified</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each storageData?.databases || [] as db (db.name)}
                {@const isActive = db.isActive}
                {@const isExpanded = expandedDatabase === db.name}
                <tr class="hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--border)]" class:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]={isActive}>
                  <td class="px-4 py-4">
                    <strong class="font-mono text-[var(--text)]">{db.filename}</strong>
                    {#if isActive}
                      <span class="ml-2 inline-block px-2 py-0.5 text-xs bg-[var(--accent)] text-[var(--bg)] rounded font-sans">Active</span>
                    {/if}
                  </td>
                  <td class="px-4 py-4 font-mono text-[var(--text)]">{formatBytes(db.size)}</td>
                  <td class="px-4 py-4 font-mono text-[var(--text)]">{formatNumber(db.totalRecords)}</td>
                  <td class="px-4 py-4 font-mono text-[var(--text)]">{Object.keys(db.recordCounts).length}</td>
                  <td class="px-4 py-4">
                    {#if db.error}
                      <span class="inline-block px-3 py-1 text-xs font-bold bg-[color-mix(in_srgb,var(--error)_20%,transparent)] text-[var(--error)] rounded font-sans">Error</span>
                    {:else}
                      <span class="inline-block px-3 py-1 text-xs font-bold bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)] rounded font-sans">OK</span>
                    {/if}
                  </td>
                  <td class="px-4 py-4 font-mono text-[var(--text)]">{formatDate(db.modified)}</td>
                  <td class="px-4 py-4">
                    <div class="flex items-center gap-2 flex-wrap">
                      <button
                        onclick={() => toggleDatabaseExpansion(db.name)}
                        class="px-2 py-1 text-xs bg-transparent border border-[var(--border)] rounded hover:border-[var(--accent)] transition-colors font-sans"
                      >
                        {isExpanded ? '▼' : '▶'} Details
                      </button>
                      <button
                        onclick={() => exportDatabase(db.name)}
                        title="Export database"
                        class="px-2 py-1 text-xs bg-transparent border border-[var(--border)] rounded hover:border-[var(--accent)] transition-colors"
                      >
                        💾
                      </button>
                      <button
                        onclick={() => optimizeDatabase(db.name)}
                        title="Optimize database (VACUUM)"
                        class="px-2 py-1 text-xs bg-transparent border border-[var(--border)] rounded hover:border-[var(--accent)] transition-colors"
                      >
                        ⚡
                      </button>
                      <button
                        onclick={() => cleanDatabase(db.name)}
                        title="Clean old data"
                        class="px-2 py-1 text-xs bg-transparent border border-[var(--error)] text-[var(--error)] rounded hover:bg-[var(--error)] hover:text-white transition-colors"
                      >
                        🧹
                      </button>
                    </div>
                  </td>
                </tr>
                {#if isExpanded && db.tableStats?.length > 0}
                  <tr class="bg-[var(--bg)]">
                    <td colspan="7" class="px-4 py-4">
                      <div class="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4">
                        <h4 class="text-sm text-[var(--muted)] mb-4 font-sans">Table Breakdown - {db.filename}</h4>
                        <table class="w-full text-sm bg-[var(--surface)]">
                          <thead class="bg-[var(--bg)]">
                            <tr>
                              <th class="px-4 py-2 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Table</th>
                              <th class="px-4 py-2 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Records</th>
                              <th class="px-4 py-2 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Size</th>
                              <th class="px-4 py-2 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">% of Database</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each db.tableStats as table (table.name)}
                              {@const percent = getPercentage(table.size, db.size)}
                              <tr class="border-b border-[var(--border)]">
                                <td class="px-4 py-3">
                                  <code class="text-[var(--text)] font-mono text-xs">{table.name}</code>
                                </td>
                                <td class="px-4 py-3 font-mono text-[var(--text)]">{formatNumber(table.records)}</td>
                                <td class="px-4 py-3 font-mono text-[var(--text)]">{formatBytes(table.size)}</td>
                                <td class="px-4 py-3">
                                  <div class="relative w-full h-6 bg-[var(--bg)] rounded overflow-hidden">
                                    <div
                                      class="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all duration-500"
                                      style="width: {percent}%"
                                    ></div>
                                    <span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--text)] [text-shadow:0_0_4px_var(--bg)]">
                                      {percent}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Snapshots Section -->
      <section class="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h2 class="text-lg font-bold text-[var(--text)] mb-4 font-sans">📸 Snapshots</h2>
        {#if storageData?.snapshots?.length > 0}
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-[var(--surface-2)]">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Project</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Files</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Size</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Oldest</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider border-b-2 border-[var(--border)]">Newest</th>
                </tr>
              </thead>
              <tbody>
                {#each storageData.snapshots as snapshot (snapshot.project)}
                  <tr class="hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--border)]">
                    <td class="px-4 py-4">
                      <strong class="font-mono text-[var(--text)]">{snapshot.project}</strong>
                    </td>
                    <td class="px-4 py-4 font-mono text-[var(--text)]">{formatNumber(snapshot.files)}</td>
                    <td class="px-4 py-4 font-mono text-[var(--text)]">{formatBytes(snapshot.size)}</td>
                    <td class="px-4 py-4 font-mono text-[var(--text)]">{formatDate(snapshot.oldest)}</td>
                    <td class="px-4 py-4 font-mono text-[var(--text)]">{formatDate(snapshot.newest)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="text-center py-8 text-[var(--muted)] italic font-sans">No snapshots found</p>
        {/if}
      </section>

      <!-- Other Files Section -->
      <section class="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h2 class="text-lg font-bold text-[var(--text)] mb-4 font-sans">📄 Other Files</h2>
        <div class="space-y-4">
          <div class="flex justify-between items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4">
            <span class="font-mono text-[var(--text)]">config.toml</span>
            <span class="text-[var(--muted)] font-mono">{formatBytes(storageData.otherFiles.config)}</span>
          </div>
          <div class="flex justify-between items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4">
            <span class="font-mono text-[var(--text)]">triggers.log</span>
            <span class="text-[var(--muted)] font-mono">{formatBytes(storageData.otherFiles.triggersLog)}</span>
          </div>
        </div>
      </section>

      <!-- Actions Section -->
      <section class="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
        <h2 class="text-lg font-bold text-[var(--text)] mb-4 font-sans">⚙️ Actions</h2>
        <p class="text-sm text-[var(--muted)] mb-4 font-sans">Use per-database action buttons in the table above, or configure retention policy below.</p>
        <div class="flex gap-4 flex-wrap">
          <button
            onclick={openRetentionConfig}
            class="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded hover:border-[var(--accent)] transition-colors font-sans"
          >
            ⚙️ Configure Retention
          </button>
        </div>
      </section>

      <!-- Last Updated -->
      <div class="text-center py-4 text-sm text-[var(--muted)] font-sans">
        Last updated: {formatDate(storageData.timestamp)}
      </div>
    {/if}
  </div>
</div>

<!-- Retention Policy Modal -->
{#if showRetentionModal}
  <div
    class="fixed inset-0 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-sm flex items-center justify-center z-50 p-8"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget) showRetentionModal = false;
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') showRetentionModal = false;
    }}
  >
    <div
      class="bg-[var(--surface)] border border-[var(--border)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
    >
      <!-- Modal Header -->
      <div class="flex justify-between items-center p-6 border-b border-[var(--border)]">
        <h2 class="text-xl font-bold text-[var(--text)] font-sans">⚙️ Configure Retention Policy</h2>
        <button
          onclick={() => showRetentionModal = false}
          class="px-2 py-1 text-xl bg-transparent border border-transparent rounded hover:bg-[var(--surface-2)] transition-colors"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-6">
        <div>
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={retentionPolicy.enabled}
              class="mt-1 w-4 h-4"
            />
            <div>
              <span class="text-[var(--text)] font-medium font-sans">Enable automatic data retention</span>
              <p class="text-sm text-[var(--muted)] mt-1 font-sans">When enabled, data older than the retention period will be flagged for cleanup.</p>
            </div>
          </label>
        </div>

        <div>
          <label for="retention-days" class="block mb-2 text-[var(--text)] font-medium font-sans">Retention Period (days)</label>
          <input
            id="retention-days"
            type="number"
            min="1"
            max="365"
            bind:value={retentionPolicy.retentionDays}
            disabled={!retentionPolicy.enabled}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono disabled:opacity-50"
          />
          <p class="text-sm text-[var(--muted)] mt-2 font-sans">Data older than this will be considered for deletion.</p>
        </div>

        <div>
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={retentionPolicy.autoCleanup}
              disabled={!retentionPolicy.enabled}
              class="mt-1 w-4 h-4"
            />
            <div>
              <span class="text-[var(--text)] font-medium font-sans">Enable automatic cleanup</span>
              <p class="text-sm text-[var(--muted)] mt-1 font-sans">Automatically delete old data on schedule (requires backend restart to take effect).</p>
            </div>
          </label>
        </div>

        <div>
          <label for="cleanup-interval" class="block mb-2 text-[var(--text)] font-medium font-sans">Cleanup Interval</label>
          <select
            id="cleanup-interval"
            bind:value={retentionPolicy.cleanupInterval}
            disabled={!retentionPolicy.enabled || !retentionPolicy.autoCleanup}
            class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] font-mono disabled:opacity-50"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <p class="text-sm text-[var(--muted)] mt-2 font-sans">How often automatic cleanup should run.</p>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex justify-end gap-4 p-6 border-t border-[var(--border)]">
        <button
          onclick={() => showRetentionModal = false}
          class="px-4 py-2 bg-transparent border border-[var(--border)] rounded hover:border-[var(--accent)] transition-colors font-sans"
        >
          Cancel
        </button>
        <button
          onclick={saveRetentionPolicy}
          class="px-4 py-2 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-2)] transition-colors font-sans"
        >
          Save Policy
        </button>
      </div>
    </div>
  </div>
{/if}
