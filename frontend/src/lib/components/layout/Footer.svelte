<script>
  import { websocketService } from '../../services/websocket.js';
  import { api } from '../../apiClient.js';
  import { onMount } from 'svelte';
  import settings, { uiSettings } from '../../stores/settingsStore.js';

  let {
    version = '2.2.0',
    sessionId = 'Loading...',
    onSessionClick = () => {},
    onAboutClick = () => {},
    onTechStackClick = () => {},
    onDesignSystemClick = () => {}
  } = $props();

  let connected = $state(false);
  let gitBranch = $state('');
  let isDark = $derived($uiSettings.theme === 'dark');

  function toggleTheme() {
    settings.updateUI({ theme: isDark ? 'light' : 'dark' });
  }

  onMount(() => {
    const interval = setInterval(() => {
      connected = websocketService.isConnected();
    }, 2000);
    connected = websocketService.isConnected();

    // Fetch git status immediately on mount
    api
      .get('/git/status')
      .then(data => {
        gitBranch = data?.current || data?.branch || '';
      })
      .catch(() => {});

    // Listen for git status updates via WebSocket
    const handleGit = data => {
      gitBranch = data?.branch || data?.current || '';
    };
    websocketService.on('git-status', handleGit);

    return () => {
      clearInterval(interval);
      websocketService.off('git-status', handleGit);
    };
  });
</script>

<footer
  class="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] z-40"
>
  <div class="flex items-center justify-between px-4 py-2 text-sm font-mono">
    <div class="flex items-center gap-4">
      <span class="font-semibold text-[var(--accent)]">Raven v{version}</span>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
      <button
        class="bg-transparent border-0 p-0 cursor-pointer text-[var(--muted)] hover:text-[var(--accent)] transition-colors text-xs flex items-center gap-2"
        onclick={onSessionClick}
        title="Session ID: {sessionId}"
        aria-label="View session details"
      >
        Session: <span class="text-[var(--text)] font-semibold">{sessionId}</span>
      </button>
    </div>

    <nav class="flex items-center gap-4" aria-label="Footer navigation">
      <button
        onclick={onAboutClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
      >
        About
      </button>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
      <button
        onclick={onTechStackClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
      >
        Tech Stack
      </button>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
      <button
        onclick={onDesignSystemClick}
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer"
      >
        Design System
      </button>
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
      <a
        href="https://github.com/seheart/raven"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors no-underline"
      >
        GitHub
      </a>
      {#if gitBranch}
        <span class="text-[var(--muted)]" aria-hidden="true">|</span>
        <span class="text-xs text-[var(--muted)] font-mono">{gitBranch}</span>
      {/if}
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
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
      <span class="text-[var(--muted)]" aria-hidden="true">|</span>
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
