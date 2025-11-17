/**
 * Export Service
 * Handles data export in various formats (CSV, JSON, Markdown)
 * Supports filtering, templates, and scheduled exports
 */

import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

export class ExportService {
  constructor(db, ravenDir) {
    this.db = db;
    this.exportsDir = path.join(ravenDir, 'exports');
    this.initializeExportsDirectory();
  }

  /**
   * Initialize exports directory
   */
  async initializeExportsDirectory() {
    try {
      await fs.mkdir(this.exportsDir, { recursive: true });
      logger.info(`Exports directory initialized: ${this.exportsDir}`);
    } catch (error) {
      logger.error('Failed to create exports directory:', error);
    }
  }

  /**
   * Export events data
   */
  exportEvents(options = {}) {
    const { projectName, startDate, endDate, eventType, limit = 1000, format = 'json' } = options;

    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (projectName) {
      query += ' AND project_name = ?';
      params.push(projectName);
    }

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    if (eventType) {
      query += ' AND event_type = ?';
      params.push(eventType);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const events = this.db.prepare(query).all(...params);

    return this.formatData(events, format, 'events');
  }

  /**
   * Export agent events
   */
  exportAgentEvents(options = {}) {
    const { projectName, agent, startDate, endDate, limit = 1000, format = 'json' } = options;

    let query = 'SELECT * FROM agent_events WHERE 1=1';
    const params = [];

    if (projectName) {
      query += ' AND project_name = ?';
      params.push(projectName);
    }

    if (agent) {
      query += ' AND agent = ?';
      params.push(agent);
    }

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const events = this.db.prepare(query).all(...params);

    return this.formatData(events, format, 'agent_events');
  }

  /**
   * Export errors
   */
  exportErrors(options = {}) {
    const { projectName, severity, startDate, endDate, limit = 1000, format = 'json' } = options;

    let query = 'SELECT * FROM errors WHERE 1=1';
    const params = [];

    if (projectName) {
      query += ' AND project_name = ?';
      params.push(projectName);
    }

    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const errors = this.db.prepare(query).all(...params);

    return this.formatData(errors, format, 'errors');
  }

  /**
   * Export metrics
   */
  exportMetrics(options = {}) {
    const { projectName, metricType, startDate, endDate, limit = 1000, format = 'json' } = options;

    let query = 'SELECT * FROM metrics WHERE 1=1';
    const params = [];

    if (projectName) {
      query += ' AND project_name = ?';
      params.push(projectName);
    }

    if (metricType) {
      query += ' AND metric_type = ?';
      params.push(metricType);
    }

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const metrics = this.db.prepare(query).all(...params);

    return this.formatData(metrics, format, 'metrics');
  }

  /**
   * Export comprehensive project report
   */
  exportProjectReport(projectName, days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Gather all relevant data
    const events = this.db
      .prepare(
        `
      SELECT * FROM events
      WHERE project_name = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 500
    `
      )
      .all(projectName, startDate);

    const agentEvents = this.db
      .prepare(
        `
      SELECT * FROM agent_events
      WHERE project_name = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 100
    `
      )
      .all(projectName, startDate);

    const errors = this.db
      .prepare(
        `
      SELECT * FROM errors
      WHERE project_name = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 50
    `
      )
      .all(projectName, startDate);

    const syntaxErrors = this.db
      .prepare(
        `
      SELECT * FROM syntax_errors
      WHERE project_name = ? AND detected_at >= ?
      ORDER BY detected_at DESC
      LIMIT 50
    `
      )
      .all(projectName, startDate);

    const anomalies = this.db
      .prepare(
        `
      SELECT * FROM anomalies
      WHERE project_name = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 50
    `
      )
      .all(projectName, startDate);

    // Compile report
    const report = {
      project_name: projectName,
      report_period: `${days} days`,
      generated_at: new Date().toISOString(),
      summary: {
        total_events: events.length,
        total_agent_events: agentEvents.length,
        total_errors: errors.length,
        total_syntax_errors: syntaxErrors.length,
        total_anomalies: anomalies.length
      },
      data: {
        events,
        agent_events: agentEvents,
        errors,
        syntax_errors: syntaxErrors,
        anomalies
      }
    };

    return report;
  }

  /**
   * Format data in specified format
   */
  formatData(data, format, dataType) {
    switch (format) {
      case 'csv':
        return this.toCSV(data);
      case 'json':
        return {
          data,
          total: data.length,
          type: dataType,
          exported_at: new Date().toISOString()
        };
      case 'markdown':
        return this.toMarkdown(data, dataType);
      default:
        return data;
    }
  }

  /**
   * Convert data to CSV format
   */
  toCSV(data) {
    if (!data || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => `"${this.escapeCsv(row[h])}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Escape CSV special characters
   */
  escapeCsv(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/"/g, '""');
  }

  /**
   * Convert data to Markdown table format
   */
  toMarkdown(data, dataType) {
    if (!data || data.length === 0) {
      return `# ${dataType}\n\nNo data available.`;
    }

    const headers = Object.keys(data[0]);
    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows = data.map(
      row => `| ${headers.map(h => this.escapeMarkdown(row[h])).join(' | ')} |`
    );

    return [
      `# ${dataType}`,
      '',
      headerRow,
      separatorRow,
      ...dataRows,
      '',
      `*Total: ${data.length} records*`
    ].join('\n');
  }

  /**
   * Escape Markdown special characters
   */
  escapeMarkdown(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  /**
   * Save export to file
   */
  async saveExport(data, filename, format) {
    let content;
    let extension;

    switch (format) {
      case 'csv':
        content = typeof data === 'string' ? data : this.toCSV(data);
        extension = 'csv';
        break;
      case 'markdown':
      case 'md':
        content = typeof data === 'string' ? data : this.toMarkdown(data, 'Export');
        extension = 'md';
        break;
      case 'json':
      default:
        content = JSON.stringify(data, null, 2);
        extension = 'json';
    }

    const filepath = path.join(this.exportsDir, `${filename}.${extension}`);
    await fs.writeFile(filepath, content, 'utf-8');

    logger.info(`Export saved: ${filepath}`);

    return {
      success: true,
      filepath,
      filename: `${filename}.${extension}`,
      size: content.length
    };
  }

  /**
   * List available exports
   */
  async listExports() {
    try {
      const files = await fs.readdir(this.exportsDir);

      const exports = await Promise.all(
        files.map(async file => {
          const filepath = path.join(this.exportsDir, file);
          const stats = await fs.stat(filepath);

          return {
            filename: file,
            size: stats.size,
            created_at: stats.birthtime.toISOString(),
            modified_at: stats.mtime.toISOString()
          };
        })
      );

      return exports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
      logger.error('Failed to list exports:', error);
      return [];
    }
  }

  /**
   * Delete an export file
   */
  async deleteExport(filename) {
    try {
      const filepath = path.join(this.exportsDir, filename);
      await fs.unlink(filepath);

      logger.info(`Export deleted: ${filepath}`);

      return { success: true, message: 'Export deleted successfully' };
    } catch (error) {
      logger.error('Failed to delete export:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get export file path
   */
  getExportPath(filename) {
    return path.join(this.exportsDir, filename);
  }

  /**
   * Generate shareable snapshot
   */
  async generateSnapshot(options = {}) {
    const { projectName, includeData = true, days = 1 } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot-${projectName || 'all'}-${timestamp}`;

    const snapshot = {
      snapshot_id: `snap_${Date.now()}`,
      created_at: new Date().toISOString(),
      project: projectName || 'all',
      period_days: days
    };

    if (includeData) {
      const report = this.exportProjectReport(projectName, days);
      snapshot.data = report;
    }

    await this.saveExport(snapshot, filename, 'json');

    return {
      success: true,
      snapshot_id: snapshot.snapshot_id,
      filename: `${filename}.json`
    };
  }

  /**
   * Get export statistics
   */
  async getExportStats() {
    const exports = await this.listExports();

    const totalSize = exports.reduce((sum, exp) => sum + exp.size, 0);
    const byType = exports.reduce((acc, exp) => {
      const ext = path.extname(exp.filename).slice(1);
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {});

    return {
      total_exports: exports.length,
      total_size: totalSize,
      by_type: byType,
      recent: exports.slice(0, 5)
    };
  }
}
