<script>
  import { onMount, onDestroy } from 'svelte';

  const API_BASE = 'http://localhost:3030/api';

  let storageData = null;
  let loading = true;
  let error = null;
  let expandedDatabase = null;
  let refreshInterval;

  onMount(() => {
    loadStorageData();
    // Refresh every 30 seconds
    refreshInterval = setInterval(loadStorageData, 30000);
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });

  async function loadStorageData() {
    try {
      const response = await fetch(`${API_BASE}/storage`);
      if (!response.ok) throw new Error('Failed to fetch storage data');
      storageData = await response.json();
      loading = false;
      error = null;
    } catch (err) {
      console.error('Failed to load storage data:', err);
      error = err.message;
      loading = false;
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
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  function toggleDatabaseExpansion(dbName) {
    expandedDatabase = expandedDatabase === dbName ? null : dbName;
  }

  function getPercentage(size, total) {
    if (!size || !total || total === 0) return 0;
    return parseFloat(((size / total) * 100).toFixed(1));
  }

  $: totalDatabaseSize = storageData?.databases?.reduce((sum, db) => sum + (db?.size || 0), 0) || 0;
  $: totalSnapshotsSize = storageData?.snapshots?.reduce((sum, snap) => sum + (snap?.size || 0), 0) || 0;
</script>

<div class="storage-panel">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading storage data...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <h3>⚠️ Error Loading Storage Data</h3>
      <p>{error}</p>
      <button on:click={loadStorageData}>Retry</button>
    </div>
  {:else if storageData}
    <!-- Header Section -->
    <div class="header">
      <div class="header-left">
        <h1>💾 Storage Overview</h1>
        <p class="subtitle">Database and snapshot storage management</p>
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
            {#each storageData?.databases || [] as db}
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
                  <button class="btn-sm" on:click={() => toggleDatabaseExpansion(db.name)}>
                    {expandedDatabase === db.name ? '▼' : '▶'} Details
                  </button>
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
                          {#each db.tableStats as table}
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
              {#each storageData?.snapshots || [] as snapshot}
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
      <div class="action-buttons">
        <button class="btn-primary" on:click={loadStorageData}>🔄 Refresh Data</button>
        <button class="btn-secondary" disabled title="Coming soon">💾 Export Database</button>
        <button class="btn-secondary" disabled title="Coming soon">🧹 Clean Old Data</button>
        <button class="btn-secondary" disabled title="Coming soon">⚙️ Configure Retention</button>
      </div>
    </section>

    <div class="last-updated">
      Last updated: {formatDate(storageData.timestamp)}
    </div>
  {/if}
</div>

<style>
  .storage-panel {
    padding: 2rem;
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
    padding: 0 8px;
    gap: 2rem;
  }

  .header-left h1 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    color: var(--muted);
    font-size: 12px;
    margin: 0;
  }

  h2 {
    margin: 0 0 1rem 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  h4 {
    margin: 0 0 1rem 0;
    font-size: 14px;
    color: var(--muted);
  }

  /* Overview Stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
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
    border-radius: 4px;
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
    border-radius: 4px;
    margin-left: 0.5rem;
  }

  .badge.active {
    background: var(--accent);
    color: var(--bg);
  }

  .status {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status.ok {
    background: color-mix(in srgb, #10b981 20%, transparent);
    color: #10b981;
  }

  .status.error {
    background: color-mix(in srgb, #ef4444 20%, transparent);
    color: #ef4444;
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
    height: 24px;
    background: var(--bg);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    transition: width 0.3s ease;
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
    gap: 0.5rem;
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
  .btn-sm {
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-sm:hover {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .action-buttons {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 1.5rem;
    font-size: 0.875rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .btn-primary:hover {
    background: var(--accent-2);
    border-color: var(--accent-2);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Loading State */
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    color: var(--muted);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Error State */
  .error-state {
    text-align: center;
    padding: 4rem;
  }

  .error-state h3 {
    color: #ef4444;
    margin-bottom: 1rem;
  }

  .error-state button {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 0.875rem;
  }

  .error-state button:hover {
    background: var(--accent-2);
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

    .btn-primary,
    .btn-secondary {
      width: 100%;
      justify-content: center;
    }

    table {
      font-size: 0.75rem;
    }

    td, th {
      padding: 0.5rem;
    }
  }
</style>
