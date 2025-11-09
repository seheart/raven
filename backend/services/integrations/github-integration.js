/**
 * GitHub Integration
 *
 * Integrates with GitHub to:
 * - Create issues for critical errors
 * - Post commit status updates
 * - Comment on PRs with health scores
 * - Track deployment events
 * - Sync project activities
 */

import { logger } from '../../utils/logger.js';

export class GitHubIntegration {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
    this.enabled = false;
    this.config = null;
  }

  /**
   * Initialize GitHub integration with config
   */
  async initialize() {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM integration_configs
        WHERE project_name = ?
          AND integration_type = 'github'
          AND enabled = 1
        LIMIT 1
      `);

      this.config = stmt.get(this.projectName);

      if (this.config && this.config.config) {
        const config = JSON.parse(this.config.config);
        this.enabled = true;
        this.token = config.token;
        this.owner = config.owner;
        this.repo = config.repo;
        this.apiUrl = config.apiUrl || 'https://api.github.com';

        logger.info('GitHub integration initialized', {
          service: 'github-integration',
          project: this.projectName,
          repo: `${this.owner}/${this.repo}`
        });
      }
    } catch (error) {
      logger.error('Failed to initialize GitHub integration', {
        service: 'github-integration',
        error: error.message
      });
    }
  }

  /**
   * Configure GitHub integration
   */
  async configure(config) {
    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO integration_configs (
          project_name, integration_type, enabled, config
        ) VALUES (?, 'github', 1, ?)
        ON CONFLICT(project_name, integration_type)
        DO UPDATE SET
          enabled = 1,
          config = excluded.config,
          updated_at = CURRENT_TIMESTAMP
      `);

      stmt.run(this.projectName, JSON.stringify(config));

      await this.initialize();

      logger.info('GitHub integration configured', {
        service: 'github-integration',
        project: this.projectName
      });

      return { success: true, message: 'GitHub integration configured' };
    } catch (error) {
      logger.error('Failed to configure GitHub integration', {
        service: 'github-integration',
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Disable GitHub integration
   */
  async disable() {
    try {
      const stmt = this.db.prepareStatement(`
        UPDATE integration_configs
        SET enabled = 0
        WHERE project_name = ?
          AND integration_type = 'github'
      `);

      stmt.run(this.projectName);

      this.enabled = false;

      logger.info('GitHub integration disabled', {
        service: 'github-integration',
        project: this.projectName
      });

      return { success: true, message: 'GitHub integration disabled' };
    } catch (error) {
      logger.error('Failed to disable GitHub integration', {
        service: 'github-integration',
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Make authenticated GitHub API request
   */
  async makeRequest(endpoint, method = 'GET', body = null) {
    if (!this.enabled || !this.token) {
      throw new Error('GitHub integration not configured');
    }

    try {
      const url = `${this.apiUrl}${endpoint}`;
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('GitHub API request failed', {
        service: 'github-integration',
        endpoint,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create GitHub issue for critical error
   */
  async createIssueForError(errorEvent) {
    if (!this.enabled) return null;

    try {
      const title = `🚨 Critical Error: ${errorEvent.error_type}`;
      const body = `
## Error Details

**Type:** ${errorEvent.error_type}
**Message:** ${errorEvent.message}
**Severity:** ${errorEvent.severity}
**File:** ${errorEvent.filepath || 'N/A'}
**Timestamp:** ${errorEvent.timestamp}

## Context
${errorEvent.context || 'No additional context available'}

## Stack Trace
\`\`\`
${errorEvent.stack || 'No stack trace available'}
\`\`\`

---
*This issue was automatically created by Corvus monitoring system.*
      `;

      const issue = await this.makeRequest(`/repos/${this.owner}/${this.repo}/issues`, 'POST', {
        title,
        body,
        labels: ['bug', 'corvus-alert', 'auto-generated']
      });

      // Record integration event
      this.recordEvent('issue_created', {
        issue_number: issue.number,
        issue_url: issue.html_url,
        error_id: errorEvent.id
      });

      logger.info('GitHub issue created for error', {
        service: 'github-integration',
        issue_number: issue.number,
        error_id: errorEvent.id
      });

      return issue;
    } catch (error) {
      logger.error('Failed to create GitHub issue', {
        service: 'github-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Post health score comment on latest commit
   */
  async postHealthScoreComment(healthScore) {
    if (!this.enabled) return null;

    try {
      // Get latest commit
      const commits = await this.makeRequest(`/repos/${this.owner}/${this.repo}/commits`);

      if (!commits || commits.length === 0) {
        return null;
      }

      const latestCommit = commits[0];

      const body = `
## 🏥 Project Health Report

**Overall Score:** ${healthScore.overallScore}/100

### Breakdown
- **Code Quality:** ${healthScore.breakdown.codeQuality}/100
- **Test Coverage:** ${healthScore.breakdown.testCoverage}/100
- **Documentation:** ${healthScore.breakdown.documentation}/100
- **Velocity:** ${healthScore.breakdown.velocity}/100
- **Stability:** ${healthScore.breakdown.stability}/100
- **Security:** ${healthScore.breakdown.security}/100

### Recommendations
${healthScore.recommendations.map(r => `- ${r.message}`).join('\n')}

---
*Generated by Corvus Health Monitoring on ${healthScore.date}*
      `;

      const comment = await this.makeRequest(
        `/repos/${this.owner}/${this.repo}/commits/${latestCommit.sha}/comments`,
        'POST',
        { body }
      );

      this.recordEvent('health_comment_posted', {
        commit_sha: latestCommit.sha,
        comment_id: comment.id,
        health_score: healthScore.overallScore
      });

      logger.info('Health score comment posted', {
        service: 'github-integration',
        commit_sha: latestCommit.sha,
        score: healthScore.overallScore
      });

      return comment;
    } catch (error) {
      logger.error('Failed to post health score comment', {
        service: 'github-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Create commit status update
   */
  async createCommitStatus(sha, state, description, context = 'corvus/health') {
    if (!this.enabled) return null;

    try {
      const status = await this.makeRequest(
        `/repos/${this.owner}/${this.repo}/statuses/${sha}`,
        'POST',
        {
          state, // success, error, failure, pending
          description,
          context
        }
      );

      this.recordEvent('status_created', {
        commit_sha: sha,
        state,
        context
      });

      logger.info('Commit status created', {
        service: 'github-integration',
        sha,
        state
      });

      return status;
    } catch (error) {
      logger.error('Failed to create commit status', {
        service: 'github-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Post drift alert comment
   */
  async postDriftAlert(drifts) {
    if (!this.enabled || drifts.length === 0) return null;

    try {
      const criticalDrifts = drifts.filter(d => d.severity === 'critical' || d.severity === 'high');

      if (criticalDrifts.length === 0) return null;

      // Get latest commit
      const commits = await this.makeRequest(`/repos/${this.owner}/${this.repo}/commits`);
      if (!commits || commits.length === 0) return null;

      const latestCommit = commits[0];

      const body = `
## ⚠️ Drift Detection Alert

**${criticalDrifts.length} significant drift(s) detected**

${criticalDrifts.map(d => `
### ${d.drift_type.toUpperCase()} Drift - ${d.severity}
${d.description}
- **Baseline:** ${d.baseline_value?.toFixed(2) || 'N/A'}
- **Current:** ${d.current_value?.toFixed(2) || 'N/A'}
- **Deviation:** ${d.deviation_percent}%
`).join('\n')}

---
*Generated by Corvus Drift Detection System*
      `;

      const comment = await this.makeRequest(
        `/repos/${this.owner}/${this.repo}/commits/${latestCommit.sha}/comments`,
        'POST',
        { body }
      );

      this.recordEvent('drift_alert_posted', {
        commit_sha: latestCommit.sha,
        drift_count: criticalDrifts.length
      });

      return comment;
    } catch (error) {
      logger.error('Failed to post drift alert', {
        service: 'github-integration',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Record integration event
   */
  recordEvent(eventType, data) {
    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO integration_events (
          project_name, integration_type, event_type, event_data, status
        ) VALUES (?, 'github', ?, ?, 'success')
      `);

      stmt.run(this.projectName, eventType, JSON.stringify(data));

      logger.debug('Integration event recorded', {
        service: 'github-integration',
        event_type: eventType
      });
    } catch (error) {
      logger.error('Failed to record integration event', {
        service: 'github-integration',
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
          AND integration_type = 'github'
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
        service: 'github-integration',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Test GitHub connection
   */
  async testConnection() {
    if (!this.enabled) {
      return { success: false, error: 'Integration not configured' };
    }

    try {
      const repo = await this.makeRequest(`/repos/${this.owner}/${this.repo}`);

      return {
        success: true,
        repo_name: repo.full_name,
        repo_url: repo.html_url,
        permissions: repo.permissions
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
