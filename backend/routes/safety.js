import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import { SyntaxChecker } from '../services/syntax-checker.js';
import { PatternChecker } from '../services/pattern-checker.js';
import { TestRunner } from '../services/test-runner.js';

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
   * Get syntax errors
   */
  router.get('/syntax-errors', (req, res) => {
    try {
      const db = getDb();
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
   * Get pattern warnings
   */
  router.get('/pattern-warnings', (req, res) => {
    try {
      const db = getDb();
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
   * Get pattern warnings by category
   */
  router.get('/pattern-warnings/category/:category', (req, res) => {
    try {
      const db = getDb();
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
      const { filepath } = req.body;

      if (!filepath) {
        return res.status(400).json({ error: 'filepath is required' });
      }

      const checker = new PatternChecker(db, SESSION_ID, io);
      const warnings = await checker.checkFile(filepath);

      res.json({ success: true, warnings, count: warnings.length });
    } catch (error) {
      logger.error('Error checking patterns:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Test Results ====================

  /**
   * GET /api/tests/frameworks
   * Get available test frameworks
   */
  router.get('/tests/frameworks', (req, res) => {
    try {
      // Detect frameworks in all projects
      const frameworks = new Set();

      for (const [projectName, watcher] of (projectWatchers || new Map()).entries()) {
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
  router.get('/tests/results', (req, res) => {
    try {
      const db = getDb();
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
   * POST /api/tests/run
   * Run tests
   */
  router.post('/tests/run', async (req, res) => {
    try {
      const db = getDb();
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
