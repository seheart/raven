<script>
  export let theme = 'theme--night';
  export let onThemeChange = () => {};
  export let onAboutClick = () => {};
  export let onChangelogClick = () => {};
  export let onDocsClick = () => {};

  let version = '0.8.0';
</script>

<footer class="footer">
  <div class="footer-content">
    <div class="footer-left">
      <span class="footer-brand">Raven v{version}</span>
      <span class="footer-divider">|</span>
      <div class="theme-selector" role="group" aria-label="Theme selector">
        <button
          class="theme-button"
          class:active={theme === 'theme--day'}
          on:click={() => onThemeChange('theme--day')}
          aria-label="Day theme"
        >
          Day
        </button>
        <button
          class="theme-button"
          class:active={theme === 'theme--dusk'}
          on:click={() => onThemeChange('theme--dusk')}
          aria-label="Dusk theme"
        >
          Dusk
        </button>
        <button
          class="theme-button"
          class:active={theme === 'theme--night'}
          on:click={() => onThemeChange('theme--night')}
          aria-label="Night theme"
        >
          Night
        </button>
      </div>
    </div>

    <div class="footer-right">
      <button class="footer-link" on:click={onAboutClick}>
        About
      </button>
      <span class="footer-divider">|</span>
      <button class="footer-link" on:click={onChangelogClick}>
        Changelog
      </button>
      <span class="footer-divider">|</span>
      <button class="footer-link" on:click={onDocsClick}>
        Docs
      </button>
      <span class="footer-divider">|</span>
      <a class="footer-link" href="https://github.com/seheart/raven" target="_blank" rel="noopener noreferrer">
        GitHub
      </a>
      <span class="footer-divider">|</span>
      <span class="footer-status">
        <span class="status-dot"></span>
        Real-time Monitoring Active
      </span>
    </div>
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
    padding: 12px 24px;
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
    gap: 12px;
  }

  .footer-brand {
    color: var(--accent);
    font-weight: 600;
  }

  .footer-divider {
    color: var(--muted);
  }

  .footer-link {
    color: var(--muted);
    text-decoration: none;
    cursor: pointer;
    transition: color 0.2s;
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
    padding: 4px 8px;
    cursor: pointer;
    transition: color 0.2s;
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
    margin-left: 8px;
  }

  .footer-status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--success);
    font-size: 12px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    background: var(--success);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @media (max-width: 768px) {
    .footer-content {
      flex-direction: column;
      gap: 8px;
      text-align: center;
    }

    .footer-left,
    .footer-right {
      flex-wrap: wrap;
      justify-content: center;
    }
  }
</style>
