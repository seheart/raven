<script>
  import { onMount } from 'svelte';

  const API_BASE = 'http://localhost:3030/api';
  let sessionId = 'Loading...';
  let websocketConnected = false;

  async function loadSessionId() {
    try {
      const response = await fetch(`${API_BASE}/session-id`);
      sessionId = await response.json();
    } catch (error) {
      sessionId = 'Offline';
    }
  }

  onMount(() => {
    loadSessionId();
    // TODO: Add WebSocket status check
    websocketConnected = true;
  });
</script>

<div class="about-page">
  <div class="about-container">
    <div class="about-header">
      <h1>🐦‍⬛ About Raven</h1>
      <p class="tagline">Real-Time AI Agent Monitoring Dashboard</p>
    </div>

    <div class="about-content">
      <section class="about-section">
        <h2>What is Raven?</h2>
        <p>
          Raven is a <strong>real-time monitoring dashboard</strong> designed specifically for AI coding agents like Claude Code.
          Track performance metrics, agent activity, system resources, and custom triggers—all with instant, real-time updates.
        </p>
        <p>
          Built for developers who need htop-level monitoring for AI agents, Raven provides sub-second visibility into
          what your AI assistant is doing and how it's impacting your system resources.
        </p>
      </section>

      <section class="about-section">
        <h2>✨ Features</h2>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">📊</div>
            <h3>Real-Time Monitoring</h3>
            <p>1-second system metrics via WebSocket with no polling overhead</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🤖</div>
            <h3>Agent Tracking</h3>
            <p>Monitor AI agent activity, events, and telemetry in real-time</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <h3>Performance Profiling</h3>
            <p>CPU, memory, network, and process-level metrics with charts</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🔔</div>
            <h3>Custom Triggers</h3>
            <p>Set up alerts for CPU spikes, memory usage, or custom patterns</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🎬</div>
            <h3>Session Replay</h3>
            <p>Review historical agent sessions and analyze behavior</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🔌</div>
            <h3>WebSocket Architecture</h3>
            <p>Instant updates with bidirectional communication, no HTTP polling</p>
          </div>
        </div>
      </section>

      <section class="about-section">
        <h2>🛠️ Tech Stack</h2>
        <div class="tech-stack">
          <div class="tech-category">
            <h3>Backend</h3>
            <div class="tech-items">
              <span class="tech-badge">Node.js</span>
              <span class="tech-badge">Express</span>
              <span class="tech-badge">Socket.io</span>
              <span class="tech-badge">SQLite</span>
              <span class="tech-badge">systeminformation</span>
            </div>
          </div>
          <div class="tech-category">
            <h3>Frontend</h3>
            <div class="tech-items">
              <span class="tech-badge">Svelte</span>
              <span class="tech-badge">Vite</span>
              <span class="tech-badge">Socket.io Client</span>
              <span class="tech-badge">Chart.js</span>
            </div>
          </div>
          <div class="tech-category">
            <h3>Real-Time</h3>
            <div class="tech-items">
              <span class="tech-badge">WebSockets</span>
              <span class="tech-badge">1s Collection Interval</span>
              <span class="tech-badge">Live Metrics</span>
            </div>
          </div>
        </div>
      </section>

      <section class="about-section">
        <h2>📊 Current Session</h2>
        <div class="session-info">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Version</span>
              <span class="info-value">0.0.1</span>
            </div>
            <div class="info-item">
              <span class="info-label">Session ID</span>
              <span class="info-value mono">{sessionId.slice(0, 8)}...</span>
            </div>
            <div class="info-item">
              <span class="info-label">Backend URL</span>
              <span class="info-value mono">http://localhost:3030</span>
            </div>
            <div class="info-item">
              <span class="info-label">Frontend URL</span>
              <span class="info-value mono">http://localhost:5173</span>
            </div>
            <div class="info-item">
              <span class="info-label">WebSocket Status</span>
              <span class="info-value status {websocketConnected ? 'online' : 'offline'}">
                {websocketConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">Real-Time Updates</span>
              <span class="info-value status online">✅ Enabled</span>
            </div>
          </div>
        </div>
      </section>

      <section class="about-section">
        <h2>🎯 Use Cases</h2>
        <ul class="use-cases">
          <li>Monitor Claude Code's resource usage during intensive coding tasks</li>
          <li>Track performance impact of AI-generated code builds and tests</li>
          <li>Set alerts for when your AI agent exceeds resource thresholds</li>
          <li>Analyze session history to optimize AI agent workflows</li>
          <li>Debug agent behavior with real-time event streaming</li>
        </ul>
      </section>

      <section class="about-section footer-section">
        <p class="built-with">
          Built with ❤️ for real-time AI agent monitoring
        </p>
        <p class="github-link">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            View on GitHub →
          </a>
        </p>
      </section>
    </div>
  </div>
</div>

<style>
  .about-page {
    padding: 40px 20px 100px 20px;
    width: 100%;
    background: #0f0f0f;
    color: #e5e5e5;
    min-height: calc(100vh - 200px);
    font-family: 'Inter', sans-serif;
  }

  .about-container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .about-header {
    text-align: center;
    margin-bottom: 60px;
    padding-bottom: 30px;
    border-bottom: 2px solid #1f1f1f;
  }

  .about-header h1 {
    margin: 0 0 16px 0;
    font-size: 48px;
    font-weight: 700;
    background: linear-gradient(135deg, #FF6B35 0%, #F7931A 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .tagline {
    margin: 0;
    font-size: 20px;
    color: #9ca3af;
    font-weight: 500;
  }

  .about-content {
    display: flex;
    flex-direction: column;
    gap: 60px;
  }

  .about-section {
    animation: fadeIn 0.5s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .about-section h2 {
    margin: 0 0 24px 0;
    font-size: 28px;
    color: #FF6B35;
    font-weight: 600;
  }

  .about-section p {
    color: #d1d5db;
    line-height: 1.8;
    font-size: 16px;
    margin-bottom: 16px;
  }

  .about-section strong {
    color: #e5e5e5;
    font-weight: 600;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px;
    margin-top: 24px;
  }

  .feature-card {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    padding: 32px 24px;
    transition: all 0.3s;
  }

  .feature-card:hover {
    background: #1f1f1f;
    border-color: #FF6B35;
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(255, 107, 53, 0.2);
  }

  .feature-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .feature-card h3 {
    margin: 0 0 12px 0;
    font-size: 20px;
    color: #e5e5e5;
    font-weight: 600;
  }

  .feature-card p {
    margin: 0;
    font-size: 14px;
    color: #9ca3af;
    line-height: 1.6;
  }

  .tech-stack {
    display: flex;
    flex-direction: column;
    gap: 32px;
    margin-top: 24px;
  }

  .tech-category h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: #9ca3af;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .tech-items {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .tech-badge {
    padding: 10px 20px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    font-size: 14px;
    color: #e5e5e5;
    font-weight: 500;
    transition: all 0.2s;
  }

  .tech-badge:hover {
    background: #2a2a2a;
    border-color: #FF6B35;
    color: #FF6B35;
  }

  .session-info {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    padding: 32px;
    margin-top: 24px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 24px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .info-label {
    font-size: 12px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .info-value {
    font-size: 16px;
    color: #e5e5e5;
    font-weight: 600;
  }

  .info-value.mono {
    font-family: 'Courier New', monospace;
    font-size: 14px;
  }

  .info-value.status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .info-value.status.online {
    color: #10b981;
  }

  .info-value.status.offline {
    color: #ef4444;
  }

  .use-cases {
    list-style: none;
    padding: 0;
    margin: 24px 0 0 0;
  }

  .use-cases li {
    padding: 16px 0 16px 32px;
    border-bottom: 1px solid #1f1f1f;
    position: relative;
    color: #d1d5db;
    font-size: 16px;
    line-height: 1.6;
  }

  .use-cases li:last-child {
    border-bottom: none;
  }

  .use-cases li::before {
    content: "▸";
    position: absolute;
    left: 0;
    color: #FF6B35;
    font-size: 20px;
  }

  .footer-section {
    text-align: center;
    padding-top: 40px;
    border-top: 2px solid #1f1f1f;
  }

  .built-with {
    font-size: 18px;
    color: #6b7280;
    font-style: italic;
    margin-bottom: 16px;
  }

  .github-link a {
    display: inline-block;
    padding: 12px 32px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    color: #FF6B35;
    text-decoration: none;
    font-weight: 600;
    font-size: 16px;
    transition: all 0.2s;
  }

  .github-link a:hover {
    background: #2a2a2a;
    border-color: #FF6B35;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
  }

  @media (max-width: 768px) {
    .about-header h1 {
      font-size: 36px;
    }

    .tagline {
      font-size: 16px;
    }

    .features-grid {
      grid-template-columns: 1fr;
    }

    .info-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
