/**
 * Slack Integration
 *
 * Integrates with Slack via webhooks to:
 * - Send error alerts to channels
 * - Post health score updates
 * - Notify about drift events
 * - Share productivity insights
 * - Send daily summaries
 */

import { logger } from '../../utils/logger.js';

export class SlackIntegration {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
    this.enabled = false;
    this.config = null;
  }

  /**
   * Initialize Slack integration with config
   */
  async initialize() {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM integration_configs
        WHERE project_name = ?
          AND integration_type = 'slack'
          AND enabled = 1
        LIMIT 1
      `);

      this.config = stmt.get(this.projectName);

      if (this.config && this.config.config) {
        const config = JSON.parse(this.config.config);
        this.enabled = true;
        this.webhookUrl = config.webhookUrl;
        this.channel = config.channel || null;
        this.username = config.username || 'Corvus';
        this.iconEmoji = config.iconEmoji || ':robot_face:';

        logger.info('Slack integration initialized', {
          service: 'slack-integration',
          project: this.projectName,
          channel: this.channel
        });
      }
    } catch (error) {
      logger.error('Failed to initialize Slack integration', {
        service: 'slack-integration',
        error: error.message
      });
    }
  }

  /**
   * Configure Slack integration
   */
  async configure(config) {
    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO integration_configs (
          project_name, integration_type, enabled, config
        ) VALUES (?, 'slack', 1, ?)
        ON CONFLICT(project_name, integration_type)
        DO UPDATE SET
          enabled = 1,
          config = excluded.config,
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(this.projectName, JSON.stringify(config));

      await this.initialize();

      logger.info('Slack integration configured', {
        service: 'slack-integration',
        project: this.projectName
      });

      return { success: true, message: 'Slack integration configured' };
    } catch (error) {
      logger.error('Failed to configure Slack integration', {
        service: 'slack-integration',
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Disable Slack integration
   */
  async disable() {
    try {
      const stmt = this.db.prepareStatement(`
        UPDATE integration_configs
        SET enabled = 0
        WHERE project_name = ?
          AND integration_type = 'slack'
      `);

      stmt.run(this.projectName);

      this.enabled = false;

      logger.info('Slack integration disabled', {
        service: 'slack-integration',
        project: this.projectName
      });

      return { success: true, message: 'Slack integration disabled' };
    } catch (error) {
      logger.error('Failed to disable Slack integration', {
        service: 'slack-integration',
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Retry helper with exponential backoff
   */
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isRetryableError =
          error.message.includes('5') ||
          error.message.includes('429') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('fetch failed');

        if (isLastAttempt || !isRetryableError) {
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, {
          service: 'slack-integration',
          error: error.message
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Send Slack webhook message
   */
  async sendWebhook(payload) {
    if (!this.enabled || !this.webhookUrl) {
      throw new Error('Slack integration not configured');
    }

    return this.retryWithBackoff(async () => {
      const message = {
        username: this.username,
        icon_emoji: this.iconEmoji,
        ...payload
      };

      if (this.channel) {
        message.channel = this.channel;
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack webhook error: ${response.status} ${errorText}`);
      }

      logger.debug('Slack webhook sent', {
        service: 'slack-integration',
        payload_type: payload.blocks ? 'blocks' : 'text'
      });

      return { success: true };
    });
  }

  /**
   * Send error alert to Slack
   */
  async sendErrorAlert(errorEvent) {
    if (!this.enabled) return null;

    try {
      const severityEmoji = this.getSeverityEmoji(errorEvent.severity);
      const severityColor = this.getSeverityColor(errorEvent.severity);

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji} ${errorEvent.severity.toUpperCase()} Error Detected`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Error Type:*\n${errorEvent.error_type}`
            },
            {
              type: 'mrkdwn',
              text: `*Severity:*\n${errorEvent.severity}`
            },
            {
              type: 'mrkdwn',
              text: `*File:*\n${errorEvent.filepath || 'N/A'}`
            },
            {
              type: 'mrkdwn',
              text: `*Time:*\n<!date^${Math.floor(new Date(errorEvent.timestamp).getTime() / 1000)}^{date_short_pretty} at {time}|${errorEvent.timestamp}>`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Message:*\n${errorEvent.message}`
          }
        }
      ];

      if (errorEvent.stack) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Stack Trace:*\n\`\`\`${errorEvent.stack.substring(0, 500)}\`\`\``
          }
        });
      }

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Corvus Monitoring • ${this.projectName}`
          }
        ]
      });

      await this.sendWebhook({
        blocks,
        attachments: [
          {
            color: severityColor,
            fallback: `${errorEvent.severity} error: ${errorEvent.message}`
          }
        ]
      });

      this.recordEvent('error_alert_sent', {
        error_id: errorEvent.id,
        severity: errorEvent.severity
      });

      logger.info('Error alert sent to Slack', {
        service: 'slack-integration',
        error_id: errorEvent.id
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send error alert', {
        service: 'slack-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Send health score update
   */
  async sendHealthScore(healthScore) {
    if (!this.enabled) return null;

    try {
      const emoji = this.getHealthScoreEmoji(healthScore.overallScore);
      const color = this.getHealthScoreColor(healthScore.overallScore);

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} Project Health Report`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Overall Score: ${healthScore.overallScore}/100*`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Code Quality:*\n${healthScore.breakdown.codeQuality}/100`
            },
            {
              type: 'mrkdwn',
              text: `*Test Coverage:*\n${healthScore.breakdown.testCoverage}/100`
            },
            {
              type: 'mrkdwn',
              text: `*Documentation:*\n${healthScore.breakdown.documentation}/100`
            },
            {
              type: 'mrkdwn',
              text: `*Velocity:*\n${healthScore.breakdown.velocity}/100`
            },
            {
              type: 'mrkdwn',
              text: `*Stability:*\n${healthScore.breakdown.stability}/100`
            },
            {
              type: 'mrkdwn',
              text: `*Security:*\n${healthScore.breakdown.security}/100`
            }
          ]
        }
      ];

      if (healthScore.recommendations && healthScore.recommendations.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Recommendations:*\n${healthScore.recommendations
              .slice(0, 3)
              .map(r => `• ${r.message}`)
              .join('\n')}`
          }
        });
      }

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Corvus Health Monitoring • ${this.projectName} • ${healthScore.date}`
          }
        ]
      });

      await this.sendWebhook({
        blocks,
        attachments: [
          {
            color,
            fallback: `Project health score: ${healthScore.overallScore}/100`
          }
        ]
      });

      this.recordEvent('health_score_sent', {
        score: healthScore.overallScore
      });

      logger.info('Health score sent to Slack', {
        service: 'slack-integration',
        score: healthScore.overallScore
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send health score', {
        service: 'slack-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Send drift alert
   */
  async sendDriftAlert(drifts) {
    if (!this.enabled || drifts.length === 0) return null;

    try {
      const criticalDrifts = drifts.filter(d => d.severity === 'critical' || d.severity === 'high');

      if (criticalDrifts.length === 0) return null;

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Drift Detection Alert'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${criticalDrifts.length}* significant drift(s) detected`
          }
        }
      ];

      criticalDrifts.slice(0, 5).forEach(drift => {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${drift.drift_type.toUpperCase()} - ${drift.severity}*\n${drift.description}\n*Deviation:* ${drift.deviation_percent}%`
          }
        });
        blocks.push({ type: 'divider' });
      });

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Corvus Drift Detection • ${this.projectName}`
          }
        ]
      });

      await this.sendWebhook({
        blocks,
        attachments: [
          {
            color: '#ff6b6b',
            fallback: `${criticalDrifts.length} drift(s) detected`
          }
        ]
      });

      this.recordEvent('drift_alert_sent', {
        drift_count: criticalDrifts.length
      });

      logger.info('Drift alert sent to Slack', {
        service: 'slack-integration',
        drift_count: criticalDrifts.length
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send drift alert', {
        service: 'slack-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Send productivity insights
   */
  async sendProductivityInsights(insights) {
    if (!this.enabled) return null;

    try {
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Productivity Insights'
          }
        }
      ];

      const fields = [];

      if (insights.peak_hours) {
        fields.push({
          type: 'mrkdwn',
          text: `*Peak Hour:*\n${insights.peak_hours.peak_hour}:00`
        });
      }

      if (insights.session_patterns) {
        fields.push({
          type: 'mrkdwn',
          text: `*Optimal Session:*\n${insights.session_patterns.optimal_session_duration?.toFixed(1)} hours`
        });
      }

      if (insights.focus_metrics) {
        fields.push({
          type: 'mrkdwn',
          text: `*Focus Score:*\n${insights.focus_metrics.avg_focus_score?.toFixed(1)}/10`
        });
      }

      if (insights.productivity_trends) {
        const trendIndicator =
          insights.productivity_trends.trend === 'improving'
            ? 'UP'
            : insights.productivity_trends.trend === 'declining'
              ? 'DOWN'
              : 'STABLE';
        fields.push({
          type: 'mrkdwn',
          text: `*Trend (${trendIndicator}):*\n${insights.productivity_trends.trend}`
        });
      }

      if (fields.length > 0) {
        blocks.push({
          type: 'section',
          fields
        });
      }

      if (insights.recommendations && insights.recommendations.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Recommendations:*\n${insights.recommendations
              .slice(0, 3)
              .map(r => `• ${r.message}`)
              .join('\n')}`
          }
        });
      }

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Corvus Productivity Analyzer • ${this.projectName}`
          }
        ]
      });

      await this.sendWebhook({
        blocks,
        attachments: [
          {
            color: '#4ecdc4',
            fallback: 'Productivity insights available'
          }
        ]
      });

      this.recordEvent('productivity_insights_sent', {});

      logger.info('Productivity insights sent to Slack', {
        service: 'slack-integration'
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send productivity insights', {
        service: 'slack-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Send daily summary
   */
  async sendDailySummary(summary) {
    if (!this.enabled) return null;

    try {
      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📅 Daily Summary'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${summary.date}*`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Activity:*\n${summary.total_events} events\n${summary.total_sessions} sessions`
            },
            {
              type: 'mrkdwn',
              text: `*Quality:*\nScore: ${summary.quality_score}/100\nRollbacks: ${summary.rollbacks}`
            },
            {
              type: 'mrkdwn',
              text: `*Agents:*\n${summary.active_agents} active`
            }
          ]
        }
      ];

      if (summary.highlights && summary.highlights.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*✨ Highlights:*\n${summary.highlights.slice(0, 3).join('\n')}`
          }
        });
      }

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Corvus Daily Report • ${this.projectName}`
          }
        ]
      });

      await this.sendWebhook({
        blocks,
        attachments: [
          {
            color: '#95e1d3',
            fallback: `Daily summary for ${summary.date}`
          }
        ]
      });

      this.recordEvent('daily_summary_sent', {
        date: summary.date
      });

      logger.info('Daily summary sent to Slack', {
        service: 'slack-integration',
        date: summary.date
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send daily summary', {
        service: 'slack-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get emoji for severity level
   */
  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: '⚪'
    };
    return emojis[severity] || emojis.info;
  }

  /**
   * Get color for severity level
   */
  getSeverityColor(severity) {
    const colors = {
      critical: 'danger',
      high: 'warning',
      medium: '#ffb347',
      low: '#ffe66d',
      info: 'good'
    };
    return colors[severity] || colors.info;
  }

  /**
   * Get color for health score
   */
  getHealthScoreColor(score) {
    if (score >= 80) return 'good';
    if (score >= 60) return 'warning';
    return 'danger';
  }

  /**
   * Get emoji for health score
   */
  getHealthScoreEmoji(score) {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    if (score >= 40) return '🟠';
    return '🔴';
  }

  /**
   * Record integration event
   */
  recordEvent(eventType, data) {
    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO integration_events (
          project_name, integration_type, event_type, event_data, status
        ) VALUES (?, 'slack', ?, ?, 'success')
      `);

      stmt.run(this.projectName, eventType, JSON.stringify(data));

      logger.debug('Integration event recorded', {
        service: 'slack-integration',
        event_type: eventType
      });
    } catch (error) {
      logger.error('Failed to record integration event', {
        service: 'slack-integration',
        error: error.message
      });
    }
  }

  /**
   * Get recent integration events
   */
  getRecentEvents(hours = 24) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM integration_events
        WHERE project_name = ?
          AND integration_type = 'slack'
          AND timestamp >= datetime('now', '-' || ? || ' hours')
        ORDER BY timestamp DESC
      `);

      const events = stmt.all(this.projectName, hours);

      return events.map(e => ({
        ...e,
        event_data: e.event_data ? JSON.parse(e.event_data) : null
      }));
    } catch (error) {
      logger.error('Failed to get recent events', {
        service: 'slack-integration',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Test Slack webhook
   */
  async testConnection() {
    if (!this.enabled) {
      return { success: false, error: 'Integration not configured' };
    }

    try {
      await this.sendWebhook({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Slack integration test successful!*'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Corvus is connected to this channel for project: *${this.projectName}*`
            }
          }
        ],
        attachments: [
          {
            color: 'good',
            fallback: 'Connection test successful'
          }
        ]
      });

      return { success: true, message: 'Test message sent successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
