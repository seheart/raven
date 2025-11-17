/**
 * Integrations Service
 * Manages external integrations (GitHub, Discord, Slack)
 * Sends webhooks and tracks integration events
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

export class IntegrationsService {
  constructor(db, io) {
    this.db = db;
    this.io = io;
    this.initializeSchema();
  }

  /**
   * Initialize database tables for integrations
   */
  initializeSchema() {
    // Integration configurations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS integration_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL UNIQUE,
        enabled INTEGER DEFAULT 0,
        config TEXT NOT NULL,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Integration events log
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS integration_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        metadata TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_integration_events_service ON integration_events(service);
      CREATE INDEX IF NOT EXISTS idx_integration_events_timestamp ON integration_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status);
    `);

    logger.info('Integrations schema initialized');
  }

  /**
   * Get configuration for a specific service
   */
  getConfig(service) {
    const row = this.db.prepare('SELECT * FROM integration_configs WHERE service = ?').get(service);

    if (!row) {
      return { enabled: false, config: {} };
    }

    return {
      enabled: row.enabled === 1,
      config: JSON.parse(row.config),
      last_updated: row.last_updated
    };
  }

  /**
   * Save configuration for a service
   */
  saveConfig(service, config, enabled = true) {
    const configJson = JSON.stringify(config);

    const existing = this.db
      .prepare('SELECT id FROM integration_configs WHERE service = ?')
      .get(service);

    if (existing) {
      this.db
        .prepare(
          `
        UPDATE integration_configs
        SET config = ?, enabled = ?, last_updated = CURRENT_TIMESTAMP
        WHERE service = ?
      `
        )
        .run(configJson, enabled ? 1 : 0, service);
    } else {
      this.db
        .prepare(
          `
        INSERT INTO integration_configs (service, config, enabled)
        VALUES (?, ?, ?)
      `
        )
        .run(service, configJson, enabled ? 1 : 0);
    }

    logger.info(`Integration config saved: ${service}`);
    return true;
  }

  /**
   * Toggle integration on/off
   */
  toggleIntegration(service, enabled) {
    this.db
      .prepare('UPDATE integration_configs SET enabled = ? WHERE service = ?')
      .run(enabled ? 1 : 0, service);

    logger.info(`Integration ${service} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Log an integration event
   */
  logEvent(service, eventType, status, message = null, metadata = null) {
    const stmt = this.db.prepare(`
      INSERT INTO integration_events (service, event_type, status, message, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(service, eventType, status, message, metadata ? JSON.stringify(metadata) : null);
  }

  /**
   * Get recent integration events
   */
  getRecentEvents(service, limit = 50) {
    const query = service
      ? 'SELECT * FROM integration_events WHERE service = ? ORDER BY timestamp DESC LIMIT ?'
      : 'SELECT * FROM integration_events ORDER BY timestamp DESC LIMIT ?';

    const params = service ? [service, limit] : [limit];

    const events = this.db.prepare(query).all(...params);

    return events.map(event => ({
      ...event,
      metadata: event.metadata ? JSON.parse(event.metadata) : null
    }));
  }

  /**
   * Send webhook to Discord
   */
  async sendDiscordWebhook(webhookUrl, message) {
    try {
      const payload = {
        embeds: [
          {
            title: message.title || 'Raven Notification',
            description: message.description || message.message,
            color: this.getColorForSeverity(message.severity),
            fields: message.fields || [],
            timestamp: new Date().toISOString(),
            footer: {
              text: 'Raven Monitoring'
            }
          }
        ]
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.statusText}`);
      }

      this.logEvent('discord', 'webhook_sent', 'success', message.title);
      return { success: true };
    } catch (error) {
      logger.error('Discord webhook error:', error);
      this.logEvent('discord', 'webhook_sent', 'error', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send webhook to Slack
   */
  async sendSlackWebhook(webhookUrl, message) {
    try {
      const payload = {
        text: message.title || 'Raven Notification',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${message.title || 'Notification'}*\n${message.description || message.message}`
            }
          }
        ],
        attachments: message.fields
          ? [
              {
                color: this.getColorHexForSeverity(message.severity),
                fields: message.fields.map(f => ({
                  title: f.name,
                  value: f.value,
                  short: true
                }))
              }
            ]
          : []
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.statusText}`);
      }

      this.logEvent('slack', 'webhook_sent', 'success', message.title);
      return { success: true };
    } catch (error) {
      logger.error('Slack webhook error:', error);
      this.logEvent('slack', 'webhook_sent', 'error', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send event to GitHub (create issue or comment)
   */
  async sendGitHubEvent(config, message) {
    try {
      const { token, owner, repo } = config;

      // Create an issue for critical events
      if (message.severity === 'critical' || message.severity === 'error') {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
          method: 'POST',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Raven-Monitor'
          },
          body: JSON.stringify({
            title: message.title,
            body: message.description || message.message,
            labels: ['raven-alert', message.severity]
          })
        });

        if (!response.ok) {
          throw new Error(`GitHub API failed: ${response.statusText}`);
        }

        const issue = await response.json();
        this.logEvent('github', 'issue_created', 'success', message.title, {
          issue_number: issue.number
        });
        return { success: true, issue_url: issue.html_url };
      }

      return { success: true, skipped: 'severity too low' };
    } catch (error) {
      logger.error('GitHub integration error:', error);
      this.logEvent('github', 'issue_create', 'error', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test a webhook configuration
   */
  async testWebhook(service, config) {
    const testMessage = {
      title: '🧪 Test from Raven',
      description: `This is a test message from Raven Monitoring. Integration with ${service} is working correctly!`,
      severity: 'info',
      fields: [
        { name: 'Test Type', value: 'Integration Test' },
        { name: 'Timestamp', value: new Date().toISOString() }
      ]
    };

    switch (service) {
      case 'discord':
        return await this.sendDiscordWebhook(config.webhookUrl, testMessage);
      case 'slack':
        return await this.sendSlackWebhook(config.webhookUrl, testMessage);
      case 'github':
        // For GitHub, just validate the token without creating an issue
        try {
          const response = await fetch('https://api.github.com/user', {
            headers: {
              Authorization: `token ${config.token}`,
              'User-Agent': 'Raven-Monitor'
            }
          });
          if (response.ok) {
            return { success: true, message: 'GitHub token is valid' };
          } else {
            return { success: false, error: 'Invalid GitHub token' };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      default:
        return { success: false, error: 'Unknown service' };
    }
  }

  /**
   * Broadcast event to all enabled integrations
   */
  async broadcastEvent(message) {
    const services = ['discord', 'slack', 'github'];
    const results = {};

    for (const service of services) {
      const config = this.getConfig(service);

      if (!config.enabled) {
        results[service] = { skipped: true, reason: 'disabled' };
        continue;
      }

      try {
        let result;
        switch (service) {
          case 'discord':
            result = await this.sendDiscordWebhook(config.config.webhookUrl, message);
            break;
          case 'slack':
            result = await this.sendSlackWebhook(config.config.webhookUrl, message);
            break;
          case 'github':
            result = await this.sendGitHubEvent(config.config, message);
            break;
        }
        results[service] = result;
      } catch (error) {
        results[service] = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Get color code for severity (Discord)
   */
  getColorForSeverity(severity) {
    const colors = {
      critical: 15158332, // Red
      error: 15105570, // Orange
      warning: 16776960, // Yellow
      info: 3447003, // Blue
      success: 3066993 // Green
    };
    return colors[severity] || colors.info;
  }

  /**
   * Get hex color for severity (Slack)
   */
  getColorHexForSeverity(severity) {
    const colors = {
      critical: '#e74c3c',
      error: '#e67e22',
      warning: '#f39c12',
      info: '#3498db',
      success: '#2ecc71'
    };
    return colors[severity] || colors.info;
  }

  /**
   * Get integration statistics
   */
  getStats() {
    const totalEvents = this.db.prepare('SELECT COUNT(*) as count FROM integration_events').get();

    const eventsByService = this.db
      .prepare(
        `
      SELECT service, COUNT(*) as count
      FROM integration_events
      GROUP BY service
    `
      )
      .all();

    const eventsByStatus = this.db
      .prepare(
        `
      SELECT status, COUNT(*) as count
      FROM integration_events
      GROUP BY status
    `
      )
      .all();

    const recentErrors = this.db
      .prepare(
        `
      SELECT service, event_type, message, timestamp
      FROM integration_events
      WHERE status = 'error'
      ORDER BY timestamp DESC
      LIMIT 10
    `
      )
      .all();

    return {
      total_events: totalEvents.count,
      by_service: eventsByService,
      by_status: eventsByStatus,
      recent_errors: recentErrors
    };
  }
}
