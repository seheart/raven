<script>
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../apiClient.js';
  import { logger } from '../logger.js';
  import { Chart, registerables } from 'chart.js';
  import FileHistory from '../FileHistory.svelte';

  Chart.register(...registerables);

  // State
  let files = $state([]);
  let fileMetadata = $state(new Map());
  let loading = $state(true);
  let error = $state(null);
  let expandedFile = $state(null);
  let selectedProject = $state('');

  // Search and filtering
  let searchQuery = $state('');
  let selectedFileTypes = $state([]);
  let sortBy = $state('filename'); // 'filename', 'lastModified', 'changeCount'
  let sortOrder = $state('asc');

  // Charts
  let charts = {};
  let themeObserver;
  let showCharts = $state(true);

  onMount(async () => {
    // Check for project query param
    const params = new URLSearchParams(window.location.search);
    const projectParam = params.get('project');
    if (projectParam) {
      selectedProject = projectParam;
    }

    await loadFiles();
    await loadFileMetadata();

    // Create charts after data loads
    if (showCharts && files.length > 0) {
      setTimeout(createCharts, 200);
    }

    // Watch for theme changes
    themeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class' && showCharts) {
          logger.info('[FileBrowser] Theme changed, recreating charts');
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
    if (themeObserver) {
      themeObserver.disconnect();
    }
    // Destroy all charts
    Object.values(charts).forEach(chart => chart?.destroy());
  });

  async function loadFiles() {
    try {
      loading = true;
      error = null;

      const endpoint = selectedProject
        ? `/tracked-files?project=${selectedProject}`
        : '/tracked-files';

      files = await api.get(endpoint);

      loading = false;
    } catch (error) {
      logger.error('Failed to load tracked files:', error);
      errorMessage = error.message || 'Failed to load tracked files';
      files = [];
      loading = false;
    }
  }

  async function loadFileMetadata() {
    try {
      const endpoint = selectedProject
        ? `/file-events?project=${selectedProject}&limit=1000`
        : '/file-events?limit=1000';

      const data = await api.get(endpoint);
      const events = data.events || [];

      // Build metadata map
      const metaMap = new Map();
      events.forEach(event => {
        if (!event.filepath) return;

        if (!metaMap.has(event.filepath)) {
          metaMap.set(event.filepath, {
            lastModified: event.timestamp,
            changeCount: 0,
            events: []
          });
        }

        const meta = metaMap.get(event.filepath);
        meta.changeCount++;
        meta.events.push(event);

        // Update lastModified if this event is newer
        if (new Date(event.timestamp) > new Date(meta.lastModified)) {
          meta.lastModified = event.timestamp;
        }
      });

      fileMetadata = metaMap;

      // Create charts after loading metadata
      if (showCharts) {
        setTimeout(createCharts, 100);
      }
    } catch (error) {
      logger.error('Failed to load file metadata:', error);
    }
  }

  async function refresh() {
    await loadFiles();
    await loadFileMetadata();
  }

  function toggleFileHistory(filepath) {
    if (expandedFile === filepath) {
      expandedFile = null;
    } else {
      expandedFile = filepath;
    }
  }

  function getFileExtension(filepath) {
    if (!filepath || typeof filepath !== 'string') return '';
    const match = filepath.match(/\.([^.]+)$/);
    return match ? '.' + match[1] : '';
  }

  function getFileIcon(filepath) {
    if (!filepath || typeof filepath !== 'string') return '📄';
    if (filepath.endsWith('.py')) return '🐍';
    if (filepath.endsWith('.js') || filepath.endsWith('.jsx')) return '📜';
    if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) return '📘';
    if (filepath.endsWith('.json')) return '📋';
    if (filepath.endsWith('.md')) return '📝';
    if (filepath.endsWith('.rs')) return '🦀';
    if (filepath.endsWith('.toml')) return '⚙️';
    if (filepath.endsWith('.svelte')) return '🔶';
    if (filepath.endsWith('.css') || filepath.endsWith('.scss')) return '🎨';
    if (filepath.endsWith('.html')) return '🌐';
    if (filepath.endsWith('.yml') || filepath.endsWith('.yaml')) return '⚙️';
    return '📄';
  }

  function getFileTypeColor(ext) {
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      return value && (value.startsWith('#') || value.startsWith('rgb')) ? value : fallback;
    };

    const colors = {
      '.py': getColor('--accent', '#3b82f6'),
      '.js': getColor('--warning', '#f59e0b'),
      '.jsx': getColor('--warning', '#f59e0b'),
      '.ts': getColor('--accent', '#3b82f6'),
      '.tsx': getColor('--accent', '#3b82f6'),
      '.svelte': '#ff3e00',
      '.json': getColor('--success', '#10b981'),
      '.css': getColor('--accent', '#3b82f6'),
      '.scss': getColor('--accent', '#3b82f6'),
      '.html': getColor('--error', '#ef4444'),
      '.md': getColor('--muted', '#6b7280'),
      '.rs': '#f97316',
      '.toml': getColor('--muted', '#6b7280'),
      '.yml': getColor('--muted', '#6b7280'),
      '.yaml': getColor('--muted', '#6b7280')
    };
    return colors[ext] || getColor('--muted', '#6b7280');
  }

  function getFileName(filepath) {
    return filepath?.split('/')?.pop() || '';
  }

  function getFilePath(filepath) {
    const parts = filepath?.split('/') || [];
    return parts.slice(0, -1).join('/');
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return minutes === 0 ? 'Just now' : `${minutes}m ago`;
    }

    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    return date.toLocaleDateString();
  }

  function isRecent(timestamp) {
    if (!timestamp) return false;
    const diff = new Date() - new Date(timestamp);
    return diff < 3600000; // Less than 1 hour
  }

  function toggleFileType(ext) {
    if (selectedFileTypes.includes(ext)) {
      selectedFileTypes = selectedFileTypes.filter(t => t !== ext);
    } else {
      selectedFileTypes = [...selectedFileTypes, ext];
    }
  }

  function toggleSortOrder() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  }

  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || files.length === 0) return;

    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      return value && (value.startsWith('#') || value.startsWith('rgb')) ? value : fallback;
    };

    const textColor = getColor('--text', '#c0caf5');
    const mutedColor = getColor('--muted', '#565f89');
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    const themeColors = {
      accent: getColor('--accent', '#3b82f6'),
      success: getColor('--success', '#10b981'),
      error: getColor('--error', '#ef4444'),
      warning: getColor('--warning', '#f59e0b')
    };

    // 1. Pie Chart: File types distribution
    const pieCanvas = document.getElementById('chart-file-types');
    if (pieCanvas) {
      const typeData = availableFileTypes
        .map(ext => ({
          ext,
          count: files.filter(f => getFileExtension(f) === ext).length
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      charts.fileTypes = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels: typeData.map(d => d.ext),
          datasets: [
            {
              data: typeData.map(d => d.count),
              backgroundColor: typeData.map(d => getFileTypeColor(d.ext))
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
                font: { size: 10, family: 'var(--mono)' },
                padding: 6
              }
            },
            title: {
              display: true,
              text: 'File Types Distribution',
              color: textColor,
              font: { size: 11, weight: 'bold', family: 'var(--mono)' }
            }
          }
        }
      });
    }

    // 2. Bar Chart: Top 10 most changed files
    const barCanvas = document.getElementById('chart-most-changed');
    if (barCanvas) {
      const topFiles = files
        .map(f => ({
          file: getFileName(f),
          count: fileMetadata.get(f)?.changeCount || 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      charts.mostChanged = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: topFiles.map(f => f.file),
          datasets: [
            {
              label: 'Changes',
              data: topFiles.map(f => f.count),
              backgroundColor: themeColors.accent
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Top 10 Most Changed Files',
              color: textColor,
              font: { size: 11, weight: 'bold', family: 'var(--mono)' }
            }
          },
          scales: {
            x: {
              ticks: { color: mutedColor, font: { size: 10 } },
              grid: { color: gridColor }
            },
            y: {
              ticks: { color: mutedColor, font: { size: 9 } },
              grid: { display: false }
            }
          }
        }
      });
    }

    // 3. Horizontal Bar Chart: Changes by file type
    const typeBarCanvas = document.getElementById('chart-changes-by-type');
    if (typeBarCanvas) {
      const typeChanges = availableFileTypes
        .map(ext => ({
          ext,
          changes: files
            .filter(f => getFileExtension(f) === ext)
            .reduce((sum, f) => sum + (fileMetadata.get(f)?.changeCount || 0), 0)
        }))
        .sort((a, b) => b.changes - a.changes)
        .slice(0, 10);

      charts.changesByType = new Chart(typeBarCanvas, {
        type: 'bar',
        data: {
          labels: typeChanges.map(t => t.ext),
          datasets: [
            {
              label: 'Total Changes',
              data: typeChanges.map(t => t.changes),
              backgroundColor: typeChanges.map(t => getFileTypeColor(t.ext))
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Changes by File Type',
              color: textColor,
              font: { size: 11, weight: 'bold', family: 'var(--mono)' }
            }
          },
          scales: {
            x: {
              ticks: { color: mutedColor, font: { size: 10 } },
              grid: { color: gridColor }
            },
            y: {
              ticks: { color: mutedColor, font: { size: 9 } },
              grid: { display: false }
            }
          }
        }
      });
    }
  }

  // Derived state
  const availableFileTypes = $derived(
    Array.from(new Set(files.map(f => getFileExtension(f)).filter(ext => ext))).sort()
  );

  const filteredFiles = $derived.by(() => {
    return files
      .filter(filepath => {
        // Search filter
        if (searchQuery && !filepath.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }

        // File type filter
        if (selectedFileTypes.length > 0) {
          const ext = getFileExtension(filepath);
          if (!selectedFileTypes.includes(ext)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;

        if (sortBy === 'filename') {
          comparison = a.localeCompare(b);
        } else if (sortBy === 'lastModified') {
          const aTime = fileMetadata.get(a)?.lastModified || 0;
          const bTime = fileMetadata.get(b)?.lastModified || 0;
          comparison = new Date(bTime) - new Date(aTime);
        } else if (sortBy === 'changeCount') {
          const aCount = fileMetadata.get(a)?.changeCount || 0;
          const bCount = fileMetadata.get(b)?.changeCount || 0;
          comparison = bCount - aCount;
        }

        return sortOrder === 'asc' ? comparison : -comparison;
      });
  });

  const stats = $derived.by(() => {
    const lastUpdated =
      files.length > 0
        ? Array.from(fileMetadata.values())
            .map(m => m.lastModified)
            .filter(t => t)
            .sort()
            .reverse()[0]
        : null;

    const mostChangedFile =
      files.length > 0
        ? files.reduce((max, file) => {
            const count = fileMetadata.get(file)?.changeCount || 0;
            const maxCount = fileMetadata.get(max)?.changeCount || 0;
            return count > maxCount ? file : max;
          }, files[0])
        : null;

    const fileTypeBreakdown = availableFileTypes
      .map(ext => ({
        ext,
        count: files.filter(f => getFileExtension(f) === ext).length
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalFiles: files.length,
      filteredFiles: filteredFiles.length,
      lastUpdated,
      mostChangedFile,
      fileTypeBreakdown
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-start">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1 font-mono">File Browser</h1>
        <p class="text-sm text-[var(--muted)] font-sans">Browse and track file modifications</p>
      </div>
      <div class="flex items-center gap-3">
        <button
          onclick={refresh}
          disabled={loading}
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? '⏳ Loading' : '🔄 Refresh'}
        </button>
        <button
          onclick={() => (showCharts = !showCharts)}
          class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          {showCharts ? '📊 Hide Charts' : '📈 Show Charts'}
        </button>
      </div>
    </div>

    {#if error}
      <div class="bg-[var(--error-bg)] border border-[var(--error)] rounded-lg p-4">
        <p class="text-sm text-[var(--error)] font-sans">⚠️ {error}</p>
        <button
          onclick={loadFiles}
          class="mt-2 px-3 py-1 bg-[var(--error)] text-white rounded text-sm font-sans hover:opacity-90"
        >
          Retry
        </button>
      </div>
    {:else if loading}
      <div class="text-center py-12">
        <div class="text-4xl mb-4">⏳</div>
        <p class="text-[var(--muted)] font-sans">Loading tracked files...</p>
      </div>
    {:else if files.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-12 text-center">
        <div class="text-5xl mb-4">📁</div>
        <p class="text-xl font-semibold text-[var(--text-heading)] mb-2">No files tracked yet</p>
        <p class="text-sm text-[var(--muted)] font-sans">Edit files to start tracking</p>
      </div>
    {:else}
      <!-- Statistics Header -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
            Total Files
          </div>
          <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
            {stats.totalFiles}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
            Filtered
          </div>
          <div class="text-2xl font-bold text-[var(--text-heading)] font-mono">
            {stats.filteredFiles}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
            Last Updated
          </div>
          <div class="text-lg font-semibold text-[var(--text)] font-mono">
            {formatTimestamp(stats.lastUpdated)}
          </div>
        </div>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="text-xs text-[var(--muted)] font-sans uppercase tracking-wide mb-1">
            Most Changed
          </div>
          <div
            class="text-sm font-semibold text-[var(--text)] font-mono truncate"
            title={stats.mostChangedFile}
          >
            {getFileName(stats.mostChangedFile)}
          </div>
        </div>
      </div>

      <!-- File Type Breakdown -->
      {#if stats.fileTypeBreakdown.length > 0}
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <div class="flex items-center gap-4 flex-wrap">
            <span class="text-sm font-semibold text-[var(--muted)] font-sans">Top File Types:</span>
            <div class="flex gap-3 flex-wrap">
              {#each stats.fileTypeBreakdown as { ext, count } (ext)}
                <span
                  class="inline-flex items-center gap-2 px-3 py-1 bg-[var(--bg)] border rounded text-xs font-mono"
                  style="border-color: {getFileTypeColor(ext)}"
                >
                  {ext} <span class="text-[var(--muted)]">({count})</span>
                </span>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Charts Section -->
      {#if showCharts}
        <div class="space-y-4">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div class="h-[200px]">
                <canvas id="chart-file-types"></canvas>
              </div>
            </div>
            <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div class="h-[200px]">
                <canvas id="chart-most-changed"></canvas>
              </div>
            </div>
          </div>
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
            <div class="h-[180px]">
              <canvas id="chart-changes-by-type"></canvas>
            </div>
          </div>
        </div>
      {/if}

      <!-- Search and Filter Controls -->
      <div class="space-y-4">
        <div class="relative">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search files by name or path..."
            class="w-full px-4 py-2 pr-10 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
          />
          {#if searchQuery}
            <button
              onclick={() => (searchQuery = '')}
              class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] text-xl"
            >
              ×
            </button>
          {/if}
        </div>

        <div class="flex flex-wrap gap-4 items-center">
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold text-[var(--muted)] font-sans">Sort by:</span>
            <select
              bind:value={sortBy}
              class="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="filename">Filename</option>
              <option value="lastModified">Last Modified</option>
              <option value="changeCount">Most Changes</option>
            </select>
            <button
              onclick={toggleSortOrder}
              class="px-2 py-2 bg-[var(--surface)] border border-[var(--border)] rounded hover:border-[var(--accent)] transition-colors"
            >
              {sortOrder === 'asc' ? '↓' : '↑'}
            </button>
          </div>

          {#if availableFileTypes.length > 0}
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-sm font-semibold text-[var(--muted)] font-sans">File Types:</span>
              <div class="flex gap-2 flex-wrap">
                {#each availableFileTypes as ext (ext)}
                  <button
                    onclick={() => toggleFileType(ext)}
                    class="px-3 py-1 border rounded text-xs font-mono transition-colors"
                    class:bg-accent={selectedFileTypes.includes(ext)}
                    class:text-white={selectedFileTypes.includes(ext)}
                    class:border-accent={selectedFileTypes.includes(ext)}
                    class:bg-surface={!selectedFileTypes.includes(ext)}
                    class:border-border={!selectedFileTypes.includes(ext)}
                    style={selectedFileTypes.includes(ext)
                      ? `background-color: ${getFileTypeColor(ext)}; border-color: ${getFileTypeColor(ext)}`
                      : ''}
                  >
                    {ext} ({files.filter(f => getFileExtension(f) === ext).length})
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- File List -->
      <div class="space-y-2">
        {#if filteredFiles.length === 0}
          <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
            <p class="text-sm text-[var(--muted)] font-sans">
              No files match your filters. Try adjusting your search or filters.
            </p>
          </div>
        {:else}
          {#each filteredFiles as filepath (filepath)}
            <div
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <button
                onclick={() => toggleFileHistory(filepath)}
                class="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg)] transition-colors text-left"
                class:bg-bg={expandedFile === filepath}
              >
                <span
                  class="text-xs text-[var(--muted)] transition-transform"
                  class:rotate-90={expandedFile === filepath}
                >
                  ▶
                </span>
                <span class="text-xl flex-shrink-0">{getFileIcon(filepath)}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-[var(--text)] font-mono truncate">
                      {getFileName(filepath)}
                    </span>
                    {#if isRecent(fileMetadata.get(filepath)?.lastModified)}
                      <span
                        class="px-2 py-0.5 bg-[var(--success)] text-white text-xs font-semibold rounded uppercase"
                      >
                        Recent
                      </span>
                    {/if}
                  </div>
                  <div class="text-xs text-[var(--muted)] font-mono truncate">
                    {getFilePath(filepath)}
                  </div>
                </div>
                <div class="flex items-center gap-4 flex-shrink-0">
                  {#if fileMetadata.has(filepath)}
                    <div class="flex items-center gap-1 text-xs text-[var(--muted)] font-mono">
                      <span>🕒</span>
                      {formatTimestamp(fileMetadata.get(filepath).lastModified)}
                    </div>
                    <div class="flex items-center gap-1">
                      <span class="text-xs">📝</span>
                      <span
                        class="px-2 py-0.5 bg-[var(--accent)] text-white text-xs font-semibold rounded"
                      >
                        {fileMetadata.get(filepath).changeCount}
                      </span>
                    </div>
                  {/if}
                </div>
                <span class="text-sm text-[var(--muted)] font-sans">
                  {expandedFile === filepath ? 'Hide' : 'Show'} History
                </span>
              </button>

              {#if expandedFile === filepath}
                <div class="px-4 py-4 bg-[var(--bg)] border-t border-[var(--border)]">
                  <FileHistory {filepath} inline={true} />
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      {#if filteredFiles.length > 0}
        <div class="text-center text-sm text-[var(--muted)] font-sans">
          Showing {filteredFiles.length} of {stats.totalFiles} files
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .bg-accent {
    background: var(--accent);
  }
  .text-white {
    color: white;
  }
  .border-accent {
    border-color: var(--accent);
  }
  .bg-surface {
    background: var(--surface);
  }
  .border-border {
    border-color: var(--border);
  }
  .bg-bg {
    background: var(--bg);
  }
  .rotate-90 {
    transform: rotate(90deg);
  }
</style>
