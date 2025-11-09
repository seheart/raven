/**
 * Discord Integration
 *
 * Integrates with Discord via webhooks to:
 * - Send error alerts to channels
 * - Post health score updates
 * - Notify about drift events
 * - Share productivity insights
 * - Send daily summaries
 */

import { logger } from '../../utils/logger.js';

export class DiscordIntegration {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
    this.enabled = false;
    this.config = null;
  }

  /**
   * Initialize Discord integration with config
   */
  async initialize() {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM integration_configs
        WHERE project_name = ?
          AND integration_type = 'discord'
          AND enabled = 1
        LIMIT 1
      `);

      this.config = stmt.get(this.projectName);

      if (this.config && this.config.config) {
        const config = JSON.parse(this.config.config);
        this.enabled = true;
        this.webhookUrl = config.webhookUrl;
        this.username = config.username || 'Corvus';
        this.avatarUrl = config.avatarUrl || null;

        logger.info('Discord integration initialized', {
          service: 'discord-integration',
          project: this.projectName
        });
      }
    } catch (error) {
      logger.error('Failed to initialize Discord integration', {
        service: 'discord-integration',
        error: error.message
      });
    }
  }

  /**
   * Configure Discord integration
   */
  async configure(config) {
    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO integration_configs (
          project_name, integration_type, enabled, config
        ) VALUES (?, 'discord', 1, ?)
        ON CONFLICT(project_name, integration_type)
        DO UPDATE SET
          enabled = 1,
          config = excluded.config,
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(this.projectName, JSON.stringify(config));

      await this.initialize();

      logger.info('Discord integration configured', {
        service: 'discord-integration',
        project: this.projectName
      });

      return { success: true, message: 'Discord integration configured' };
    } catch (error) {
      logger.error('Failed to configure Discord integration', {
        service: 'discord-integration',
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Disable Discord integration
   */
  async disable() {
    try {
      const stmt = this.db.prepareStatement(`
        UPDATE integration_configs
        SET enabled = 0
        WHERE project_name = ?
          AND integration_type = 'discord'
      `);

      stmt.run(this.projectName);

      this.enabled = false;

      logger.info('Discord integration disabled', {
        service: 'discord-integration',
        project: this.projectName
      });

      return { success: true, message: 'Discord integration disabled' };
    } catch (error) {
      logger.error('Failed to disable Discord integration', {
        service: 'discord-integration',
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
          service: 'discord-integration',
          error: error.message
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Send Discord webhook message
   */
  async sendWebhook(payload) {
    if (!this.enabled || !this.webhookUrl) {
      throw new Error('Discord integration not configured');
    }

    return this.retryWithBackoff(async () => {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: this.username,
          avatar_url: this.avatarUrl,
          ...payload
        })
      });

      if (!response.ok) {
        throw new Error(`Discord webhook error: ${response.status} ${response.statusText}`);
      }

      logger.debug('Discord webhook sent', {
        service: 'discord-integration',
        payload_type: payload.embeds ? 'embed' : 'message'
      });

      return { success: true };
    });
  }

  /**
   * Send error alert to Discord
   */
  async sendErrorAlert(errorEvent) {
    if (!this.enabled) return null;

    try {
      const color = this.getSeverityColor(errorEvent.severity);

      const embed = {
        title: `🚨 ${errorEvent.severity.toUpperCase()} Error Detected`,
        description: errorEvent.message,
        color,
        fields: [
          {
            name: 'Error Type',
            value: errorEvent.error_type,
            inline: true
          },
          {
            name: 'Severity',
            value: errorEvent.severity,
            inline: true
          },
          {
            name: 'File',
            value: errorEvent.filepath || 'N/A',
            inline: false
          }
        ],
        timestamp: new Date(errorEvent.timestamp).toISOString(),
        footer: {
          text: `Corvus Monitoring • ${this.projectName}`
        }
      };

      if (errorEvent.stack) {
        embed.fields.push({
          name: 'Stack Trace',
          value: `\`\`\`\n${errorEvent.stack.substring(0, 500)}\n\`\`\``,
          inline: false
        });
      }

      await this.sendWebhook({ embeds: [embed] });

      this.recordEvent('error_alert_sent', {
        error_id: errorEvent.id,
        severity: errorEvent.severity
      });

      logger.info('Error alert sent to Discord', {
        service: 'discord-integration',
        error_id: errorEvent.id
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send error alert', {
        service: 'discord-integration',
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
      const color = this.getHealthScoreColor(healthScore.overallScore);
      const emoji = this.getHealthScoreEmoji(healthScore.overallScore);

      const embed = {
        title: `${emoji} Project Health Report`,
        description: `Overall Score: **${healthScore.overallScore}/100**`,
        color,
        fields: [
          {
            name: 'Code Quality',
            value: `${healthScore.breakdown.codeQuality}/100`,
            inline: true
          },
          {
            name: 'Test Coverage',
            value: `${healthScore.breakdown.testCoverage}/100`,
            inline: true
          },
          {
            name: 'Documentation',
            value: `${healthScore.breakdown.documentation}/100`,
            inline: true
          },
          {
            name: 'Velocity',
            value: `${healthScore.breakdown.velocity}/100`,
            inline: true
          },
          {
            name: 'Stability',
            value: `${healthScore.breakdown.stability}/100`,
            inline: true
          },
          {
            name: 'Security',
            value: `${healthScore.breakdown.security}/100`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Corvus Health Monitoring • ${this.projectName}`
        }
      };

      if (healthScore.recommendations && healthScore.recommendations.length > 0) {
        embed.fields.push({
          name: 'Recommendations',
          value: healthScore.recommendations
            .slice(0, 3)
            .map(r => `• ${r.message}`)
            .join('\n'),
          inline: false
        });
      }

      await this.sendWebhook({ embeds: [embed] });

      this.recordEvent('health_score_sent', {
        score: healthScore.overallScore
      });

      logger.info('Health score sent to Discord', {
        service: 'discord-integration',
        score: healthScore.overallScore
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send health score', {
        service: 'discord-integration',
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

      const embed = {
        title: 'Drift Detection Alert',
        description: `**${criticalDrifts.length}** significant drift(s) detected`,
        color: 0xff6b6b,
        fields: criticalDrifts.slice(0, 5).map(d => ({
          name: `${d.drift_type.toUpperCase()} - ${d.severity}`,
          value: `${d.description}\n**Deviation:** ${d.deviation_percent}%`,
          inline: false
        })),
        timestamp: new Date().toISOString(),
        footer: {
          text: `Corvus Drift Detection • ${this.projectName}`
        }
      };

      await this.sendWebhook({ embeds: [embed] });

      this.recordEvent('drift_alert_sent', {
        drift_count: criticalDrifts.length
      });

      logger.info('Drift alert sent to Discord', {
        service: 'discord-integration',
        drift_count: criticalDrifts.length
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send drift alert', {
        service: 'discord-integration',
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
      const embed = {
        title: 'Productivity Insights',
        color: 0x4ecdc4,
        fields: [],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Corvus Productivity Analyzer • ${this.projectName}`
        }
      };

      if (insights.peak_hours) {
        embed.fields.push({
          name: 'Peak Hour',
          value: `${insights.peak_hours.peak_hour}:00`,
          inline: true
        });
      }

      if (insights.session_patterns) {
        embed.fields.push({
          name: 'Optimal Session',
          value: `${insights.session_patterns.optimal_session_duration?.toFixed(1)} hours`,
          inline: true
        });
      }

      if (insights.focus_metrics) {
        embed.fields.push({
          name: 'Focus Score',
          value: `${insights.focus_metrics.avg_focus_score?.toFixed(1)}/10`,
          inline: true
        });
      }

      if (insights.productivity_trends) {
        const trendIndicator =
          insights.productivity_trends.trend === 'improving'
            ? 'UP'
            : insights.productivity_trends.trend === 'declining'
              ? 'DOWN'
              : 'STABLE';
        embed.fields.push({
          name: `Trend (${trendIndicator})`,
          value: insights.productivity_trends.trend,
          inline: true
        });
      }

      if (insights.recommendations && insights.recommendations.length > 0) {
        embed.fields.push({
          name: 'Recommendations',
          value: insights.recommendations
            .slice(0, 3)
            .map(r => `• ${r.message}`)
            .join('\n'),
          inline: false
        });
      }

      await this.sendWebhook({ embeds: [embed] });

      this.recordEvent('productivity_insights_sent', {});

      logger.info('Productivity insights sent to Discord', {
        service: 'discord-integration'
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send productivity insights', {
        service: 'discord-integration',
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
      const embed = {
        title: '📅 Daily Summary',
        description: `**${summary.date}**`,
        color: 0x95e1d3,
        fields: [
          {
            name: 'Activity',
            value: `${summary.total_events} events\n${summary.total_sessions} sessions`,
            inline: true
          },
          {
            name: 'Quality',
            value: `Score: ${summary.quality_score}/100\nRollbacks: ${summary.rollbacks}`,
            inline: true
          },
          {
            name: 'Agents',
            value: `${summary.active_agents} active`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Corvus Daily Report • ${this.projectName}`
        }
      };

      if (summary.highlights && summary.highlights.length > 0) {
        embed.fields.push({
          name: '✨ Highlights',
          value: summary.highlights.slice(0, 3).join('\n'),
          inline: false
        });
      }

      await this.sendWebhook({ embeds: [embed] });

      this.recordEvent('daily_summary_sent', {
        date: summary.date
      });

      logger.info('Daily summary sent to Discord', {
        service: 'discord-integration',
        date: summary.date
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to send daily summary', {
        service: 'discord-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get color for severity level
   */
  getSeverityColor(severity) {
    const colors = {
      critical: 0xff0000,
      high: 0xff6b6b,
      medium: 0xffb347,
      low: 0xffe66d,
      info: 0x4ecdc4
    };
    return colors[severity] || colors.info;
  }

  /**
   * Get color for health score
   */
  getHealthScoreColor(score) {
    if (score >= 80) return 0x51cf66; // Green
    if (score >= 60) return 0xffe66d; // Yellow
    if (score >= 40) return 0xffb347; // Orange
    return 0xff6b6b; // Red
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
        ) VALUES (?, 'discord', ?, ?, 'success')
      `);

      stmt.run(this.projectName, eventType, JSON.stringify(data));

      logger.debug('Integration event recorded', {
        service: 'discord-integration',
        event_type: eventType
      });
    } catch (error) {
      logger.error('Failed to record integration event', {
        service: 'discord-integration',
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
          AND integration_type = 'discord'
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
        service: 'discord-integration',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Test Discord webhook
   */
  async testConnection() {
    if (!this.enabled) {
      return { success: false, error: 'Integration not configured' };
    }

    try {
      await this.sendWebhook({
        content: 'Discord integration test successful!',
        embeds: [
          {
            title: 'Connection Test',
            description: `Corvus is connected to this channel for project: **${this.projectName}**`,
            color: 0x51cf66,
            timestamp: new Date().toISOString()
          }
        ]
      });

      return { success: true, message: 'Test message sent successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
