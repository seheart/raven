<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { formatShortDateTime } from './timeFormat.js';
  import DiffViewer from './DiffViewer.svelte';

  const API_BASE = 'http://localhost:3030';

  let gitStatus = {
    available: false,
    branch: 'unknown',
    modified: [],
    created: [],
    deleted: [],
    branches: [],
    commits: [],
    ahead: 0,
    behind: 0
  };

  // Computed values
  $: uncommittedFiles = gitStatus.modified.length + gitStatus.created.length + gitStatus.deleted.length;
  $: unpublishedCommits = gitStatus.ahead || 0;

  let refreshInterval;
  let isMounted = false;
  let isRefreshing = false;
  let repositoryName = 'Loading...';

  // Diff viewer state
  let showDiffViewer = false;
  let currentDiff = '';
  let currentFile = '';

  // Inline diff state
  let expandedFile = null;
  let fileDiffs = new Map(); // Cache diffs for expanded files

  function formatCommitDate(date) {
    return formatShortDateTime(date);
  }

  async function loadRepositoryName() {
    try {
      const res = await fetch(`${API_BASE}/api/projects/list`);
      const data = await res.json();
      repositoryName = data.active || 'Unknown';
    } catch (error) {
      repositoryName = 'Unknown';
      console.error('Error loading repository name:', error);
    }
  }

  async function checkGitStatus() {
    if (!isMounted) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const [statusRes, branchesRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/api/git/status`, { signal: controller.signal }),
        fetch(`${API_BASE}/api/git/branches`, { signal: controller.signal }),
        fetch(`${API_BASE}/api/git/history?limit=10`, { signal: controller.signal })
      ]).finally(() => clearTimeout(timeoutId));

      const statusData = await statusRes.json();
      const branchesData = await branchesRes.json();
      const historyData = await historyRes.json();

      gitStatus = {
        available: true,
        branch: statusData.branch || 'unknown',
        modified: statusData.modified || [],
        created: statusData.created || [],
        deleted: statusData.deleted || [],
        branches: branchesData.branches || [],
        commits: historyData.commits || [],
        ahead: statusData.ahead || 0,
        behind: statusData.behind || 0
      };
    } catch (error) {
      gitStatus.available = false;
    }
  }

  async function manualRefresh() {
    isRefreshing = true;
    await checkGitStatus();
    setTimeout(() => { isRefreshing = false; }, 500);
  }

  async function showFileDiff(filepath) {
    // Toggle: if clicking the same file, collapse it
    if (expandedFile === filepath) {
      expandedFile = null;
      return;
    }

    // Expand the new file
    expandedFile = filepath;

    // Fetch diff if not cached
    if (!fileDiffs.has(filepath)) {
      try {
        const res = await fetch(`${API_BASE}/api/git/diff/${encodeURIComponent(filepath)}`);
        const data = await res.json();
        fileDiffs.set(filepath, data.diff || '');
        fileDiffs = fileDiffs; // Trigger reactivity
      } catch (error) {
        console.error('Error fetching diff:', error);
        fileDiffs.set(filepath, 'Error loading diff');
        fileDiffs = fileDiffs;
      }
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

  function closeDiffViewer() {
    showDiffViewer = false;
    currentDiff = '';
    currentFile = '';
  }

  // WebSocket event handlers
  const handleGitStatusUpdated = (data) => {
    console.log('🔀 Git status updated via WebSocket');
    gitStatus = {
      available: true,
      branch: data.branch || 'unknown',
      modified: data.modified || [],
      created: data.created || [],
      deleted: data.deleted || [],
      branches: gitStatus.branches, // Keep existing branches
      commits: gitStatus.commits, // Keep existing commits
      ahead: data.ahead || 0,
      behind: data.behind || 0
    };
  };

  const handleProjectSwitched = () => {
    console.log('📡 Project switched, refreshing git status');
    loadRepositoryName();
    checkGitStatus();
  };

  onMount(async () => {
    isMounted = true;
    await loadRepositoryName();
    await checkGitStatus();
    websocketService.connect();

    refreshInterval = setInterval(() => {
      checkGitStatus();
    }, 5000);

    // Listen for real-time git status updates
    websocketService.on('git-status-updated', handleGitStatusUpdated);

    // Listen for project switches
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    isMounted = false;
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Clean up WebSocket listeners
    websocketService.off('git-status-updated', handleGitStatusUpdated);
    websocketService.off('project-switched', handleProjectSwitched);
  });
</script>

<div class="git-panel">
  <div class="panel-header">
    <div class="header-title">
      <h1>🌳 Git Repository</h1>
      <div class="repo-name">{repositoryName}</div>
      <div class="status-badge" class:available={gitStatus.available} class:unavailable={!gitStatus.available}>
        {gitStatus.available ? '🟢 Available' : '⚫ Not a Git Repo'}
      </div>
    </div>
    <div class="header-stats">
      <div class="header-stat">
        <div class="stat-label">Uncommitted Files</div>
        <div class="stat-value" class:has-changes={uncommittedFiles > 0}>{uncommittedFiles}</div>
      </div>
      <div class="header-stat">
        <div class="stat-label">Unpublished Commits</div>
        <div class="stat-value" class:has-changes={unpublishedCommits > 0}>{unpublishedCommits}</div>
      </div>
      <button class="btn-refresh" on:click={manualRefresh} disabled={isRefreshing}>
        {isRefreshing ? '⏳' : '🔄'} Refresh
      </button>
    </div>
  </div>

  {#if !gitStatus.available}
    <div class="empty-state">
      <div class="empty-icon">📂</div>
      <h2>Not a Git Repository</h2>
      <p>This project is not tracked with Git, or Git monitoring is disabled.</p>
    </div>
  {:else}
    <div class="git-content">
      <!-- Current Branch -->
      <section class="git-section">
        <div class="section-header">
          <h2>📍 Current Branch</h2>
        </div>
        <div class="section-content">
          <div class="branch-info">
            <div class="info-row">
              <span class="label">Active Branch:</span>
              <span class="value branch-name">{gitStatus.branch}</span>
            </div>
            <div class="stats-row">
              <div class="stat-card modified">
                <div class="stat-icon">📝</div>
                <div class="stat-details">
                  <div class="stat-value">{gitStatus.modified.length}</div>
                  <div class="stat-label">Modified</div>
                </div>
              </div>
              <div class="stat-card created">
                <div class="stat-icon">➕</div>
                <div class="stat-details">
                  <div class="stat-value">{gitStatus.created.length}</div>
                  <div class="stat-label">Added</div>
                </div>
              </div>
              <div class="stat-card deleted">
                <div class="stat-icon">🗑️</div>
                <div class="stat-details">
                  <div class="stat-value">{gitStatus.deleted.length}</div>
                  <div class="stat-label">Deleted</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Changed Files -->
      {#if gitStatus.modified.length > 0 || gitStatus.created.length > 0 || gitStatus.deleted.length > 0}
        <section class="git-section">
          <div class="section-header">
            <h2>📝 Changed Files</h2>
            <span class="count-badge">{gitStatus.modified.length + gitStatus.created.length + gitStatus.deleted.length}</span>
          </div>
          <div class="section-content">
            <div class="files-list">
              {#each gitStatus.modified as file}
                <div class="file-wrapper">
                  <div class="file-item modified" class:expanded={expandedFile === file} on:click={() => showFileDiff(file)}>
                    <span class="expand-arrow">{expandedFile === file ? '▼' : '▶'}</span>
                    <span class="file-icon">📝</span>
                    <span class="file-path">{file}</span>
                    <span class="file-status">Modified</span>
                  </div>
                  {#if expandedFile === file && fileDiffs.has(file)}
                    <div class="inline-diff">
                      {#each parseDiffLines(fileDiffs.get(file)) as line}
                        <div class="diff-line {line.type}">
                          <span class="line-number">{line.lineNum}</span>
                          <code class="line-content">{line.text}</code>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
              {#each gitStatus.created as file}
                <div class="file-wrapper">
                  <div class="file-item created" class:expanded={expandedFile === file} on:click={() => showFileDiff(file)}>
                    <span class="expand-arrow">{expandedFile === file ? '▼' : '▶'}</span>
                    <span class="file-icon">➕</span>
                    <span class="file-path">{file}</span>
                    <span class="file-status">Added</span>
                  </div>
                  {#if expandedFile === file && fileDiffs.has(file)}
                    <div class="inline-diff">
                      {#each parseDiffLines(fileDiffs.get(file)) as line}
                        <div class="diff-line {line.type}">
                          <span class="line-number">{line.lineNum}</span>
                          <code class="line-content">{line.text}</code>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
              {#each gitStatus.deleted as file}
                <div class="file-item deleted">
                  <span class="file-icon">🗑️</span>
                  <span class="file-path">{file}</span>
                  <span class="file-status">Deleted</span>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}

      <!-- All Branches -->
      {#if gitStatus.branches.length > 0}
        <section class="git-section">
          <div class="section-header">
            <h2>🌿 All Branches</h2>
            <span class="count-badge">{gitStatus.branches.length}</span>
          </div>
          <div class="section-content">
            <div class="branches-grid">
              {#each gitStatus.branches as branch}
                <div class="branch-tag" class:active={branch === gitStatus.branch}>
                  {branch === gitStatus.branch ? '● ' : ''}{branch}
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}

      <!-- Recent Commits -->
      {#if gitStatus.commits.length > 0}
        <section class="git-section">
          <div class="section-header">
            <h2>📜 Recent Commits</h2>
            <span class="count-badge">{gitStatus.commits.length}</span>
          </div>
          <div class="section-content">
            <div class="commits-list">
              {#each gitStatus.commits as commit}
                <div class="commit-item">
                  <div class="commit-header">
                    <span class="commit-hash">{commit.hash.slice(0, 7)}</span>
                    <span class="commit-date">{formatCommitDate(commit.date)}</span>
                  </div>
                  <div class="commit-message">{commit.message}</div>
                  <div class="commit-author">{commit.author}</div>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

{#if showDiffViewer}
  <DiffViewer diff={currentDiff} onClose={closeDiffViewer} />
{/if}

<style>
  .git-panel {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-stats {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .header-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--mono);
  }

  .stat-value.has-changes {
    color: var(--accent);
  }

  .header-title h1 {
    margin: 0;
    font-size: 28px;
    color: var(--text);
  }

  .repo-name {
    font-family: var(--mono);
    font-size: 14px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    padding: 6px 14px;
    border-radius: 6px;
    font-weight: 600;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .status-badge {
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }

  .status-badge.available {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .status-badge.unavailable {
    background: color-mix(in srgb, var(--muted) 20%, transparent);
    color: var(--muted);
  }

  .btn-refresh {
    padding: 8px 16px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .btn-refresh:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .btn-refresh:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: var(--muted);
  }

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  .empty-state h2 {
    font-size: 24px;
    margin: 0 0 8px 0;
    color: var(--text);
  }

  .empty-state p {
    font-size: 14px;
    margin: 0;
  }

  .git-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .git-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .section-header h2 {
    margin: 0;
    font-size: 16px;
    color: var(--text);
  }

  .count-badge {
    background: var(--accent);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
  }

  .section-content {
    padding: 20px;
  }

  .branch-info {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    font-size: 13px;
    color: var(--muted);
    font-weight: 500;
  }

  .value {
    font-size: 14px;
    color: var(--text);
  }

  .branch-name {
    font-family: var(--mono);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    padding: 4px 12px;
    border-radius: 6px;
    font-weight: 600;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .stat-card:hover {
    background: var(--surface-2);
    transform: translateY(-2px);
  }

  .stat-icon {
    font-size: 32px;
  }

  .stat-details {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 600;
  }

  .stat-card.modified {
    border-left: 3px solid var(--info);
  }

  .stat-card.created {
    border-left: 3px solid var(--success);
  }

  .stat-card.deleted {
    border-left: 3px solid var(--error);
  }

  .files-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.2s;
    cursor: pointer;
  }

  .file-item.expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .file-item:hover {
    background: var(--surface-2);
    border-color: var(--accent);
    transform: translateX(4px);
  }

  .file-item.expanded:hover {
    transform: none;
  }

  .file-item.deleted {
    opacity: 0.7;
    cursor: default;
  }

  .file-item.deleted:hover {
    transform: none;
    border-color: var(--border);
  }

  .expand-arrow {
    font-size: 10px;
    color: var(--muted);
    width: 12px;
    flex-shrink: 0;
    transition: transform 0.2s;
  }

  .file-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .file-path {
    flex: 1;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-status {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 4px;
    font-weight: 700;
    flex-shrink: 0;
    text-transform: uppercase;
  }

  .file-item.modified .file-status {
    background: color-mix(in srgb, var(--info) 20%, transparent);
    color: var(--info);
  }

  .file-item.created .file-status {
    background: color-mix(in srgb, var(--success) 20%, transparent);
    color: var(--success);
  }

  .file-item.deleted .file-status {
    background: color-mix(in srgb, var(--error) 20%, transparent);
    color: var(--error);
  }

  .branches-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }

  .branch-tag {
    padding: 10px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    transition: all 0.2s;
  }

  .branch-tag:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .branch-tag.active {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }

  .commits-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .commit-item {
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: all 0.2s;
  }

  .commit-item:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .commit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .commit-hash {
    font-family: var(--mono);
    font-size: 12px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .commit-date {
    font-size: 11px;
    color: var(--muted);
  }

  .commit-message {
    font-size: 14px;
    color: var(--text);
    margin-bottom: 6px;
    line-height: 1.4;
  }

  .commit-author {
    font-size: 11px;
    color: var(--muted);
    font-style: italic;
  }

  /* Inline Diff Viewer */
  .inline-diff {
    background: var(--bg);
    border: 1px solid var(--accent);
    border-top: none;
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
    overflow-x: auto;
    max-height: 600px;
    overflow-y: auto;
    font-family: 'Courier New', 'Consolas', monospace;
  }

  .diff-line {
    display: flex;
    align-items: stretch;
    font-size: 11px;
    line-height: 1.6;
    min-height: 20px;
    transition: background 0.1s ease;
  }

  .diff-line:hover {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .diff-line.add {
    background: color-mix(in srgb, #22c55e 15%, transparent);
    border-left: 3px solid #22c55e;
  }

  .diff-line.remove {
    background: color-mix(in srgb, #ef4444 15%, transparent);
    border-left: 3px solid #ef4444;
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
    width: 50px;
    padding: 2px 12px;
    color: var(--muted);
    text-align: right;
    user-select: none;
    font-size: 10px;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--bg) 50%, var(--surface));
  }

  .diff-line.add .line-number {
    color: #22c55e;
  }

  .diff-line.remove .line-number {
    color: #ef4444;
  }

  .line-content {
    flex: 1;
    padding: 2px 12px;
    white-space: pre;
    overflow-x: auto;
    color: var(--text);
    font-family: inherit;
  }

  .diff-line.add .line-content {
    color: #22c55e;
  }

  .diff-line.remove .line-content {
    color: #ef4444;
  }

  .inline-diff::-webkit-scrollbar {
    height: 6px;
    width: 6px;
  }

  .inline-diff::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  @media (max-width: 768px) {
    .git-panel {
      padding: 16px;
    }

    .header-title h1 {
      font-size: 20px;
    }

    .stats-row {
      grid-template-columns: 1fr;
    }

    .branches-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
