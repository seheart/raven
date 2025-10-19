<script>
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';

  const API_BASE = 'http://localhost:3030/api';

  let fileTree = {};
  let expandedFolders = new Set();
  let changedFiles = new Set();
  let selectedFile = null;
  let codeChanges = [];
  let recentActivity = [];
  let loading = true;
  let refreshInterval;
  let flatItems = [];
  let reloadTimeout;

  // Debounce function
  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Debounced reload functions
  const debouncedLoadChanges = debounce(async () => {
    await loadCodeChanges();
    await loadRecentActivity();
  }, 300);

  onMount(async () => {
    await loadAllData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();

    // Listen for file change events (debounced)
    websocketService.on('file-change', (data) => {
      console.log('File change detected:', data);
      debouncedLoadChanges();
    });

    // Listen for agent events (debounced)
    websocketService.on('agent-event', () => {
      debouncedLoadChanges();
    });

    // Refresh every 30 seconds (reduced frequency)
    refreshInterval = setInterval(loadAllData, 30000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    websocketService.off('file-change');
    websocketService.off('agent-event');
  });

  async function loadAllData() {
    await Promise.all([
      loadFileTree(),
      loadCodeChanges(),
      loadRecentActivity()
    ]);
    loading = false;
  }

  async function loadFileTree() {
    try {
      const [filesRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/tracked-files`),
        fetch(`${API_BASE}/file-events?limit=100`)
      ]);

      const files = await filesRes.json();
      const events = await eventsRes.json();

      // Track changed files
      changedFiles = new Set(events.map(e => e.filepath).filter(Boolean));

      // Build tree structure
      fileTree = buildTree(files);

      // Update flattened tree
      flatItems = flattenTree(fileTree);
    } catch (error) {
      console.error('Failed to load file tree:', error);
    }
  }

  async function loadCodeChanges() {
    try {
      const res = await fetch(`${API_BASE}/file-events?limit=50&diff=true`);
      const data = await res.json();
      codeChanges = data;
    } catch (error) {
      console.error('Failed to load code changes:', error);
    }
  }

  async function loadRecentActivity() {
    try {
      // Get both file events and agent events
      const [fileEventsRes, agentEventsRes] = await Promise.all([
        fetch(`${API_BASE}/file-events?limit=20`),
        fetch(`${API_BASE}/agent-events?limit=20`)
      ]);

      const fileEvents = await fileEventsRes.json();
      const agentEvents = await agentEventsRes.json();

      // Combine and sort by timestamp
      const combined = [
        ...fileEvents.map(e => ({ ...e, type: 'file' })),
        ...agentEvents.map(e => ({ ...e, type: 'agent' }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      recentActivity = combined.slice(0, 30);
    } catch (error) {
      console.error('Failed to load recent activity:', error);
    }
  }

  function buildTree(files) {
    const tree = {};

    for (const filepath of files) {
      const parts = filepath.split('/');
      let current = tree;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;

        if (!current[part]) {
          current[part] = isFile ? { _file: true, _path: filepath } : {};
        }

        if (!isFile) {
          current = current[part];
        }
      }
    }

    return tree;
  }

  // Optimized folder toggle with immediate UI update
  function toggleFolder(path) {
    if (expandedFolders.has(path)) {
      expandedFolders.delete(path);
    } else {
      expandedFolders.add(path);
    }
    // Immediately update flat items for responsive UI
    flatItems = flattenTree(fileTree);
  }

  function selectFile(filepath) {
    selectedFile = filepath;
  }

  function flattenTree(tree, path = '', level = 0) {
    const items = [];

    for (const [name, value] of Object.entries(tree).sort()) {
      const currentPath = path ? `${path}/${name}` : name;

      if (value && value._file) {
        // It's a file
        items.push({
          type: 'file',
          name,
          path: value._path,
          level,
          hasChanges: changedFiles.has(value._path)
        });
      } else {
        // It's a folder
        const isExpanded = expandedFolders.has(currentPath);
        items.push({
          type: 'folder',
          name,
          path: currentPath,
          level,
          isExpanded
        });

        if (isExpanded) {
          items.push(...flattenTree(value, currentPath, level + 1));
        }
      }
    }

    return items;
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

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
  }

  function truncatePath(path, maxLength = 40) {
    if (!path || path.length <= maxLength) return path;
    const parts = path.split('/');
    if (parts.length <= 2) return path;
    return '.../' + parts.slice(-2).join('/');
  }
</script>

<div class="live-code-feed">
  <div class="feed-header">
    <h2>🔴 Live Code Feed</h2>
    <div class="header-actions">
      <span class="live-indicator">● LIVE</span>
      <button on:click={loadAllData} class="btn-refresh">↻ Refresh</button>
    </div>
  </div>

  <div class="feed-layout">
    <!-- Left Column: File Tree -->
    <div class="file-tree-column">
      <div class="column-header">
        <h3>📂 Project Files</h3>
      </div>
      <div class="file-tree-content">
        {#if loading}
          <div class="loading">Loading files...</div>
        {:else if flatItems.length === 0}
          <div class="empty-state">
            <p>No files tracked yet</p>
          </div>
        {:else}
          <div class="file-list">
            {#each flatItems as item}
              {#if item.type === 'folder'}
                <div
                  class="tree-item folder"
                  style="padding-left: {item.level * 12 + 4}px"
                  on:click={() => toggleFolder(item.path)}
                >
                  <span class="folder-arrow">{item.isExpanded ? '▼' : '▶'}</span>
                  <span class="folder-icon">📁</span>
                  <span class="item-name">{item.name}</span>
                </div>
              {:else}
                <div
                  class="tree-item file"
                  style="padding-left: {item.level * 12 + 4}px"
                  class:selected={selectedFile === item.path}
                  class:has-changes={item.hasChanges}
                  on:click={() => selectFile(item.path)}
                >
                  <span class="file-icon">📄</span>
                  <span class="item-name">{item.name}</span>
                  {#if item.hasChanges}
                    <span class="change-indicator">●</span>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Middle Column: Code Changes -->
    <div class="code-changes-column">
      <div class="column-header">
        <h3>📊 Code Changes</h3>
        <span class="change-count">{codeChanges.length} events</span>
      </div>
      <div class="code-changes-content">
        {#if loading}
          <div class="loading">Loading changes...</div>
        {:else if codeChanges.length === 0}
          <div class="empty-state">
            <p>No code changes yet</p>
            <p class="empty-hint">Changes will appear here in real-time</p>
          </div>
        {:else}
          <div class="changes-list">
            {#each codeChanges as change}
              <div class="change-item">
                <div class="change-header">
                  <div class="change-meta">
                    <span class="change-icon" style="color: {getChangeTypeColor(change.change_type)}">
                      {getChangeTypeIcon(change.change_type)}
                    </span>
                    <span class="change-type" style="color: {getChangeTypeColor(change.change_type)}">
                      {change.change_type.toUpperCase()}
                    </span>
                    <span class="change-time">{formatTime(change.timestamp)}</span>
                  </div>
                  <button class="btn-copy" title="Copy">📋</button>
                </div>

                <div class="change-file">
                  <code>{change.filepath || 'Unknown file'}</code>
                </div>

                {#if change.diff}
                  <div class="change-diff">
                    {#each parseDiffLines(change.diff) as line}
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
      </div>
    </div>

    <!-- Right Column: Recent Activity -->
    <div class="activity-column">
      <div class="column-header">
        <h3>⚡ Recent Activity</h3>
      </div>
      <div class="activity-content">
        {#if loading}
          <div class="loading">Loading activity...</div>
        {:else if recentActivity.length === 0}
          <div class="empty-state">
            <p>No activity yet</p>
          </div>
        {:else}
          <div class="activity-list">
            {#each recentActivity as activity}
              <div class="activity-item" class:file={activity.type === 'file'} class:agent={activity.type === 'agent'}>
                <div class="activity-icon">
                  {#if activity.type === 'file'}
                    <span style="color: {getChangeTypeColor(activity.change_type)}">
                      {getChangeTypeIcon(activity.change_type)}
                    </span>
                  {:else}
                    <span>🤖</span>
                  {/if}
                </div>

                <div class="activity-details">
                  {#if activity.type === 'file'}
                    <div class="activity-file">{truncatePath(activity.filepath)}</div>
                    <div class="activity-meta">
                      <span class="activity-type">{activity.change_type}</span>
                      <span class="activity-time">{formatTimestamp(activity.timestamp)}</span>
                    </div>
                  {:else}
                    <div class="activity-file">{activity.agent || 'Agent'}</div>
                    <div class="activity-meta">
                      <span class="activity-type">{activity.event_type}</span>
                      <span class="activity-time">{formatTimestamp(activity.timestamp)}</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .live-code-feed {
    width: 100%;
    height: calc(100vh - 150px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono);
  }

  .feed-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .feed-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .live-indicator {
    color: var(--error);
    font-size: 11px;
    font-weight: 600;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .btn-refresh {
    padding: 6px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
  }

  .btn-refresh:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .feed-layout {
    display: grid;
    grid-template-columns: 200px 1fr 280px;
    gap: 0;
    height: 100%;
    overflow: hidden;
  }

  .file-tree-column,
  .code-changes-column,
  .activity-column {
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    overflow: hidden;
  }

  .activity-column {
    border-right: none;
  }

  .column-header {
    padding: 10px 12px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .column-header h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .change-count {
    font-size: 10px;
    color: var(--muted);
    padding: 2px 8px;
    background: var(--surface);
    border-radius: 4px;
  }

  .file-tree-content,
  .code-changes-content,
  .activity-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* File Tree Styles */
  .file-list {
    padding: 4px;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    margin-bottom: 2px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease;
    font-size: 11px;
    user-select: none;
  }

  .tree-item:hover {
    background: var(--surface);
  }

  .tree-item.file.selected {
    background: var(--surface-2);
    border-left: 3px solid var(--accent);
  }

  .tree-item.file.has-changes {
    background: color-mix(in srgb, var(--warning) 5%, transparent);
  }

  .folder-arrow {
    font-size: 10px;
    color: var(--muted);
    width: 12px;
    display: inline-block;
    transition: transform 0.15s ease;
  }

  .folder-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .file-icon {
    font-size: 12px;
    flex-shrink: 0;
    margin-left: 12px;
  }

  .item-name {
    font-size: 11px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .change-indicator {
    color: var(--warning);
    font-size: 8px;
    margin-left: auto;
  }

  /* Legacy file-item support */
  .file-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    margin-bottom: 2px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease;
    font-size: 10px;
  }

  .file-item:hover {
    background: var(--surface);
  }

  .file-item.selected {
    background: var(--surface-2);
    border-left: 3px solid var(--accent);
  }

  .file-name {
    font-size: 10px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Code Changes Styles */
  .changes-list {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .change-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    transition: all 0.2s;
  }

  .change-item:hover {
    border-color: var(--accent);
    background: var(--surface-2);
  }

  .change-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .change-meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .change-icon {
    font-size: 14px;
  }

  .change-type {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .change-time {
    font-size: 10px;
    color: var(--muted);
  }

  .btn-copy {
    padding: 4px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
  }

  .btn-copy:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .change-file {
    margin-bottom: 8px;
  }

  .change-file code {
    font-size: 11px;
    color: var(--accent);
    background: var(--bg);
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
  }

  .change-diff {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 8px;
    overflow-x: auto;
    max-height: 400px;
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
    width: 40px;
    padding: 2px 8px;
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
    gap: 12px;
    font-size: 10px;
    color: var(--muted);
  }

  .change-size,
  .change-hash {
    padding: 2px 6px;
    background: var(--bg);
    border-radius: 4px;
  }

  /* Activity Styles */
  .activity-list {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .activity-item {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    transition: all 0.2s;
    cursor: pointer;
  }

  .activity-item:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  .activity-icon {
    font-size: 14px;
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
    gap: 8px;
    font-size: 10px;
    color: var(--muted);
  }

  .activity-type {
    text-transform: uppercase;
    font-weight: 600;
  }

  .loading {
    text-align: center;
    padding: 24px;
    color: var(--muted);
    font-size: 11px;
  }

  .empty-state {
    text-align: center;
    padding: 32px 16px;
    color: var(--muted);
  }

  .empty-state p {
    margin: 0 0 8px 0;
    font-size: 12px;
  }

  .empty-hint {
    font-size: 10px;
  }

  /* Scrollbar */
  .file-tree-content::-webkit-scrollbar,
  .code-changes-content::-webkit-scrollbar,
  .activity-content::-webkit-scrollbar {
    width: 6px;
  }

  .file-tree-content::-webkit-scrollbar-thumb,
  .code-changes-content::-webkit-scrollbar-thumb,
  .activity-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .feed-layout {
      grid-template-columns: 180px 1fr 240px;
    }
  }

  @media (max-width: 768px) {
    .feed-layout {
      grid-template-columns: 1fr;
    }

    .file-tree-column,
    .activity-column {
      display: none;
    }
  }
</style>
