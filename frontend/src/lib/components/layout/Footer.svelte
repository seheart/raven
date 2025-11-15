<script>
  /**
   * Footer Component - Raven UI Library
   * Sticky footer with branding, session info, theme switcher, and navigation
   */

  let {
    theme = 'light',
    version = '2.0.1',
    onThemeChange = () => {},
    onAboutClick = () => {},
    onChangelogClick = () => {},
    onDocsClick = () => {}
  } = $props();

  const themes = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'auto', label: 'Auto' }
  ];
</script>

<footer class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
  <div class="flex items-center justify-between px-4 py-2 text-xs font-mono">
    <!-- Left Section -->
    <div class="flex items-center gap-4">
      <span class="font-semibold text-blue-600">Raven v{version}</span>
      <span class="text-gray-300">|</span>

      <!-- Theme Selector -->
      <div class="flex items-center gap-1" role="group" aria-label="Theme selector">
        {#each themes as themeOption, i (themeOption.id)}
          <button
            class={`px-2 py-1 transition-colors ${
              theme === themeOption.id
                ? 'text-blue-600 font-semibold'
                : 'text-gray-500 hover:text-gray-900'
            }`}
            onclick={() => onThemeChange(themeOption.id)}
            aria-label="Switch to {themeOption.label} theme"
            aria-pressed={theme === themeOption.id}
          >
            {themeOption.label}
          </button>
          {#if i < themes.length - 1}
            <span class="text-gray-400">·</span>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Right Section -->
    <nav class="flex items-center gap-4" aria-label="Footer navigation">
      <button
        onclick={onAboutClick}
        class="text-gray-500 hover:text-blue-600 transition-colors"
        aria-label="Open about dialog"
      >
        About
      </button>
      <span class="text-gray-300">|</span>
      <button
        onclick={onChangelogClick}
        class="text-gray-500 hover:text-blue-600 transition-colors"
        aria-label="View changelog"
      >
        Changelog
      </button>
      <span class="text-gray-300">|</span>
      <button
        onclick={onDocsClick}
        class="text-gray-500 hover:text-blue-600 transition-colors"
        aria-label="Open documentation"
      >
        Docs
      </button>
      <span class="text-gray-300">|</span>
      <a
        href="https://github.com/seheart/raven"
        target="_blank"
        rel="noopener noreferrer"
        class="text-gray-500 hover:text-blue-600 transition-colors"
        aria-label="Open GitHub repository in new tab"
      >
        GitHub
      </a>
      <span class="text-gray-300">|</span>
      <span class="flex items-center gap-2 text-green-600" role="status" aria-live="polite">
        <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        Real-time Monitoring Active
      </span>
    </nav>
  </div>
</footer>
