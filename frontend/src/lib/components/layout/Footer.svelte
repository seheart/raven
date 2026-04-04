<script>
  let {
    version = '2.0.1',
    sessionId = 'Loading...',
    onSessionClick = () => {},
    onAboutClick = () => {}
  } = $props();
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
      <span class="flex items-center gap-2 text-[var(--success)] text-xs" role="status">
        <span class="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse"></span>
        Monitoring Active
      </span>
    </nav>
  </div>
</footer>
