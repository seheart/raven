<script>
  export let visible = false;
  export let onClose = () => {};

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if visible}
  <div class="modal-backdrop" on:click={handleBackdropClick}>
    <div class="modal">
      <div class="modal-header">
        <h2>🐦‍⬛ About Raven</h2>
        <button class="close-btn" on:click={onClose}>✕</button>
      </div>

      <div class="modal-content">
        <div class="section">
          <h3>What is Raven?</h3>
          <p>
            Raven is a <strong>real-time monitoring dashboard</strong> for AI coding agents like Claude Code.
            Track performance metrics, agent activity, system resources, and custom triggers—all in real-time.
          </p>
        </div>

        <div class="section">
          <h3>✨ Features</h3>
          <ul>
            <li><strong>Real-Time Monitoring</strong> - 1-second system metrics via WebSocket</li>
            <li><strong>Agent Tracking</strong> - Monitor AI agent activity and events</li>
            <li><strong>Performance Profiling</strong> - CPU, memory, and process metrics</li>
            <li><strong>Custom Triggers</strong> - Set up alerts for specific conditions</li>
            <li><strong>Session Replay</strong> - Review historical agent sessions</li>
            <li><strong>WebSocket Architecture</strong> - Instant updates with no polling</li>
          </ul>
        </div>

        <div class="section">
          <h3>🛠️ Tech Stack</h3>
          <div class="tech-grid">
            <div class="tech-item">
              <strong>Backend:</strong>
              <span>Node.js + Express + Socket.io</span>
            </div>
            <div class="tech-item">
              <strong>Frontend:</strong>
              <span>Svelte + Vite</span>
            </div>
            <div class="tech-item">
              <strong>Database:</strong>
              <span>SQLite</span>
            </div>
            <div class="tech-item">
              <strong>Real-Time:</strong>
              <span>WebSockets (Socket.io)</span>
            </div>
          </div>
        </div>

        <div class="section">
          <h3>📊 Current Session</h3>
          <div class="session-info">
            <div class="info-row">
              <span class="label">Version:</span>
              <span class="value">1.0.0</span>
            </div>
            <div class="info-row">
              <span class="label">Backend:</span>
              <span class="value">http://localhost:3030</span>
            </div>
            <div class="info-row">
              <span class="label">Frontend:</span>
              <span class="value">http://localhost:5173</span>
            </div>
            <div class="info-row">
              <span class="label">WebSocket:</span>
              <span class="value status-online">🟢 Connected</span>
            </div>
          </div>
        </div>

        <div class="section footer-section">
          <p class="built-with">
            Built with ❤️ for real-time AI agent monitoring
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    max-width: 700px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px;
    border-bottom: 1px solid #2a2a2a;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 24px;
    color: #e5e5e5;
  }

  .close-btn {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: #2a2a2a;
    color: #FF6B35;
  }

  .modal-content {
    padding: 24px;
  }

  .section {
    margin-bottom: 28px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section h3 {
    margin: 0 0 12px 0;
    font-size: 18px;
    color: #FF6B35;
  }

  .section p {
    color: #d1d5db;
    line-height: 1.6;
    margin: 0;
  }

  .section strong {
    color: #e5e5e5;
  }

  .section ul {
    margin: 8px 0 0 0;
    padding-left: 20px;
    list-style: none;
  }

  .section ul li {
    color: #d1d5db;
    margin: 8px 0;
    position: relative;
    padding-left: 20px;
  }

  .section ul li::before {
    content: "▸";
    position: absolute;
    left: 0;
    color: #FF6B35;
  }

  .tech-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }

  .tech-item {
    background: #0f0f0f;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #2a2a2a;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tech-item strong {
    color: #9ca3af;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tech-item span {
    color: #e5e5e5;
    font-size: 14px;
  }

  .session-info {
    background: #0f0f0f;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    margin-top: 12px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #1f1f1f;
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .info-row .label {
    color: #9ca3af;
    font-size: 14px;
  }

  .info-row .value {
    color: #e5e5e5;
    font-size: 14px;
    font-family: 'Courier New', monospace;
  }

  .info-row .value.status-online {
    color: #10b981;
  }

  .footer-section {
    text-align: center;
    padding-top: 20px;
    border-top: 1px solid #2a2a2a;
  }

  .built-with {
    color: #6b7280;
    font-size: 14px;
    font-style: italic;
  }

  @media (max-width: 768px) {
    .modal {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .tech-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
