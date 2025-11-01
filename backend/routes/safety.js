import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { SyntaxChecker } from '../services/syntax-checker.js';
import { PatternChecker } from '../services/pattern-checker.js';
import { TestRunner } from '../services/test-runner.js';
import { safetyCache, cacheMiddleware } from '../utils/cache.js';

const execAsync = promisify(exec);

/**
 * Creates safety-related routes (errors, syntax checking, tests, sessions, pattern warnings)
 * @param {object} deps - Dependencies { projectDatabases, io, SESSION_ID, projectWatchers }
 * @returns {Router} Express router
 */
export function createSafetyRoutes(deps) {
  const router = Router();
  const { projectDatabases, io, SESSION_ID, projectWatchers } = deps;

  // Get first database for safety features
  const getDb = () => {
    const firstDb = projectDatabases?.values().next().value;
    if (!firstDb) {
      throw new Error('No database available');
    }
    return firstDb;
  };

  /**
   * POST /api/errors
   * Log frontend errors to database and emit WebSocket events
   */
  router.post('/errors', (req, res) => {
    try {
      const db = getDb();
      const {
        error_type,
        message,
        stack,
        component,
        user_agent,
        url,
        metadata,
        severity
      } = req.body;

      // Validate required fields
      if (!error_type || !message) {
        return res.status(400).json({ error: 'Missing required fields: error_type, message' });
      }

      const timestamp = new Date().toISOString();

      // Insert into database
      const errorId = db.insertErrorLog(
        timestamp,
        error_type,
        message,
        stack,
        component,
        user_agent,
        url,
        metadata,
        SESSION_ID,
        severity || 'error'
      );

      logger.error(`Error logged: ${error_type} - ${message}`, {
        component,
        error_id: errorId
      });

      // Create notification for errors (not warnings or info)
      if (severity === 'error' || !severity) {
        const notificationId = db.insertNotification(
          timestamp,
          'error',
          'critical',
          `${error_type}: ${message.substring(0, 80)}`,
          message,
          { component, error_id: errorId, stack: stack?.substring(0, 500) },
          SESSION_ID
        );

        io.emit('notification', {
          id: notificationId,
          timestamp,
          type: 'error',
          severity: 'critical',
          title: `${error_type}: ${message.substring(0, 80)}`,
          message,
          read: false,
          metadata: { component, error_id: errorId }
        });
      }

      // Emit real-time event via WebSocket
      io.emit('error-logged', {
        id: errorId,
        timestamp,
        error_type,
        message,
        component,
        severity: severity || 'error'
      });

      res.json({
        success: true,
        error_id: errorId
      });
    } catch (error) {
      logger.error('Error logging endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Syntax Errors ====================

  /**
   * GET /api/syntax-errors
   * Get syntax errors (with caching)
   */
  router.get('/syntax-errors', cacheMiddleware(safetyCache), (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.getSyntaxErrors) {
        return res.json({
          errors: [],
          count: 0,
          message: 'Syntax error checking not available in this configuration'
        });
      }

      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const resolved = req.query.resolved === 'true';

      const result = db.getSyntaxErrors({ limit, offset, resolved });

      res.json(result);
    } catch (error) {
      logger.error('Error fetching syntax errors:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/syntax-errors/count
   * Get syntax error count
   */
  router.get('/syntax-errors/count', (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.getSyntaxErrors) {
        return res.json({ count: 0 });
      }

      const result = db.getSyntaxErrors({ limit: 1 });
      res.json({ count: result.count });
    } catch (error) {
      logger.error('Error counting syntax errors:', error);
      res.status(500).json({ error: error.message, count: 0 });
    }
  });

  /**
   * POST /api/syntax-errors/:errorId/resolve
   * Resolve a syntax error
   */
  router.post('/syntax-errors/:errorId/resolve', (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.resolveSyntaxError) {
        return res.status(501).json({
          error: 'Syntax error resolution not available in this configuration'
        });
      }

      const errorId = parseInt(req.params.errorId);
      db.resolveSyntaxError(errorId);

      res.json({ success: true, message: 'Syntax error resolved' });
    } catch (error) {
      logger.error('Error resolving syntax error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/syntax-errors/check
   * Manually trigger syntax check for a file
   */
  router.post('/syntax-errors/check', async (req, res) => {
    try {
      const db = getDb();
      const { filepath } = req.body;

      if (!filepath) {
        return res.status(400).json({ error: 'filepath is required' });
      }

      const checker = new SyntaxChecker(db, SESSION_ID, io);
      const errors = await checker.checkFile(filepath);

      res.json({ success: true, errors, count: errors.length });
    } catch (error) {
      logger.error('Error checking syntax:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/open-file
   * Open a file in the configured editor
   */
  router.post('/open-file', async (req, res) => {
    try {
      const { filepath, lineNumber, editor } = req.body;

      if (!filepath) {
        return res.status(400).json({ error: 'filepath is required' });
      }

      const line = lineNumber || 1;
      const editorType = editor || 'auto';

      logger.info(`Opening file: ${filepath}:${line} with editor: ${editorType}`);

      // Editor command templates
      const editorCommands = {
        'vscode': `code --goto "${filepath}:${line}"`,
        'cursor': `cursor --goto "${filepath}:${line}"`,
        'sublime': `subl "${filepath}:${line}"`,
        'intellij': `idea --line ${line} "${filepath}"`,
        'vim': `gnome-terminal -- vim "+${line}" "${filepath}"`,
        'nvim': `gnome-terminal -- nvim "+${line}" "${filepath}"`,
        'nano': `gnome-terminal -- nano "+${line}" "${filepath}"`,
        'auto': process.platform === 'darwin' ? `open "${filepath}"` : `xdg-open "${filepath}"`
      };

      const command = editorCommands[editorType] || editorCommands['auto'];

      try {
        await execAsync(command);
        res.json({
          success: true,
          message: `Opened ${filepath}:${line}`,
          editor: editorType
        });
      } catch (error) {
        // If the specific editor fails, try system default
        if (editorType !== 'auto') {
          logger.warn(`Failed to open with ${editorType}, trying system default`);
          try {
            await execAsync(editorCommands['auto']);
            res.json({
              success: true,
              message: `Opened ${filepath} with system default editor`,
              editor: 'auto',
              fallback: true
            });
          } catch (fallbackError) {
            throw fallbackError;
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error('Error opening file:', error);
      res.status(500).json({
        error: 'Failed to open file',
        message: error.message,
        suggestion: 'Please check that your editor is installed and in your PATH'
      });
    }
  });

  // ==================== Pattern Warnings ====================

  /**
   * GET /api/pattern-warnings
   * Get pattern warnings (with caching)
   */
  router.get('/pattern-warnings', cacheMiddleware(safetyCache), (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.getPatternWarnings) {
        return res.json({
          warnings: [],
          count: 0,
          message: 'Pattern warnings not available in this configuration'
        });
      }

      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      const category = req.query.category || 'all';
      const resolved = req.query.resolved === 'true';

      const result = db.getPatternWarnings({ limit, offset, category, resolved });

      res.json(result);
    } catch (error) {
      logger.error('Error fetching pattern warnings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/pattern-warnings/category/:category
   * Get pattern warnings by category (with caching)
   */
  router.get('/pattern-warnings/category/:category', cacheMiddleware(safetyCache), (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.getPatternWarnings) {
        return res.json({
          warnings: [],
          count: 0,
          category: req.params.category,
          message: 'Pattern warnings not available in this configuration'
        });
      }

      const category = req.params.category;
      const limit = parseInt(req.query.limit) || 100;

      const result = db.getPatternWarnings({ limit, category });

      res.json(result);
    } catch (error) {
      logger.error('Error fetching pattern warnings by category:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/pattern-warnings/:warningId/resolve
   * Resolve a pattern warning
   */
  router.post('/pattern-warnings/:warningId/resolve', (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.resolvePatternWarning) {
        return res.status(501).json({
          error: 'Pattern warning resolution not available in this configuration'
        });
      }

      const warningId = parseInt(req.params.warningId);
      db.resolvePatternWarning(warningId);

      res.json({ success: true, message: 'Pattern warning resolved' });
    } catch (error) {
      logger.error('Error resolving pattern warning:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/pattern-warnings/check
   * Manually trigger pattern check for a file
   */
  router.post('/pattern-warnings/check', async (req, res) => {
    try {
      const db = getDb();
      const { filepath, projectName } = req.body;

      if (!filepath) {
        return res.status(400).json({ error: 'filepath is required' });
      }

      // Use provided project name or try to determine from projectDatabases keys
      const project = projectName || Array.from(projectDatabases.keys())[0] || 'unknown';

      const checker = new PatternChecker(db, SESSION_ID, io, project);
      const warnings = await checker.checkFile(filepath);

      res.json({ success: true, warnings, count: warnings.length });
    } catch (error) {
      logger.error('Error checking patterns:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/pattern-warnings/resolve-all
   * Resolve all pattern warnings
   */
  router.post('/pattern-warnings/resolve-all', (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.resolveAllPatternWarnings) {
        return res.status(501).json({
          error: 'Bulk resolution not available in this configuration'
        });
      }

      const category = req.query.category || null;
      const result = db.resolveAllPatternWarnings(category);

      res.json({
        success: true,
        message: `Resolved ${result.count} pattern warning(s)`,
        count: result.count
      });
    } catch (error) {
      logger.error('Error resolving all pattern warnings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/pattern-warnings/export
   * Export pattern warnings as CSV or JSON
   */
  router.get('/pattern-warnings/export', (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.getPatternWarnings) {
        return res.status(501).json({
          error: 'Pattern warnings export not available in this configuration'
        });
      }

      const format = req.query.format || 'csv';
      const category = req.query.category || 'all';
      const resolved = req.query.resolved === 'true';

      // Get all warnings (no limit)
      const result = db.getPatternWarnings({ limit: 999999, category, resolved });
      const warnings = result.warnings || [];

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="pattern-warnings-${Date.now()}.json"`);
        res.json({ warnings, count: warnings.length, exported_at: new Date().toISOString() });
      } else {
        // CSV format
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="pattern-warnings-${Date.now()}.csv"`);

        // CSV header
        const csvHeaders = [
          'ID', 'Timestamp', 'Filepath', 'Project', 'Category', 'Severity',
          'Pattern Name', 'Message', 'Line Number', 'Match Text', 'Context',
          'Suggestion', 'Resolved'
        ];
        let csv = csvHeaders.join(',') + '\n';

        // CSV rows
        for (const warning of warnings) {
          const row = [
            warning.id || '',
            warning.timestamp || '',
            `"${(warning.filepath || '').replace(/"/g, '""')}"`,
            `"${(warning.project_name || '').replace(/"/g, '""')}"`,
            warning.category || '',
            warning.severity || '',
            `"${(warning.pattern_name || '').replace(/"/g, '""')}"`,
            `"${(warning.message || '').replace(/"/g, '""')}"`,
            warning.line_number || '',
            `"${(warning.match_text || '').replace(/"/g, '""')}"`,
            `"${(warning.context || '').replace(/"/g, '""')}"`,
            `"${(warning.suggestion || '').replace(/"/g, '""')}"`,
            warning.resolved ? 'Yes' : 'No'
          ];
          csv += row.join(',') + '\n';
        }

        res.send(csv);
      }
    } catch (error) {
      logger.error('Error exporting pattern warnings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Test Results ====================

  /**
   * GET /api/tests/frameworks
   * Get available test frameworks
   */
  router.get('/tests/frameworks', cacheMiddleware(safetyCache), (req, res) => {
    try {
      // Check if projectWatchers is available (stub for tests)
      if (!projectWatchers || projectWatchers.size === 0) {
        return res.json({
          frameworks: [],
          message: 'Test framework detection not available in this configuration'
        });
      }

      // Detect frameworks in all projects
      const frameworks = new Set();

      for (const [projectName, watcher] of projectWatchers.entries()) {
        try {
          const db = projectDatabases.get(projectName);
          if (!db) continue;

          const runner = new TestRunner(db, SESSION_ID, io);
          const watchPath = watcher.options?.cwd || process.cwd();
          const detected = runner.detectFrameworks(watchPath);

          detected.forEach(f => frameworks.add(f));
        } catch (error) {
          logger.error(`Error detecting frameworks for ${projectName}:`, error);
        }
      }

      res.json({ frameworks: Array.from(frameworks) });
    } catch (error) {
      logger.error('Error detecting test frameworks:', error);
      res.status(500).json({ error: error.message, frameworks: [] });
    }
  });

  /**
   * GET /api/tests/results
   * Get test results
   */
  router.get('/tests/results', cacheMiddleware(safetyCache), (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.getTestResults) {
        return res.json({
          results: [],
          total: 0,
          message: 'Test results not available in this configuration'
        });
      }

      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;
      const framework = req.query.framework || 'all';
      const status = req.query.status || 'all';

      const result = db.getTestResults({ limit, offset, framework, status });

      res.json(result);
    } catch (error) {
      logger.error('Error fetching test results:', error);
      res.status(500).json({ error: error.message, results: [], total: 0 });
    }
  });

  /**
   * GET /api/tests/details/:timestamp
   * Get all test details for a specific test run (failures first, then passed)
   */
  router.get('/tests/details/:timestamp', cacheMiddleware(safetyCache), (req, res) => {
    try {
      const db = getDb();
      const { timestamp } = req.params;

      // Get all tests for this timestamp - failed first, then passed
      const stmt = db.db.prepare(`
        SELECT
          test_file,
          test_name,
          status,
          error_message,
          error_stack,
          duration_ms
        FROM test_results
        WHERE timestamp = ?
        ORDER BY
          CASE status
            WHEN 'failed' THEN 1
            WHEN 'skipped' THEN 2
            WHEN 'passed' THEN 3
          END,
          test_file,
          test_name
      `);

      const tests = stmt.all(timestamp);

      res.json({
        tests,
        timestamp,
        total: tests.length,
        failed: tests.filter(t => t.status === 'failed').length,
        passed: tests.filter(t => t.status === 'passed').length,
        skipped: tests.filter(t => t.status === 'skipped').length
      });
    } catch (error) {
      logger.error('Error fetching test details:', error);
      res.status(500).json({ error: error.message, tests: [] });
    }
  });

  /**
   * GET /api/tests/export/:timestamp
   * Export test results to CSV
   */
  router.get('/tests/export/:timestamp', (req, res) => {
    try {
      const db = getDb();
      const { timestamp } = req.params;

      // Get all tests for this timestamp
      const stmt = db.db.prepare(`
        SELECT
          test_file,
          test_name,
          status,
          error_message,
          duration_ms
        FROM test_results
        WHERE timestamp = ?
        ORDER BY status DESC, test_file, test_name
      `);

      const tests = stmt.all(timestamp);

      // Generate CSV
      let csv = 'File,Test Name,Status,Error,Duration (ms)\n';
      for (const test of tests) {
        const file = (test.test_file || '').replace(/"/g, '""');
        const name = (test.test_name || '').replace(/"/g, '""');
        const error = (test.error_message || '').replace(/"/g, '""').replace(/\n/g, ' ');
        csv += `"${file}","${name}","${test.status}","${error}",${test.duration_ms || 0}\n`;
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="test-results-${timestamp}.csv"`);
      res.send(csv);
    } catch (error) {
      logger.error('Error exporting test results:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/tests/run
   * Run tests
   */
  router.post('/tests/run', async (req, res) => {
    try {
      const db = getDb();

      // Check if test running is available (stub for tests)
      if (!projectWatchers || projectWatchers.size === 0) {
        return res.status(501).json({
          error: 'Test running not available in this configuration'
        });
      }

      const { framework, projectPath } = req.body;

      if (!framework) {
        return res.status(400).json({ error: 'framework is required' });
      }

      const runner = new TestRunner(db, SESSION_ID, io);
      const result = await runner.runTests(projectPath || process.cwd(), framework);

      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Error running tests:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/tests/results
   * Clear all test results
   */
  router.delete('/tests/results', (req, res) => {
    try {
      const db = getDb();

      // Check if method exists (stub for tests)
      if (!db.clearTestResults) {
        return res.status(501).json({
          error: 'Test result clearing not available in this configuration'
        });
      }

      const result = db.clearTestResults();

      res.json({
        success: true,
        message: `Cleared ${result.count} test result(s)`,
        count: result.count
      });
    } catch (error) {
      logger.error('Error clearing test results:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Sessions ====================

  /**
   * GET /api/sessions
   * Get development sessions
   */
  router.get('/sessions', (req, res) => {
    try {
      const db = getDb();
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      const projectName = req.query.project || null;

      const result = db.getSessions({ limit, offset, projectName });

      res.json(result);
    } catch (error) {
      logger.error('Error fetching sessions:', error);
      res.status(500).json({ error: error.message, sessions: [], total: 0 });
    }
  });

  /**
   * GET /api/sessions/:sessionId/preview
   * Preview rollback for a session
   */
  router.get('/sessions/:sessionId/preview', (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);

      // This would need integration with the events system to show what would be rolled back
      // For now, return a stub response
      res.json({
        session_id: sessionId,
        canRollback: false,
        message: 'Session rollback preview not yet implemented',
        changes: []
      });
    } catch (error) {
      logger.error('Error previewing session rollback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/sessions/:sessionId/rollback
   * Execute session rollback
   */
  router.post('/sessions/:sessionId/rollback', (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);

      // Session rollback would need deep integration with version control
      // For now, return not implemented
      res.status(501).json({
        error: 'Session rollback execution not yet implemented',
        session_id: sessionId
      });
    } catch (error) {
      logger.error('Error executing session rollback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Pause/Resume (Legacy Stubs) ====================

  router.get('/pause/status', (req, res) => {
    res.json({ paused: false, message: 'Pause feature not available in JavaScript version' });
  });

  router.post('/pause', (req, res) => {
    res.status(501).json({ error: 'Pause feature not available in JavaScript version' });
  });

  router.post('/resume', (req, res) => {
    res.status(501).json({ error: 'Resume feature not available in JavaScript version' });
  });

  router.get('/alerts/templates', (req, res) => {
    res.json({ templates: [] });
  });

  return router;
}
