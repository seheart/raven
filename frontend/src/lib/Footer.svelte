<script>
  import { onMount } from 'svelte';

  export let onAboutClick = () => {};
  export let onChangelogClick = () => {};

  let version = '0.0.1';
  let sessionUptime = '0s';
  let uptimeInterval;

  const startTime = Date.now();

  function updateUptime() {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      sessionUptime = `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      sessionUptime = `${minutes}m ${secs}s`;
    } else {
      sessionUptime = `${secs}s`;
    }
  }

  onMount(() => {
    updateUptime();
    uptimeInterval = setInterval(updateUptime, 1000);

    return () => {
      if (uptimeInterval) clearInterval(uptimeInterval);
    };
  });
</script>

<footer class="footer">
  <div class="footer-content">
    <div class="footer-left">
      <span class="footer-brand">🐦‍⬛ Raven v{version}</span>
      <span class="footer-divider">|</span>
      <span class="footer-uptime">Session: {sessionUptime}</span>
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
      <a class="footer-link" href="https://github.com" target="_blank" rel="noopener noreferrer">
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
    background: #1a1a1a;
    border-top: 1px solid #2a2a2a;
    padding: 12px 24px;
    z-index: 100;
    font-family: 'Inter', sans-serif;
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
    color: #FF6B35;
    font-weight: 600;
  }

  .footer-uptime {
    color: #9ca3af;
    font-family: 'Courier New', monospace;
  }

  .footer-divider {
    color: #4b5563;
  }

  .footer-link {
    color: #9ca3af;
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
    color: #FF6B35;
  }

  .footer-status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #10b981;
    font-size: 12px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    background: #10b981;
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
