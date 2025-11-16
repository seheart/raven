<script>
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  /**
   * Documentation Viewer Page
   * Modern sidebar navigation with markdown content display
   * Note: Requires 'marked' and 'dompurify' packages for markdown rendering
   */

  let docs = $state([]);
  let selectedDoc = $state(null);

  let html = $state('');
  let loading = $state(false);
  let error = $state(null);
  let searchTerm = $state('');

  // Filter docs based on search
  const filteredDocs = $derived(
    docs.filter(
      doc =>
        doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Organize docs by category
  const organizedDocs = $derived(
    filteredDocs.reduce((acc, doc) => {
      if (!acc[doc.category]) {
        acc[doc.category] = [];
      }
      acc[doc.category].push(doc);
      return acc;
    }, {})
  );

  // Load docs list from API
  async function loadDocsList() {
    try {
      const response = await api.get('/docs/list');
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
    } catch (error) {
      error = 'Failed to load documentation list';
      logger.error(error);
    }
  }

  // Load a specific doc
  async function loadDoc(filepath) {
    loading = true;
    error = null;

    try {
      const response = await api.get(`/docs/${filepath}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      markdown = data.markdown;
      // For now, display raw markdown. Full implementation would use marked + DOMPurify
      html = `<pre class="whitespace-pre-wrap font-mono text-sm text-[var(--text)] leading-relaxed">${escapeHtml(data.markdown)}</pre>`;
      selectedDoc = filepath;
    } catch (error) {
      error = `Failed to load ${filepath}`;
      logger.error(error);
    } finally {
      loading = false;
    }
  }

  // Simple HTML escaping
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Load on mount
  $effect(() => {
    loadDocsList();
  });
</script>

<div class="fixed inset-0 top-16 bottom-14 bg-[var(--bg)] flex">
  <!-- Sidebar -->
  <nav class="w-80 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col">
    <!-- Search Header -->
    <div class="p-5 border-b border-[var(--border)]">
      <h2 class="text-base font-semibold text-[var(--accent)] mb-3">📚 Documentation</h2>
      <input
        type="text"
        placeholder="Search docs..."
        bind:value={searchTerm}
        class="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] font-sans"
      />
    </div>

    <!-- Docs List -->
    <div class="flex-1 overflow-y-auto p-4">
      {#each Object.entries(organizedDocs) as [category, categoryDocs] (category)}
        <div class="mb-6">
          <h3
            class="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2 px-3 font-sans"
          >
            {category === 'root' ? 'Getting Started' : category}
          </h3>
          {#each categoryDocs as doc (doc.id || doc.name)}
            <button
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--text)] hover:bg-[var(--surface-2)] transition-all {selectedDoc ===
              doc.path
                ? 'bg-[var(--accent)] text-[#ffffff] font-semibold hover:bg-[var(--accent)]'
                : ''} font-sans text-left"
              onclick={() => loadDoc(doc.path)}
            >
              <span class="text-xs flex-shrink-0">📄</span>
              <span class="flex-1 truncate">{doc.title}</span>
            </button>
          {/each}
        </div>
      {/each}

      {#if filteredDocs.length === 0}
        <div class="text-center py-8">
          <p class="text-sm text-[var(--muted)] font-sans">No documentation found</p>
        </div>
      {/if}
    </div>
  </nav>

  <!-- Content Area -->
  <main class="flex-1 overflow-y-auto p-8 bg-[var(--bg)]">
    {#if loading}
      <div class="flex flex-col items-center justify-center h-full">
        <div
          class="w-12 h-12 border-4 border-[var(--surface-2)] border-t-[var(--accent)] rounded-full animate-spin"
        ></div>
        <p class="text-sm text-[var(--muted)] mt-6 font-sans">Loading documentation...</p>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center h-full">
        <h2 class="text-lg font-semibold text-[var(--error)] mb-2">❌ Error</h2>
        <p class="text-sm text-[var(--muted)] font-sans">{error}</p>
      </div>
    {:else if html}
      <div class="max-w-4xl mx-auto">
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <!-- Note about markdown rendering -->
          <div
            class="bg-[var(--warning)] bg-opacity-10 border-l-4 border-[var(--warning)] p-4 mb-6 rounded"
          >
            <p class="text-sm text-[var(--text)] font-sans">
              <strong>Note:</strong> Full markdown rendering requires the 'marked' and 'dompurify' packages.
              Currently displaying raw markdown.
            </p>
          </div>

          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html html}
        </div>
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center h-full">
        <h2 class="text-lg font-semibold text-[var(--muted)] mb-2">Select a document</h2>
        <p class="text-sm text-[var(--muted)] font-sans">
          Choose a documentation file from the sidebar to view it here.
        </p>
      </div>
    {/if}
  </main>
</div>
