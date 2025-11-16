<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { api } from './apiClient.js';

  import { formatDurationMinutes } from './formatUtils.js';
  import { websocketService } from './websocket.js';

  export let project = 'raven';

  let currentSession = null;
  let quality = null;
  let breakRecommendation = null;
  let stats = null;
  let loading = true;
  let error = null;
  let sessionStartTime = null;

  async function loadSessionData() {
    loading = true;
    error = null;

    try {
      // Load current session
      const sessionData = await api.get(`/sessions/current?project=${project}`);
      currentSession = sessionData.hasActiveSession ? sessionData.session : null;

      if (currentSession) {
        // Load quality metrics
        try {
          const qualityData = await api.get(`/sessions/quality?project=${project}`);
          quality = qualityData.quality;
          // Use recommendation from quality endpoint if available
          breakRecommendation = qualityData.quality?.recommendation || null;
        } catch (err) {
          logger.warn('Quality metrics not available:', err);
          quality = null;
          breakRecommendation = null;
        }

        // Store session start time for duration calculation
        sessionStartTime = currentSession.startTime ? new Date(currentSession.startTime) : null;
      }

      // Load session stats (last 30 days)
      try {
        const statsData = await api.get(`/sessions/stats?project=${project}&days=30`);
        stats = statsData.stats;
      } catch (err) {
        logger.warn('Session stats not available:', err);
        stats = null;
      }
    } catch (err) {
      logger.error('Failed to load session data:', error);
      errorMessage = error.message;
    } finally {
      loading = false;
    }
  }

  // WebSocket event handlers (event-driven, no polling!)
  const handleFileChanged = async () => {
    await loadSessionData();
  };

  const handleProjectSwitched = async () => {
    await loadSessionData();
  };

  onMount(async () => {
    await loadSessionData();

    // Connect to WebSocket for real-time updates
    websocketService.connect();
    websocketService.on('file-changed', handleFileChanged);
    websocketService.on('project-switched', handleProjectSwitched);
  });

  onDestroy(() => {
    // Clean up WebSocket listeners
    websocketService.off('file-changed', handleFileChanged);
    websocketService.off('project-switched', handleProjectSwitched);
  });

  function getQualityColor(score) {
    if (score >= 80) return 'var(--success)'; // Green - excellent
    if (score >= 70) return 'var(--info)'; // Blue - good
    if (score >= 50) return 'var(--warning)'; // Orange - warning
    return 'var(--error)'; // Red - critical
  }

  function getQualityLabel(score) {
    if (score >= 80) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  }

  function getUrgencyIcon(urgency) {
    if (urgency === 'critical') return '🚨';
    if (urgency === 'warning') return '⚠️';
    if (urgency === 'info') return 'ℹ️';
    return '✅';
  }

  function formatTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  }

  // Reactive session duration - calculates from start time (no polling!)
  $: sessionDuration =
    currentSession && sessionStartTime
      ? (Date.now() - sessionStartTime.getTime()) / 1000 / 60 // minutes
      : currentSession?.durationMinutes || 0;
</script>

