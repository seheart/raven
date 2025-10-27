<script>
  import { onMount } from 'svelte';
  import RavenLogo from './RavenLogo.svelte';

  export let progress = 0; // 0-100
  export let message = 'Initializing Raven...';

  let dots = '';
  let dotsInterval;

  onMount(() => {
    // Animate dots
    dotsInterval = setInterval(() => {
      dots = dots.length >= 3 ? '' : dots + '.';
    }, 400);

    return () => {
      if (dotsInterval) clearInterval(dotsInterval);
    };
  });
</script>

<div class="loading-screen" role="alert" aria-live="polite" aria-busy="true">
  <div class="loading-content">
    <!-- Animated Raven Logo -->
    <div class="logo-container" aria-hidden="true">
      <div class="logo-pulse">
        <RavenLogo size={80} />
      </div>
    </div>

    <!-- App Name -->
    <h1 class="app-name">Raven</h1>
    <p class="tagline">Your AI Development Guardian</p>

    <!-- Loading Message -->
    <div class="loading-message" role="status">
      {message}<span class="dots" aria-hidden="true">{dots}</span>
    </div>

    <!-- Progress Bar -->
    <div class="progress-container" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" aria-label="Loading progress">
      <div class="progress-bar" style="width: {progress}%"></div>
    </div>

    <!-- Loading Stats -->
    <div class="loading-stats" role="status" aria-live="polite">
      <div class="stat">
        <span class="stat-icon" aria-hidden="true">🔍</span>
        <span class="stat-label">Scanning projects</span>
      </div>
      <div class="stat">
        <span class="stat-icon" aria-hidden="true">🔗</span>
        <span class="stat-label">Connecting to server</span>
      </div>
      <div class="stat">
        <span class="stat-icon" aria-hidden="true">📊</span>
        <span class="stat-label">Loading analytics</span>
      </div>
    </div>
  </div>
</div>

<style>
  .loading-screen {
    position: fixed;
    inset: 0;
    background: linear-gradient(
      135deg,
      var(--bg) 0%,
      var(--surface) 50%,
      var(--bg) 100%
    );
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
    max-width: 500px;
    padding: var(--space-2xl);
  }

  .logo-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-lg);
  }

  .logo-pulse {
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.9;
    }
  }

  .app-name {
    font-family: var(--sans);
    font-size: 48px;
    font-weight: var(--weight-bold);
    margin: 0;
    background: linear-gradient(
      135deg,
      var(--accent) 0%,
      var(--accent-2, var(--accent)) 100%
    );
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: slideUp 0.5s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tagline {
    font-family: var(--mono);
    font-size: var(--text-sm);
    color: var(--muted);
    margin: 0;
    animation: slideUp 0.5s ease-out 0.1s both;
  }

  .loading-message {
    font-family: var(--mono);
    font-size: var(--text-base);
    color: var(--text);
    margin-top: var(--space-xl);
    min-height: 24px;
    animation: slideUp 0.5s ease-out 0.2s both;
  }

  .dots {
    display: inline-block;
    width: 20px;
    text-align: left;
  }

  .progress-container {
    width: 100%;
    height: 4px;
    background: var(--surface-2);
    border-radius: 2px;
    overflow: hidden;
    position: relative;
    animation: slideUp 0.5s ease-out 0.3s both;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--accent) 0%,
      var(--accent-2, var(--accent)) 100%
    );
    border-radius: 2px;
    transition: width 0.3s ease-out;
    position: relative;
    overflow: hidden;
  }

  .progress-bar::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.3) 50%,
      transparent 100%
    );
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  .loading-stats {
    display: flex;
    gap: var(--space-xl);
    margin-top: var(--space-xl);
    animation: slideUp 0.5s ease-out 0.4s both;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
  }

  .stat-icon {
    font-size: 24px;
    animation: float 2s ease-in-out infinite;
  }

  .stat:nth-child(2) .stat-icon {
    animation-delay: 0.2s;
  }

  .stat:nth-child(3) .stat-icon {
    animation-delay: 0.4s;
  }

  @keyframes float {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }

  .stat-label {
    font-family: var(--mono);
    font-size: var(--text-xs);
    color: var(--muted);
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .loading-content {
      padding: var(--space-xl);
    }

    .app-name {
      font-size: 36px;
    }

    .loading-stats {
      flex-direction: column;
      gap: var(--space-md);
    }
  }
</style>
