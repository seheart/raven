<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import RavenLogo from './components/ui/RavenLogo.svelte';

  const dispatch = createEventDispatcher();

  function handleGetStarted() {
    localStorage.setItem('raven-welcome-seen', 'true');
    dispatch('close');
  }

  const features = [
    {
      icon: '',
      title: 'Real-time Monitoring',
      description: 'Watch file changes, system metrics, and AI agent activity as it happens'
    },
    {
      icon: '',
      title: 'AI Agent Tracking',
      description: "Monitor Claude Code, GPT, and local LLMs - see what they're doing in real-time"
    },
    {
      icon: '',
      title: 'Pattern Recognition',
      description: 'Raven learns your coding patterns and rhythms to become your perfect companion'
    },
    {
      icon: '',
      title: 'Local-First Privacy',
      description: 'Everything stays on your machine - no cloud, no telemetry, just you and Raven'
    }
  ];

  const quickTips = [
    { keys: '1-5', tip: 'Quick navigation between tabs' },
    { keys: '?', tip: 'Show keyboard shortcuts' },
    { keys: 'Escape', tip: 'Close dialogs and modals' }
  ];
</script>

<div
  class="welcome-overlay"
  transition:fade={{ duration: 300 }}
  role="dialog"
  aria-modal="true"
  aria-labelledby="welcome-title"
>
  <div class="welcome-container" transition:fly={{ y: 50, duration: 400, delay: 100 }}>
    <!-- Header -->
    <div class="welcome-header">
      <RavenLogo size={64} />
      <h1 id="welcome-title">Welcome to Raven</h1>
      <p class="tagline">Your AI Coding Companion That Learns Who You Are</p>
    </div>

    <!-- Vision Statement -->
    <div class="vision-section">
      <p class="vision-text">
        Raven isn't just another monitoring tool - it's designed to <strong>understand you</strong> as
        a developer. By watching your patterns, rhythms, and how you interact with AI agents, Raven builds
        a profile of your unique coding style. This is "vibe coding" - where the tool adapts to you,
        not the other way around.
      </p>
    </div>

    <!-- Features Grid -->
    <div class="features-grid" role="list" aria-label="Raven features">
      {#each features as feature (feature)}
        <div class="feature-card" role="listitem">
          <span class="feature-icon" aria-hidden="true">{feature.icon}</span>
          <h3 class="feature-title">{feature.title}</h3>
          <p class="feature-description">{feature.description}</p>
        </div>
      {/each}
    </div>

    <!-- Quick Start -->
    <div class="quick-start">
      <h2>Quick Start</h2>
      <div class="tips-list">
        {#each quickTips as tip (tip)}
          <div class="tip-item">
            <kbd>{tip.keys}</kbd>
            <span>{tip.tip}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- CTA -->
    <div class="welcome-footer">
      <button
        class="get-started-button"
        on:click={handleGetStarted}
        aria-label="Get started with Raven"
      >
        Let's Go!
      </button>
      <p class="footer-note">
        Raven will start learning your patterns immediately. The more you code, the smarter it gets.
      </p>
    </div>
  </div>
</div>

<style>
  .welcome-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20000;
    overflow-y: auto;
    padding: var(--space-lg);
  }

  .welcome-container {
    background: var(--surface);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    max-width: 800px;
    width: 100%;
    padding: var(--space-3xl);
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.4);
    animation: gentleFloat 4s ease-in-out infinite;
  }

  @keyframes gentleFloat {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }

  .welcome-header {
    text-align: center;
    margin-bottom: var(--space-4xl);
  }

  #welcome-title {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    margin: var(--space-2xl) 0 var(--space-lg) 0;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2, var(--accent)) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    font-family: var(--sans);
    font-size: 11px;
    color: var(--muted);
    margin: 0;
  }

  .vision-section {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    margin-bottom: var(--space-4xl);
  }

  .vision-text {
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
    margin: 0;
  }

  .vision-text strong {
    color: var(--accent);
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-4xl);
  }

  .feature-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    text-align: center;
    transition: all var(--duration-slow) var(--ease-smooth);
  }

  .feature-card:hover {
    transform: translateY(-4px);
    border-color: var(--accent);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  .feature-icon {
    font-size: 11px;
    display: block;
    margin-bottom: var(--space-xl);
  }

  .feature-title {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-lg) 0;
  }

  .feature-description {
    font-family: var(--sans);
    font-size: 11px;
    color: var(--muted);
    margin: 0;
    line-height: 1.4;
  }

  .quick-start {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg);
    margin-bottom: var(--space-4xl);
  }

  .quick-start h2 {
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    margin: 0 0 var(--space-lg) 0;
  }

  .tips-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }

  .tip-item {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  kbd {
    padding: var(--space-sm) var(--space-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    min-width: 60px;
    text-align: center;
  }

  .tip-item span {
    font-family: var(--sans);
    font-size: 12px;
    color: var(--text);
  }

  .welcome-footer {
    text-align: center;
  }

  .get-started-button {
    padding: var(--space-xl) var(--space-4xl);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius);
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-slow) var(--ease-smooth);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .get-started-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    background: color-mix(in srgb, var(--accent) 80%, black);
  }

  .get-started-button:focus {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }

  .get-started-button:active {
    transform: translateY(0);
  }

  .footer-note {
    font-family: var(--sans);
    font-size: 11px;
    color: var(--muted);
    margin: var(--space-2xl) 0 0 0;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .welcome-container {
      padding: var(--space-xl) var(--space-3xl);
    }

    #welcome-title {
      font-size: 11px;
    }

    .features-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Alive feeling - pulsing elements */
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }

  .feature-icon {
    animation: pulse 3s ease-in-out infinite;
    animation-delay: calc(var(--index, 0) * 0.2s);
  }

  .feature-card:nth-child(1) .feature-icon {
    animation-delay: 0s;
  }
  .feature-card:nth-child(2) .feature-icon {
    animation-delay: 0.2s;
  }
  .feature-card:nth-child(3) .feature-icon {
    animation-delay: 0.4s;
  }
  .feature-card:nth-child(4) .feature-icon {
    animation-delay: 0.6s;
  }
</style>
