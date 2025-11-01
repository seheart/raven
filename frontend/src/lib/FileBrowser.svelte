<script>
  import { onMount, onDestroy } from 'svelte';
  import FileHistory from './FileHistory.svelte';
  import { logger } from './logger.js';
  import { notifications } from './notificationService.js';
  import { API_CONFIG } from '../config.js';
  import { Chart, registerables } from 'chart.js';
  import LoadingSkeleton from './LoadingSkeleton.svelte';

  Chart.register(...registerables);

  const API_BASE = API_CONFIG.API_BASE;

  let files = [];
  let fileMetadata = new Map(); // filepath -> { lastModified, changeCount, events }
  let loading = true;
  let error = null;
  let expandedFile = null;
  let projects = [];
  let selectedProject = localStorage.getItem('raven-file-browser-project') || '';
  let loadingProjects = true;

  // Search and filtering
  let searchQuery = '';
  let selectedFileTypes = [];
  let sortBy = 'filename'; // 'filename', 'lastModified', 'changeCount'
  let sortOrder = 'asc'; // 'asc', 'desc'

  // Charts
  let charts = {};
  let themeObserver;
  let showCharts = true;

  onMount(async () => {
    await loadProjects();
    await loadFiles();
    await loadFileMetadata();

    // Create charts after data loads and DOM is ready
    if (showCharts && files.length > 0) {
      setTimeout(createCharts, 200);
    }

    // Watch for theme changes
    themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
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

  async function loadProjects() {
    try {
      loadingProjects = true;
      const response = await fetch(`${API_BASE}/projects`);
      if (!response.ok) {
        throw new Error(`Failed to load projects: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      projects = data.projects || [];
      loadingProjects = false;
    } catch (error) {
      logger.error('Failed to load projects:', error);
      notifications.error(`Failed to load projects: ${error.message || 'Network error'}`, {
        title: 'File Browser Error'
      });
      projects = [];
      loadingProjects = false;
    }
  }

  async function loadFiles() {
    try {
      loading = true;
      const url = selectedProject
        ? `${API_BASE}/tracked-files?project=${selectedProject}`
        : `${API_BASE}/tracked-files`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load files: ${response.status} ${response.statusText}`);
      }
      files = await response.json();
      loading = false;
      error = null;
    } catch (err) {
      logger.error('Failed to load tracked files:', err);
      notifications.error(`Failed to load tracked files: ${err.message || 'Network error'}`, {
        title: 'File Browser Error',
        message: 'Using fallback data. Check if the Raven backend is running.'
      });
      error = err.message || 'Failed to load tracked files';
      // Fallback to mock data
      files = [
        'test_workspace/src/example.py',
        'test_workspace/src/example.js',
        'test_workspace/config.json'
      ];
      loading = false;
    }
  }

  async function loadFileMetadata() {
    try {
      // Fetch file events to get metadata
      const url = selectedProject
        ? `${API_BASE}/file-events?project=${selectedProject}&limit=1000`
        : `${API_BASE}/file-events?limit=1000`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load file metadata: ${response.status}`);
      }
      const data = await response.json();
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

  async function handleProjectChange(event) {
    try {
      selectedProject = event.target.value;
      localStorage.setItem('raven-file-browser-project', selectedProject);
      expandedFile = null; // Collapse any expanded files when switching projects
      await loadFiles();
      await loadFileMetadata();
    } catch (error) {
      logger.error('Failed to handle project change:', error);
      notifications.error(`Failed to switch projects: ${error.message || 'Network error'}`, {
        title: 'File Browser Error'
      });
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
    // Helper function to safely extract color with fallback
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      return (value && (value.startsWith('#') || value.startsWith('rgb'))) ? value : fallback;
    };

    const colors = {
      '.py': getColor('--accent', '#7aa2f7'),
      '.js': getColor('--warning', '#e0af68'),
      '.jsx': getColor('--warning', '#e0af68'),
      '.ts': getColor('--accent', '#7aa2f7'),
      '.tsx': getColor('--accent', '#7aa2f7'),
      '.svelte': '#ff3e00',
      '.json': getColor('--success', '#9ece6a'),
      '.css': '#8b5cf6',
      '.scss': '#8b5cf6',
      '.html': getColor('--error', '#f7768e'),
      '.md': getColor('--muted', '#565f89'),
      '.rs': '#f97316',
      '.toml': getColor('--muted', '#565f89'),
      '.yml': getColor('--muted', '#565f89'),
      '.yaml': getColor('--muted', '#565f89')
    };
    return colors[ext] || getColor('--muted', '#565f89');
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

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return minutes === 0 ? 'Just now' : `${minutes}m ago`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    // Otherwise show date
    return date.toLocaleDateString();
  }

  function isRecent(timestamp) {
    if (!timestamp) return false;
    const diff = new Date() - new Date(timestamp);
    return diff < 3600000; // Less than 1 hour
  }

  // Auto-detect file types from files list
  $: availableFileTypes = Array.from(new Set(
    files.map(f => getFileExtension(f)).filter(ext => ext)
  )).sort();

  // Filter and sort files
  $: filteredFiles = files
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
        comparison = new Date(bTime) - new Date(aTime); // Most recent first by default
      } else if (sortBy === 'changeCount') {
        const aCount = fileMetadata.get(a)?.changeCount || 0;
        const bCount = fileMetadata.get(b)?.changeCount || 0;
        comparison = bCount - aCount; // Most changed first by default
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Statistics
  $: stats = {
    totalFiles: files.length,
    filteredFiles: filteredFiles.length,
    fileTypeBreakdown: availableFileTypes.map(ext => ({
      ext,
      count: files.filter(f => getFileExtension(f) === ext).length
    })).sort((a, b) => b.count - a.count).slice(0, 5),
    lastUpdated: files.length > 0
      ? Array.from(fileMetadata.values())
          .map(m => m.lastModified)
          .filter(t => t)
          .sort()
          .reverse()[0]
      : null,
    mostChangedFile: files.length > 0
      ? files.reduce((max, file) => {
          const count = fileMetadata.get(file)?.changeCount || 0;
          const maxCount = fileMetadata.get(max)?.changeCount || 0;
          return count > maxCount ? file : max;
        }, files[0])
      : null
  };

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

  // Reactive aria-labels for chart accessibility
  $: fileTypesAriaLabel = (() => {
    const topTypes = availableFileTypes.map(ext => ({
      ext,
      count: files.filter(f => getFileExtension(f) === ext).length
    })).sort((a, b) => b.count - a.count).slice(0, 3);
    if (topTypes.length === 0) return 'File types distribution chart: No files available';
    const summary = topTypes.map(({ ext, count }) => `${ext}: ${count} files`).join(', ');
    return `File types distribution chart showing ${files.length} total files. Top types: ${summary}`;
  })();

  $: mostChangedAriaLabel = (() => {
    const topFiles = files.map(f => ({
      file: getFileName(f),
      count: fileMetadata.get(f)?.changeCount || 0
    })).sort((a, b) => b.count - a.count).slice(0, 3);
    if (topFiles.length === 0 || topFiles[0].count === 0) return 'Most changed files chart: No change data available';
    const summary = topFiles.map(({ file, count }) => `${file}: ${count} changes`).join(', ');
    return `Most changed files chart. Top files: ${summary}`;
  })();

  $: changesByTypeAriaLabel = (() => {
    const typeChanges = availableFileTypes.map(ext => ({
      ext,
      changes: files.filter(f => getFileExtension(f) === ext).reduce((sum, f) => sum + (fileMetadata.get(f)?.changeCount || 0), 0)
    })).sort((a, b) => b.changes - a.changes).slice(0, 3);
    if (typeChanges.length === 0 || typeChanges[0].changes === 0) return 'Changes by file type chart: No change data available';
    const summary = typeChanges.map(({ ext, changes }) => `${ext}: ${changes} changes`).join(', ');
    return `Changes by file type chart. Top types: ${summary}`;
  })();

  function createCharts() {
    // Destroy existing charts
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};

    if (!showCharts || files.length === 0) return;

    // Helper function to safely extract color with fallback
    const getColor = (varName, fallback) => {
      const computedStyle = getComputedStyle(document.body);
      const value = computedStyle.getPropertyValue(varName).trim();
      // Only use if it's a valid color (hex or rgb)
      return (value && (value.startsWith('#') || value.startsWith('rgb'))) ? value : fallback;
    };

    // Get theme-aware colors
    const textColor = getColor('--text', '#c0caf5');
    const mutedColor = getColor('--muted', '#565f89');
    const gridColor = 'rgba(128, 128, 128, 0.15)';

    // Extract theme colors for charts
    const themeColors = {
      accent: getColor('--accent', '#7aa2f7'),
      success: getColor('--success', '#9ece6a'),
      error: getColor('--error', '#f7768e'),
      warning: getColor('--warning', '#e0af68')
    };

    // 1. Pie Chart: File types distribution
    const pieCanvas = document.getElementById('chart-file-types');
    if (pieCanvas) {
      const typeData = availableFileTypes.map(ext => ({
        ext,
        count: files.filter(f => getFileExtension(f) === ext).length
      })).sort((a, b) => b.count - a.count).slice(0, 10);

      charts.fileTypes = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels: typeData.map(d => d.ext),
          datasets: [{
            data: typeData.map(d => d.count),
            backgroundColor: typeData.map(d => getFileTypeColor(d.ext))
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
          datasets: [{
            label: 'Changes',
            data: topFiles.map(f => f.count),
            backgroundColor: themeColors.accent
          }]
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
      const typeChanges = availableFileTypes.map(ext => ({
        ext,
        changes: files
          .filter(f => getFileExtension(f) === ext)
          .reduce((sum, f) => sum + (fileMetadata.get(f)?.changeCount || 0), 0)
      })).sort((a, b) => b.changes - a.changes).slice(0, 10);

      charts.changesByType = new Chart(typeBarCanvas, {
        type: 'bar',
        data: {
          labels: typeChanges.map(t => t.ext),
          datasets: [{
            label: 'Total Changes',
            data: typeChanges.map(t => t.changes),
            backgroundColor: typeChanges.map(t => getFileTypeColor(t.ext))
          }]
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
</script>

<div class="file-browser" role="region" aria-label="File browser">
  <!-- Header with controls -->
  <div class="browser-header">
    <h3 id="files-heading"><span aria-hidden="true">📂</span> Tracked Files</h3>
    <div class="header-controls">
      {#if !loadingProjects && projects.length > 0}
        <select
          class="project-selector"
          bind:value={selectedProject}
          on:change={handleProjectChange}
          aria-label="Select project"
        >
          <option value="">All Projects (Default)</option>
          {#each projects as project (project.name)}
            <option value={project.name}>{project.name}</option>
          {/each}
        </select>
      {/if}
      <button class="refresh-btn" on:click={refresh} disabled={loading} aria-label="Refresh file list">
        <span aria-hidden="true">{loading ? '⟳' : '↻'}</span> Refresh
      </button>
      <button class="toggle-charts-btn" on:click={() => showCharts = !showCharts} aria-label="Toggle charts">
        {showCharts ? '📊' : '📈'}
      </button>
    </div>
  </div>

  {#if error}
    <div class="error-state" role="alert">
      <p>Error: {error}</p>
      <button class="btn-retry" on:click={loadFiles} aria-label="Retry loading files">
        Retry
      </button>
    </div>
  {:else if loading}
    <LoadingSkeleton type="list" count={5} height="60px" />
  {:else if files.length === 0}
    <div class="empty" role="status">
      <p>No files tracked yet</p>
      <p class="hint">Edit files in test_workspace/ to start tracking</p>
    </div>
  {:else}
    <!-- Statistics Header -->
    <div class="stats-header">
      <div class="stat-item">
        <div class="stat-label">Total Files</div>
        <div class="stat-value">{stats.totalFiles}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Filtered</div>
        <div class="stat-value">{stats.filteredFiles}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Last Updated</div>
        <div class="stat-value">{formatTimestamp(stats.lastUpdated)}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Most Changed</div>
        <div class="stat-value" title={stats.mostChangedFile}>{getFileName(stats.mostChangedFile)}</div>
      </div>
    </div>

    <!-- File Type Breakdown -->
    {#if stats.fileTypeBreakdown.length > 0}
      <div class="type-breakdown">
        <div class="breakdown-label">Top File Types:</div>
        <div class="breakdown-tags">
          {#each stats.fileTypeBreakdown as { ext, count } (ext)}
            <span class="type-tag" style="border-color: {getFileTypeColor(ext)}">
              {ext} <span class="type-count">({count})</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Charts Section -->
    {#if showCharts}
      <div class="charts-section">
        <div class="chart-row">
          <div class="chart-container">
            <div role="img" aria-label={fileTypesAriaLabel}>
              <canvas id="chart-file-types" width="300" height="200"></canvas>
            </div>
          </div>
          <div class="chart-container">
            <div role="img" aria-label={mostChangedAriaLabel}>
              <canvas id="chart-most-changed" width="300" height="200"></canvas>
            </div>
          </div>
        </div>
        <div class="chart-row">
          <div class="chart-container full-width">
            <div role="img" aria-label={changesByTypeAriaLabel}>
              <canvas id="chart-changes-by-type" width="600" height="180"></canvas>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Search and Filter Controls -->
    <div class="controls-section">
      <div class="search-bar">
        <input
          type="text"
          class="search-input"
          placeholder="Search files by name or path..."
          bind:value={searchQuery}
          aria-label="Search files"
        />
        {#if searchQuery}
          <button class="clear-search-btn" on:click={() => searchQuery = ''} aria-label="Clear search">×</button>
        {/if}
      </div>

      <div class="filter-controls">
        <div class="filter-group">
          <span class="filter-label">Sort by:</span>
          <select class="sort-select" bind:value={sortBy} aria-label="Sort by">
            <option value="filename">Filename</option>
            <option value="lastModified">Last Modified</option>
            <option value="changeCount">Change Count</option>
          </select>
          <button class="sort-order-btn" on:click={toggleSortOrder} aria-label="Toggle sort order">
            {sortOrder === 'asc' ? '↓' : '↑'}
          </button>
        </div>

        {#if availableFileTypes.length > 0}
          <div class="filter-group">
            <span class="filter-label">File Types:</span>
            <div class="type-filters">
              {#each availableFileTypes as ext (ext)}
                <button
                  class="type-filter-btn"
                  class:active={selectedFileTypes.includes(ext)}
                  style="--type-color: {getFileTypeColor(ext)}"
                  on:click={() => toggleFileType(ext)}
                  aria-label="Filter by {ext}"
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
    <div class="file-list" role="list" aria-labelledby="files-heading">
      {#if filteredFiles.length === 0}
        <div class="no-results">
          No files match your filters. Try adjusting your search or filters.
        </div>
      {:else}
        {#each filteredFiles as filepath (filepath)}
          <div class="file-container">
            <button
              class="file-item"
              class:expanded={expandedFile === filepath}
              on:click={() => toggleFileHistory(filepath)}
              aria-label="View history for {getFileName(filepath)}"
              aria-expanded={expandedFile === filepath}
              aria-controls="file-history-{filepath}"
            >
              <div class="expand-arrow" aria-hidden="true">{expandedFile === filepath ? '▼' : '▶'}</div>
              <div class="file-icon" aria-hidden="true">{getFileIcon(filepath)}</div>
              <div class="file-info">
                <div class="file-name">
                  {getFileName(filepath)}
                  {#if isRecent(fileMetadata.get(filepath)?.lastModified)}
                    <span class="recent-badge" title="Modified in the last hour">Recent</span>
                  {/if}
                </div>
                <div class="file-path">{getFilePath(filepath)}</div>
              </div>
              <div class="file-metadata">
                {#if fileMetadata.has(filepath)}
                  <div class="metadata-item" title="Last modified">
                    <span class="metadata-icon">🕒</span>
                    {formatTimestamp(fileMetadata.get(filepath).lastModified)}
                  </div>
                  <div class="metadata-item" title="Number of changes">
                    <span class="metadata-icon">📝</span>
                    <span class="change-badge">{fileMetadata.get(filepath).changeCount}</span>
                  </div>
                {/if}
              </div>
              <div class="view-btn" aria-hidden="true">{expandedFile === filepath ? 'Hide' : 'Show'} History</div>
            </button>

            {#if expandedFile === filepath}
              <div class="history-expansion" id="file-history-{filepath}">
                <FileHistory filepath={filepath} inline={true} />
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .file-browser {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 8px;
    position: relative;
    gap: 8px;
    overflow-y: auto;
  }

  .browser-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    gap: 6px;
    flex-shrink: 0;
  }

  h3 {
    margin: 0;
    color: var(--text);
    font-size: 11px;
    font-family: var(--mono);
    font-weight: 600;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .project-selector {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-family: var(--mono);
    transition: all 0.2s;
    min-width: 120px;
  }

  .project-selector:hover {
    border-color: var(--info);
  }

  .project-selector:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .refresh-btn,
  .toggle-charts-btn {
    background: var(--surface-2);
    color: var(--info);
    border: 1px solid var(--info);
    padding: 5px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled),
  .toggle-charts-btn:hover {
    background: var(--info);
    color: white;
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading {
    text-align: center;
    padding: 8px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 10px;
  }

  .empty {
    text-align: center;
    padding: 12px 8px;
    color: var(--muted);
  }

  .empty p {
    margin: 0.5rem 0;
    font-size: 10px;
  }

  .hint {
    font-size: 10px;
    color: var(--muted);
  }

  /* Statistics Header */
  .stats-header {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label {
    font-size: 9px;
    color: var(--muted);
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 11px;
    color: var(--text);
    font-family: var(--mono);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* File Type Breakdown */
  .type-breakdown {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    flex-wrap: wrap;
  }

  .breakdown-label {
    font-size: 10px;
    color: var(--muted);
    font-family: var(--mono);
    font-weight: 600;
  }

  .breakdown-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .type-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: var(--surface);
    border: 1px solid;
    border-radius: 3px;
    font-size: 9px;
    font-family: var(--mono);
    color: var(--text);
  }

  .type-count {
    color: var(--muted);
  }

  /* Charts Section */
  .charts-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .chart-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .chart-container {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 8px;
    min-height: 200px;
  }

  .chart-container.full-width {
    grid-column: 1 / -1;
    min-height: 180px;
  }

  /* Controls Section */
  .controls-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-input {
    width: 100%;
    padding: 6px 10px;
    padding-right: 30px;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 10px;
    font-family: var(--mono);
    transition: all 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--info);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  .clear-search-btn {
    position: absolute;
    right: 6px;
    background: none;
    border: none;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    padding: 2px 6px;
    line-height: 1;
    transition: color 0.2s;
  }

  .clear-search-btn:hover {
    color: var(--text);
  }

  .filter-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: 10px;
    color: var(--muted);
    font-family: var(--mono);
    font-weight: 600;
    white-space: nowrap;
  }

  .sort-select {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 10px;
    font-family: var(--mono);
    cursor: pointer;
    transition: all 0.2s;
  }

  .sort-select:hover {
    border-color: var(--info);
  }

  .sort-select:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .sort-order-btn {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .sort-order-btn:hover {
    background: var(--info);
    color: white;
    border-color: var(--info);
  }

  .type-filters {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .type-filter-btn {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 9px;
    font-family: var(--mono);
    transition: all 0.2s;
  }

  .type-filter-btn:hover {
    border-color: var(--type-color);
    background: var(--surface);
  }

  .type-filter-btn.active {
    background: var(--type-color);
    border-color: var(--type-color);
    color: white;
    font-weight: 600;
  }

  /* File List */
  .file-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    overflow-y: auto;
  }

  .no-results {
    text-align: center;
    padding: 16px;
    color: var(--muted);
    font-size: 10px;
    font-family: var(--mono);
  }

  .file-container {
    border: 1px solid var(--border);
    border-radius: 3px;
    overflow: hidden;
    background: var(--surface-2);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    border-bottom: 1px solid transparent;
    width: 100%;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
  }

  .file-item:hover {
    background: var(--surface);
  }

  .file-item.expanded {
    border-bottom-color: var(--border);
    background: var(--surface);
  }

  .file-item:focus {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .expand-arrow {
    font-size: 10px;
    color: var(--muted);
    width: 10px;
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .history-expansion {
    padding: 6px;
    background: var(--bg);
    border-top: 1px solid var(--border);
  }

  .file-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .file-name {
    color: var(--text);
    font-weight: 500;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .recent-badge {
    display: inline-block;
    background: var(--success);
    color: white;
    padding: 2px 6px;
    border-radius: 2px;
    font-size: 8px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .file-path {
    color: var(--muted);
    font-size: 9px;
    font-family: 'Courier New', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-metadata {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .metadata-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .metadata-icon {
    font-size: 10px;
  }

  .change-badge {
    background: var(--info);
    color: white;
    padding: 2px 6px;
    border-radius: 2px;
    font-size: 9px;
    font-weight: 600;
  }

  .view-btn {
    color: var(--info);
    font-size: 9px;
    font-weight: 500;
    white-space: nowrap;
    padding: 4px 8px;
    border-radius: 3px;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .file-item:hover .view-btn {
    background: var(--info);
    color: white;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .stats-header {
      grid-template-columns: repeat(2, 1fr);
    }

    .chart-row {
      grid-template-columns: 1fr;
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
    margin: 16px 0;
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
