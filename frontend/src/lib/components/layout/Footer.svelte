<script>
  import { websocketService } from '../../services/websocket.js';
  import { onMount } from 'svelte';

  let {
    version = '2.2.0',
    sessionId = 'Loading...',
    onSessionClick = () => {},
    onAboutClick = () => {}
  } = $props();

  let connected = $state(false);

  onMount(() => {
    // Poll connection status every 2s (lightweight check)
    const interval = setInterval(() => {
      connected = websocketService.isConnected();
    }, 2000);
    connected = websocketService.isConnected();

    return () => clearInterval(interval);
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
      <a
        href="https://github.com/seheart/raven"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[var(--muted)] hover:text-[var(--accent)] transition-colors no-underline"
      >
        GitHub
      </a>
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
