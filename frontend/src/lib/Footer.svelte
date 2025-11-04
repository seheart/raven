<script>
  export let theme = 'theme--night';
  export let onThemeChange = () => {};
  export let onAboutClick = () => {};
  export let onChangelogClick = () => {};
  export let onDocsClick = () => {};
  export let onSessionClick = () => {};
  export let sessionId = 'Loading...';

  let version = '1.0.0';
</script>

<footer class="footer">
  <div class="footer-content">
    <div class="footer-left">
      <span class="footer-brand">Raven v{version}</span>
      <span class="footer-divider" aria-hidden="true">|</span>
      <button
        class="footer-session-btn"
        on:click={onSessionClick}
        title="Session ID: {sessionId} (Click for details)"
        aria-label="View session details"
      >
        Session: <span class="session-id">{sessionId}</span>
      </button>
      <span class="footer-divider" aria-hidden="true">|</span>
      <div class="theme-selector" role="group" aria-label="Theme selector">
        <button
          class="theme-button"
          class:active={theme === 'theme--day'}
          on:click={() => onThemeChange('theme--day')}
          aria-label="Switch to day theme"
          aria-pressed={theme === 'theme--day'}
        >
          Day
        </button>
        <button
          class="theme-button"
          class:active={theme === 'theme--dusk'}
          on:click={() => onThemeChange('theme--dusk')}
          aria-label="Switch to dusk theme"
          aria-pressed={theme === 'theme--dusk'}
        >
          Dusk
        </button>
        <button
          class="theme-button"
          class:active={theme === 'theme--night'}
          on:click={() => onThemeChange('theme--night')}
          aria-label="Switch to night theme"
          aria-pressed={theme === 'theme--night'}
        >
          Night
        </button>
      </div>
    </div>

    <nav class="footer-right" aria-label="Footer navigation">
      <button class="footer-link" on:click={onAboutClick} aria-label="Open about dialog">
        About
      </button>
      <span class="footer-divider" aria-hidden="true">|</span>
      <button class="footer-link" on:click={onChangelogClick} aria-label="View changelog">
        Changelog
      </button>
      <span class="footer-divider" aria-hidden="true">|</span>
      <button class="footer-link" on:click={onDocsClick} aria-label="Open documentation">
        Docs
      </button>
      <span class="footer-divider" aria-hidden="true">|</span>
      <a
        class="footer-link"
        href="https://github.com/seheart/raven"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open GitHub repository in new tab"
      >
        GitHub
      </a>
      <span class="footer-divider" aria-hidden="true">|</span>
      <span
        class="footer-status"
        role="status"
        aria-live="polite"
        aria-label="Real-time monitoring active"
      >
        <span class="status-dot" aria-hidden="true"></span>
        Real-time Monitoring Active
      </span>
    </nav>
  </div>
</footer>

<style>
  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: var(--space-md) var(--space-xl);
    z-index: 100;
    font-family: var(--mono);
  }

  .footer-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 100%;
    font-size: 13px;
  }

  .footer-left,
  .footer-right {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  .footer-brand {
    color: var(--accent);
    font-weight: 600;
  }

  .footer-session-btn {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 12px;
    padding: 0;
    cursor: pointer;
    font-family: var(--mono);
    transition: color var(--duration-base) var(--ease-smooth);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .footer-session-btn:hover {
    color: var(--accent);
  }

  .footer-session-btn:hover .session-id {
    color: var(--accent);
  }

  .session-id {
    font-family: var(--mono);
    color: var(--text);
    font-weight: 600;
    transition: color var(--duration-base) var(--ease-smooth);
  }

  .footer-divider {
    color: var(--muted);
  }

  .footer-link {
    color: var(--muted);
    text-decoration: none;
    cursor: pointer;
    transition: color var(--duration-base) var(--ease-smooth);
    background: none;
    border: none;
    font-size: 13px;
    padding: 0;
    font-family: inherit;
  }

  .footer-link:hover {
    color: var(--accent);
  }

  .theme-selector {
    display: flex;
    gap: 0;
    align-items: center;
  }

  .theme-button {
    background: none;
    border: none;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 13px;
    padding: var(--space-sm) var(--space-lg);
    cursor: pointer;
    transition: color var(--duration-base) var(--ease-smooth);
    font-weight: 500;
  }

  .theme-button:hover {
    color: var(--text);
  }

  .theme-button.active {
    color: var(--accent);
    font-weight: 600;
  }

  .theme-button:not(:last-child)::after {
    content: '·';
    color: var(--muted);
    margin-left: var(--space-lg);
  }

  .footer-status {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    color: var(--success);
    font-size: 12px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    min-width: 8px;
    min-height: 8px;
    background: var(--success);
    border-radius: 50%;
    flex-shrink: 0;
    display: block;
    padding: 0;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @media (max-width: 768px) {
    .footer-content {
      flex-direction: column;
      gap: var(--space-lg);
      text-align: center;
    }

    .footer-left,
    .footer-right {
      flex-wrap: wrap;
      justify-content: center;
    }
  }
</style>