<div class="card session-dashboard">
  <div class="dashboard-header">
    <h3>⏱️ Session Intelligence</h3>
    {#if currentSession}
      <span class="active-indicator">
        <span class="pulse-dot"></span>
        Active Session
      </span>
    {/if}
  </div>

  {#if loading && !currentSession}
    <div class="loading-skeleton">
      <div class="skeleton skeleton-panel">
        <div class="skeleton skeleton-heading"></div>
        <div class="skeleton skeleton-hero"></div>
        <div class="skeleton-grid">
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
        </div>
      </div>
    </div>
  {:else if error}
    <div class="error-state">
      <p>❌ Failed to load session data</p>
      <p class="error-detail">{error}</p>
    </div>
  {:else}
    <div class="dashboard-content">
      <!-- Active Session Panel -->
      {#if currentSession}
        <div class="panel active-session-panel">
          <div class="panel-title">Current Session</div>

          <div class="session-timer">
            <div class="timer-display">
              {formatDurationMinutes(sessionDuration)}
            </div>
            <div class="timer-label">Session Duration</div>
          </div>

          <div class="session-metrics">
            <div class="metric-item">
              <div class="metric-value">{currentSession.changesCount}</div>
              <div class="metric-label">Changes</div>
            </div>
            <div class="metric-item">
              <div
                class="metric-value"
                style="color: {getQualityColor(currentSession.qualityScore)}"
              >
                {currentSession.qualityScore}
              </div>
              <div class="metric-label">Quality</div>
            </div>
          </div>

          {#if quality}
            <div class="quality-section">
              <div class="quality-header">
                <span
                  class="quality-badge"
                  style="background: {getQualityColor(
                    quality.score
                  )}33; border-color: {getQualityColor(quality.score)};"
                >
                  {quality.score}/100
                </span>
                <span class="quality-label" style="color: {getQualityColor(quality.score)}">
                  {getQualityLabel(quality.score)}
                </span>
              </div>

              {#if quality.factors && quality.factors.length > 0}
                <div class="quality-factors">
                  <div class="factors-title">Quality Factors:</div>
                  {#each quality.factors as factor (factor.type)}
                    <div class="factor-item">
                      <span class="factor-icon">
                        {#if factor.type === 'high_rollback_rate'}
                          ↩️
                        {:else if factor.type === 'long_session'}
                          ⏰
                        {:else if factor.type === 'increasing_change_size'}
                          📈
                        {:else if factor.type === 'high_risk_changes'}
                          ⚠️
                        {/if}
                      </span>
                      <span class="factor-message">{factor.message}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if breakRecommendation && breakRecommendation.shouldTakeBreak}
            <div
              class="break-recommendation"
              class:critical={breakRecommendation.urgency === 'critical'}
              class:warning={breakRecommendation.urgency === 'warning'}
            >
              <div class="break-header">
                <span class="break-icon">{getUrgencyIcon(breakRecommendation.urgency)}</span>
                <span class="break-title">Break Recommendation</span>
              </div>
              <div class="break-message">{breakRecommendation.message}</div>
              {#if breakRecommendation.breakDuration}
                <div class="break-duration">
                  Suggested: {breakRecommendation.breakDuration} minute break
                </div>
              {/if}
              {#if breakRecommendation.reasons && breakRecommendation.reasons.length > 0}
                <div class="break-reasons">
                  {#each breakRecommendation.reasons as reason, i (i)}
                    <div class="reason-item">• {reason}</div>
                  {/each}
                </div>
              {/if}
            </div>
          {:else if breakRecommendation}
            <div class="no-break-needed">
              ✅ {breakRecommendation.message}
            </div>
          {/if}
        </div>
      {:else}
        <div class="panel no-session-panel">
          <div class="no-session-icon">💤</div>
          <div class="no-session-title">No Active Session</div>
          <div class="no-session-hint">Start coding to begin a new session</div>
        </div>
      {/if}

      <!-- Session Statistics Panel -->
      {#if stats}
        <div class="panel stats-panel">
          <div class="panel-title">Session Statistics (Last 30 Days)</div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-icon">📊</div>
              <div class="stat-value">{stats.totalSessions}</div>
              <div class="stat-label">Total Sessions</div>
            </div>

            <div class="stat-card">
              <div class="stat-icon">⏱️</div>
              <div class="stat-value">{stats.avgDuration}h</div>
              <div class="stat-label">Avg Duration</div>
            </div>

            <div class="stat-card">
              <div class="stat-icon">⭐</div>
              <div class="stat-value" style="color: {getQualityColor(stats.avgQuality)}">
                {stats.avgQuality}
              </div>
              <div class="stat-label">Avg Quality</div>
            </div>

            <div class="stat-card">
              <div class="stat-icon">↩️</div>
              <div class="stat-value">{stats.avgRollbackRate}</div>
              <div class="stat-label">Rollback Rate</div>
            </div>
          </div>

          {#if stats.peakHours && stats.peakHours.length > 0}
            <div class="peak-hours-section">
              <div class="peak-hours-title">🔥 Peak Productivity Hours</div>
              <div class="peak-hours-list">
                {#each stats.peakHours as peak (peak.hour)}
                  <div class="peak-hour-item">
                    <div class="peak-hour-time">
                      {peak.hour}:00
                    </div>
                    <div class="peak-hour-bar">
                      <div
                        class="peak-hour-fill"
                        style="width: {stats.peakHours &&
                        stats.peakHours.length > 0 &&
                        stats.peakHours[0].avgChanges
                          ? (peak.avgChanges / stats.peakHours[0].avgChanges) * 100
                          : 100}%"
                      ></div>
                    </div>
                    <div class="peak-hour-stats">
                      {peak.avgChanges.toFixed(1)} avg changes
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if stats.recentSessions && stats.recentSessions.length > 0}
            <div class="recent-sessions-section">
              <div class="recent-sessions-title">Recent Sessions</div>
              <div class="recent-sessions-list">
                {#each stats.recentSessions.slice(0, 5) as session (session.start_time)}
                  <div class="recent-session-item">
                    <div class="session-info">
                      <span class="session-time">{formatTimeAgo(session.start_time)}</span>
                      <span class="session-separator">•</span>
                      <span class="session-duration">{session.duration_hours.toFixed(1)}h</span>
                      <span class="session-separator">•</span>
                      <span class="session-changes">{session.changes_count} changes</span>
                    </div>
                    <div
                      class="session-quality"
                      style="color: {getQualityColor(session.quality_score)}"
                    >
                      {session.quality_score}/100
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .session-dashboard {
    /* Using standardized .card class */
    border-width: 2px; /* Custom: thicker border */
    padding: 0; /* Custom: no padding on container, padding on children instead */
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); /* Custom: enhanced shadow */
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg);
    border-bottom: 2px solid var(--border);
  }

  .dashboard-header h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    font-family: var(--sans);
  }

  .active-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-xl);
    background: color-mix(in srgb, var(--success) 15%, transparent);
    border: 1px solid var(--success);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
    color: var(--success);
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    background: var(--success);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }

  .error-state {
    padding: var(--space-lg) var(--space-xl);
    text-align: center;
    color: var(--muted);
  }

  .error-detail {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--error);
    margin-top: var(--space-lg);
  }

  .dashboard-content {
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
    animation: fadeInUp 0.3s ease-out;
  }

  .panel {
    background: var(--bg); /* Custom: different background */
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-lg); /* Custom: 8px padding */
    transition: all var(--duration-base) var(--ease-smooth);
  }

  .panel:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .panel-title {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--sans);
    color: var(--text);
    margin-bottom: var(--space-lg);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Active Session Panel */
  .active-session-panel {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 3%, var(--bg));
  }

  .session-timer {
    text-align: center;
    padding: var(--space-xl);
    background: var(--surface);
    border-radius: var(--radius);
    margin-bottom: var(--space-lg);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: transform var(--duration-base) var(--ease-smooth);
  }

  .session-timer:hover {
    transform: scale(1.02);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .timer-display {
    font-size: var(--icon-lg);
    font-weight: 700;
    font-family: var(--mono);
    color: var(--accent);
    line-height: 1.1;
    margin-bottom: var(--space-sm);
    animation: fadeIn 0.3s ease;
  }

  .timer-label {
    font-size: 10px;
    font-family: var(--sans);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .session-metrics {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .metric-item {
    text-align: center;
    padding: var(--space-md);
    background: var(--surface);
    border-radius: var(--radius-sm);
  }

  .metric-value {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
    line-height: 1;
    margin-bottom: var(--space-md);
  }

  .metric-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .quality-section {
    margin-top: var(--space-lg);
    padding: var(--space-md);
    background: var(--surface);
    border-radius: var(--radius);
  }

  .quality-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
  }

  .quality-badge {
    padding: var(--space-md) var(--space-xl);
    border: 2px solid;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
  }

  .quality-label {
    font-size: 11px;
    font-weight: 700;
  }

  .quality-factors {
    margin-top: var(--space-xl);
  }

  .factors-title {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-lg);
    font-weight: 600;
  }

  .factor-item {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    padding: var(--space-lg);
    background: var(--bg);
    border-radius: var(--radius);
    margin-bottom: var(--space-md);
    font-size: 12px;
  }

  .factor-icon {
    font-size: 11px;
  }

  .factor-message {
    color: var(--text);
  }

  .break-recommendation {
    margin-top: var(--space-lg);
    padding: var(--space-md);
    background: var(--surface-2);
    border-left: 4px solid var(--accent);
    border-radius: var(--radius);
  }

  .break-recommendation.critical {
    background: color-mix(in srgb, var(--error) 15%, transparent);
    border-left-color: var(--error);
  }

  .break-recommendation.warning {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    border-left-color: var(--warning);
  }

  .break-header {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .break-icon {
    font-size: 12px;
  }

  .break-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
  }

  .break-message {
    font-size: 11px;
    color: var(--text);
    margin-bottom: var(--space-lg);
    font-weight: 600;
  }

  .break-duration {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: var(--space-lg);
  }

  .break-reasons {
    margin-top: var(--space-xl);
    font-size: 11px;
    color: var(--muted);
  }

  .reason-item {
    padding: var(--space-sm) 0;
  }

  .no-break-needed {
    margin-top: var(--space-lg);
    padding: var(--space-md);
    background: color-mix(in srgb, var(--success) 10%, transparent);
    border-left: 4px solid var(--success);
    border-radius: var(--radius);
    color: var(--success);
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }

  /* No Session Panel */
  .no-session-panel {
    text-align: center;
    padding: var(--space-lg) var(--space-xl);
  }

  .no-session-icon {
    font-size: 11px;
    margin-bottom: var(--space-md);
  }

  .no-session-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: var(--space-lg);
  }

  .no-session-hint {
    font-size: 11px;
    color: var(--muted);
  }

  /* Statistics Panel */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
  }

  .stat-card {
    /* Card-like styling but with custom requirements */
    text-align: center;
    padding: var(--space-lg); /* Custom: 8px padding */
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: all var(--duration-base) var(--ease-smooth);
    cursor: pointer;
  }

  .stat-card:hover {
    transform: translateY(-2px) scale(1.01);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-color: var(--accent);
  }

  .stat-card:active {
    transform: translateY(-2px) scale(1);
  }

  .stat-icon {
    font-size: var(--icon-lg);
    margin-bottom: var(--space-xl);
  }

  .stat-value {
    font-size: var(--icon-lg);
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
    line-height: 1;
    margin-bottom: var(--space-lg);
  }

  .stat-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .peak-hours-section {
    margin-top: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface);
    border-radius: var(--radius);
  }

  .peak-hours-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: var(--space-md);
  }

  .peak-hours-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .peak-hour-item {
    display: grid;
    grid-template-columns: 60px 1fr 120px;
    align-items: center;
    gap: var(--space-md);
  }

  .peak-hour-time {
    font-size: 11px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
  }

  .peak-hour-bar {
    height: var(--icon-md);
    background: var(--bg);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .peak-hour-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--success));
    transition: width var(--duration-slow) var(--ease-smooth);
  }

  .peak-hour-stats {
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }

  .recent-sessions-section {
    margin-top: var(--space-lg);
    padding: var(--space-lg);
    background: var(--surface);
    border-radius: var(--radius);
  }

  .recent-sessions-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: var(--space-md);
  }

  .recent-sessions-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .recent-session-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xl);
    background: var(--bg);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .session-info {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
    color: var(--muted);
  }

  .session-separator {
    color: var(--border);
  }

  .session-quality {
    font-weight: 700;
    font-family: var(--mono);
  }

  /* Skeleton Loading */
  .loading-skeleton {
    padding: var(--space-xl);
  }

  .skeleton-panel {
    padding: var(--space-lg);
    border-radius: var(--radius);
  }

  .skeleton-hero {
    height: 120px;
    margin-bottom: var(--space-lg);
  }

  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-md);
  }

  .skeleton-card {
    height: 100px;
  }
</style>
