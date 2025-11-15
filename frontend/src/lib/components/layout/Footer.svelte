<script>
  /**
   * Footer Component - Raven UI Library
   * Sticky footer with branding, theme switcher, and navigation
   */

  let {
    theme = 'tokyo-night',
    version = '2.0.1',
    sessionId = 'Loading...',
    onThemeChange = () => {},
    onSessionClick = () => {},
    onAboutClick = () => {},
    onChangelogClick = () => {},
    onDocsClick = () => {}
  } = $props();
</script>

<footer
  class="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] z-40"
>
  <div class="flex items-center justify-between px-4 py-2 text-sm font-mono">
    <!-- Left Section -->
    <div class="flex items-center gap-4">
      <span class="font-semibold text-[var(--accent)]">Raven v{version}</span>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>

      <!-- Session ID -->
      <button
        class="bg-transparent border-0 p-0 cursor-pointer text-[var(--muted)] hover:text-[var(--accent)] transition-colors text-xs flex items-center gap-2"
        onclick={onSessionClick}
        title="Session ID: {sessionId} (Click for details)"
        aria-label="View session details"
      >
        Session: <span class="text-[var(--text)] font-semibold">{sessionId}</span>
      </button>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>

      <!-- Theme Selector -->
      <div class="flex gap-0" role="group" aria-label="Theme selector">
        <button
          class={`px-2 py-0 font-medium transition-colors ${
            theme === 'gruvbox-light'
              ? 'text-[var(--accent)] font-semibold'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
          onclick={() => onThemeChange('gruvbox-light')}
          aria-label="Switch to day theme"
          aria-pressed={theme === 'gruvbox-light'}
        >
          Day
        </button>
        <span class="text-[var(--muted)] px-2">·</span>
        <button
          class={`px-2 py-0 font-medium transition-colors ${
            theme === 'ristretto'
              ? 'text-[var(--accent)] font-semibold'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
          onclick={() => onThemeChange('ristretto')}
          aria-label="Switch to dusk theme"
          aria-pressed={theme === 'ristretto'}
        >
          Dusk
        </button>
        <span class="text-[var(--muted)] px-2">·</span>
        <button
          class={`px-2 py-0 font-medium transition-colors ${
            theme === 'tokyo-night'
              ? 'text-[var(--accent)] font-semibold'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
          onclick={() => onThemeChange('tokyo-night')}
          aria-label="Switch to night theme"
          aria-pressed={theme === 'tokyo-night'}
        >
          Night
        </button>
      </div>
    </div>

    <!-- Right Section -->
    <nav class="flex items-center gap-4" aria-label="Footer navigation">
      <button
        onclick={onAboutClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
        aria-label="Open about dialog"
      >
        About
      </button>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
      <button
        onclick={onChangelogClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
        aria-label="View changelog"
      >
        Changelog
      </button>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
      <button
        onclick={onDocsClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
        aria-label="Open documentation"
      >
        Docs
      </button>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
      <a
        href="https://github.com/seheart/raven"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors no-underline"
        aria-label="Open GitHub repository in new tab"
      >
        GitHub
      </a>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
      <span
        class="flex items-center gap-2 text-[var(--success)] text-xs"
        role="status"
        aria-live="polite"
      >
        <span class="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse"></span>
        Real-time Monitoring Active
      </span>
    </nav>
  </div>
</footer>
