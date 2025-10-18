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
      case 'feature': return '#10b981';
      case 'fix': return '#ef4444';
      case 'improvement': return '#3b82f6';
      case 'breaking': return '#f59e0b';
      case 'security': return '#8b5cf6';
      case 'docs': return '#6b7280';
      default: return '#9ca3af';
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
    padding: 40px 20px 100px 20px;
    width: 100%;
    background: #0f0f0f;
    color: #e5e5e5;
    min-height: calc(100vh - 200px);
    font-family: 'Inter', sans-serif;
  }

  .changelog-container {
    max-width: 900px;
    margin: 0 auto;
  }

  .changelog-header {
    text-align: center;
    margin-bottom: 60px;
    padding-bottom: 30px;
    border-bottom: 2px solid #1f1f1f;
  }

  .changelog-header h1 {
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

  .changelog-content {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  .release-section {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    padding: 32px;
    transition: all 0.3s;
  }

  .release-section:hover {
    border-color: #FF6B35;
    box-shadow: 0 4px 16px rgba(255, 107, 53, 0.1);
  }

  .release-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid #2a2a2a;
  }

  .release-title {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .release-title h2 {
    margin: 0;
    font-size: 28px;
    color: #FF6B35;
    font-weight: 600;
  }

  .release-subtitle {
    font-size: 16px;
    color: #9ca3af;
    font-weight: 500;
  }

  .release-date {
    font-size: 14px;
    color: #6b7280;
    font-family: 'Courier New', monospace;
    background: #0f0f0f;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #2a2a2a;
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
    background: #0f0f0f;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .change-item:hover {
    background: #1a1a1a;
  }

  .change-icon {
    font-size: 20px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .change-description {
    color: #d1d5db;
    font-size: 15px;
    line-height: 1.6;
  }

  .changelog-footer {
    text-align: center;
    padding: 40px 20px;
    margin-top: 20px;
  }

  .changelog-footer p {
    font-size: 18px;
    color: #6b7280;
    font-style: italic;
    margin: 0;
  }

  @media (max-width: 768px) {
    .changelog-header h1 {
      font-size: 36px;
    }

    .tagline {
      font-size: 16px;
    }

    .release-header {
      flex-direction: column;
      gap: 12px;
    }

    .release-title h2 {
      font-size: 24px;
    }
  }
</style>
