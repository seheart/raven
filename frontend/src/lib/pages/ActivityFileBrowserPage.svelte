<script>
  import { onMount, onDestroy } from 'svelte';
  import { createPageApi } from '../apiClient.js';
  import { PageLayout, PageHeader, StatusBar } from '../components/layout/index.js';
  import {
    RefreshButton,
    EmptyState,
    ToolbarButton,
    LoadingState,
    DataFetchError
  } from '../components/ui/index.js';
  import FreshnessBadge from '../components/ui/FreshnessBadge.svelte';
  const { api, abort: abortRequests } = createPageApi();
  import { logger } from '../logger.js';
  import { formatDateOnly } from '../timeFormat.js';
  import { getChartColors, chartFill } from '../utils/chartUtils.js';
  import { Chart, registerables } from 'chart.js';
  import { websocketService } from '../services/websocket.js';
  import { debounce } from '../utils/debounce.js';
  import FileHistory from '../FileHistory.svelte';

  Chart.register(...registerables);

  // State
  let files = $state([]);
  let fileMetadata = $state(new Map());
  let loading = $state(false);
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
  let lastUpdated = $state(null);
  let unsubscribeFileChanged = null;

  // Whether the current theme is dark. We snapshot it so getFileTypeColor
  // can read a memoized color map instead of calling getComputedStyle per
  // chip per render. Bumping this (on theme change) recomputes the map.
  let isDark = $state(false);

  // Memoized file-type → color map. getChartColors() is a getComputedStyle
  // DOM read; doing it per chip per render was wasteful. Recomputes only
  // when the theme flips (isDark dependency).
  const fileTypeColorMap = $derived.by(() => {
    // Reference isDark so this recomputes on theme change.
    void isDark;
    const c = getChartColors();
    return {
      '.py': c.primary,
      '.js': c.warning,
      '.jsx': c.warning,
      '.ts': c.primary,
      '.tsx': c.primary,
      '.svelte': c.error,
      '.json': c.success,
      '.css': c.primary,
      '.scss': c.primary,
      '.html': c.error,
      '.md': c.muted,
      '.rs': c.warning,
      '.toml': c.muted,
      '.yml': c.muted,
      '.yaml': c.muted,
      _default: c.muted
    };
  });

  // Reload on incoming WS events but coalesce so a flurry of edits doesn't
  // hammer the API. Earlier this page was strictly onMount-only — totals
  // stayed frozen while reality moved underneath the user.
  const debouncedReload = debounce(async () => {
    await loadFiles();
    await loadFileMetadata();
  }, 600);

  onMount(async () => {
    // Check for project query param
    const params = new URLSearchParams(window.location.search);
    const projectParam = params.get('project');
    if (projectParam) {
      selectedProject = projectParam;
    }

    isDark = document.documentElement.classList.contains('dark');

    // loadFileMetadata schedules createCharts once after metadata is ready
    // (charts depend on it). loadFiles alone isn't enough, so we don't
    // double-schedule here.
    await loadFiles();
    await loadFileMetadata();

    // Watch for theme changes — only react when the `dark` class actually
    // toggles, not on every unrelated <html> class mutation.
    themeObserver = new MutationObserver(() => {
      const nextDark = document.documentElement.classList.contains('dark');
      if (nextDark === isDark) return;
      isDark = nextDark;
      if (showCharts) {
        logger.info('[FileBrowser] Theme changed, recreating charts');
        setTimeout(createCharts, 100);
      }
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    unsubscribeFileChanged = websocketService.subscribe('file-changed', () => {
      debouncedReload();
    });
  });

  onDestroy(() => {
    abortRequests();
    if (themeObserver) {
      themeObserver.disconnect();
    }
    if (unsubscribeFileChanged) unsubscribeFileChanged();
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
      lastUpdated = new Date();

      loading = false;
    } catch (err) {
      logger.error('Failed to load tracked files:', err);
      error = err.message || 'Failed to load tracked files';
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
      const events = Array.isArray(data) ? data : data.events || [];

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
    } catch (err) {
      logger.error('Failed to load file metadata:', err);
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

  function getFileTypeColor(ext) {
    return fileTypeColorMap[ext] || fileTypeColorMap._default;
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

    return formatDateOnly(date);
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

    // Theme-aware chart colors (shared helper; flips with dark mode).
    const c = getChartColors();
    const textColor = c.text;
    const mutedColor = c.muted;
    const gridColor = 'rgba(128, 128, 128, 0.15)';

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
              backgroundColor: chartFill,
              borderRadius: 3
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

  // The tracked-file list can be thousands of rows. Render only a slice so the
  // page stays a sane height (rendering all of them made it ~150,000px tall);
  // users narrow with search / type / project filters or click "Show more".
  let visibleCount = $state(100);

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

  const visibleFiles = $derived(filteredFiles.slice(0, visibleCount));

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

<PageLayout>
  <StatusBar prompt="RAVEN.ACTIVITY" label="Files" />
  <PageHeader
    title="Files Raven has watched"
    description="Every file your AI tools have created, edited, or deleted at least once. Click any row to see its history."
  >
    {#snippet actions()}
      <div class="flex items-center gap-3">
        <span
          class="text-xs text-muted font-mono"
          title="Files Raven has seen change at least once.">{stats.totalFiles} files tracked</span
        >
        <FreshnessBadge mode="live" since={lastUpdated} />
        <RefreshButton onClick={refresh} {loading} />
      </div>
    {/snippet}
  </PageHeader>

  {#if error}
    <DataFetchError
      endpoint="/api/tracked-files"
      message="Failed to load tracked files."
      hint={error}
      onRetry={refresh}
    />
  {:else if loading}
    <LoadingState message="Loading tracked files..." />
  {:else if files.length === 0}
    <EmptyState
      title="No files watched yet"
      description="Raven adds files to this list the first time anything edits, creates, or deletes them in one of your tracked projects. Open Claude Code in a project under ~/Projects (or wherever you point Raven) and make any change — it'll appear here within a second."
    />
  {:else}
    <!-- Statistics Header -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Total Files</div>
        <div class="text-sm font-mono text-body">{stats.totalFiles}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">File Types</div>
        <div class="text-sm font-mono text-body">{availableFileTypes.length}</div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Last Updated
        </div>
        <div class="text-sm font-mono text-body">
          {formatTimestamp(stats.lastUpdated)}
        </div>
      </div>
      <div class="bg-surface border border-border rounded p-4">
        <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Most Changed
        </div>
        <div class="text-sm font-mono text-body truncate" title={stats.mostChangedFile}>
          {getFileName(stats.mostChangedFile)}
        </div>
      </div>
    </div>

    <!-- File Type Breakdown -->
    {#if stats.fileTypeBreakdown.length > 0}
      <div class="bg-surface border border-border rounded-lg p-4 mb-6">
        <div class="flex items-center gap-4 flex-wrap">
          <span class="text-sm font-semibold text-muted font-sans">Top File Types:</span>
          <div class="flex gap-3 flex-wrap">
            {#each stats.fileTypeBreakdown as { ext, count } (ext)}
              <span
                class="inline-flex items-center gap-2 px-3 py-1 bg-canvas border rounded text-xs font-mono"
                style="border-color: {getFileTypeColor(ext)}"
              >
                {ext} <span class="text-muted">({count})</span>
              </span>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Charts Section — single column at half-screen, two columns at xl+
         so neither pie nor bar chart gets squashed below a usable width. -->
    {#if showCharts}
      <div class="mb-6 space-y-4">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="h-[200px] min-h-[200px]">
              <canvas id="chart-file-types"></canvas>
            </div>
          </div>
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="h-[200px] min-h-[200px]">
              <canvas id="chart-most-changed"></canvas>
            </div>
          </div>
        </div>
        <div class="bg-surface border border-border rounded-lg p-4">
          <div class="h-[180px] min-h-[180px]">
            <canvas id="chart-changes-by-type"></canvas>
          </div>
        </div>
      </div>
    {/if}

    <!-- Search and Filter Controls -->
    <div class="bg-surface border border-border rounded-lg p-4 mb-6 space-y-3">
      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search files by name or path..."
          class="w-full px-3 py-1.5 pr-10 bg-canvas border border-border rounded text-sm font-mono text-body placeholder:text-muted focus:outline-none focus:border-accent"
        />
        {#if searchQuery}
          <button
            onclick={() => (searchQuery = '')}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-body text-sm"
          >
            ×
          </button>
        {/if}
      </div>

      <div class="flex flex-wrap gap-4 items-center">
        <div class="flex items-center gap-3">
          <span class="text-sm text-muted">Sort</span>
          <select
            bind:value={sortBy}
            class="px-3 py-1.5 bg-canvas border border-border rounded text-sm font-mono text-body focus:outline-none focus:border-accent"
          >
            <option value="filename">Filename</option>
            <option value="lastModified">Last Modified</option>
            <option value="changeCount">Most Changes</option>
          </select>
          <ToolbarButton onClick={toggleSortOrder} title="Toggle sort order">
            {sortOrder === 'asc' ? '↓' : '↑'}
          </ToolbarButton>
        </div>

        {#if availableFileTypes.length > 0}
          <div class="flex items-center gap-3 flex-wrap">
            <span class="text-sm text-muted">Types</span>
            <div class="flex gap-2 flex-wrap">
              {#each availableFileTypes as ext (ext)}
                <button
                  onclick={() => toggleFileType(ext)}
                  class="px-3 py-1 border rounded text-xs font-mono transition-colors"
                  class:bg-accent={selectedFileTypes.includes(ext)}
                  class:text-canvas={selectedFileTypes.includes(ext)}
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

    <!-- File List — flat dense table, bounded so a thousand tracked files
         don't push the filter bar off the screen. User scrolls within it. -->
    {#if filteredFiles.length === 0}
      <EmptyState
        size="compact"
        title="No files match"
        description="Try adjusting your search or filters."
      />
    {:else}
      <div class="border-t border-b border-border font-mono text-sm overflow-x-auto mb-6">
        <table class="w-full">
          <thead class="bg-canvas sticky top-0 z-10">
            <tr class="text-[11px] text-muted uppercase tracking-wide">
              <th class="text-left font-semibold px-3 py-1">File</th>
              <th class="text-left font-semibold px-3 py-1 hidden md:table-cell">Path</th>
              <th class="text-right font-semibold px-3 py-1 w-28">Modified</th>
              <th class="text-right font-semibold px-3 py-1 w-24">Changes</th>
            </tr>
          </thead>
          <tbody>
            {#each visibleFiles as filepath (filepath)}
              <tr
                class="hover:bg-surface/40 cursor-pointer align-top {expandedFile === filepath
                  ? 'bg-surface/40'
                  : ''}"
                onclick={() => toggleFileHistory(filepath)}
              >
                <td class="px-3 py-0.5 text-body">
                  <div class="flex items-center gap-2">
                    <span
                      class="text-muted transition-transform"
                      class:rotate-90={expandedFile === filepath}>›</span
                    >
                    <span class="truncate" title={filepath}>{getFileName(filepath)}</span>
                    {#if isRecent(fileMetadata.get(filepath)?.lastModified)}
                      <span class="text-[10px] font-semibold uppercase text-success">recent</span>
                    {/if}
                  </div>
                </td>
                <td class="px-3 py-0.5 text-muted hidden md:table-cell truncate max-w-[24rem]">
                  {getFilePath(filepath)}
                </td>
                <td class="px-3 py-0.5 text-muted text-right whitespace-nowrap">
                  {#if fileMetadata.has(filepath)}
                    {formatTimestamp(fileMetadata.get(filepath).lastModified)}
                  {:else}
                    —
                  {/if}
                </td>
                <td class="px-3 py-0.5 text-muted text-right">
                  {fileMetadata.get(filepath)?.changeCount ?? 0}
                </td>
              </tr>
              {#if expandedFile === filepath}
                <tr class="bg-canvas">
                  <td colspan="4" class="px-4 py-4 border-t border-border">
                    <FileHistory {filepath} inline={true} />
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if filteredFiles.length > 0}
      <div class="flex flex-col items-center gap-3 text-center text-sm text-muted font-sans">
        <div>
          Showing {visibleFiles.length} of {filteredFiles.length}
          {filteredFiles.length === stats.totalFiles
            ? 'files'
            : `matching (${stats.totalFiles} tracked)`}
        </div>
        {#if filteredFiles.length > visibleCount}
          <ToolbarButton onClick={() => (visibleCount += 100)}>
            Show 100 more · {filteredFiles.length - visibleCount} hidden
          </ToolbarButton>
        {/if}
      </div>
    {/if}
  {/if}
</PageLayout>
