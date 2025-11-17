<script>
  import { logger } from '../logger.js';
  import { projectFilter } from '../projectFilterStore.js';
  /**
   * System Exports Page
   * Export and share Raven data in multiple formats
   */
  import { api } from '../apiClient.js';

  let selectedProject = $derived($projectFilter.currentProject || 'all');
  let activeTab = $state('events');
  let loading = $state(false);
  let exportStats = $state(null);
  let existingExports = $state([]);

  // Export configuration
  let startDate = $state('');
  let endDate = $state('');
  let exportFormat = $state('json');
  let exportLimit = $state(1000);
  let includeData = $state(true);
  let reportDays = $state(7);

  // Filters for specific exports
  let eventType = $state('');
  let agentName = $state('');
  let errorSeverity = $state('');
  let metricType = $state('');

  const exportTypes = [
    { id: 'events', label: 'Events', description: 'File system events and changes' },
    { id: 'agent-events', label: 'Agent Events', description: 'AI agent interactions' },
    { id: 'errors', label: 'Errors', description: 'Error logs and exceptions' },
    { id: 'metrics', label: 'Metrics', description: 'Performance and system metrics' },
    { id: 'report', label: 'Full Report', description: 'Comprehensive project report' },
    { id: 'snapshot', label: 'Snapshot', description: 'Shareable project snapshot' }
  ];

  const formats = [
    { value: 'json', label: 'JSON', icon: '📦' },
    { value: 'csv', label: 'CSV', icon: '📊' },
    { value: 'markdown', label: 'Markdown', icon: '📝' }
  ];

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
  }

  async function loadExportStats() {
    try {
      const stats = await api.get('/export/stats');
      exportStats = stats;
    } catch (err) {
      logger.error('Failed to load export stats:', err);
    }
  }

  async function loadExistingExports() {
    try {
      const data = await api.get('/export/list');
      existingExports = data.exports || [];
    } catch (err) {
      logger.error('Failed to load existing exports:', err);
    }
  }

  async function performExport() {
    try {
      loading = true;

      let endpoint = '';
      let params = new URLSearchParams();

      // Add common parameters
      if (selectedProject !== 'all') {
        params.append('project', selectedProject);
      }
      if (startDate) params.append('start', new Date(startDate).toISOString());
      if (endDate) params.append('end', new Date(endDate).toISOString());
      params.append('format', exportFormat);
      params.append('limit', exportLimit.toString());

      // Set endpoint and type-specific parameters
      switch (activeTab) {
        case 'events':
          endpoint = '/export/events';
          if (eventType) params.append('type', eventType);
          break;
        case 'agent-events':
          endpoint = '/export/agent-events';
          if (agentName) params.append('agent', agentName);
          break;
        case 'errors':
          endpoint = '/export/errors';
          if (errorSeverity) params.append('severity', errorSeverity);
          break;
        case 'metrics':
          endpoint = '/export/metrics';
          if (metricType) params.append('type', metricType);
          break;
        case 'report':
          endpoint = '/export/report';
          params.append('days', reportDays.toString());
          break;
        case 'snapshot':
          // Snapshot is a POST request
          const snapshotResult = await api.post('/export/snapshot', {
            projectName: selectedProject !== 'all' ? selectedProject : undefined,
            includeData,
            days: reportDays
          });

          logger.info(`Snapshot created: ${snapshotResult.filename}`);
          await loadExistingExports();
          await loadExportStats();
          loading = false;
          return;
      }

      const data = await api.get(`${endpoint}?${params.toString()}`);

      // Download the exported data
      downloadData(data, activeTab);

      logger.info('Export completed successfully!');
      await loadExportStats();
    } catch (err) {
      logger.error('Export failed:', err);
    } finally {
      loading = false;
    }
  }

  function downloadData(data, type) {
    let content, filename, mimeType;

    if (exportFormat === 'csv' && typeof data === 'string') {
      content = data;
      filename = `raven-${type}-${Date.now()}.csv`;
      mimeType = 'text/csv';
    } else if (exportFormat === 'markdown' && typeof data === 'string') {
      content = data;
      filename = `raven-${type}-${Date.now()}.md`;
      mimeType = 'text/markdown';
    } else {
      content = JSON.stringify(data, null, 2);
      filename = `raven-${type}-${Date.now()}.json`;
      mimeType = 'application/json';
    }

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

  async function downloadExport(filename) {
    try {
      // Open download URL in new tab
      window.open(`/api/export/download/${filename}`, '_blank');
      logger.info('Download started!');
    } catch (err) {
      logger.error('Download failed:', err);
    }
  }

  async function deleteExport(filename) {
    if (!confirm(`Delete ${filename}?`)) return;

    try {
      await api.delete(`/export/${filename}`);
      logger.info('Export deleted');
      await loadExistingExports();
      await loadExportStats();
    } catch (err) {
      logger.error('Delete failed:', err);
    }
  }

  $effect(() => {
    loadExportStats();
    loadExistingExports();
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-xl font-bold text-[var(--text)] mb-2">Data Export & Sharing</h1>
      <p class="text-base text-[var(--muted)] font-sans">
        Export Raven data in multiple formats for analysis and sharing
      </p>
    </div>

    <!-- Stats Cards -->
    {#if exportStats}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 uppercase tracking-wide">Total Exports</div>
          <div class="text-2xl font-bold font-mono text-[var(--text)]">
            {exportStats.total_exports}
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 uppercase tracking-wide">Total Size</div>
          <div class="text-2xl font-bold font-mono text-[var(--text)]">
            {formatBytes(exportStats.total_size)}
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 uppercase tracking-wide">JSON Exports</div>
          <div class="text-2xl font-bold font-mono text-[var(--text)]">
            {exportStats.by_type?.json || 0}
          </div>
        </div>

        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-sm text-[var(--muted)] mb-1 uppercase tracking-wide">CSV Exports</div>
          <div class="text-2xl font-bold font-mono text-[var(--text)]">
            {exportStats.by_type?.csv || 0}
          </div>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Export Configuration Panel -->
      <div class="lg:col-span-2">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <h2 class="text-lg font-semibold text-[var(--text)] mb-4">Create Export</h2>

          <!-- Export Type Tabs -->
          <div class="flex flex-wrap gap-2 mb-6">
            {#each exportTypes as type (type.id)}
              <button
                class="px-3 py-2 rounded text-sm font-mono transition-all"
                class:bg-[var(--accent)]={activeTab === type.id}
                class:text-white={activeTab === type.id}
                class:border={activeTab !== type.id}
                class:border-[var(--border)]={activeTab !== type.id}
                onclick={() => (activeTab = type.id)}
              >
                {type.label}
              </button>
            {/each}
          </div>

          <!-- Export Configuration -->
          <div class="space-y-4">
            <!-- Common Options -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">Start Date</label>
                <input
                  type="datetime-local"
                  bind:value={startDate}
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">End Date</label>
                <input
                  type="datetime-local"
                  bind:value={endDate}
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <!-- Format Selection -->
            {#if activeTab !== 'snapshot'}
              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">Export Format</label
                >
                <div class="grid grid-cols-3 gap-3">
                  {#each formats as format (format.value)}
                    <button
                      class="px-4 py-3 rounded border transition-all text-center"
                      class:border-[var(--accent)]={exportFormat === format.value}
                      class:bg-[var(--accent)]={exportFormat === format.value}
                      class:text-white={exportFormat === format.value}
                      class:border-[var(--border)]={exportFormat !== format.value}
                      onclick={() => (exportFormat = format.value)}
                    >
                      <div class="text-2xl mb-1">{format.icon}</div>
                      <div class="text-sm font-mono">{format.label}</div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Type-Specific Options -->
            {#if activeTab === 'events'}
              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">Event Type</label>
                <select
                  bind:value={eventType}
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono cursor-pointer"
                >
                  <option value="">All Types</option>
                  <option value="add">Add</option>
                  <option value="change">Change</option>
                  <option value="unlink">Delete</option>
                </select>
              </div>
            {:else if activeTab === 'agent-events'}
              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">Agent Name</label>
                <input
                  type="text"
                  bind:value={agentName}
                  placeholder="claude, gpt, etc."
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            {:else if activeTab === 'errors'}
              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">Severity</label>
                <select
                  bind:value={errorSeverity}
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono cursor-pointer"
                >
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>
            {:else if activeTab === 'metrics'}
              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">Metric Type</label>
                <input
                  type="text"
                  bind:value={metricType}
                  placeholder="api_response, memory, cpu, etc."
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            {:else if activeTab === 'report' || activeTab === 'snapshot'}
              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">
                  Report Period (days)
                </label>
                <input
                  type="number"
                  bind:value={reportDays}
                  min="1"
                  max="90"
                  class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-[var(--text)] font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {#if activeTab === 'snapshot'}
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" bind:checked={includeData} class="w-4 h-4" />
                  <span class="text-sm text-[var(--text)] font-mono"
                    >Include full data in snapshot</span
                  >
                </label>
              {/if}
            {/if}

            <!-- Limit -->
            {#if activeTab !== 'report' && activeTab !== 'snapshot'}
              <div>
                <label class="block text-sm text-[var(--muted)] mb-2 font-mono">
                  Record Limit: {exportLimit}
                </label>
                <input
                  type="range"
                  bind:value={exportLimit}
                  min="100"
                  max="10000"
                  step="100"
                  class="w-full"
                />
              </div>
            {/if}

            <!-- Export Button -->
            <button
              class="w-full px-6 py-3 bg-[var(--accent)] text-white rounded text-base font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              onclick={performExport}
              disabled={loading}
            >
              {loading
                ? '⏳ Exporting...'
                : `📤 Export ${exportTypes.find(t => t.id === activeTab)?.label || ''}`}
            </button>
          </div>
        </div>
      </div>

      <!-- Saved Exports Sidebar -->
      <div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <h2 class="text-lg font-semibold text-[var(--text)] mb-4">Saved Exports</h2>

          {#if existingExports.length === 0}
            <p class="text-sm text-[var(--muted)] text-center py-8">No exports yet</p>
          {:else}
            <div class="space-y-3 max-h-[600px] overflow-y-auto">
              {#each existingExports as exp (exp.filename)}
                <div class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-mono text-[var(--text)] truncate mb-1">
                        {exp.filename}
                      </div>
                      <div class="text-xs text-[var(--muted)]">{formatBytes(exp.size)}</div>
                    </div>
                  </div>

                  <div class="text-xs text-[var(--muted)] mb-3">
                    {formatDate(exp.created_at)}
                  </div>

                  <div class="flex gap-2">
                    <button
                      class="flex-1 px-3 py-1 bg-[var(--accent)] text-white rounded text-xs font-semibold hover:opacity-90 transition-opacity"
                      onclick={() => downloadExport(exp.filename)}
                    >
                      ⬇️ Download
                    </button>
                    <button
                      class="px-3 py-1 bg-red-500 text-white rounded text-xs font-semibold hover:opacity-90 transition-opacity"
                      onclick={() => deleteExport(exp.filename)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
