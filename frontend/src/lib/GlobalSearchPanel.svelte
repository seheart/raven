<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  import { exportCSV, exportJSON } from './exportUtils.js';
  import { API_CONFIG } from '../config.js';
  import { formatDateTime } from './timeFormat.js';
  import { Chart, registerables } from 'chart.js';
  import DOMPurify from 'dompurify';

  Chart.register(...registerables);

  let searchQuery = '';
  let results = [];
  let allResults = []; // Store all results for pagination
  let loading = false;
  let error = null;
  let filterType = 'all'; // all, event, conversation, error, notification
  let dateRange = 'all'; // all, today, week, month
  let selectedProject = 'all';
  let sortBy = 'relevance'; // relevance, newest, oldest, type
  let searchStartTime = 0;
  let searchDuration = 0;
  let displayLimit = 50;
  let bookmarkedResults = new Set();
  let selectedResults = new Set();

  // Search history
  let searchHistory = [];
  const MAX_HISTORY = 10;

  // Load search history from localStorage
  onMount(() => {
    const saved = localStorage.getItem('raven-search-history');
    if (saved) {
      try {
        searchHistory = JSON.parse(saved);
      } catch (e) {
        logger.error('Failed to load search history', e);
      }
    }
  });

  function saveSearchHistory(query) {
    if (!query || query.trim().length < 2) return;

    // Remove duplicates and add to front
    searchHistory = [query, ...searchHistory.filter(q => q !== query)].slice(0, MAX_HISTORY);
    localStorage.setItem('raven-search-history', JSON.stringify(searchHistory));
  }

  function loadHistoryItem(query) {
    searchQuery = query;
    performSearch();
  }

  function clearHistory() {
    searchHistory = [];
    localStorage.removeItem('raven-search-history');
  }

  const API_BASE = API_CONFIG.API_BASE;

  // Get unique projects from results
  $: projects = [...new Set(results.map(r => r.project_name).filter(Boolean))];

  // Filter and sort results
  $: processedResults = (() => {
    let filtered = allResults;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(r => r.type === filterType);
    }

    // Filter by date range
    if (dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();

      if (dateRange === 'today') {
        cutoff.setHours(0, 0, 0, 0);
      } else if (dateRange === 'week') {
        cutoff.setDate(now.getDate() - 7);
      } else if (dateRange === 'month') {
        cutoff.setDate(now.getDate() - 30);
      }

      filtered = filtered.filter(r => new Date(r.timestamp) >= cutoff);
    }

    // Filter by project
    if (selectedProject !== 'all') {
      filtered = filtered.filter(r => r.project_name === selectedProject);
    }

    // Sort results
    const sorted = [...filtered];
    if (sortBy === 'newest') {
      sorted.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else if (sortBy === 'type') {
      sorted.sort((a, b) => a.type.localeCompare(b.type));
    }
    // relevance is default order from API

    return sorted;
  })();

  $: displayedResults = processedResults.slice(0, displayLimit);
  $: hasMore = processedResults.length > displayLimit;

  // Statistics
  $: stats = (() => {
    const byType = processedResults.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {});

    const byProject = processedResults.reduce((acc, r) => {
      if (r.project_name) {
        acc[r.project_name] = (acc[r.project_name] || 0) + 1;
      }
      return acc;
    }, {});

    const types = Object.entries(byType);
    const mostCommonType = types.length > 0
      ? types.reduce((a, b) => a[1] > b[1] ? a : b)[0]
      : '';

    return {
      total: processedResults.length,
      byType,
      byProject,
      mostCommonType
    };
  })();

  // Chart.js instances
  let typeChartCanvas;
  let projectChartCanvas;
  let timelineChartCanvas;
  let typeChart = null;
  let projectChart = null;
  let timelineChart = null;
  let themeObserver = null;

  // Theme-aware colors
  function getThemeColors() {
    const style = getComputedStyle(document.body);
    const getColor = (varName, fallback) => {
      const value = style.getPropertyValue(varName).trim();
      return (value && (value.startsWith('#') || value.startsWith('rgb'))) ? value : fallback;
    };

    return {
      text: getColor('--text', '#c0caf5'),
      muted: getColor('--muted', '#565f89'),
      accent: getColor('--accent', 'var(--info)'),
      success: getColor('--success', 'var(--success)'),
      error: getColor('--error', 'var(--error)'),
      warning: getColor('--warning', 'var(--warning)'),
      surface: getColor('--surface', '#1a1b26'),
      border: getColor('--border', '#24283b')
    };
  }

  // Reactive aria-labels for chart accessibility
  $: typeBreakdownAriaLabel = (() => {
    const typeData = {
      event: stats.byType.event || 0,
      conversation: stats.byType.conversation || 0,
      error: stats.byType.error || 0,
      notification: stats.byType.notification || 0
    };
    const topTypes = Object.entries(typeData).filter(([_, count]) => count > 0).slice(0, 3);
    if (topTypes.length === 0) return 'Results by type chart: No results available';
    const summary = topTypes.map(([type, count]) => `${type}: ${count}`).join(', ');
    return `Results by type chart showing ${stats.total} total results. ${summary}`;
  })();

  $: projectDistributionAriaLabel = (() => {
    const projectEntries = Object.entries(stats.byProject).slice(0, 3);
    if (projectEntries.length === 0) return 'Results by project chart: No project data available';
    const summary = projectEntries.map(([name, count]) => `${name}: ${count} results`).join(', ');
    return `Results by project chart. Top projects: ${summary}`;
  })();

  $: timelineAriaLabel = (() => {
    const recentResults = processedResults.filter(r => {
      const date = new Date(r.timestamp);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      return date >= cutoff;
    });
    return `Results timeline chart showing ${recentResults.length} results over the last 30 days`;
  })();

  function updateCharts() {
    if (!processedResults.length) return;

    const colors = getThemeColors();
    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: colors.text,
            font: { size: 10, family: 'JetBrains Mono, monospace' }
          }
        }
      }
    };

    // Type distribution pie chart
    if (typeChartCanvas) {
      if (typeChart) typeChart.destroy();

      const typeData = {
        event: stats.byType.event || 0,
        conversation: stats.byType.conversation || 0,
        error: stats.byType.error || 0,
        notification: stats.byType.notification || 0
      };

      typeChart = new Chart(typeChartCanvas, {
        type: 'pie',
        data: {
          labels: ['File Events', 'Conversations', 'Errors', 'Notifications'],
          datasets: [{
            data: [typeData.event, typeData.conversation, typeData.error, typeData.notification],
            backgroundColor: [colors.accent, colors.success, colors.error, colors.warning],
            borderColor: colors.surface,
            borderWidth: 2
          }]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            title: {
              display: true,
              text: 'Results by Type',
              color: colors.text,
              font: { size: 11, family: 'JetBrains Mono, monospace', weight: 'bold' }
            }
          }
        }
      });
    }

    // Project distribution bar chart
    if (projectChartCanvas && Object.keys(stats.byProject).length > 0) {
      if (projectChart) projectChart.destroy();

      const projectEntries = Object.entries(stats.byProject).slice(0, 10);
      projectChart = new Chart(projectChartCanvas, {
        type: 'bar',
        data: {
          labels: projectEntries.map(([name]) => name),
          datasets: [{
            label: 'Results',
            data: projectEntries.map(([, count]) => count),
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            borderWidth: 1
          }]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            legend: { display: false },
            title: {
              display: true,
              text: 'Results by Project',
              color: colors.text,
              font: { size: 11, family: 'JetBrains Mono, monospace', weight: 'bold' }
            }
          },
          scales: {
            x: {
              ticks: { color: colors.muted, font: { size: 9 } },
              grid: { color: colors.border }
            },
            y: {
              ticks: { color: colors.muted, font: { size: 9 } },
              grid: { color: colors.border }
            }
          }
        }
      });
    }

    // Timeline bar chart (last 30 days)
    if (timelineChartCanvas) {
      if (timelineChart) timelineChart.destroy();

      const last30Days = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        last30Days.push(date);
      }

      const timelineData = last30Days.map(date => {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        return processedResults.filter(r => {
          const rDate = new Date(r.timestamp);
          return rDate >= date && rDate < nextDay;
        }).length;
      });

      timelineChart = new Chart(timelineChartCanvas, {
        type: 'bar',
        data: {
          labels: last30Days.map(d => `${d.getMonth() + 1}/${d.getDate()}`),
          datasets: [{
            label: 'Results',
            data: timelineData,
            backgroundColor: colors.success,
            borderColor: colors.success,
            borderWidth: 1
          }]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            legend: { display: false },
            title: {
              display: true,
              text: 'Results Timeline (Last 30 Days)',
              color: colors.text,
              font: { size: 11, family: 'JetBrains Mono, monospace', weight: 'bold' }
            }
          },
          scales: {
            x: {
              ticks: {
                color: colors.muted,
                font: { size: 8 },
                maxRotation: 45,
                minRotation: 45
              },
              grid: { color: colors.border }
            },
            y: {
              ticks: { color: colors.muted, font: { size: 9 } },
              grid: { color: colors.border }
            }
          }
        }
      });
    }
  }

  $: if (processedResults.length > 0) {
    setTimeout(updateCharts, 100);
  }

  let searchTimeout;
  function handleSearchInput() {
    clearTimeout(searchTimeout);
    if (searchQuery.trim().length < 2) {
      results = [];
      allResults = [];
      total = 0;
      return;
    }
    searchTimeout = setTimeout(() => {
      performSearch();
    }, 300); // Debounce
  }

  async function performSearch() {
    if (searchQuery.trim().length < 2) return;

    try {
      loading = true;
      searchStartTime = performance.now();

      const response = await fetch(`${API_BASE}/search/global?q=${encodeURIComponent(searchQuery)}&limit=1000`);

      const data = await response.json();
      allResults = data.results || [];
      results = allResults;
      categories = data.categories || {};
      total = data.total || 0;
      error = null;

      searchDuration = Math.round(performance.now() - searchStartTime);
      saveSearchHistory(searchQuery);

      // Reset pagination
      displayLimit = 50;
    } catch (err) {
      logger.error('Search error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function loadMore() {
    displayLimit += 50;
  }

  function toggleBookmark(result) {
    const key = `${result.type}-${result.id}`;
    if (bookmarkedResults.has(key)) {
      bookmarkedResults.delete(key);
    } else {
      bookmarkedResults.add(key);
    }
    bookmarkedResults = bookmarkedResults;
  }

  function isBookmarked(result) {
    return bookmarkedResults.has(`${result.type}-${result.id}`);
  }

  function toggleSelect(result) {
    const key = `${result.type}-${result.id}`;
    if (selectedResults.has(key)) {
      selectedResults.delete(key);
    } else {
      selectedResults.add(key);
    }
    selectedResults = selectedResults;
  }

  function isSelected(result) {
    return selectedResults.has(`${result.type}-${result.id}`);
  }

  function selectAll() {
    displayedResults.forEach(r => {
      selectedResults.add(`${r.type}-${r.id}`);
    });
    selectedResults = selectedResults;
  }

  function deselectAll() {
    selectedResults.clear();
    selectedResults = selectedResults;
  }

  function exportSelected() {
    const selected = displayedResults.filter(r => isSelected(r));
    if (selected.length === 0) return;

    const data = selected.map(r => ({
      Type: getTypeLabel(r.type),
      Title: r.title,
      Description: r.description,
      Content: r.content || '',
      Project: r.project_name || '',
      Timestamp: r.timestamp
    }));
    exportCSV(data, `search-results-selected-${selected.length}`);
  }

  function highlightText(text, query) {
    if (!query || !text) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, _i) =>
      part.toLowerCase() === query.toLowerCase()
        ? `<mark>${part}</mark>`
        : part
    ).join('');
  }

  function getPreview(result) {
    const text = result.description || result.content || result.title || '';
    return text.substring(0, 100) + (text.length > 100 ? '...' : '');
  }

  function getTypeLabel(type) {
    return {
      event: 'File Event',
      conversation: 'Conversation',
      error: 'Error',
      notification: 'Notification'
    }[type] || type;
  }

  function getTypeClass(type) {
    return `type-${type}`;
  }

  function formatTimestamp(timestamp) {
    return formatDateTime(timestamp);
  }

  function clearSearch() {
    searchQuery = '';
    results = [];
    allResults = [];
    total = 0;
    displayLimit = 50;
    selectedResults.clear();
    selectedResults = selectedResults;
  }

  function handleExportCSV() {
    const data = processedResults.map(r => ({
      Type: getTypeLabel(r.type),
      Title: r.title,
      Description: r.description,
      Content: r.content || '',
      Project: r.project_name || '',
      Timestamp: r.timestamp
    }));
    exportCSV(data, 'search-results');
  }

  function handleExportJSON() {
    const data = {
      query: searchQuery,
      total: processedResults.length,
      filters: {
        type: filterType,
        dateRange,
        project: selectedProject,
        sortBy
      },
      results: processedResults,
      exported_at: new Date().toISOString()
    };
    exportJSON(data, 'search-results');
  }

  // Focus search input on mount
  let searchInput;
  onMount(() => {
    if (searchInput) searchInput.focus();

    // Observe theme changes
    themeObserver = new MutationObserver(() => {
      if (typeChart || projectChart || timelineChart) {
        updateCharts();
      }
    });

    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  onDestroy(() => {
    // Clean up pending timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Destroy charts
    if (typeChart) typeChart.destroy();
    if (projectChart) projectChart.destroy();
    if (timelineChart) timelineChart.destroy();

    // Disconnect observer
    if (themeObserver) themeObserver.disconnect();
  });
</script>

<div class="global-search-panel" role="region" aria-label="Global search">
  <div class="panel-header">
    <div class="header-left">
      <h2 id="search-heading">Global Search</h2>
      <p class="subtitle">Search across all projects, files, conversations, and events</p>
    </div>
    <div class="header-right" role="toolbar" aria-label="Search actions">
      {#if processedResults.length > 0}
        <button class="btn btn-primary btn-sm" on:click={handleExportCSV} aria-label="Export results as CSV">Export CSV</button>
        <button class="btn btn-primary btn-sm" on:click={handleExportJSON} aria-label="Export results as JSON">Export JSON</button>
        {#if selectedResults.size > 0}
          <button class="btn btn-primary btn-sm" on:click={exportSelected} aria-label="Export selected results">Export Selected ({selectedResults.size})</button>
        {/if}
      {/if}
    </div>
  </div>

  <div class="search-bar-container" role="search" aria-labelledby="search-heading">
    <div class="search-bar">
      <input
        bind:this={searchInput}
        type="search"
        placeholder="Search files, conversations, errors, notifications..."
        bind:value={searchQuery}
        on:input={handleSearchInput}
        class="search-input"
        aria-label="Search query"
        aria-describedby="search-hint"
      />
      {#if searchQuery}
        <button class="btn btn-ghost btn-sm" on:click={clearSearch} aria-label="Clear search">Clear</button>
      {/if}
    </div>

    {#if searchHistory.length > 0 && !searchQuery}
      <div class="search-history">
        <div class="history-header">
          <span class="history-title">Recent Searches</span>
          <button class="btn btn-ghost btn-sm" on:click={clearHistory}>Clear</button>
        </div>
        <div class="history-items">
          {#each searchHistory as historyItem (historyItem)}
            <button class="history-item" on:click={() => loadHistoryItem(historyItem)}>
              {historyItem}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="search-hint" id="search-hint" role="status" aria-live="polite">
      {#if searchQuery.length > 0 && searchQuery.length < 2}
        <span>Type at least 2 characters to search</span>
      {:else if loading}
        <span>Searching...</span>
      {:else if processedResults.length > 0}
        <span>Found {processedResults.length} result{processedResults.length !== 1 ? 's' : ''} for "{searchQuery}" {searchDuration > 0 ? `(${searchDuration}ms)` : ''}</span>
      {:else if searchQuery.length >= 2}
        <span>No results found for "{searchQuery}"</span>
      {:else}
        <span>Start typing to search</span>
      {/if}
    </div>
  </div>

  {#if processedResults.length > 0}
    <!-- Advanced Filters -->
    <div class="advanced-filters">
      <div class="filter-group">
        <label for="date-range">Date Range:</label>
        <select id="date-range" bind:value={dateRange} class="filter-select">
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
        </select>
      </div>

      {#if projects.length > 0}
        <div class="filter-group">
          <label for="project-filter">Project:</label>
          <select id="project-filter" bind:value={selectedProject} class="filter-select">
            <option value="all">All Projects</option>
            {#each projects as project (project)}
              <option value={project}>{project}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="filter-group">
        <label for="sort-by">Sort By:</label>
        <select id="sort-by" bind:value={sortBy} class="filter-select">
          <option value="relevance">Relevance</option>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="type">Type (A-Z)</option>
        </select>
      </div>
    </div>

    <!-- Statistics -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Results</div>
        <div class="stat-value">{stats.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Search Time</div>
        <div class="stat-value">{searchDuration}ms</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Most Common Type</div>
        <div class="stat-value">{stats.mostCommonType ? getTypeLabel(stats.mostCommonType) : 'N/A'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">File Events</div>
        <div class="stat-value">{stats.byType.event || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Conversations</div>
        <div class="stat-value">{stats.byType.conversation || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Errors</div>
        <div class="stat-value">{stats.byType.error || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Notifications</div>
        <div class="stat-value">{stats.byType.notification || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Selected</div>
        <div class="stat-value">{selectedResults.size}</div>
      </div>
    </div>

    <!-- Charts -->
    <div class="charts-grid">
      <div class="chart-container">
        <div role="img" aria-label={typeBreakdownAriaLabel}>
          <canvas bind:this={typeChartCanvas}></canvas>
        </div>
      </div>
      {#if Object.keys(stats.byProject).length > 0}
        <div class="chart-container">
          <div role="img" aria-label={projectDistributionAriaLabel}>
            <canvas bind:this={projectChartCanvas}></canvas>
          </div>
        </div>
      {/if}
      <div class="chart-container chart-wide">
        <div role="img" aria-label={timelineAriaLabel}>
          <canvas bind:this={timelineChartCanvas}></canvas>
        </div>
      </div>
    </div>

    <!-- Type Filters -->
    <div class="filter-bar" role="tablist" aria-label="Filter search results">
      <button class="btn btn-ghost btn-sm" class:active={filterType === 'all'} on:click={() => filterType = 'all'} role="tab" aria-selected={filterType === 'all'} aria-controls="results-list">
        All ({processedResults.length})
      </button>
      <button class="btn btn-ghost btn-sm" class:active={filterType === 'event'} on:click={() => filterType = 'event'} role="tab" aria-selected={filterType === 'event'} aria-controls="results-list">
        Files ({stats.byType.event || 0})
      </button>
      <button class="btn btn-ghost btn-sm" class:active={filterType === 'conversation'} on:click={() => filterType = 'conversation'} role="tab" aria-selected={filterType === 'conversation'} aria-controls="results-list">
        Conversations ({stats.byType.conversation || 0})
      </button>
      <button class="btn btn-ghost btn-sm" class:active={filterType === 'error'} on:click={() => filterType = 'error'} role="tab" aria-selected={filterType === 'error'} aria-controls="results-list">
        Errors ({stats.byType.error || 0})
      </button>
      <button class="btn btn-ghost btn-sm" class:active={filterType === 'notification'} on:click={() => filterType = 'notification'} role="tab" aria-selected={filterType === 'notification'} aria-controls="results-list">
        Notifications ({stats.byType.notification || 0})
      </button>
    </div>

    <!-- Batch Actions -->
    <div class="batch-actions">
      <button class="btn btn-secondary btn-sm" on:click={selectAll}>Select All</button>
      <button class="btn btn-secondary btn-sm" on:click={deselectAll}>Deselect All</button>
      <span class="batch-info">{selectedResults.size} selected</span>
    </div>
  {/if}

  {#if loading}
    <div role="status" aria-live="polite" aria-busy="true"><LoadingSkeleton /></div>
  {:else if error}
    <div class="error-state" role="alert">
      <p>Search error: {error}</p>
    </div>
  {:else if displayedResults.length > 0}
    <div class="results-list" id="results-list" role="feed" aria-label="Search results" aria-busy="false">
      {#each displayedResults as result (result.type + result.id)}
        <article class="result-card {getTypeClass(result.type)}">
          <div class="result-actions">
            <input
              type="checkbox"
              checked={isSelected(result)}
              on:change={() => toggleSelect(result)}
              class="result-checkbox"
              aria-label="Select result"
            />
            <button
              class="btn btn-ghost btn-icon"
              class:bookmarked={isBookmarked(result)}
              on:click={() => toggleBookmark(result)}
              aria-label={isBookmarked(result) ? 'Remove bookmark' : 'Bookmark result'}
            >
              {isBookmarked(result) ? '★' : '☆'}
            </button>
          </div>
          <div class="result-header">
            <span class="result-icon" aria-hidden="true">{result.icon}</span>
            <div class="result-meta">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              <div class="result-title">{@html DOMPurify.sanitize(highlightText(result.title, searchQuery))}</div>
              <div class="result-info">
                <span class="result-type">{getTypeLabel(result.type)}</span>
                {#if result.project_name}
                  <span class="result-project">{result.project_name}</span>
                {/if}
                <time class="result-timestamp" datetime="{result.timestamp}">{formatTimestamp(result.timestamp)}</time>
              </div>
            </div>
          </div>
          {#if result.description || result.content}
            <div class="result-preview">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html DOMPurify.sanitize(highlightText(getPreview(result), searchQuery))}
            </div>
          {/if}
        </article>
      {/each}
    </div>

    {#if hasMore}
      <div class="load-more-container">
        <button class="btn btn-primary btn-md" on:click={loadMore}>
          Load More ({processedResults.length - displayLimit} remaining)
        </button>
      </div>
    {/if}
  {:else if searchQuery.length === 0}
    <div class="empty-state" role="status">
      <div class="empty-icon">🔍</div>
      <p>Search across your entire Raven database</p>
      <p class="hint">Find files, conversations, errors, and notifications instantly</p>
      <div class="search-tips">
        <h3>Search Tips:</h3>
        <ul>
          <li>Search by filename: <code>server.js</code></li>
          <li>Find conversations: <code>claude</code></li>
          <li>Track errors: <code>failed</code></li>
          <li>Filter by project name</li>
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .global-search-panel {
    padding: var(--space-lg);
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-lg);
  }

  .header-left h2 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 11px;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }

  .header-right {
    display: flex;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .search-bar-container {
    margin-bottom: var(--space-lg);
  }

  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-md) var(--space-lg);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .search-bar:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 11px;
    font-family: var(--mono);
    outline: none;
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  /* Button styles removed - using global .btn classes */

  .search-history {
    margin-top: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
  }

  .history-title {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  /* Button styles removed - using global .btn classes */

  .history-items {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
  }

  .history-item {
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    cursor: pointer;
    font-size: 11px;
    font-family: var(--mono);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .history-item:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .search-hint {
    margin-top: var(--space-lg);
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .advanced-filters {
    display: flex;
    gap: var(--space-xl);
    margin-bottom: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .filter-group label {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .filter-select {
    padding: var(--space-sm) var(--space-lg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 11px;
    font-family: var(--mono);
    cursor: pointer;
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .filter-select:hover {
    border-color: var(--accent);
  }

  .filter-select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .stat-card {
    padding: var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
  }

  .stat-label {
    font-size: 10px;
    color: var(--muted);
    font-family: var(--mono);
    margin-bottom: var(--space-sm);
  }

  .stat-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    font-family: var(--mono);
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .chart-container {
    height: 200px;
    padding: var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .chart-wide {
    grid-column: 1 / -1;
    height: 150px;
  }

  .filter-bar {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }

  /* Button styles removed - using global .btn classes */

  .batch-actions {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    margin-bottom: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .batch-info {
    margin-left: auto;
    font-size: 11px;
    color: var(--muted);
    font-family: var(--mono);
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .result-card {
    position: relative;
    padding: var(--space-lg);
    padding-left: 40px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid;
    border-radius: var(--radius);
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .result-card:hover {
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .result-card.type-event {
    border-left-color: var(--accent);
  }

  .result-card.type-conversation {
    border-left-color: var(--success);
  }

  .result-card.type-error {
    border-left-color: var(--error);
  }

  .result-card.type-notification {
    border-left-color: var(--warning);
  }

  .result-actions {
    position: absolute;
    left: 8px;
    top: 8px;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    align-items: center;
  }

  .result-checkbox {
    cursor: pointer;
    width: 14px;
    height: 14px;
  }

  /* Button styles removed - using global .btn classes */

  .result-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .result-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .result-meta {
    flex: 1;
    min-width: 0;
  }

  .result-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--mono);
    margin-bottom: var(--space-md);
    word-break: break-all;
  }

  .result-title :global(mark) {
    background: var(--warning);
    color: var(--surface);
    padding: var(--space-xs) var(--space-xs);
    border-radius: 2px;
  }

  .result-info {
    display: flex;
    gap: var(--space-md);
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--muted);
  }

  .result-type {
    background: var(--bg);
    padding: var(--space-xs) var(--space-lg);
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 10px;
  }

  .result-project, .result-timestamp {
    font-family: var(--mono);
    font-size: 10px;
  }

  .result-preview {
    margin-top: var(--space-lg);
    font-size: 11px;
    color: var(--muted);
    line-height: 1.5;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  .result-preview :global(mark) {
    background: var(--warning);
    color: var(--surface);
    padding: var(--space-xs) var(--space-xs);
    border-radius: 2px;
  }

  .load-more-container {
    text-align: center;
    margin-top: var(--space-xl);
  }

  /* Button styles removed - using global .btn classes */

  .empty-state {
    text-align: center;
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .empty-icon {
    font-size: 11px;
    margin-bottom: var(--space-lg);
  }

  .empty-state p {
    margin: var(--space-lg) 0;
    color: var(--text);
  }

  .hint {
    font-size: 11px;
    color: var(--muted);
  }

  .search-tips {
    margin-top: var(--space-4xl);
    text-align: left;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
  }

  .search-tips h3 {
    font-size: 11px;
    color: var(--text);
    margin-bottom: var(--space-md);
  }

  .search-tips ul {
    list-style: none;
    padding: 0;
  }

  .search-tips li {
    padding: var(--space-lg) 0;
    color: var(--muted);
    font-size: 11px;
  }

  .search-tips code {
    background: var(--bg);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-sm);
    font-family: var(--mono);
    color: var(--accent);
  }

  /* Button styles removed - using global .btn classes */

  .error-state {
    text-align: center;
    padding: var(--space-lg) var(--space-xl);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .error-state p {
    margin: var(--space-lg) 0;
    color: var(--error);
    font-size: 11px;
  }

  @media (max-width: 768px) {
    .panel-header {
      flex-direction: column;
      gap: var(--space-lg);
    }

    .header-right {
      flex-direction: column;
    }

    .advanced-filters {
      flex-direction: column;
    }

    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .charts-grid {
      grid-template-columns: 1fr;
    }

    .filter-bar {
      flex-direction: column;
    }

    .batch-actions {
      flex-direction: column;
      align-items: flex-start;
    }

    .batch-info {
      margin-left: 0;
    }

    .result-info {
      flex-direction: column;
      gap: var(--space-sm);
    }
  }
</style>
