<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { API_CONFIG } from '../config.js';
  import { websocketService } from './websocket.js';
  import { formatDateTime } from './timeFormat.js';
  import { Chart, registerables } from 'chart.js';
  import { initializeCharts, setupChartThemeObserver, getChartThemeColors } from './utils/chartHelpers.js';

  Chart.register(...registerables);

  const API_BASE = API_CONFIG.API_BASE;

  let storageData = null;
  let loading = true;
  let error = null;
  let expandedDatabase = null;
  let lastUpdated = null;
  let isManualRefresh = false;
  let showCharts = false; // Toggle for showing/hiding charts

  // Charts
  let charts = {};
  let themeObserver;

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    await loadStorageData();
  };

  const handleProjectSwitched = async () => {
    await loadStorageData();
  };

  onMount(async () => {
    await loadStorageData();

    // Initialize charts after data loads
    initializeCharts(createCharts, {
      data: storageData?.databases,
      enabled: showCharts
    });

    // Setup theme observer for charts
    themeObserver = setupChartThemeObserver(createCharts, {
      enabled: showCharts
    });

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Destroy charts
    Object.values(charts).forEach(chart => chart?.destroy());

    // Disconnect theme observer
    themeObserver?.disconnect();

    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  async function loadStorageData(manual = false) {
    try {
      loading = true;
      isManualRefresh = manual;
      const response = await fetch(`${API_BASE}/storage`);
      if (!response.ok) throw new Error('Failed to fetch storage data');
      storageData = await response.json();
      lastUpdated = new Date();
      loading = false;
      isManualRefresh = false;
      error = null;
    } catch (err) {
      logger.error('Failed to load storage data:', err);
      error = err.message;
      loading = false;
      isManualRefresh = false;
    }
  }

  // Format "time ago" for last updated timestamp

  // Reactive "time ago" - updates when lastUpdated changes (no polling!)
  let timeAgo = 'Just now';
  // Update time ago when lastUpdated changes (prevents infinite loop)
  $: if (lastUpdated) {
    if (!lastUpdated) timeAgo = 'Just now';
    else {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (seconds < 10) timeAgo = 'Just now';
      else if (seconds < 60) timeAgo = `${seconds}s ago`;
      else if (seconds < 3600) timeAgo = `${Math.floor(seconds / 60)}m ago`;
      else timeAgo = `${Math.floor(seconds / 3600)}h ago`;
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  }

  function formatNumber(num) {
    return num.toLocaleString();
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
      const response = await fetch(`${API_BASE}/storage/export/${dbName}`);
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
      const response = await fetch(`${API_BASE}/storage/vacuum/${dbName}`, {
        method: 'POST'
      });

      const result = await response.json();

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
      const response = await fetch(`${API_BASE}/storage/clean/${dbName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: daysNum })
      });

      const result = await response.json();

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

  // Retention policy state
  let showRetentionModal = false;
  let retentionPolicy = {
    enabled: false,
    retentionDays: 30,
    autoCleanup: false,
    cleanupInterval: 'weekly'
  };

  async function loadRetentionPolicy() {
    try {
      const response = await fetch(`${API_BASE}/storage/retention`);
      retentionPolicy = await response.json();
    } catch (err) {
      logger.error('Failed to load retention policy:', err);
    }
  }

  async function saveRetentionPolicy() {
    try {
      const response = await fetch(`${API_BASE}/storage/retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retentionPolicy)
      });

      const result = await response.json();

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

  $: totalDatabaseSize = storageData?.databases?.reduce((sum, db) => sum + (db?.size || 0), 0) || 0;
  $: totalSnapshotsSize = storageData?.snapshots?.reduce((sum, snap) => sum + (snap?.size || 0), 0) || 0;

  // Chart Functions
  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || !storageData?.databases || storageData.databases.length === 0) return;

    const colors = getChartThemeColors();

    // Chart 1: Pie Chart - Storage Distribution by Database
    const dbDistCanvas = document.getElementById('chart-db-distribution');
    if (dbDistCanvas) {
      const dbData = storageData.databases.map(db => ({
        name: db.filename,
        size: db.size
      }));

      const colorPalette = [
        colors.accent,
        colors.info,
        colors.warning,
        colors.success,
        'var(--accent)',
        '#ff9e64',
        '#7dcfff',
        'var(--success)'
      ];

      charts.dbDistChart = new Chart(dbDistCanvas, {
        type: 'pie',
        data: {
          labels: dbData.map(db => db.name),
          datasets: [{
            data: dbData.map(db => db.size),
            backgroundColor: dbData.map((_, i) => colorPalette[i % colorPalette.length]),
            borderColor: dbData.map((_, i) => colorPalette[i % colorPalette.length]),
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
                font: { size: 11, family: 'var(--mono)' },
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
        charts.largestTablesChart = new Chart(largestTablesCanvas, {
          type: 'bar',
          data: {
            labels: topTables.map(t => t.name),
            datasets: [{
              label: 'Row Count',
              data: topTables.map(t => t.records),
              backgroundColor: colors.info,
              borderColor: colors.info,
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
                  font: { size: 10, family: 'var(--mono)' },
                  callback: function(value) {
                    return formatNumber(value);
                  }
                },
                grid: {
                  color: colors.grid
                }
              },
              y: {
                ticks: {
                  color: colors.muted,
                  font: { size: 10, family: 'var(--mono)' }
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
        colors.accent,
        'var(--accent)',
        '#7dcfff',
        '#ff9e64',
        'var(--success)'
      ];

      charts.dbSizeChart = new Chart(dbSizeCanvas, {
        type: 'doughnut',
        data: {
          labels: dbSizes.map(db => db.name),
          datasets: [{
            data: dbSizes.map(db => db.size),
            backgroundColor: dbSizes.map((_, i) => colorPalette[i % colorPalette.length]),
            borderColor: dbSizes.map((_, i) => colorPalette[i % colorPalette.length]),
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
                font: { size: 11, family: 'var(--mono)' },
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

  // Reactive statement to recreate charts when showCharts or storageData changes
  $: if (showCharts && storageData?.databases) {
    setTimeout(createCharts, 100);
  }
</script>

<div class="storage-panel">
  {#if loading && !storageData}
    <LoadingSkeleton count={8} height="120px" />
  {:else if error}
    <div class="error-state">
      <h3>⚠️ Error Loading Storage Data</h3>
      <p>{error}</p>
      <button class="btn btn-primary" on:click={loadStorageData}>Retry</button>
    </div>
  {:else if storageData}
    <!-- Header Section -->
    <div class="header">
      <div class="header-left">
        <h1>💾 Storage Overview</h1>
        <p class="subtitle">Database and snapshot storage management</p>
      </div>
      <div class="header-actions">
        <span class="last-updated">Updated: {timeAgo}</span>
        <button class="btn btn-secondary" on:click={() => loadStorageData(true)} disabled={loading}>
          <span class="refresh-icon" class:spinning={isManualRefresh}>🔄</span>
          Refresh
        </button>
      </div>
    </div>

    <!-- Overview Section -->
    <section class="overview">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{formatBytes(storageData.totalSize)}</div>
          <div class="stat-label">Total Size</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{storageData.databases.length}</div>
          <div class="stat-label">Databases</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{formatBytes(totalDatabaseSize)}</div>
          <div class="stat-label">Database Storage</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{formatBytes(totalSnapshotsSize)}</div>
          <div class="stat-label">Snapshots Storage</div>
        </div>
      </div>
      <div class="path-info">
        <strong>Storage Location:</strong> <code>{storageData.ravenDir}</code>
      </div>
    </section>

    <!-- Charts Section -->
    {#if storageData?.databases?.length > 0}
      <div class="charts-section">
        <div class="charts-header">
          <h2>Storage Analytics</h2>
          <button class="btn btn-ghost btn-sm" on:click={() => showCharts = !showCharts}>
            {showCharts ? 'Hide Charts' : 'Show Charts'}
          </button>
        </div>

        {#if showCharts}
          <div class="charts-grid">
            <div class="chart-container">
              <div class="chart-header">
                <h3>Storage Distribution by Database</h3>
              </div>
              <div class="chart-canvas-wrapper">
                <canvas id="chart-db-distribution"></canvas>
              </div>
            </div>

            <div class="chart-container">
              <div class="chart-header">
                <h3>Database Size Breakdown</h3>
              </div>
              <div class="chart-canvas-wrapper">
                <canvas id="chart-db-size-breakdown"></canvas>
              </div>
            </div>

            <div class="chart-container chart-wide">
              <div class="chart-header">
                <h3>Largest Tables by Row Count</h3>
              </div>
              <div class="chart-canvas-wrapper">
                <canvas id="chart-largest-tables"></canvas>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Databases Section -->
    <section class="databases">
      <h2>🗄️ Databases</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Database</th>
              <th>Size</th>
              <th>Records</th>
              <th>Tables</th>
              <th>Status</th>
              <th>Last Modified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each storageData?.databases || [] as db (db.name)}
              <tr class:active={db.isActive} class:expanded={expandedDatabase === db.name}>
                <td>
                  <strong>{db.filename}</strong>
                  {#if db.isActive}
                    <span class="badge active">Active</span>
                  {/if}
                </td>
                <td>{formatBytes(db.size)}</td>
                <td>{formatNumber(db.totalRecords)}</td>
                <td>{Object.keys(db.recordCounts).length}</td>
                <td>
                  {#if db.error}
                    <span class="status error">Error</span>
                  {:else}
                    <span class="status ok">OK</span>
                  {/if}
                </td>
                <td>{formatDate(db.modified)}</td>
                <td>
                  <div class="db-actions">
                    <button class="btn btn-ghost btn-sm" on:click={() => toggleDatabaseExpansion(db.name)}>
                      {expandedDatabase === db.name ? '▼' : '▶'} Details
                    </button>
                    <button class="btn btn-icon btn-sm" on:click={() => exportDatabase(db.name)} title="Export database">
                      💾
                    </button>
                    <button class="btn btn-icon btn-sm" on:click={() => optimizeDatabase(db.name)} title="Optimize database (VACUUM)">
                      ⚡
                    </button>
                    <button class="btn btn-danger btn-icon btn-sm" on:click={() => cleanDatabase(db.name)} title="Clean old data">
                      🧹
                    </button>
                  </div>
                </td>
              </tr>
              {#if expandedDatabase === db.name && db.tableStats.length > 0}
                <tr class="details-row">
                  <td colspan="7">
                    <div class="table-details">
                      <h4>Table Breakdown - {db.filename}</h4>
                      <table class="inner-table">
                        <thead>
                          <tr>
                            <th>Table</th>
                            <th>Records</th>
                            <th>Size</th>
                            <th>% of Database</th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each db.tableStats as table (table.name)}
                            <tr>
                              <td><code>{table.name}</code></td>
                              <td>{formatNumber(table.records)}</td>
                              <td>{formatBytes(table.size)}</td>
                              <td>
                                <div class="progress-bar">
                                  <div class="progress-fill" style="width: {getPercentage(table.size, db.size)}%"></div>
                                  <span class="progress-label">{getPercentage(table.size, db.size)}%</span>
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
    <section class="snapshots">
      <h2>📸 Snapshots</h2>
      {#if storageData?.snapshots?.length > 0}
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Files</th>
                <th>Size</th>
                <th>Oldest</th>
                <th>Newest</th>
              </tr>
            </thead>
            <tbody>
              {#each storageData?.snapshots || [] as snapshot (snapshot.project)}
                <tr>
                  <td><strong>{snapshot.project}</strong></td>
                  <td>{formatNumber(snapshot.files)}</td>
                  <td>{formatBytes(snapshot.size)}</td>
                  <td>{formatDate(snapshot.oldest)}</td>
                  <td>{formatDate(snapshot.newest)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="empty-state">No snapshots found</p>
      {/if}
    </section>

    <!-- Other Files Section -->
    <section class="other-files">
      <h2>📄 Other Files</h2>
      <div class="file-list">
        <div class="file-item">
          <span class="file-name">config.toml</span>
          <span class="file-size">{formatBytes(storageData.otherFiles.config)}</span>
        </div>
        <div class="file-item">
          <span class="file-name">triggers.log</span>
          <span class="file-size">{formatBytes(storageData.otherFiles.triggersLog)}</span>
        </div>
      </div>
    </section>

    <!-- Actions Section -->
    <section class="actions">
      <h2>⚙️ Actions</h2>
      <p class="help-text">Use per-database action buttons in the table above, or configure retention policy below.</p>
      <div class="action-buttons">
        <button class="btn btn-secondary" on:click={openRetentionConfig}>⚙️ Configure Retention</button>
      </div>
    </section>

    <div class="last-updated">
      Last updated: {formatDate(storageData.timestamp)}
    </div>
  {/if}

  <!-- Retention Policy Modal -->
  {#if showRetentionModal}
    <div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" on:click={() => showRetentionModal = false} on:keydown={(e) => e.key === 'Escape' && (showRetentionModal = false)}>
      <div class="modal-content" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
        <div class="modal-header">
          <h2>⚙️ Configure Retention Policy</h2>
          <button class="btn btn-ghost btn-icon" on:click={() => showRetentionModal = false}>✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>
              <input type="checkbox" bind:checked={retentionPolicy.enabled} />
              Enable automatic data retention
            </label>
            <p class="help-text">When enabled, data older than the retention period will be flagged for cleanup.</p>
          </div>

          <div class="form-group">
            <label for="retention-days">Retention Period (days)</label>
            <input
              id="retention-days"
              type="number"
              min="1"
              max="365"
              bind:value={retentionPolicy.retentionDays}
              disabled={!retentionPolicy.enabled}
            />
            <p class="help-text">Data older than this will be considered for deletion.</p>
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" bind:checked={retentionPolicy.autoCleanup} disabled={!retentionPolicy.enabled} />
              Enable automatic cleanup
            </label>
            <p class="help-text">Automatically delete old data on schedule (requires backend restart to take effect).</p>
          </div>

          <div class="form-group">
            <label for="cleanup-interval">Cleanup Interval</label>
            <select
              id="cleanup-interval"
              bind:value={retentionPolicy.cleanupInterval}
              disabled={!retentionPolicy.enabled || !retentionPolicy.autoCleanup}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <p class="help-text">How often automatic cleanup should run.</p>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" on:click={() => showRetentionModal = false}>Cancel</button>
          <button class="btn btn-primary" on:click={saveRetentionPolicy}>Save Policy</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .storage-panel {
    padding: var(--space-lg);
    position: relative;
    max-width: 1400px;
    margin: 0 auto;
  }

  section {
    margin-bottom: 3rem;
    background: var(--surface);
    padding: 1.5rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding: 0 var(--space-lg);
    gap: var(--space-2xl);
  }

  .header-left h1 {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    color: var(--muted);
    font-size: 12px;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }

  .last-updated {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .refresh-icon {
    display: inline-block;
    font-size: 11px;
  }

  .refresh-icon.spinning {
    animation: spin-refresh 1s linear infinite;
  }

  h2 {
    margin: 0 0 1rem 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  h4 {
    margin: 0 0 1rem 0;
    font-size: 11px;
    color: var(--muted);
  }

  /* Overview Stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-xl);
    margin-bottom: 1rem;
  }

  .stat-card {
    background: var(--surface-2);
    padding: 1.5rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    text-align: center;
  }

  .stat-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 0.5rem;
  }

  .stat-label {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .path-info {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--surface-2);
    border-radius: var(--radius);
    font-size: 0.875rem;
    color: var(--muted);
  }

  .path-info code {
    color: var(--text);
    font-family: var(--mono);
    background: var(--bg);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius);
  }

  /* Tables */
  .table-container {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  thead {
    background: var(--surface-2);
  }

  th {
    padding: 0.75rem 1rem;
    text-align: left;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.5px;
    border-bottom: 2px solid var(--border);
  }

  td {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }

  tr:hover {
    background: var(--surface-2);
  }

  tr.active {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  tr.active:hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border-radius: var(--radius);
    margin-left: 0.5rem;
  }

  .badge.active {
    background: var(--accent);
    color: var(--bg);
  }

  .status {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status.ok {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .status.error {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
  }

  /* Details Row */
  .details-row {
    background: var(--bg) !important;
  }

  .details-row:hover {
    background: var(--bg) !important;
  }

  .table-details {
    padding: 1rem;
    background: var(--surface-2);
    border-radius: var(--radius);
    margin: 0.5rem 0;
  }

  .inner-table {
    margin-top: 1rem;
    background: var(--surface);
  }

  .inner-table th {
    background: var(--bg);
  }

  /* Progress Bar */
  .progress-bar {
    position: relative;
    width: 100%;
    height: var(--icon-md);
    background: var(--bg);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    transition: width var(--duration-slow) var(--ease-smooth);
  }

  .progress-label {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text);
    text-shadow: 0 0 4px var(--bg);
  }

  /* File List */
  .file-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--surface-2);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .file-name {
    font-family: var(--mono);
    color: var(--text);
  }

  .file-size {
    color: var(--muted);
    font-size: 0.875rem;
  }

  /* Buttons */
  .action-buttons {
    display: flex;
    gap: var(--space-xl);
    flex-wrap: wrap;
  }

  /* (removed unused .loading/.spinner) */

  /* Error State */
  .error-state {
    text-align: center;
    padding: 4rem;
  }

  .error-state h3 {
    color: var(--error);
    margin-bottom: 1rem;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--muted);
    font-style: italic;
  }

  /* Last Updated */
  .last-updated {
    text-align: center;
    margin-top: 2rem;
    padding: 1rem;
    color: var(--muted);
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .storage-panel {
      padding: 1rem;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .action-buttons {
      flex-direction: column;
    }

    table {
      font-size: 0.75rem;
    }

    td, th {
      padding: 0.5rem;
    }
  }

  /* Database Actions */
  .db-actions {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    flex-wrap: wrap;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 2rem;
  }

  .modal-content {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 50px color-mix(in srgb, var(--bg) 50%, transparent);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text);
  }

  .modal-body {
    padding: 1.5rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-xl);
    padding: 1.5rem;
    border-top: 1px solid var(--border);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-weight: 500;
    font-size: 0.875rem;
  }

  .form-group input[type="number"],
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.875rem;
    font-family: var(--mono);
  }

  .form-group input[type="checkbox"] {
    margin-right: 0.5rem;
    width: 1rem;
    height: 1rem;
    vertical-align: middle;
  }

  .form-group input:disabled,
  .form-group select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .help-text {
    margin: 0.5rem 0 0 0;
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.4;
  }

  .actions .help-text {
    margin-bottom: 1rem;
  }

  /* Charts Section */
  .charts-section {
    margin-bottom: 3rem;
    background: var(--surface);
    padding: 1.5rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .charts-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .charts-header h2 {
    margin: 0;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-2xl);
  }

  .chart-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    border-left: 3px solid var(--accent);
  }

  .chart-container.chart-wide {
    grid-column: 1 / -1;
  }

  .chart-header {
    margin-bottom: 1rem;
  }

  .chart-header h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .chart-canvas-wrapper {
    height: 250px;
    position: relative;
  }

  .chart-wide .chart-canvas-wrapper {
    height: 300px;
  }

  /* Responsive Charts */
  @media (max-width: 768px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }

    .chart-container.chart-wide {
      grid-column: 1;
    }
  }
</style>
