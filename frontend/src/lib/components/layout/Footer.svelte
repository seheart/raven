<script>
  import { websocketService } from '../../services/websocket.js';
  import { onMount } from 'svelte';
  import { settings, uiSettings } from '../../stores/settingsStore.js';

  let {
    version = '0.5.0',
    onAboutClick = () => {},
    onDesignSystemClick = () => {},
    onRoadmapClick = () => {},
    onDiagnosticClick = () => {},
    onSettingsClick = () => {}
  } = $props();

  let connected = $state(false);
  let isDark = $derived($uiSettings.theme === 'dark');

  function toggleTheme() {
    settings.updateUI({ theme: isDark ? 'light' : 'dark' });
  }

  onMount(() => {
    const interval = setInterval(() => {
      connected = websocketService.isConnected();
    }, 2000);
    connected = websocketService.isConnected();

    return () => {
      clearInterval(interval);
    };
  });
</script>

<!--
  Footer chrome.

  RESPONSIVE.md rule 5: tagline hides below `md` and nav uses `flex-wrap` so
  items reflow to a second row at narrow widths instead of crushing. The
  outer row also wraps, so the brand block and nav can stack onto two rows
  at half-screen widths (~768–960px). At wide widths everything sits on a
  single row.

  Footer is fixed-position; <main> in NewApp.svelte uses `pb-20` to clear
  the wrapped two-row footer height.
-->
<footer
  class="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] z-40"
>
  <div
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm font-mono"
  >
    <div class="flex items-center gap-3 shrink-0">
      <span class="font-semibold text-[var(--accent)]">Raven v{version}</span>
      <!-- Tagline hides below md (RESPONSIVE.md rule 5). Flavor, not content. -->
      <span
        class="hidden md:flex items-center gap-1.5 text-xs text-[var(--body)]"
        title="Raven is your AI's steady companion — always present, every session, every day."
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" aria-hidden="true"
        ></span>
        <span>Always perched · your AI's steady companion</span>
      </span>
    </div>

    <!--
      Footer nav. `flex-wrap` lets items reflow to a second row at narrow
      widths. The pipe separators are hidden below md so wrapped rows
      don't end with an orphan "|"; at md+ they re-appear when the nav
      typically fits on one row anyway.
    -->
    <nav
      class="flex flex-wrap items-center gap-x-3 gap-y-1 md:gap-x-4"
      aria-label="Footer navigation"
    >
      <button
        onclick={onAboutClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
      >
        About
      </button>
      <span class="hidden md:inline text-[var(--muted)]" aria-hidden="true">|</span>
      <button
        onclick={onDesignSystemClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
      >
        Design
      </button>
      <span class="hidden md:inline text-[var(--muted)]" aria-hidden="true">|</span>
      <button
        onclick={onRoadmapClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
      >
        Roadmap
      </button>
      <span class="hidden md:inline text-[var(--muted)]" aria-hidden="true">|</span>
      <button
        onclick={onDiagnosticClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
        title="Run all tests, scans, and health checks in one place"
      >
        Diagnostic
      </button>
      <span class="hidden md:inline text-[var(--muted)]" aria-hidden="true">|</span>
      <a
        href="https://github.com/seheart/raven/issues/new"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors no-underline"
        title="Report a bug or share feedback on GitHub"
      >
        Feedback
      </a>
      <span class="hidden md:inline text-[var(--muted)]" aria-hidden="true">|</span>
      <a
        href="https://github.com/seheart/raven"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors no-underline flex items-center"
        title="GitHub"
        aria-label="GitHub"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15 0 1.55-.01 2.81-.01 3.19 0 .31.21.68.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"
          />
        </svg>
      </a>
      <span class="hidden md:inline text-[var(--muted)]" aria-hidden="true">|</span>
      <!--
        Settings + Theme stay together as the rightmost utility pair.
        Wrapped as one inline-flex so they never split across rows.
      -->
      <span class="inline-flex items-center gap-3">
        <button
          onclick={onSettingsClick}
          class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer flex items-center"
          title="Settings"
          aria-label="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
        <button
          onclick={toggleTheme}
          class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer flex items-center gap-1.5 text-xs"
          title="Switch to {isDark ? 'light' : 'dark'} theme"
          aria-label="Switch to {isDark ? 'light' : 'dark'} theme"
        >
          {#if isDark}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line
                x1="12"
                y1="21"
                x2="12"
                y2="23"
              /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line
                x1="18.36"
                y1="18.36"
                x2="19.78"
                y2="19.78"
              /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line
                x1="4.22"
                y1="19.78"
                x2="5.64"
                y2="18.36"
              /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg
            >
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg
            >
          {/if}
        </button>
      </span>
      <span class="hidden md:inline text-[var(--muted)]" aria-hidden="true">|</span>
      <!--
        Monitoring heartbeat — always visible. Lives at the end of the
        nav so it sits in the bottom-right corner at all widths and stays
        as the "is Raven listening?" signal even when the nav wraps.
      -->
      <span
        class="flex items-center gap-2 text-xs {connected
          ? 'text-[var(--success)]'
          : 'text-[var(--warning)]'}"
        role="status"
        aria-label={connected ? 'Monitoring active' : 'Monitoring disconnected'}
      >
        <span
          class="w-2 h-2 rounded-full {connected
            ? 'bg-[var(--success)] animate-pulse'
            : 'bg-[var(--warning)]'}"
        ></span>
        {connected ? 'Monitoring Active' : 'Disconnected'}
      </span>
    </nav>
  </div>
</footer>
