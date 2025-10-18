<script>
  const changelog = [
    {
      version: '0.0.1',
      date: '2025-10-18',
      title: 'Initial Development - Phase II Complete',
      changes: [
        {
          type: 'feature',
          description: 'Real-time WebSocket architecture with 1-second metrics collection'
        },
        {
          type: 'feature',
          description: 'Dashboard with live agent activity and system metrics'
        },
        {
          type: 'feature',
          description: 'Performance panel with CPU, memory, and network monitoring'
        },
        {
          type: 'feature',
          description: 'Triggers system with TOML-based configuration'
        },
        {
          type: 'feature',
          description: 'Agents panel for AI agent tracking and telemetry'
        },
        {
          type: 'feature',
          description: 'Status page for backend health monitoring'
        },
        {
          type: 'feature',
          description: 'Session Replay placeholder for future development'
        },
        {
          type: 'feature',
          description: 'Keyboard shortcuts for navigation (1-7 keys)'
        },
        {
          type: 'feature',
          description: 'Dark theme with orange accent colors'
        },
        {
          type: 'feature',
          description: 'Footer with About and Changelog pages'
        }
      ]
    }
  ];

  function getTypeIcon(type) {
    switch (type) {
      case 'feature': return '✨';
      case 'fix': return '🐛';
      case 'improvement': return '⚡';
      case 'breaking': return '💥';
      case 'security': return '🔒';
      case 'docs': return '📝';
      default: return '•';
    }
  }

  function getTypeColor(type) {
    switch (type) {
      case 'feature': return 'var(--success)';
      case 'fix': return 'var(--error)';
      case 'improvement': return 'var(--info)';
      case 'breaking': return 'var(--warning)';
      case 'security': return 'var(--accent-2)';
      case 'docs': return 'var(--muted)';
      default: return 'var(--muted)';
    }
  }
</script>

<div class="changelog-page">
  <div class="changelog-container">
    <div class="changelog-header">
      <h1>📋 Changelog</h1>
      <p class="tagline">Track Raven's development progress and updates</p>
    </div>

    <div class="changelog-content">
      {#each changelog as release}
        <div class="release-section">
          <div class="release-header">
            <div class="release-title">
              <h2>Version {release.version}</h2>
              {#if release.title}
                <span class="release-subtitle">{release.title}</span>
              {/if}
            </div>
            <div class="release-date">{release.date}</div>
          </div>

          <div class="changes-list">
            {#each release.changes as change}
              <div class="change-item">
                <span
                  class="change-icon"
                  style="color: {getTypeColor(change.type)}"
                >
                  {getTypeIcon(change.type)}
                </span>
                <span class="change-description">{change.description}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}

      <div class="changelog-footer">
        <p>More updates coming soon! 🚀</p>
      </div>
    </div>
  </div>
</div>

<style>
  .changelog-page {
    padding: 16px 20px 100px 20px;
    width: 100%;
    background: var(--bg);
    color: var(--text);
    min-height: calc(100vh - 200px);
    font-family: var(--mono);
  }

  .changelog-container {
    max-width: 900px;
    margin: 0 auto;
  }

  .changelog-header {
    text-align: center;
    margin-bottom: 60px;
    padding-bottom: 30px;
    border-bottom: 2px solid var(--border);
  }

  .changelog-header h1 {
    margin: 0 0 16px 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }

  .tagline {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .changelog-content {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  .release-section {
    background: var(--surface);
    border: 1px solid var(--surface-2);
    border-radius: 12px;
    padding: 12px;
    transition: all 0.3s;
  }

  .release-section:hover {
    border-color: var(--accent);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .release-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--surface-2);
  }

  .release-title {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .release-title h2 {
    margin: 0;
    font-size: 13px;
    color: var(--accent);
    font-weight: 600;
  }

  .release-subtitle {
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
  }

  .release-date {
    font-size: 12px;
    color: var(--muted);
    font-family: 'Courier New', monospace;
    background: var(--bg);
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--surface-2);
  }

  .changes-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .change-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    background: var(--bg);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .change-item:hover {
    background: var(--surface);
  }

  .change-icon {
    font-size: 12px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .change-description {
    color: var(--text);
    font-size: 12px;
    line-height: 1.4;
  }

  .changelog-footer {
    text-align: center;
    padding: 16px 20px;
    margin-top: 20px;
  }

  .changelog-footer p {
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
    margin: 0;
  }

  @media (max-width: 768px) {
    .changelog-header h1 {
      font-size: 13px;
    }

    .tagline {
      font-size: 12px;
    }

    .release-header {
      flex-direction: column;
      gap: 12px;
    }

    .release-title h2 {
      font-size: 13px;
    }
  }
</style>
