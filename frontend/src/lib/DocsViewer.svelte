<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { API_CONFIG } from '../config.js';
  import { logger } from './logger.js';

  const dispatch = createEventDispatcher();

  const API_BASE = API_CONFIG.API_BASE;

  let docs = [];
  let selectedDoc = null;
  let markdown = '';
  let html = '';
  let loading = false;
  let error = null;
  let searchTerm = '';

  function close() {
    dispatch('close');
  }

  // Configure marked for better rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: true,
    mangle: false
  });

  async function loadDocsList() {
    try {
      const response = await fetch(`${API_BASE}/docs/list`);
      const data = await response.json();
      docs = data.all || [];

      // Load README.md by default
      if (docs.length > 0) {
        const readme = docs.find(d => d.name === 'README.md');
        if (readme) {
          loadDoc(readme.path);
        } else {
          loadDoc(docs[0].path);
        }
      }
    } catch (err) {
      error = 'Failed to load documentation list';
      logger.error(err);
    }
  }

  async function loadDoc(filepath) {
    loading = true;
    error = null;

    try {
      const response = await fetch(`${API_BASE}/docs/${filepath}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      markdown = data.markdown;
      // Sanitize HTML to prevent XSS attacks
      html = DOMPurify.sanitize(marked(data.markdown));
      selectedDoc = filepath;
    } catch (err) {
      error = `Failed to load ${filepath}`;
      logger.error(err);
    } finally {
      loading = false;
    }
  }

  // Handle clicks on links within markdown content
  function handleMarkdownClick(event) {
    const target = event.target.closest('a');
    if (!target) return;

    const href = target.getAttribute('href');
    if (!href) return;

    // Check if it's an external link (http/https)
    if (href.startsWith('http://') || href.startsWith('https://')) {
      // Let external links work normally
      return;
    }

    // Check if it's an internal markdown link
    if (href.endsWith('.md') || href.includes('.md#')) {
      event.preventDefault();

      // Parse the link to get the file path
      let docPath = href;

      // Remove leading slashes and '../' patterns
      docPath = docPath.replace(/^\.\.\//, '').replace(/^\//, '');

      // Remove 'docs/' prefix if present (since our API expects paths relative to docs/)
      docPath = docPath.replace(/^docs\//, '');

      // Remove anchor if present
      const anchorIndex = docPath.indexOf('#');
      if (anchorIndex !== -1) {
        docPath = docPath.substring(0, anchorIndex);
      }

      // Find the doc in our list to verify it exists
      const doc = docs.find(d =>
        d.path === docPath ||
        d.name === docPath ||
        d.path.endsWith('/' + docPath)
      );

      if (doc) {
        loadDoc(doc.path);
      } else {
        // Try loading directly
        loadDoc(docPath);
      }
    }
  }

  onMount(() => {
    loadDocsList();
  });

  // Memoization cache for filtered docs
  let cachedDocs = null;
  let cachedSearchTerm = '';
  let cachedFilteredDocs = [];

  // Optimized: Only filter when docs or searchTerm changes
  $: {
    if (docs !== cachedDocs || searchTerm !== cachedSearchTerm) {
      cachedDocs = docs;
      cachedSearchTerm = searchTerm;

      const lowerSearch = searchTerm.toLowerCase();
      cachedFilteredDocs = docs.filter(doc =>
        doc.name.toLowerCase().includes(lowerSearch) ||
        doc.title.toLowerCase().includes(lowerSearch)
      );
    }
  }

  $: filteredDocs = cachedFilteredDocs;

  // Memoization cache for organized docs
  let cachedOrgDocs = null;
  let cachedOrganizedResult = {};

  // Organize docs by category (memoized)
  $: {
    if (filteredDocs !== cachedOrgDocs) {
      cachedOrgDocs = filteredDocs;
      cachedOrganizedResult = filteredDocs.reduce((acc, doc) => {
        if (!acc[doc.category]) {
          acc[doc.category] = [];
        }
        acc[doc.category].push(doc);
        return acc;
      }, {});
    }
  }

  $: organizedDocs = cachedOrganizedResult;
</script>

<div class="docs-viewer" transition:fade={{ duration: 300 }} role="main" aria-label="Documentation viewer">
  <nav class="docs-sidebar" aria-label="Documentation navigation">
    <div class="sidebar-header">
      <h2 id="docs-heading"><span aria-hidden="true">📚</span> Documentation</h2>
      <input
        type="text"
        placeholder="Search docs..."
        bind:value={searchTerm}
        class="search-input"
        aria-label="Search documentation"
      />
    </div>

    <div class="docs-list" role="region" aria-labelledby="docs-heading">
      {#each Object.entries(organizedDocs) as [category, categoryDocs]}
        <div class="docs-category">
          <h3 class="category-title">{category === 'root' ? 'Getting Started' : category.toUpperCase()}</h3>
          {#each categoryDocs as doc}
            <button
              class="doc-item"
              class:active={selectedDoc === doc.path}
              on:click={() => loadDoc(doc.path)}
              aria-current={selectedDoc === doc.path ? 'page' : undefined}
              aria-label="View {doc.title}"
            >
              <span class="doc-icon" aria-hidden="true">📄</span>
              <span class="doc-title">{doc.title}</span>
            </button>
          {/each}
        </div>
      {/each}

      {#if filteredDocs.length === 0}
        <div class="no-results" role="status">
          <p>No documentation found</p>
        </div>
      {/if}
    </div>
  </nav>

  <main class="docs-content" role="region" aria-label="Documentation content">
    {#if loading}
      <div class="loading" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <p>Loading documentation...</p>
      </div>
    {:else if error}
      <div class="error" role="alert">
        <h2><span aria-hidden="true">❌</span> Error</h2>
        <p>{error}</p>
      </div>
    {:else if html}
      <article class="markdown-content" on:click={handleMarkdownClick}>
        {@html html}
      </article>
    {:else}
      <div class="empty" role="status">
        <h2>Select a document</h2>
        <p>Choose a documentation file from the sidebar to view it here.</p>
      </div>
    {/if}
  </main>
</div>

<style>
  .docs-viewer {
    position: relative;
    background: var(--bg);
    width: 100%;
    min-height: 100vh;
    display: grid;
    grid-template-columns: 300px 1fr;
    color: var(--text);
    font-family: var(--mono);
    overflow: hidden;
  }

  /* Sidebar */
  .docs-sidebar {
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }

  .sidebar-header h2 {
    margin: 0 0 12px 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--accent);
  }

  .search-input {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
    outline: none;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    border-color: var(--accent);
  }

  .search-input::placeholder {
    color: var(--muted);
  }

  .docs-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .docs-category {
    margin-bottom: 24px;
  }

  .category-title {
    margin: 0 0 8px 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 8px;
  }

  .doc-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
    font-family: var(--mono);
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 4px;
  }

  .doc-item:hover {
    background: var(--surface-2);
  }

  .doc-item.active {
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }

  .doc-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .doc-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-results {
    padding: 24px 12px;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
  }

  /* Content Area */
  .docs-content {
    overflow-y: auto;
    padding: 32px 48px;
    background: var(--bg);
  }

  .loading,
  .error,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--surface-2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading p {
    margin-top: 16px;
    color: var(--muted);
    font-size: 12px;
  }

  .error h2 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: var(--error);
  }

  .error p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }

  .empty h2 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: var(--muted);
  }

  .empty p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }

  /* Markdown Content Styling */
  .markdown-content {
    max-width: 900px;
    margin: 0 auto;
  }

  .markdown-content :global(h1) {
    font-size: 24px;
    font-weight: 700;
    color: var(--text);
    margin: 32px 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--border);
  }

  .markdown-content :global(h2) {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    margin: 28px 0 14px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }

  .markdown-content :global(h3) {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    margin: 24px 0 12px 0;
  }

  .markdown-content :global(h4) {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    margin: 20px 0 10px 0;
  }

  .markdown-content :global(p) {
    font-size: 13px;
    line-height: 1.7;
    color: var(--text);
    margin: 0 0 16px 0;
  }

  .markdown-content :global(a) {
    color: var(--accent);
    text-decoration: underline;
    transition: opacity 0.2s;
  }

  .markdown-content :global(a:hover) {
    opacity: 0.8;
  }

  .markdown-content :global(code) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: var(--accent);
  }

  .markdown-content :global(pre) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 16px 0;
  }

  .markdown-content :global(pre code) {
    background: none;
    border: none;
    padding: 0;
    color: var(--text);
    font-size: 12px;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0 0 16px 0;
    padding-left: 24px;
  }

  .markdown-content :global(li) {
    font-size: 13px;
    line-height: 1.7;
    color: var(--text);
    margin-bottom: 8px;
  }

  .markdown-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 12px;
  }

  .markdown-content :global(th) {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: var(--text);
  }

  .markdown-content :global(td) {
    border: 1px solid var(--border);
    padding: 10px 12px;
    color: var(--text);
  }

  .markdown-content :global(tr:nth-child(even)) {
    background: var(--surface);
  }

  .markdown-content :global(blockquote) {
    border-left: 4px solid var(--accent);
    padding-left: 16px;
    margin: 16px 0;
    color: var(--muted);
    font-style: italic;
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 2px solid var(--border);
    margin: 32px 0;
  }

  .markdown-content :global(img) {
    max-width: 100%;
    border-radius: 8px;
    margin: 16px 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .docs-viewer {
      grid-template-columns: 1fr;
    }

    .docs-sidebar {
      display: none; /* Mobile: hide sidebar by default */
    }

    .docs-content {
      padding: 16px 20px;
    }
  }
</style>
