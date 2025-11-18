<script>
  /**
   * Live Monitor Page - Real-time AI activity monitoring
   * Split-view layout inspired by IDE interfaces
   */
  import FileTreeSidebar from '../components/live/FileTreeSidebar.svelte';
  import DiffViewer from '../components/live/DiffViewer.svelte';
  import ContextPanel from '../components/live/ContextPanel.svelte';
  import LiveStatusBar from '../components/live/LiveStatusBar.svelte';

  let selectedFile = $state(null);

  function handleFileSelect(file) {
    selectedFile = file.path;
  }
</script>

<div class="live-page">
  <!-- Top Bar with Session Info -->
  <div class="top-section">
    <LiveStatusBar />
  </div>

  <!-- Main Split View Layout -->
  <div class="main-layout">
    <!-- Left Sidebar - File Tree -->
    <div class="left-panel">
      <FileTreeSidebar onFileSelect={handleFileSelect} />
    </div>

    <!-- Center Panel - Diff Viewer -->
    <div class="center-panel">
      <DiffViewer filePath={selectedFile} />
    </div>

    <!-- Right Panel - Context & Actions -->
    <div class="right-panel">
      <ContextPanel currentFile={selectedFile} />
    </div>
  </div>
</div>

<style>
  .live-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .top-section {
    padding: 1rem 1.5rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .main-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 280px 1fr 320px;
    overflow: hidden;
    min-height: 0;
  }

  .left-panel,
  .center-panel,
  .right-panel {
    min-height: 0;
    overflow: hidden;
  }

  /* Responsive breakpoints */
  @media (max-width: 1400px) {
    .main-layout {
      grid-template-columns: 240px 1fr 280px;
    }
  }

  @media (max-width: 1200px) {
    .main-layout {
      grid-template-columns: 200px 1fr 260px;
    }
  }

  @media (max-width: 900px) {
    .main-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }

    .left-panel,
    .right-panel {
      display: none;
    }
  }
</style>
